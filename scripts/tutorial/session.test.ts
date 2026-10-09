import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  completedBlocks,
  type Markers,
  newMarkers,
  type SessionBlock,
  sessionScript,
  splitOutput,
  splitSetup,
} from "#scripts/tutorial/session.ts";

const markers: Markers = {
  setup: "__SETUP_test__",
  step: "__STEP_test__",
  attempt: "__ATTEMPT_test__",
};

const counter = "n=$(( $(cat count 2>/dev/null || echo 0) + 1 )); echo $n > count";

function run(blocks: SessionBlock[]) {
  const result = spawnSync("bash", ["-c", sessionScript(blocks, markers)], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
  });
  return { status: result.status, ...splitOutput(result.stdout, markers) };
}

function runWithSetup(setupLines: string[], blocks: SessionBlock[]) {
  const dir = mkdtempSync(join(tmpdir(), "session-test-"));
  try {
    writeFileSync(join(dir, "setup.sh"), setupLines.join("\n"));
    const script = sessionScript(blocks, markers, `${dir}/setup.sh one`);
    const { status, stdout } = spawnSync("bash", ["-c", script], { encoding: "utf8" });
    const { lines, rest } = splitSetup(stdout, markers);
    return {
      status,
      setup: lines,
      ...splitOutput(rest ?? "", markers),
      finished: rest !== undefined,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("newMarkers", () => {
  it("makes distinct markers each time", () => {
    const first = newMarkers();
    const second = newMarkers();
    expect(new Set([first.setup, first.step, first.attempt]).size).toBe(3);
    expect(first.step).not.toBe(second.step);
  });
});

describe("sessionScript", () => {
  it("carries variables and the working directory from block to block", () => {
    expect(run([{ command: "export A=1; cd /" }, { command: 'echo "$A $PWD"' }])).toEqual({
      status: 0,
      completed: [[], ["1 /"]],
      unfinished: [],
    });
  });

  it("stops at the first failing command, with stderr in the output", () => {
    expect(run([{ command: "echo out; echo err >&2; false; echo after" }])).toEqual({
      status: 1,
      completed: [],
      unfinished: ["out", "err"],
    });
  });

  it("stops on an unset variable and a failure inside a pipeline", () => {
    expect(run([{ command: "echo $UNSET_IN_TEST" }]).status).not.toBe(0);
    expect(run([{ command: "false | true" }]).status).not.toBe(0);
  });

  it("repeats a retry block until it succeeds, keeping only the last attempt's output", () => {
    const result = run([
      { command: 'cd "$(mktemp -d)"' },
      { command: `${counter}\necho "attempt $n"\ntest "$n" -ge 3`, retry: 0.01 },
    ]);
    expect(result).toEqual({ status: 0, completed: [[], ["attempt 3"]], unfinished: [] });
  });

  it("fails a retry attempt at its first failing command, not only its last", () => {
    const result = run([
      { command: 'cd "$(mktemp -d)"' },
      { command: `${counter}\ntest "$n" -ge 2\necho "attempt $n"`, retry: 0.01 },
    ]);
    expect(result.completed).toEqual([[], ["attempt 2"]]);
  });

  it("runs retry attempts in a subshell, so their variables do not carry", () => {
    const result = run([{ command: "export B=1", retry: 0.01 }, { command: 'echo "${B:-unset}"' }]);
    expect(result.completed).toEqual([[], ["unset"]]);
  });

  it("keeps the session strict after a retry block", () => {
    expect(run([{ command: "true", retry: 0.01 }, { command: "false; echo after" }])).toEqual({
      status: 1,
      completed: [[]],
      unfinished: [],
    });
  });
});

describe("sessionScript with a setup", () => {
  it("sources the setup with its arguments before the first block", () => {
    const result = runWithSetup(
      ['echo "setting up $1"', "export S=ready"],
      [{ command: "echo $S" }],
    );
    expect(result).toEqual({
      status: 0,
      setup: ["setting up one"],
      completed: [["ready"]],
      unfinished: [],
      finished: true,
    });
  });

  it("stops before the first block when the setup fails", () => {
    const result = runWithSetup(["echo partway", "false"], [{ command: "echo never" }]);
    expect(result).toEqual({
      status: 1,
      setup: ["partway"],
      completed: [],
      unfinished: [],
      finished: false,
    });
  });
});

describe("splitSetup", () => {
  const { setup, step } = markers;

  it("splits setup's lines from the blocks' output", () => {
    expect(splitSetup(`built\n\n${setup}\none\n\n${step}\n`, markers)).toEqual({
      lines: ["built"],
      rest: `one\n\n${step}\n`,
    });
  });

  it("gives a setup that printed nothing no lines", () => {
    expect(splitSetup(`\n${setup}\n`, markers)).toEqual({ lines: [], rest: "" });
  });

  it("has no rest while setup has not finished", () => {
    expect(splitSetup("still building\n", markers)).toEqual({ lines: ["still building"] });
  });
});

describe("splitOutput", () => {
  const { step, attempt } = markers;

  it("splits output into each block's lines", () => {
    const output = `one\n\n${step}\ntwo\nthree\n\n${step}\n`;
    expect(splitOutput(output, markers)).toEqual({
      completed: [["one"], ["two", "three"]],
      unfinished: [],
    });
  });

  it("gives a block with no output no lines", () => {
    const output = `\n${step}\nafter\n\n${step}\n`;
    expect(splitOutput(output, markers)).toEqual({ completed: [[], ["after"]], unfinished: [] });
  });

  it("keeps a block's output that does not end in a newline", () => {
    expect(splitOutput(`no newline\n${step}\n`, markers)).toEqual({
      completed: [["no newline"]],
      unfinished: [],
    });
  });

  it("keeps a blank last line the block printed itself", () => {
    expect(splitOutput(`text\n\n\n${step}\n`, markers)).toEqual({
      completed: [["text", ""]],
      unfinished: [],
    });
  });

  it("returns what a block printed before the session stopped", () => {
    const output = `one\n\n${step}\npartial\nerror: failed\n`;
    expect(splitOutput(output, markers)).toEqual({
      completed: [["one"]],
      unfinished: ["partial", "error: failed"],
    });
  });

  it("returns no blocks when the session stopped in the first", () => {
    expect(splitOutput("", markers)).toEqual({ completed: [], unfinished: [] });
  });

  it("keeps the last attempt that printed, when a retried block stopped between attempts", () => {
    const output = `wait\n\n${attempt}\nstill\n\n${attempt}\n`;
    expect(splitOutput(output, markers)).toEqual({ completed: [], unfinished: ["still"] });
  });

  it("keeps a finished block's last attempt even when it printed nothing", () => {
    const output = `failed\n\n${attempt}\n\n${step}\n`;
    expect(splitOutput(output, markers)).toEqual({ completed: [[]], unfinished: [] });
  });

  it("keeps only the last attempt of a retried block, finished or not", () => {
    const output = `first\n\n${attempt}\nsecond\n\n${step}\nwait\n\n${attempt}\nstill\n`;
    expect(splitOutput(output, markers)).toEqual({
      completed: [["second"]],
      unfinished: ["still"],
    });
  });
});

describe("completedBlocks", () => {
  it("counts the blocks the output shows as finished", () => {
    const { step, attempt } = markers;
    expect(completedBlocks("", markers)).toBe(0);
    expect(completedBlocks(`a\n\n${attempt}\nb\n${step}\n`, markers)).toBe(1);
    expect(completedBlocks(`\n${step}\n\n${step}\npartial`, markers)).toBe(2);
  });
});
