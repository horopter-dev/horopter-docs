import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVersions, type Versions } from "#lib/versions.ts";
import { matchOutput } from "#scripts/tutorial/match.ts";
import {
  defaultTimeout,
  parseTutorial,
  type Step,
  type Tutorial,
} from "#scripts/tutorial/parse.ts";
import {
  completedBlocks,
  type Markers,
  newMarkers,
  sessionScript,
  splitOutput,
  type SetupOutput,
  splitSetup,
} from "#scripts/tutorial/session.ts";

export interface Failure {
  step: Step;
  reason: string;
  output: string[];
}

export interface SetupRun {
  command: string;
  /** Why the setup failed, when it did. */
  reason?: string;
  output: string[];
}

export interface CleanupFailure {
  command: string;
  reason: string;
  output: string[];
}

export interface TutorialResult {
  tutorial: Tutorial;
  setup?: SetupRun;
  failure?: Failure;
  cleanupFailure?: CleanupFailure;
}

interface Phase {
  index: number;
  seconds: number;
}

interface ScriptRun {
  output: string;
  ok: boolean;
  reason: string;
}

type Environment = Record<string, string>;

/** The `horopter-docs` checkout's absolute path, given to every script as `DOCS_ROOT`. */
const docsRoot = join(import.meta.dirname, "..", "..");

function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

function exitReason(code: number | null, signal: string | null, timedOut?: Phase): string {
  if (timedOut !== undefined) {
    return `exceeded its timeout of ${timedOut.seconds}s`;
  }
  return signal === null ? `exited with status ${code}` : `killed by ${signal}`;
}

/**
 * Runs a bash script in its own process group, with the given variables in its environment.
 * The group is killed when the current phase runs past its limit, and when the script exits,
 * so nothing the script started outlives it.
 */
function runScript(
  script: string,
  cwd: string,
  environment: Environment,
  phaseOf: (output: string) => Phase,
) {
  return new Promise<ScriptRun>((resolve, reject) => {
    const child = spawn("bash", ["-c", script], {
      cwd,
      env: { ...process.env, ...environment },
      detached: true,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    let phase: Phase = { index: -1, seconds: 0 };
    let timer: NodeJS.Timeout | undefined;
    let timedOut: Phase | undefined;
    const watch = () => {
      const next = phaseOf(output);
      if (next.index === phase.index) {
        return;
      }
      phase = next;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = phase;
        killGroup(child.pid);
      }, phase.seconds * 1000);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      watch();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`could not run bash: ${error.message}`, { cause: error }));
    });
    child.on("exit", () => {
      clearTimeout(timer);
      killGroup(child.pid);
    });
    child.on("close", (code, signal) => {
      resolve({ output, ok: code === 0, reason: exitReason(code, signal, timedOut) });
    });
    watch();
  });
}

/** Splits off what setup printed; with no setup, all the output is the steps'. */
function afterSetup(tutorial: Tutorial, output: string, markers: Markers): SetupOutput {
  return tutorial.setup === undefined ? { lines: [], rest: output } : splitSetup(output, markers);
}

function currentPhase(tutorial: Tutorial, output: string, markers: Markers): Phase {
  const { rest } = afterSetup(tutorial, output, markers);
  if (rest === undefined) {
    return { index: 0, seconds: tutorial.setupTimeout };
  }
  const index = completedBlocks(rest, markers);
  return { index: index + 1, seconds: tutorial.steps[index]?.timeout ?? defaultTimeout };
}

function firstFailure(steps: Step[], stepsOutput: string, run: ScriptRun, markers: Markers) {
  const { completed, unfinished } = splitOutput(stepsOutput, markers);
  for (const [index, output] of completed.entries()) {
    const step = steps[index];
    if (step?.expect === undefined) {
      continue;
    }
    const reason = matchOutput(step.expect.lines, output);
    if (reason !== undefined) {
      return { step, reason, output } satisfies Failure;
    }
  }
  const stopped = steps[completed.length];
  return stopped === undefined
    ? undefined
    : ({ step: stopped, reason: run.reason, output: unfinished } satisfies Failure);
}

function readRun(tutorial: Tutorial, run: ScriptRun, markers: Markers): TutorialResult {
  const result: TutorialResult = { tutorial };
  const { lines, rest } = afterSetup(tutorial, run.output, markers);
  if (tutorial.setup !== undefined) {
    result.setup =
      rest === undefined
        ? { command: tutorial.setup, reason: run.reason, output: lines }
        : { command: tutorial.setup, output: lines };
  }
  if (rest === undefined) {
    return result;
  }
  const failure = firstFailure(tutorial.steps, rest, run, markers);
  if (failure !== undefined) {
    result.failure = failure;
  }
  return result;
}

async function runCleanup(
  command: string,
  cwd: string,
  environment: Environment,
): Promise<CleanupFailure | undefined> {
  const markers = newMarkers();
  const script = sessionScript([{ command }], markers);
  const run = await runScript(script, cwd, environment, () => ({
    index: 0,
    seconds: defaultTimeout,
  }));
  if (run.ok) {
    return undefined;
  }
  return { command, reason: run.reason, output: splitOutput(run.output, markers).unfinished };
}

