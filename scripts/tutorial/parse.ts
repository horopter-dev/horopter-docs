import { createProcessor } from "@mdx-js/mdx";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import type { Code, Nodes } from "mdast";

export interface Expectation {
  line: number;
  lines: string[];
}

export interface Step {
  line: number;
  command: string;
  timeout: number;
  retry?: number;
  expect?: Expectation;
}

export interface ManualBlock {
  line: number;
  lang: string;
}

export interface Tutorial {
  steps: Step[];
  manual: ManualBlock[];
  cleanup?: string;
}

const defaultTimeout = 120;

const processor = createProcessor({ format: "mdx" });

function metaWords(block: Code): string[] {
  return (block.meta ?? "").split(/\s+/);
}

function hasMarker(block: Code, marker: string): boolean {
  return metaWords(block).includes(marker);
}

function lineOf(block: Code): number {
  return block.position?.start.line ?? 0;
}

function collectCode(node: Nodes, blocks: Code[]): void {
  if (node.type === "code") {
    blocks.push(node);
  } else if ("children" in node) {
    for (const child of node.children) {
      collectCode(child, blocks);
    }
  }
}

function cleanupOf(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("cleanup" in data)) {
    return undefined;
  }
  if (typeof data.cleanup !== "string") {
    throw new Error("front matter cleanup is not a string; give it one shell command");
  }
  return data.cleanup;
}

function secondsOption(block: Code, name: string): number | undefined {
  const word = metaWords(block).find((w) => w.startsWith(`${name}=`));
  if (word === undefined) {
    return undefined;
  }
  const value = word.slice(name.length + 1);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `run block at line ${lineOf(block)} has ${word}; ${name} takes a positive number of seconds`,
    );
  }
  return seconds;
}

function runStep(block: Code): Step {
  if (block.lang !== "bash") {
    throw new Error(
      `run block at line ${lineOf(block)} is "${block.lang ?? ""}"; ` +
        "run blocks are executed by bash, so mark them ```bash run",
    );
  }
  const step: Step = {
    line: lineOf(block),
    command: block.value,
    timeout: secondsOption(block, "timeout") ?? defaultTimeout,
  };
  const retry = secondsOption(block, "retry");
  if (retry !== undefined) {
    step.retry = retry;
  }
  return step;
}

function attachExpectation(block: Code, step: Step | undefined): void {
  const line = lineOf(block);
  if (step === undefined) {
    throw new Error(
      `expect block at line ${line} follows no run block; ` +
        "put it after the run block whose output it shows",
    );
  }
  if (step.expect !== undefined) {
    throw new Error(
      `expect block at line ${line} is the second for the run block at line ${step.line}; ` +
        "merge it into the first",
    );
  }
  step.expect = { line, lines: block.value === "" ? [] : block.value.split("\n") };
}

function readBlocks(blocks: Code[]): Pick<Tutorial, "steps" | "manual"> {
  const steps: Step[] = [];
  const manual: ManualBlock[] = [];
  let afterManual = false;
  for (const block of blocks) {
    const run = hasMarker(block, "run");
    if (run && hasMarker(block, "manual")) {
      throw new Error(
        `block at line ${lineOf(block)} is marked both run and manual; a step is one or the other`,
      );
    }
    if (run) {
      steps.push(runStep(block));
      afterManual = false;
    } else if (hasMarker(block, "manual")) {
      manual.push({ line: lineOf(block), lang: block.lang ?? "" });
      afterManual = true;
    } else if (hasMarker(block, "expect") && !afterManual) {
      attachExpectation(block, steps.at(-1));
    }
  }
  return { steps, manual };
}

/**
 * Reads a tutorial page: each ```bash run block, in page order, with its options and the
 * ```text expect block that follows it; each manual block, which is not run; and the front
 * matter's cleanup command. An expect block after a manual block is untested with it, and
 * blocks with no marker are ignored.
 *
 * Args:
 *   source: The page's MDX source, front matter included.
 *
 * Returns:
 *   The page's steps, its manual blocks and its cleanup command, if any.
 *
 * Raises:
 *   Error: a run block is not bash or has a malformed option, a block is both run and
 *     manual, an expect block has no run block to belong to, or cleanup is not a string.
 */
export function parseTutorial(source: string): Tutorial {
  // Fumadocs pads the body with one blank line per front-matter line before compiling, so
  // positions are lines of the file. Parsing the same way tests what is rendered.
  const matter = frontmatter(source);
  const padding = "\n".repeat(matter.matter.split("\n").length - 1);
  const blocks: Code[] = [];
  collectCode(processor.parse(padding + matter.content), blocks);
  const tutorial: Tutorial = readBlocks(blocks);
  const cleanup = cleanupOf(matter.data);
  if (cleanup !== undefined) {
    tutorial.cleanup = cleanup;
  }
  return tutorial;
}
