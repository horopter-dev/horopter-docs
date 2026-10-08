import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchOutput } from "#scripts/tutorial/match.ts";
import { parseTutorial, type Step } from "#scripts/tutorial/parse.ts";
import { sessionScript, splitOutput } from "#scripts/tutorial/session.ts";

export interface Failure {
  step: Step;
  reason: string;
  output: string[];
}

interface Session {
  output: string;
  status: string;
}

function runSession(script: string): Session {
  const scriptDir = mkdtempSync(join(tmpdir(), "tutorial-script-"));
  const workDir = mkdtempSync(join(tmpdir(), "tutorial-"));
  try {
    const scriptPath = join(scriptDir, "session.sh");
    writeFileSync(scriptPath, script);
    const result = spawnSync("bash", [scriptPath], {
      cwd: workDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error !== undefined) {
      throw new Error(`could not run bash: ${result.error.message}`, { cause: result.error });
    }
    const status =
      result.signal === null ? `exited with status ${result.status}` : `killed by ${result.signal}`;
    return { output: result.stdout, status };
  } finally {
    rmSync(scriptDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Runs a tutorial page's run blocks in one bash session, in a throwaway directory, and checks
 * each against its expect block.
 *
 * Args:
 *   pagePath: The page's MDX file.
 *
 * Returns:
 *   The first failure, a mismatched expect block or a block that stopped the session, or
 *   undefined when every block ran and matched.
 */
export function runTutorial(pagePath: string): Failure | undefined {
  const steps = parseTutorial(readFileSync(pagePath, "utf8"));
  const sentinel = `__TUTORIAL_STEP_${randomBytes(8).toString("hex")}__`;
  const session = runSession(
    sessionScript(
      steps.map((step) => step.command),
      sentinel,
    ),
  );
  const { completed, unfinished } = splitOutput(session.output, sentinel);
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
    : { step: stopped, reason: session.status, output: unfinished };
}

function indented(lines: string[]): string[] {
  return (lines.length === 0 ? ["(none)"] : lines).map((line) => `    ${line}`);
}

/**
 * Describes a failure for the person reading CI's log.
 *
 * Args:
 *   pagePath: The page the failure is in, as it should be named.
 *   failure: What `runTutorial` returned.
 *
 * Returns:
 *   The report, naming the page, the block by line, the command, the expected lines and the
 *   output.
 */
export function formatFailure(pagePath: string, failure: Failure): string {
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
    "",
  ].join("\n");
}

if (import.meta.main) {
  const pages = process.argv.slice(2);
  if (pages.length === 0) {
    console.error("usage: node scripts/tutorial/run.ts <page.mdx>...");
    process.exitCode = 2;
  }
  for (const page of pages) {
    const failure = runTutorial(page);
    if (failure === undefined) {
      console.log(`${page}: every run block passed`);
    } else {
      console.error(formatFailure(page, failure));
      process.exitCode = 1;
    }
  }
}
