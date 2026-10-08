import { describe, expect, it } from "vitest";
import { parseTutorial } from "#scripts/tutorial/parse.ts";

const fence = "```";

describe("parseTutorial", () => {
  it("returns run blocks in page order, each with its line and command", () => {
    const page = [
      "# Steps",
      "",
      `${fence}bash run`,
      "echo one",
      fence,
      "",
      `${fence}bash run`,
      "echo two",
      "echo three",
      fence,
    ].join("\n");
    expect(parseTutorial(page)).toEqual([
      { line: 3, command: "echo one" },
      { line: 7, command: "echo two\necho three" },
    ]);
  });

  it("attaches an expect block to the run block before it", () => {
    const page = [
      `${fence}bash run`,
      "echo hello",
      fence,
      "",
      "The output:",
      "",
      `${fence}text expect`,
      "hello",
      "...",
      fence,
    ].join("\n");
    expect(parseTutorial(page)).toEqual([
      { line: 1, command: "echo hello", expect: { line: 7, lines: ["hello", "..."] } },
    ]);
  });

  it("reads an empty expect block as no output", () => {
    const page = [`${fence}bash run`, "true", fence, `${fence}text expect`, fence].join("\n");
    expect(parseTutorial(page)).toEqual([
      { line: 1, command: "true", expect: { line: 4, lines: [] } },
    ]);
  });

  it("ignores code blocks with no marker", () => {
    const page = [
      `${fence}bash`,
      "echo shown, not run",
      fence,
      "",
      `${fence}bash run`,
      "echo run",
      fence,
      "",
      `${fence}text`,
      "not checked",
      fence,
    ].join("\n");
    expect(parseTutorial(page)).toEqual([{ line: 5, command: "echo run" }]);
  });

  it("reads markers among other meta words", () => {
    const page = [`${fence}bash title="install" run`, "echo hi", fence].join("\n");
    expect(parseTutorial(page)).toEqual([{ line: 1, command: "echo hi" }]);
  });

  it("does not treat a marker inside another meta word as a marker", () => {
    const page = [`${fence}bash title="run"`, "echo hi", fence].join("\n");
    expect(parseTutorial(page)).toEqual([]);
  });

  it("numbers lines from the top of the file when the page has front matter", () => {
    const page = ["---", "title: A tutorial", "---", "", `${fence}bash run`, "echo hi", fence].join(
      "\n",
    );
    expect(parseTutorial(page)).toEqual([{ line: 5, command: "echo hi" }]);
  });

  it("parses the page as MDX, so JSX around the blocks is not mistaken for text", () => {
    const page = [
      'import { Callout } from "fumadocs-ui/components/callout";',
      "",
      "<Callout>",
      "",
      `${fence}bash run`,
      "echo inside",
      fence,
      "",
      "</Callout>",
    ].join("\n");
    expect(parseTutorial(page)).toEqual([{ line: 5, command: "echo inside" }]);
  });

  it("rejects an expect block with no run block before it", () => {
    const page = [`${fence}text expect`, "hello", fence].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "expect block at line 1 follows no run block; put it after the run block whose output it shows",
    );
  });

  it("rejects a second expect block for the same run block", () => {
    const page = [
      `${fence}bash run`,
      "echo hi",
      fence,
      `${fence}text expect`,
      "hi",
      fence,
      `${fence}text expect`,
      "hi",
      fence,
    ].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "expect block at line 7 is the second for the run block at line 1; merge it into the first",
    );
  });

  it("rejects a run marker on a block that is not bash", () => {
    const page = [`${fence}sh run`, "echo hi", fence].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      'run block at line 1 is "sh"; run blocks are executed by bash, so mark them ```bash run',
    );
  });
});
