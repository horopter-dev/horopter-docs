import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTutorial, formatFailure, runTutorial } from "#scripts/tutorial/run.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const fence = "```";
const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function page(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tutorial-page-"));
  created.push(dir);
  const path = join(dir, "page.mdx");
  writeFileSync(path, lines.join("\n"));
  return path;
}

describe("runTutorial", () => {
  it("passes the echo fixture, whose variables and directories carry between blocks", () => {
    expect(runTutorial(join(fixtures, "echo.mdx"))).toBeUndefined();
  });

  it("fails the wrong-expect fixture at the block whose output differs", () => {
    expect(runTutorial(join(fixtures, "wrong-expect.mdx"))).toEqual({
      step: { line: 14, command: "echo two", expect: { line: 18, lines: ["three"] } },
      reason: 'line 1: expected "three", got "two"',
      output: ["two"],
    });
  });

  it("fails at a block that exits non-zero, with what it printed", () => {
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
    expect(runTutorial(path)).toEqual({
      step: { line: 4, command: "echo partial\necho oops >&2\nfalse\necho after" },
      reason: "exited with status 1",
      output: ["partial", "oops"],
    });
  });

  it("runs the steps in a throwaway directory, not where the harness was started", () => {
    const path = page([`${fence}bash run`, `test "$PWD" != '${process.cwd()}'`, fence]);
    expect(runTutorial(path)).toBeUndefined();
  });
});

describe("formatFailure", () => {
  it("names the page, the block by line, the command, the expected lines and the output", () => {
    const report = formatFailure("content/docs/tutorials/try.mdx", {
      step: { line: 14, command: "echo two", expect: { line: 18, lines: ["three"] } },
      reason: 'line 1: expected "three", got "two"',
      output: ["two"],
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
    const report = formatFailure("page.mdx", {
      step: { line: 4, command: "false" },
      reason: "exited with status 1",
      output: [],
    });
    expect(report).toBe(
      [
        "page.mdx: run block at line 4: exited with status 1",
        "  command:",
        "    false",
        "  output:",
        "    (none)",
        "",
      ].join("\n"),
    );
  });
});

describe("checkTutorial", () => {
  it("reports nothing for a page that passes", () => {
    expect(checkTutorial(join(fixtures, "echo.mdx"))).toBeUndefined();
  });

  it("reports a failing page by name", () => {
    const path = join(fixtures, "wrong-expect.mdx");
    expect(checkTutorial(path)).toMatch(
      new RegExp(`^${RegExp.escape(path)}: run block at line 14:`),
    );
  });

  it("names the page when the harness cannot read it", () => {
    const path = page([`${fence}sh run`, "echo hi", fence]);
    expect(checkTutorial(path)).toBe(
      `${path}: run block at line 1 is "sh"; run blocks are executed by bash, ` +
        "so mark them ```bash run\n",
    );
  });

  it("names the page when it does not exist", () => {
    expect(checkTutorial("no/such/page.mdx")).toMatch(/^no\/such\/page\.mdx: ENOENT/);
  });
});
