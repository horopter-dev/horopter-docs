import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { blockAt, parseTutorial } from "#scripts/tutorial/parse.ts";

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
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
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
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
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
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
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
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 5, command: "echo run", timeout: 120 },
    ]);
  });

  it("reads markers among other meta words", () => {
    const page = [`${fence}bash title="install" run`, "echo hi", fence].join("\n");
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 1, command: "echo hi", timeout: 120 },
    ]);
  });

  it("does not treat a marker inside another meta word as a marker", () => {
    const page = [`${fence}bash title="run"`, "echo hi", fence].join("\n");
    expect(parseTutorial(page, "page.mdx").steps).toEqual([]);
  });

  it("numbers lines from the top of the file when the page has front matter", () => {
    const page = ["---", "title: A tutorial", "---", "", `${fence}bash run`, "echo hi", fence].join(
      "\n",
    );
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 5, command: "echo hi", timeout: 120 },
    ]);
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
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 5, command: "echo inside", timeout: 120 },
    ]);
  });

  it("rejects an expect block with no run block before it", () => {
    const page = [`${fence}text expect`, "hello", fence].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
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
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
      "expect block at line 7 is the second for the run block at line 1; merge it into the first",
    );
  });

  it("rejects a run marker on a block that is not bash", () => {
    const page = [`${fence}sh run`, "echo hi", fence].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
      'run block at line 1 is "sh"; run blocks are executed by bash, so mark them ```bash run',
    );
  });

  it("reads timeout and retry options from a run block's meta", () => {
    const page = [`${fence}bash run timeout=300 retry=5`, "kubectl get ready", fence].join("\n");
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 1, command: "kubectl get ready", timeout: 300, retry: 5 },
    ]);
  });

  it("accepts fractional seconds", () => {
    const page = [`${fence}bash run timeout=0.5 retry=0.1`, "true", fence].join("\n");
    expect(parseTutorial(page, "page.mdx").steps).toEqual([
      { line: 1, command: "true", timeout: 0.5, retry: 0.1 },
    ]);
  });

  it.each(["timeout=0", "timeout=-1", "timeout=abc", "timeout=", "retry=0", "retry=5s"])(
    "rejects the option %s",
    (option) => {
      const page = [`${fence}bash run ${option}`, "true", fence].join("\n");
      const [name = ""] = option.split("=");
      expect(() => parseTutorial(page, "page.mdx")).toThrow(
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
    expect(parseTutorial(page, "page.mdx")).toEqual({
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
    expect(parseTutorial(page, "page.mdx")).toEqual({
      steps: [{ line: 1, command: "echo ran", timeout: 120 }],
      manual: [{ line: 4, lang: "bash" }],
      setupTimeout: 120,
    });
  });

  it("rejects a block marked both run and manual", () => {
    const page = [`${fence}bash run manual`, "true", fence].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
      "block at line 1 is marked both run and manual; a step is one or the other",
    );
  });

  it("reads the cleanup command from the front matter", () => {
    const page = ["---", "title: T", "cleanup: docker compose down -v", "---", ""].join("\n");
    expect(parseTutorial(page, "page.mdx")).toEqual({
      steps: [],
      manual: [],
      setupTimeout: 120,
      cleanup: "docker compose down -v",
    });
  });

  it("rejects a cleanup that is not a command", () => {
    const page = ["---", "cleanup:", "  - one", "---", ""].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
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
    expect(parseTutorial(page, "page.mdx")).toEqual({
      steps: [],
      manual: [],
      setup: "$DOCS_ROOT/journeys/flux/setup.sh",
      setupTimeout: 600,
    });
  });

  it("gives setup 120 seconds when the page sets no setup-timeout", () => {
    const page = ["---", "setup: ./setup.sh", "---", ""].join("\n");
    expect(parseTutorial(page, "page.mdx").setupTimeout).toBe(120);
  });

  it("rejects a setup that is not a command", () => {
    const page = ["---", "setup:", "  - one", "---", ""].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
      "front matter setup is not a string; give it one shell command",
    );
  });

  it.each([["0"], ["-5"], ["1.5"], ['"60"'], ["ten"]])("rejects a setup-timeout of %s", (value) => {
    const page = ["---", "setup: ./setup.sh", `setup-timeout: ${value}`, "---", ""].join("\n");
    expect(() => parseTutorial(page, "page.mdx")).toThrow(
      /^front matter setup-timeout is .*; give it a positive whole number of seconds$/,
    );
  });
});

function parsePage(root: string, path: string): ReturnType<typeof parseTutorial> {
  const page = join(root, path);
  return parseTutorial(readFileSync(page, "utf8"), page);
}

