import { describe, expect, it } from "vitest";
import { sessionScript, splitOutput } from "#scripts/tutorial/session.ts";

const sentinel = "__STEP_test__";

describe("sessionScript", () => {
  it("runs every command in one strict shell, with a sentinel line after each", () => {
    expect(sessionScript(["export A=1", "echo $A"], sentinel)).toBe(
      [
        "set -euo pipefail",
        "exec 2>&1",
        "export A=1",
        "printf '\\n%s\\n' '__STEP_test__'",
        "echo $A",
        "printf '\\n%s\\n' '__STEP_test__'",
        "",
      ].join("\n"),
    );
  });
});

describe("splitOutput", () => {
  it("splits output into each block's lines", () => {
    const output = `one\n\n${sentinel}\ntwo\nthree\n\n${sentinel}\n`;
    expect(splitOutput(output, sentinel)).toEqual({
      completed: [["one"], ["two", "three"]],
      unfinished: [],
    });
  });

  it("gives a block with no output no lines", () => {
    const output = `\n${sentinel}\nafter\n\n${sentinel}\n`;
    expect(splitOutput(output, sentinel)).toEqual({ completed: [[], ["after"]], unfinished: [] });
  });

  it("keeps a block's output that does not end in a newline", () => {
    const output = `no newline\n${sentinel}\n`;
    expect(splitOutput(output, sentinel)).toEqual({
      completed: [["no newline"]],
      unfinished: [],
    });
  });

  it("keeps a blank last line the block printed itself", () => {
    const output = `text\n\n\n${sentinel}\n`;
    expect(splitOutput(output, sentinel)).toEqual({ completed: [["text", ""]], unfinished: [] });
  });

  it("returns what a block printed before the session stopped", () => {
    const output = `one\n\n${sentinel}\npartial\nerror: failed\n`;
    expect(splitOutput(output, sentinel)).toEqual({
      completed: [["one"]],
      unfinished: ["partial", "error: failed"],
    });
  });

  it("returns no blocks when the session stopped in the first", () => {
    expect(splitOutput("", sentinel)).toEqual({ completed: [], unfinished: [] });
  });
});
