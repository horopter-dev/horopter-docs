import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
} from "#scripts/tutorial/session.ts";

export interface Failure {
  step: Step;
  reason: string;
  output: string[];
}

export interface CleanupFailure {
  command: string;
  reason: string;
  output: string[];
}

export interface TutorialResult {
  tutorial: Tutorial;
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
 * Runs a bash script in its own process group. The group is killed when the current phase
 * runs past its limit, and when the script exits, so nothing the script started outlives it.
 */
function runScript(script: string, cwd: string, phaseOf: (output: string) => Phase) {
  return new Promise<ScriptRun>((resolve, reject) => {
    const child = spawn("bash", ["-c", script], {
      cwd,
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

function firstFailure(steps: Step[], run: ScriptRun, markers: Markers): Failure | undefined {
  const { completed, unfinished } = splitOutput(run.output, markers);
  for (const [index, output] of completed.entries()) {
    const step = steps[index];
    if (step?.expect === undefined) {
      continue;
    }
    const reason = matchOutput(step.expect.lines, output);
    if (reason !== undefined) {
      return { step, reason, output };
    }
  }
  const stopped = steps[completed.length];
  return stopped === undefined
    ? undefined
    : { step: stopped, reason: run.reason, output: unfinished };
}

async function runCleanup(command: string, cwd: string): Promise<CleanupFailure | undefined> {
  const markers = newMarkers();
  const script = sessionScript([{ command }], markers);
  const run = await runScript(script, cwd, () => ({ index: 0, seconds: defaultTimeout }));
  if (run.ok) {
    return undefined;
  }
  return { command, reason: run.reason, output: splitOutput(run.output, markers).unfinished };
}

/**
 * Runs a tutorial page's run blocks in one bash session, in a throwaway directory, and checks
 * each against its expect block. Each block is limited to its timeout. The page's cleanup
 * command runs afterwards in the same directory, whatever the steps did.
 *
 * Args:
 *   pagePath: The page's MDX file.
 *
 * Returns:
 *   The parsed page; the first failure, a mismatched expect block or a block that stopped
 *   the session; and the cleanup's failure.
 *
 * Raises:
 *   Error: the page cannot be read or parsed, or bash cannot be started.
 */
export async function runTutorial(pagePath: string): Promise<TutorialResult> {
  const tutorial = parseTutorial(readFileSync(pagePath, "utf8"));
  const { steps } = tutorial;
  const markers = newMarkers();
  const workDir = mkdtempSync(join(tmpdir(), "tutorial-"));
  try {
    const run = await runScript(sessionScript(steps, markers), workDir, (output) => {
      const index = completedBlocks(output, markers);
      return { index, seconds: steps[index]?.timeout ?? defaultTimeout };
    });
    const result: TutorialResult = { tutorial };
    const failure = firstFailure(steps, run, markers);
    if (failure !== undefined) {
      result.failure = failure;
    }
    const cleanupFailure =
      tutorial.cleanup === undefined ? undefined : await runCleanup(tutorial.cleanup, workDir);
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

function cleanupLines(pagePath: string, failure: CleanupFailure | undefined): string[] {
  if (failure === undefined) {
    return [];
  }
  return [
    `${pagePath}: cleanup ${failure.reason}`,
    "  command:",
    ...indented(failure.command.split("\n")),
    "  output:",
    ...indented(failure.output),
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
 *   The report: whether the steps passed, or the failing block by line with its command,
 *   expected lines and output; each manual block, as untested; and a failing cleanup.
 */
export function formatReport(pagePath: string, result: TutorialResult): string {
  const untested = result.tutorial.manual.map(
    ({ line, lang }) => `${pagePath}: untested: manual block at line ${line} (${lang})`,
  );
  return [
    ...failureLines(pagePath, result.failure),
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
 *
 * Returns:
 *   Whether the steps and the cleanup passed, and the report naming the page.
 */
export async function checkTutorial(
  pagePath: string,
): Promise<{ passed: boolean; report: string }> {
  try {
    const result = await runTutorial(pagePath);
    const passed = result.failure === undefined && result.cleanupFailure === undefined;
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
  for (const page of pages) {
    // Pages may share ports and containers, so they run one at a time.
    // oxlint-disable-next-line no-await-in-loop
    const { passed, report } = await checkTutorial(page);
    if (passed) {
      process.stdout.write(report);
    } else {
      process.stderr.write(report);
      process.exitCode = 1;
    }
  }
}
