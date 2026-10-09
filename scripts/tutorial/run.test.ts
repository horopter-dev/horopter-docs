import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkTutorial, formatReport, runTutorial } from "#scripts/tutorial/run.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const fence = "```";
const version = "v9.8.7";
const versions = { HOROPTER_VERSION: version, FLUX_VERSION: "2.6.4" };
const docsRoot = join(import.meta.dirname, "..", "..");
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

function setupScript(lines: string[]): string {
  const path = join(scratchDir(), "setup.sh");
  writeFileSync(path, lines.join("\n"));
  return path;
}

function withSetup(matter: string[], body: string[]): string {
  return page(["---", ...matter, "---", "", ...body]);
}

describe("runTutorial", () => {
  it("passes the echo fixture, whose variables and directories carry between blocks", async () => {
    const result = await runTutorial(join(fixtures, "echo.mdx"), versions);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
  });

  it("passes the setup fixture, whose setup script's exports reach its steps", async () => {
    const result = await runTutorial(join(fixtures, "setup.mdx"), versions);
    expect(result.setup).toEqual({
      command: "$DOCS_ROOT/scripts/tutorial/fixtures/setup.sh",
      output: [`building the world for Horopter ${version}`],
    });
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
  });

  it("fails the wrong-expect fixture at the block whose output differs", async () => {
    expect((await runTutorial(join(fixtures, "wrong-expect.mdx"), versions)).failure).toEqual({
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
    expect((await runTutorial(path, versions)).failure).toEqual({
      step: { line: 4, command: "echo partial\necho oops >&2\nfalse\necho after", timeout: 120 },
      reason: "exited with status 1",
      output: ["partial", "oops"],
    });
  });

  it("runs the steps in a throwaway directory, not where the harness was started", async () => {
    const path = page([`${fence}bash run`, `test "$PWD" != '${process.cwd()}'`, fence]);
    expect((await runTutorial(path, versions)).failure).toBeUndefined();
  });

  it("does not run a manual block, and lists it", async () => {
    const marker = join(scratchDir(), "ran");
    const path = page([`${fence}bash manual`, `touch '${marker}'`, fence]);
    const result = await runTutorial(path, versions);
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
    const { failure } = await runTutorial(path, versions);
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
    expect((await runTutorial(path, versions)).failure).toBeUndefined();
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
    expect((await runTutorial(path, versions)).failure).toBeUndefined();
  });

  it("fails a retry block that never succeeds at its timeout, with its last attempt", async () => {
    const path = page([`${fence}bash run retry=0.05 timeout=0.5`, "echo not yet", "false", fence]);
    const { failure } = await runTutorial(path, versions);
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
    const result = await runTutorial(path, versions);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
    expect(existsSync(marker)).toBe(true);
  });

  it("runs cleanup after a failing tutorial", async () => {
    const marker = join(scratchDir(), "cleaned");
    const path = withCleanup(`touch ${marker}`, [`${fence}bash run`, "false", fence]);
    expect((await runTutorial(path, versions)).failure?.reason).toBe("exited with status 1");
    expect(existsSync(marker)).toBe(true);
  });

  it("runs cleanup after a block that timed out", async () => {
    const marker = join(scratchDir(), "cleaned");
    const path = withCleanup(`touch ${marker}`, [
      `${fence}bash run timeout=0.2`,
      "sleep 30",
      fence,
    ]);
    expect((await runTutorial(path, versions)).failure?.reason).toBe(
      "exceeded its timeout of 0.2s",
    );
    expect(existsSync(marker)).toBe(true);
  });

  it("reports a failing cleanup with its output", async () => {
    const path = withCleanup("echo tearing down; exit 3", [`${fence}bash run`, "true", fence]);
    const result = await runTutorial(path, versions);
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
    expect((await runTutorial(path, versions)).failure).toBeUndefined();
  });

  it("gives cleanup the pinned release as HOROPTER_VERSION", async () => {
    const path = withCleanup(`test "$HOROPTER_VERSION" = ${version}`, [
      `${fence}bash run`,
      "true",
      fence,
    ]);
    expect((await runTutorial(path, versions)).cleanupFailure).toBeUndefined();
  });

  it("gives the steps and cleanup every pin", async () => {
    const path = withCleanup('test "$FLUX_VERSION" = 2.6.4', [
      `${fence}bash run`,
      'echo "$HOROPTER_VERSION $FLUX_VERSION"',
      fence,
      `${fence}text expect`,
      `${version} 2.6.4`,
      fence,
    ]);
    const result = await runTutorial(path, versions);
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
  });

  it("gives setup, the steps and cleanup the checkout's absolute path as DOCS_ROOT", async () => {
    const setup = setupScript([`test "$DOCS_ROOT" = '${docsRoot}'`]);
    const path = withSetup(
      [`setup: ${setup}`, `cleanup: test "$DOCS_ROOT" = '${docsRoot}'`],
      [`${fence}bash run`, `test "$DOCS_ROOT" = '${docsRoot}'`, fence],
    );
    const result = await runTutorial(path, versions);
    expect(result.setup?.reason).toBeUndefined();
    expect(result.failure).toBeUndefined();
    expect(result.cleanupFailure).toBeUndefined();
  });

  it("sources setup in the steps' shell, so its exports and cd reach every step", async () => {
    const setup = setupScript([
      'echo "building the world"',
      'export CLUSTER="kind-$FLUX_VERSION"',
      "mkdir world",
      "cd world",
    ]);
    const path = withSetup(
      [`setup: ${setup}`],
      [
        `${fence}bash run`,
        "true",
        fence,
        `${fence}bash run`,
        'echo "$CLUSTER in $(basename "$PWD")"',
        fence,
        `${fence}text expect`,
        "kind-2.6.4 in world",
        fence,
      ],
    );
    const result = await runTutorial(path, versions);
    expect(result.failure).toBeUndefined();
    expect(result.setup).toEqual({ command: setup, output: ["building the world"] });
  });

  it("fails a page at a failing setup, naming it, runs no step, and cleans up", async () => {
    const ran = join(scratchDir(), "ran");
    const cleaned = join(scratchDir(), "cleaned");
    const setup = setupScript(["echo halfway", "false", "echo never"]);
    const path = withSetup(
      [`setup: ${setup}`, `cleanup: touch ${cleaned}`],
      [`${fence}bash run`, `touch ${ran}`, fence],
    );
    const result = await runTutorial(path, versions);
    expect(result.setup).toEqual({
      command: setup,
      reason: "exited with status 1",
      output: ["halfway"],
    });
    expect(result.failure).toBeUndefined();
    expect(existsSync(ran)).toBe(false);
    expect(existsSync(cleaned)).toBe(true);
  });

  it("fails a setup that names no script", async () => {
    const path = withSetup(
      ["setup: $DOCS_ROOT/no/such/setup.sh"],
      [`${fence}bash run`, "true", fence],
    );
    const { setup } = await runTutorial(path, versions);
    expect(setup?.reason).toBe("exited with status 1");
    expect(setup?.output.join("\n")).toMatch(/no\/such\/setup\.sh: No such file or directory/);
  });

  it("does not give cleanup setup's exports", async () => {
    const setup = setupScript(["export FROM_SETUP=yes"]);
    const path = withSetup(
      [`setup: ${setup}`, 'cleanup: test -z "${FROM_SETUP:-}"'],
      [`${fence}bash run`, "true", fence],
    );
    expect((await runTutorial(path, versions)).cleanupFailure).toBeUndefined();
  });

  it("fails a setup that exits early, even with status 0, before any step", async () => {
    const ran = join(scratchDir(), "ran");
    const setup = setupScript(["exit 0"]);
    const path = withSetup([`setup: ${setup}`], [`${fence}bash run`, `touch ${ran}`, fence]);
    const result = await runTutorial(path, versions);
    expect(result.setup?.reason).toBe("exited with status 0");
    expect(existsSync(ran)).toBe(false);
  });

  it("fails a setup that outlives setup-timeout as a setup timeout, not step 1's", async () => {
    const setup = setupScript(["echo starting", "sleep 30"]);
    const path = withSetup(
      [`setup: ${setup}`, "setup-timeout: 1"],
      [`${fence}bash run timeout=60`, "true", fence],
    );
    const started = Date.now();
    const result = await runTutorial(path, versions);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(result.setup).toEqual({
      command: setup,
      reason: "exceeded its timeout of 1s",
      output: ["starting"],
    });
    expect(result.failure).toBeUndefined();
  });

  it("times the first step from the end of setup, under its own timeout", async () => {
    const setup = setupScript(["sleep 0.8"]);
    const path = withSetup(
      [`setup: ${setup}`, "setup-timeout: 1"],
      [`${fence}bash run timeout=0.3`, "sleep 30", fence],
    );
    const result = await runTutorial(path, versions);
    expect(result.setup?.reason).toBeUndefined();
    expect(result.failure?.reason).toBe("exceeded its timeout of 0.3s");
  });
});

describe("formatReport", () => {
  const tutorial = { steps: [], manual: [], setupTimeout: 120 };

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
        setupTimeout: 120,
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

  it("reports what setup printed before the steps' result", () => {
    const report = formatReport("page.mdx", {
      tutorial,
      setup: { command: "$DOCS_ROOT/setup.sh", output: ["cluster ready"] },
    });
    expect(report).toBe(
      [
        "page.mdx: setup passed",
        "  command:",
        "    $DOCS_ROOT/setup.sh",
        "  output:",
        "    cluster ready",
        "page.mdx: every run block passed",
        "",
      ].join("\n"),
    );
  });

  it("reports a failing setup as a setup failure, with no step's result", () => {
    const report = formatReport("page.mdx", {
      tutorial,
      setup: { command: "$DOCS_ROOT/setup.sh", reason: "exited with status 1", output: [] },
    });
    expect(report).toBe(
      [
        "page.mdx: setup exited with status 1; no run block ran",
        "  command:",
        "    $DOCS_ROOT/setup.sh",
        "  output:",
        "    (none)",
        "",
      ].join("\n"),
    );
  });
});

describe("checkTutorial", () => {
  it("passes a page that passes, with its report", async () => {
    expect(await checkTutorial(join(fixtures, "echo.mdx"), versions)).toEqual({
      passed: true,
      report: expect.stringMatching(/echo\.mdx: every run block passed\n/),
    });
  });

  it("fails a page whose steps fail, naming it", async () => {
    const path = join(fixtures, "wrong-expect.mdx");
    const { passed, report } = await checkTutorial(path, versions);
    expect(passed).toBe(false);
    expect(report).toMatch(new RegExp(`^${RegExp.escape(path)}: run block at line 14:`));
  });

  it("fails a page whose setup fails", async () => {
    const path = withSetup(["setup: /no/such/setup.sh"], []);
    const { passed, report } = await checkTutorial(path, versions);
    expect(passed).toBe(false);
    expect(report).toMatch(/: setup exited with status 1; no run block ran\n/);
  });

  it("fails a page whose cleanup fails", async () => {
    const path = withCleanup("false", []);
    expect((await checkTutorial(path, versions)).passed).toBe(false);
  });

  it("names the page when the harness cannot read it", async () => {
    const path = page([`${fence}sh run`, "echo hi", fence]);
    expect(await checkTutorial(path, versions)).toEqual({
      passed: false,
      report:
        `${path}: run block at line 1 is "sh"; run blocks are executed by bash, ` +
        "so mark them ```bash run\n",
    });
  });

  it("names the page when it does not exist", async () => {
    const { passed, report } = await checkTutorial("no/such/page.mdx", versions);
    expect(passed).toBe(false);
    expect(report).toMatch(/^no\/such\/page\.mdx: ENOENT/);
  });
});
