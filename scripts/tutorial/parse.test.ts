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
    expect(parseTutorial(page).steps).toEqual([
      { line: 3, command: "echo one", timeout: 120 },
      { line: 7, command: "echo two\necho three", timeout: 120 },
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
    expect(parseTutorial(page).steps).toEqual([
      {
        line: 1,
        command: "echo hello",
        timeout: 120,
        expect: { line: 7, lines: ["hello", "..."] },
      },
    ]);
  });

  it("reads an empty expect block as no output", () => {
    const page = [`${fence}bash run`, "true", fence, `${fence}text expect`, fence].join("\n");
    expect(parseTutorial(page).steps).toEqual([
      { line: 1, command: "true", timeout: 120, expect: { line: 4, lines: [] } },
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
    expect(parseTutorial(page).steps).toEqual([{ line: 5, command: "echo run", timeout: 120 }]);
  });

  it("reads markers among other meta words", () => {
    const page = [`${fence}bash title="install" run`, "echo hi", fence].join("\n");
    expect(parseTutorial(page).steps).toEqual([{ line: 1, command: "echo hi", timeout: 120 }]);
  });

  it("does not treat a marker inside another meta word as a marker", () => {
    const page = [`${fence}bash title="run"`, "echo hi", fence].join("\n");
    expect(parseTutorial(page).steps).toEqual([]);
  });

  it("numbers lines from the top of the file when the page has front matter", () => {
    const page = ["---", "title: A tutorial", "---", "", `${fence}bash run`, "echo hi", fence].join(
      "\n",
    );
    expect(parseTutorial(page).steps).toEqual([{ line: 5, command: "echo hi", timeout: 120 }]);
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
    expect(parseTutorial(page).steps).toEqual([{ line: 5, command: "echo inside", timeout: 120 }]);
  });

  it("rejects an expect block with no run block before it", () => {
    const page = [`${fence}text expect`, "hello", fence].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "expect block at line 1 follows no run block; " +
        "put it after the run block whose output it shows",
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

  it("reads timeout and retry options from a run block's meta", () => {
    const page = [`${fence}bash run timeout=300 retry=5`, "kubectl get ready", fence].join("\n");
    expect(parseTutorial(page).steps).toEqual([
      { line: 1, command: "kubectl get ready", timeout: 300, retry: 5 },
    ]);
  });

  it("accepts fractional seconds", () => {
    const page = [`${fence}bash run timeout=0.5 retry=0.1`, "true", fence].join("\n");
    expect(parseTutorial(page).steps).toEqual([
      { line: 1, command: "true", timeout: 0.5, retry: 0.1 },
    ]);
  });

  it.each(["timeout=0", "timeout=-1", "timeout=abc", "timeout=", "retry=0", "retry=5s"])(
    "rejects the option %s",
    (option) => {
      const page = [`${fence}bash run ${option}`, "true", fence].join("\n");
      const [name = ""] = option.split("=");
      expect(() => parseTutorial(page)).toThrow(
        `run block at line 1 has ${option}; ${name} takes a positive number of seconds`,
      );
    },
  );

  it("lists manual blocks, in page order, without running them", () => {
    const page = [
      `${fence}bash manual`,
      "open http://localhost:3000",
      fence,
      `${fence}bash run`,
      "echo ran",
      fence,
      `${fence}yaml manual`,
      "key: value",
      fence,
    ].join("\n");
    expect(parseTutorial(page)).toEqual({
      steps: [{ line: 4, command: "echo ran", timeout: 120 }],
      manual: [
        { line: 1, lang: "bash" },
        { line: 7, lang: "yaml" },
      ],
      setupTimeout: 120,
    });
  });

  it("treats an expect block after a manual block as untested, not as the run block's", () => {
    const page = [
      `${fence}bash run`,
      "echo ran",
      fence,
      `${fence}bash manual`,
      "echo by hand",
      fence,
      `${fence}text expect`,
      "by hand",
      fence,
    ].join("\n");
    expect(parseTutorial(page)).toEqual({
      steps: [{ line: 1, command: "echo ran", timeout: 120 }],
      manual: [{ line: 4, lang: "bash" }],
      setupTimeout: 120,
    });
  });

  it("rejects a block marked both run and manual", () => {
    const page = [`${fence}bash run manual`, "true", fence].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "block at line 1 is marked both run and manual; a step is one or the other",
    );
  });

  it("reads the cleanup command from the front matter", () => {
    const page = ["---", "title: T", "cleanup: docker compose down -v", "---", ""].join("\n");
    expect(parseTutorial(page)).toEqual({
      steps: [],
      manual: [],
      setupTimeout: 120,
      cleanup: "docker compose down -v",
    });
  });

  it("rejects a cleanup that is not a command", () => {
    const page = ["---", "cleanup:", "  - one", "---", ""].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "front matter cleanup is not a string; give it one shell command",
    );
  });

  it("reads the setup command and its timeout from the front matter", () => {
    const page = [
      "---",
      "setup: $DOCS_ROOT/journeys/flux/setup.sh",
      "setup-timeout: 600",
      "---",
      "",
    ].join("\n");
    expect(parseTutorial(page)).toEqual({
      steps: [],
      manual: [],
      setup: "$DOCS_ROOT/journeys/flux/setup.sh",
      setupTimeout: 600,
    });
  });

  it("gives setup 120 seconds when the page sets no setup-timeout", () => {
    const page = ["---", "setup: ./setup.sh", "---", ""].join("\n");
    expect(parseTutorial(page).setupTimeout).toBe(120);
  });

  it("rejects a setup that is not a command", () => {
    const page = ["---", "setup:", "  - one", "---", ""].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      "front matter setup is not a string; give it one shell command",
    );
  });

  it.each([["0"], ["-5"], ["1.5"], ['"60"'], ["ten"]])("rejects a setup-timeout of %s", (value) => {
    const page = ["---", "setup: ./setup.sh", `setup-timeout: ${value}`, "---", ""].join("\n");
    expect(() => parseTutorial(page)).toThrow(
      /^front matter setup-timeout is .*; give it a positive whole number of seconds$/,
    );
  });
});
