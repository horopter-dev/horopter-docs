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
  expect?: Expectation;
}

const processor = createProcessor({ format: "mdx" });

function hasMarker(block: Code, marker: string): boolean {
  return (block.meta ?? "").split(/\s+/).includes(marker);
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

function codeBlocks(source: string): Code[] {
  // Fumadocs pads the body with one blank line per front-matter line before compiling, so
  // positions are lines of the file. Parsing the same way tests what is rendered.
  const matter = frontmatter(source);
  const padding = "\n".repeat(matter.matter.split("\n").length - 1);
  const blocks: Code[] = [];
  collectCode(processor.parse(padding + matter.content), blocks);
  return blocks;
}

function runStep(block: Code): Step {
  if (block.lang !== "bash") {
    throw new Error(
      `run block at line ${lineOf(block)} is "${block.lang ?? ""}"; ` +
        "run blocks are executed by bash, so mark them ```bash run",
    );
  }
  return { line: lineOf(block), command: block.value };
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

/**
 * Reads a tutorial page's runnable steps: each ```bash run block, in page order, with the
 * ```text expect block that follows it, if any. Blocks with neither marker are ignored.
 *
 * Args:
 *   source: The page's MDX source, front matter included.
 *
 * Returns:
 *   The run blocks, each with its line in the file and its expected output.
 *
 * Raises:
 *   Error: a run block is not bash, or an expect block has no run block to belong to.
 */
export function parseTutorial(source: string): Step[] {
  const steps: Step[] = [];
  for (const block of codeBlocks(source)) {
    if (hasMarker(block, "run")) {
      steps.push(runStep(block));
    } else if (hasMarker(block, "expect")) {
      attachExpectation(block, steps.at(-1));
    }
  }
  return steps;
}