/**
 * Runs a tutorial page's run blocks in one bash session, in a throwaway directory, and checks
 * each against its expect block. The page's setup script, if any, is sourced first in the same
 * session, limited to its setup timeout, and each block is limited to its timeout. A failed
 * setup stops the session before any block. The page's cleanup command runs afterwards in the
 * same directory, whatever setup and the steps did, without setup's exports. Every script sees
 * each pin by its key and the checkout's absolute path as `DOCS_ROOT`.
 *
 * Args:
 *   pagePath: The page's MDX file.
 *   versions: The pins, from `readVersions`.
 *
 * Returns:
 *   The parsed page; what setup printed and why it failed, if it did; the first failure, a
 *   mismatched expect block or a block that stopped the session; and the cleanup's failure.
 *
 * Raises:
 *   Error: the page cannot be read or parsed, or bash cannot be started.
 */
export async function runTutorial(pagePath: string, versions: Versions): Promise<TutorialResult> {
  const tutorial = parseTutorial(readFileSync(pagePath, "utf8"));
  const environment = { ...versions, DOCS_ROOT: docsRoot };
  const markers = newMarkers();
  const workDir = mkdtempSync(join(tmpdir(), "tutorial-"));
  try {
    const script = sessionScript(tutorial.steps, markers, tutorial.setup);
    const run = await runScript(script, workDir, environment, (output) =>
      currentPhase(tutorial, output, markers),
    );
    const result = readRun(tutorial, run, markers);
    const cleanupFailure =
      tutorial.cleanup === undefined
        ? undefined
        : await runCleanup(tutorial.cleanup, workDir, environment);
    if (cleanupFailure !== undefined) {
      result.cleanupFailure = cleanupFailure;
    }
    return result;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function indented(lines: string[]): string[] {
  return (lines.length === 0 ? ["(none)"] : lines).map((line) => `    ${line}`);
}

function failureLines(pagePath: string, failure: Failure | undefined): string[] {
  if (failure === undefined) {
    return [`${pagePath}: every run block passed`];
  }
  const { step, reason, output } = failure;
  const expected =
    step.expect === undefined
      ? []
      : [`  expected (expect block at line ${step.expect.line}):`, ...indented(step.expect.lines)];
  return [
    `${pagePath}: run block at line ${step.line}: ${reason}`,
    "  command:",
    ...indented(step.command.split("\n")),
    ...expected,
    "  output:",
    ...indented(output),
  ];
}

function commandLines(command: string, output: string[]): string[] {
  return ["  command:", ...indented(command.split("\n")), "  output:", ...indented(output)];
}

function setupLines(pagePath: string, setup: SetupRun | undefined): string[] {
  if (setup === undefined) {
    return [];
  }
  const outcome = setup.reason === undefined ? "passed" : `${setup.reason}; no run block ran`;
  return [`${pagePath}: setup ${outcome}`, ...commandLines(setup.command, setup.output)];
}

function cleanupLines(pagePath: string, failure: CleanupFailure | undefined): string[] {
  if (failure === undefined) {
    return [];
  }
  return [
    `${pagePath}: cleanup ${failure.reason}`,
    ...commandLines(failure.command, failure.output),
  ];
}

/**
 * Describes a tutorial's run for the person reading CI's log.
 *
 * Args:
 *   pagePath: The page, as it should be named.
 *   result: What `runTutorial` returned.
 *
 * Returns:
 *   The report: setup's command and output, if the page has one; whether the steps passed,
 *   or the failing block by line with its command, expected lines and output, unless setup
 *   failed; each manual block, as untested; and a failing cleanup.
 */
export function formatReport(pagePath: string, result: TutorialResult): string {
  const untested = result.tutorial.manual.map(
    ({ line, lang }) => `${pagePath}: untested: manual block at line ${line} (${lang})`,
  );
  const setupFailed = result.setup?.reason !== undefined;
  return [
    ...setupLines(pagePath, result.setup),
    ...(setupFailed ? [] : failureLines(pagePath, result.failure)),
    ...untested,
    ...cleanupLines(pagePath, result.cleanupFailure),
    "",
  ].join("\n");
}

/**
 * Runs a tutorial page and reports on it, a page the harness cannot read included, so one
 * bad page names itself and does not stop the pages after it.
 *
 * Args:
 *   pagePath: The page's MDX file.
 *   versions: The pins, from `readVersions`.
 *
 * Returns:
 *   Whether setup, the steps and the cleanup passed, and the report naming the page.
 */
export async function checkTutorial(
  pagePath: string,
  versions: Versions,
): Promise<{ passed: boolean; report: string }> {
  try {
    const result = await runTutorial(pagePath, versions);
    const passed =
      result.setup?.reason === undefined &&
      result.failure === undefined &&
      result.cleanupFailure === undefined;
    return { passed, report: formatReport(pagePath, result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: false, report: `${pagePath}: ${message}\n` };
  }
}

if (import.meta.main) {
  const pages = process.argv.slice(2);
  if (pages.length === 0) {
    console.error("usage: node scripts/tutorial/run.ts <page.mdx>...");
    process.exitCode = 2;
  }
  const versions = readVersions();
  for (const page of pages) {
    // Pages may share ports and containers, so they run one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const { passed, report } = await checkTutorial(page, versions);
    if (passed) {
      process.stdout.write(report);
    } else {
      process.stderr.write(report);
      process.exitCode = 1;
    }
  }
}