describe("parseTutorial with <include>", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tree(files: Record<string, string[]>): string {
    const root = mkdtempSync(join(tmpdir(), "parse-test-"));
    created.push(root);
    for (const [path, lines] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), lines.join("\n"));
    }
    return root;
  }

  it("collects a run block inside an included file, with that file and its line", () => {
    const root = tree({
      "docs/page.mdx": [
        `${fence}bash run`,
        "echo page",
        fence,
        "",
        "<include>../snippets/s.mdx</include>",
      ],
      "snippets/s.mdx": ["Some prose.", "", `${fence}bash run`, "echo snippet", fence],
    });
    expect(parsePage(root, "docs/page.mdx").steps).toEqual([
      { line: 1, command: "echo page", timeout: 120 },
      {
        line: 3,
        file: relative(process.cwd(), join(root, "snippets/s.mdx")),
        command: "echo snippet",
        timeout: 120,
      },
    ]);
  });

  it("keeps page order, the included blocks standing where the include stands", () => {
    const root = tree({
      "page.mdx": [
        `${fence}bash run`,
        "echo before",
        fence,
        "",
        "<include>./s.mdx</include>",
        "",
        `${fence}bash run`,
        "echo after",
        fence,
      ],
      "s.mdx": [`${fence}bash run`, "echo inside", fence],
    });
    const commands = parsePage(root, "page.mdx").steps.map((step) => step.command);
    expect(commands).toEqual(["echo before", "echo inside", "echo after"]);
  });

  it("attaches an included expect block, and lists an included manual block", () => {
    const root = tree({
      "page.mdx": ["<include>s.mdx</include>"],
      "s.mdx": [
        `${fence}bash run`,
        "echo hi",
        fence,
        `${fence}text expect`,
        "hi",
        fence,
        `${fence}bash manual`,
        "go install x",
        fence,
      ],
    });
    const file = relative(process.cwd(), join(root, "s.mdx"));
    expect(parsePage(root, "page.mdx")).toEqual({
      steps: [
        {
          line: 1,
          file,
          command: "echo hi",
          timeout: 120,
          expect: { line: 4, file, lines: ["hi"] },
        },
      ],
      manual: [{ line: 7, file, lang: "bash" }],
      setupTimeout: 120,
    });
  });

  it("finds blocks an include wraps in JSX, such as tabs", () => {
    const root = tree({
      "page.mdx": ["<include>s.mdx</include>"],
      "s.mdx": [
        '<Tabs items={["One"]}>',
        '  <Tab value="One">',
        "",
        `${fence}bash run`,
        "echo tab",
        fence,
        "",
        "  </Tab>",
        "</Tabs>",
      ],
    });
    expect(parsePage(root, "page.mdx").steps.map((step) => step.line)).toEqual([4]);
  });

  it("numbers an included file's lines from its top when it has front matter", () => {
    const root = tree({
      "page.mdx": ["<include>s.mdx</include>"],
      "s.mdx": ["---", "title: x", "---", "", `${fence}bash run`, "echo hi", fence],
    });
    expect(parsePage(root, "page.mdx").steps.map((step) => step.line)).toEqual([5]);
  });

  it("resolves a nested include against the file that holds it", () => {
    const root = tree({
      "page.mdx": ["<include>a/outer.mdx</include>"],
      "a/outer.mdx": ["<include>inner.mdx</include>"],
      "a/inner.mdx": [`${fence}bash run`, "echo inner", fence],
    });
    expect(parsePage(root, "page.mdx").steps.map((step) => step.command)).toEqual(["echo inner"]);
  });

  it("resolves an include marked cwd against the working directory", () => {
    const root = tree({ "s.mdx": [`${fence}bash run`, "echo cwd", fence] });
    const fromCwd = relative(process.cwd(), join(root, "s.mdx"));
    mkdirSync(join(root, "a", "b", "c"), { recursive: true });
    writeFileSync(join(root, "a", "b", "c", "page.mdx"), `<include cwd>${fromCwd}</include>`);
    expect(parsePage(root, "a/b/c/page.mdx").steps.map((step) => step.command)).toEqual([
      "echo cwd",
    ]);
  });

  it("includes a file that is not Markdown as one code block, with its lang and meta", () => {
    const root = tree({
      "page.mdx": ['<include lang="bash" meta="run timeout=5">install.sh</include>'],
      "install.sh": ["echo one", "echo two"],
    });
    expect(parsePage(root, "page.mdx").steps).toEqual([
      {
        line: 1,
        file: relative(process.cwd(), join(root, "install.sh")),
        command: "echo one\necho two",
        timeout: 5,
      },
    ]);
  });

  it("fails on a missing include file, naming the include and the file", () => {
    const root = tree({ "page.mdx": ["Prose.", "", "<include>./missing.mdx</include>"] });
    expect(() => parsePage(root, "page.mdx")).toThrow(
      `include at line 3 names ${relative(process.cwd(), join(root, "missing.mdx"))}, ` +
        "which cannot be read: ENOENT",
    );
  });

  it("fails on an include of a section, which the harness does not expand", () => {
    const root = tree({
      "page.mdx": ["<include>s.mdx#install</include>"],
      "s.mdx": ["## Install"],
    });
    expect(() => parsePage(root, "page.mdx")).toThrow(
      "include at line 1 names section install of s.mdx; " +
        "the tutorial harness does not expand sections, so include the whole file",
    );
  });

  it("names the included file when a block in it is malformed", () => {
    const root = tree({
      "page.mdx": ["<include>s.mdx</include>"],
      "s.mdx": ["", `${fence}sh run`, "echo hi", fence],
    });
    const file = relative(process.cwd(), join(root, "s.mdx"));
    expect(() => parsePage(root, "page.mdx")).toThrow(`run block at line 2 of ${file} is "sh"`);
  });
});

describe("blockAt", () => {
  it("names a block on the page by its line", () => {
    expect(blockAt({ line: 4 })).toBe("line 4");
  });

  it("names a block in an included file by its line and the file", () => {
    expect(blockAt({ line: 4, file: "content/snippets/s.mdx" })).toBe(
      "line 4 of content/snippets/s.mdx",
    );
  });
});
