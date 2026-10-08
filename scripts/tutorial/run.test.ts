import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTutorial, formatReport, runTutorial } from "#scripts/tutorial/run.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const fence = "```";
const version = "v9.8.7";
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tutorial-test-"));
  created.push(dir);
  return dir;
}

function page(lines: string[]): string {
  const path = join(scratchDir(), "page.mdx");
  writeFileSync(path, lines.join("\n"));
  return path;
}

function withCleanup(cleanup: string, body: string[]): string {
  return page(["---", `cleanup: '${cleanup}'`, "---", "", ...body]);
}

describe("runTutorial", () => {
  it("passes the echo fixture, whose variables and directories carry between blocks", async () => {
    const result = await runTutorial(join(fixtures, "echo.mdx"), version);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
  });

  it("fails the wrong-expect fixture at the block whose output differs", async () => {
    expect((await runTutorial(join(fixtures, "wrong-expect.mdx"), version)).failure).toEqual({
      step: {
        line: 14,
        command: "echo two",
        timeout: 120,
        expect: { line: 18, lines: ["three"] },
      },
      reason: 'line 1: expected "three", got "two"',
      output: ["two"],
    });
  });

  it("fails at a block that exits non-zero, with what it printed", async () => {
    const path = page([
      `${fence}bash run`,
      "echo before",
      fence,
      `${fence}bash run`,
      "echo partial",
      "echo oops >&2",
      "false",
      "echo after",
      fence,
    ]);
    expect((await runTutorial(path, version)).failure).toEqual({
      step: { line: 4, command: "echo partial\necho oops >&2\nfalse\necho after", timeout: 120 },
      reason: "exited with status 1",
      output: ["partial", "oops"],
    });
  });

  it("runs the steps in a throwaway directory, not where the harness was started", async () => {
    const path = page([`${fence}bash run`, `test "$PWD" != '${process.cwd()}'`, fence]);
    expect((await runTutorial(path, version)).failure).toBeUndefined();
  });

  it("does not run a manual block, and lists it", async () => {
    const marker = join(scratchDir(), "ran");
    const path = page([`${fence}bash manual`, `touch '${marker}'`, fence]);
    const result = await runTutorial(path, version);
    expect(existsSync(marker)).toBe(false);
    expect(result.failure).toBeUndefined();
    expect(result.tutorial.manual).toEqual([{ line: 1, lang: "bash" }]);
  });

  it("fails a block that runs past its timeout, and stops the session there", async () => {
    const path = page([
      `${fence}bash run timeout=0.3`,
      "echo waiting",
      "sleep 30",
      fence,
      `${fence}bash run`,
      "echo never",
      fence,
    ]);
    const started = Date.now();
    const { failure } = await runTutorial(path, version);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(failure).toEqual({
      step: { line: 1, command: "echo waiting\nsleep 30", timeout: 0.3 },
      reason: "exceeded its timeout of 0.3s",
      output: ["waiting"],
    });
  });

  it("times each block from its own start", async () => {
    const path = page([
      `${fence}bash run timeout=2`,
      "sleep 1.2",
      fence,
      `${fence}bash run timeout=2`,
      "sleep 1.2",
      fence,
    ]);
    expect((await runTutorial(path, version)).failure).toBeUndefined();
  });

  it("passes a retry block that succeeds on a later attempt", async () => {
    const path = page([
      `${fence}bash run retry=0.05`,
      "n=$(( $(cat count 2>/dev/null || echo 0) + 1 )); echo $n > count",
      'echo "attempt $n"',
      'test "$n" -ge 3',
      fence,
      `${fence}text expect`,
      "attempt 3",
      fence,
    ]);
    expect((await runTutorial(path, version)).failure).toBeUndefined();
  });

  it("fails a retry block that never succeeds at its timeout, with its last attempt", async () => {
    const path = page([`${fence}bash run retry=0.05 timeout=0.5`, "echo not yet", "false", fence]);
    const { failure } = await runTutorial(path, version);
    expect(failure?.reason).toBe("exceeded its timeout of 0.5s");
    expect(failure?.output).toEqual(["not yet"]);
  });

  it("runs cleanup after a passing tutorial, in the session's directory", async () => {
    const marker = join(scratchDir(), "cleaned");
    const path = withCleanup(`test -d work && touch ${marker}`, [
      `${fence}bash run`,
      "mkdir work",
      fence,
    ]);
    const result = await runTutorial(path, version);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
    expect(existsSync(marker)).toBe(true);
  });

  it("runs cleanup after a failing tutorial", async () => {
    const marker = join(scratchDir(), "cleaned");
    const path = withCleanup(`touch ${marker}`, [`${fence}bash run`, "false", fence]);
    expect((await runTutorial(path, version)).failure?.reason).toBe("exited with status 1");
    expect(existsSync(marker)).toBe(true);
  });

  it("runs cleanup after a block that timed out", async () => {
    const marker = join(scratchDir(), "cleaned");
    const path = withCleanup(`touch ${marker}`, [
      `${fence}bash run timeout=0.2`,
      "sleep 30",
      fence,
    ]);
    expect((await runTutorial(path, version)).failure?.reason).toBe("exceeded its timeout of 0.2s");
    expect(existsSync(marker)).toBe(true);
  });

  it("reports a failing cleanup with its output", async () => {
    const path = withCleanup("echo tearing down; exit 3", [`${fence}bash run`, "true", fence]);
    const result = await runTutorial(path, version);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toEqual({
      command: "echo tearing down; exit 3",
      reason: "exited with status 3",
      output: ["tearing down"],
    });
  });

  it("gives the steps the pinned release as HOROPTER_VERSION", async () => {
    const path = page([
      `${fence}bash run`,
      'echo "pinned $HOROPTER_VERSION"',
      fence,
      `${fence}text expect`,
      `pinned ${version}`,
      fence,
    ]);
    expect((await runTutorial(path, version)).failure).toBeUndefined();
  });

  it("gives cleanup the pinned release as HOROPTER_VERSION", async () => {
    const path = withCleanup(`test "$HOROPTER_VERSION" = ${version}`, [
      `${fence}bash run`,
      "true",
      fence,
    ]);
    expect((await runTutorial(path, version)).cleanupFailure).toBeUndefined();
  });
});

describe("formatReport", () => {
  const tutorial = { steps: [], manual: [] };

  it("names the page, the block by line, the command, the expected lines and the output", () => {
    const report = formatReport("content/docs/tutorials/try.mdx", {
      tutorial,
      failure: {
        step: {
          line: 14,
          command: "echo two",
          timeout: 120,
          expect: { line: 18, lines: ["three"] },
        },
        reason: 'line 1: expected "three", got "two"',
        output: ["two"],
      },
    });
    expect(report).toBe(
      [
        'content/docs/tutorials/try.mdx: run block at line 14: line 1: expected "three", got "two"',
        "  command:",
        "    echo two",
        "  expected (expect block at line 18):",
        "    three",
        "  output:",
        "    two",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the expected lines when the block has no expect block", () => {
    const report = formatReport("page.mdx", {
      tutorial,
      failure: { step: { line: 4, command: "false", timeout: 120 }, reason: "x", output: [] },
    });
    expect(report).toBe(
      [
        "page.mdx: run block at line 4: x",
        "  command:",
        "    false",
        "  output:",
        "    (none)",
        "",
      ].join("\n"),
    );
  });

  it("says a page passed, and lists each manual block as untested", () => {
    const report = formatReport("page.mdx", {
      tutorial: {
        steps: [],
        manual: [
          { line: 3, lang: "bash" },
          { line: 9, lang: "yaml" },
        ],
      },
    });
    expect(report).toBe(
      [
        "page.mdx: every run block passed",
        "page.mdx: untested: manual block at line 3 (bash)",
        "page.mdx: untested: manual block at line 9 (yaml)",
        "",
      ].join("\n"),
    );
  });

  it("reports a failing cleanup after the steps' result", () => {
    const report = formatReport("page.mdx", {
      tutorial,
      cleanupFailure: {
        command: "docker compose down",
        reason: "exited with status 1",
        output: [],
      },
    });
    expect(report).toBe(
      [
        "page.mdx: every run block passed",
        "page.mdx: cleanup exited with status 1",
        "  command:",
        "    docker compose down",
        "  output:",
        "    (none)",
        "",
      ].join("\n"),
    );
  });
});

describe("checkTutorial", () => {
  it("passes a page that passes, with its report", async () => {
    expect(await checkTutorial(join(fixtures, "echo.mdx"), version)).toEqual({
      passed: true,
      report: expect.stringMatching(/echo\.mdx: every run block passed\n/),
    });
  });

  it("fails a page whose steps fail, naming it", async () => {
    const path = join(fixtures, "wrong-expect.mdx");
    const { passed, report } = await checkTutorial(path, version);
    expect(passed).toBe(false);
    expect(report).toMatch(new RegExp(`^${RegExp.escape(path)}: run block at line 14:`));
  });

  it("fails a page whose cleanup fails", async () => {
    const path = withCleanup("false", []);
    expect((await checkTutorial(path, version)).passed).toBe(false);
  });

  it("names the page when the harness cannot read it", async () => {
    const path = page([`${fence}sh run`, "echo hi", fence]);
    expect(await checkTutorial(path, version)).toEqual({
      passed: false,
      report:
        `${path}: run block at line 1 is "sh"; run blocks are executed by bash, ` +
        "so mark them ```bash run\n",
    });
  });

  it("names the page when it does not exist", async () => {
    const { passed, report } = await checkTutorial("no/such/page.mdx", version);
    expect(passed).toBe(false);
    expect(report).toMatch(/^no\/such\/page\.mdx: ENOENT/);
  });
});
