import { readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import type { Code, Nodes } from "mdast";

/** Where a block is: its line, and the included file holding it, absent for the page itself. */
export interface BlockLocation {
  line: number;
  file?: string;
}

export interface Expectation extends BlockLocation {
  lines: string[];
}

export interface Step extends BlockLocation {
  command: string;
  timeout: number;
  retry?: number;
  expect?: Expectation;
}

export interface ManualBlock extends BlockLocation {
  lang: string;
}

export interface Tutorial {
  steps: Step[];
  manual: ManualBlock[];
  setup?: string;
  setupTimeout: number;
  cleanup?: string;
}

export const defaultTimeout = 120;

const processors = {
  ".md": createProcessor({ format: "md" }),
  ".mdx": createProcessor({ format: "mdx" }),
};

/** A file whose blocks are collected: its path, and how a report names it, absent for the page. */
interface Source {
  path: string;
  reportedAs?: string;
}

interface LocatedCode {
  block: Code;
  source: Source;
}

/**
 * Names a block for a report or an error: by its line, and by its file when it is included.
 *
 * Args:
 *   location: The block's line, and its file if an include brought it in.
 *
 * Returns:
 *   "line 4", or "line 4 of content/snippets/install-horo.mdx".
 */
export function blockAt({ line, file }: BlockLocation): string {
  return file === undefined ? `line ${line}` : `line ${line} of ${file}`;
}

function metaWords(block: Code): string[] {
  return (block.meta ?? "").split(/\s+/);
}

function hasMarker(block: Code, marker: string): boolean {
  return metaWords(block).includes(marker);
}

function locationOf(node: Nodes, source: Source): BlockLocation {
  const line = node.position?.start.line ?? 0;
  return source.reportedAs === undefined ? { line } : { line, file: source.reportedAs };
}

type FrontMatter = ReturnType<typeof frontmatter>;

function parseFile(matter: FrontMatter, extension: ".md" | ".mdx"): Nodes {
  // Fumadocs pads the body with one blank line per front-matter line before compiling, so
  // positions are lines of the file. Parsing the same way tests what is rendered.
  const padding = "\n".repeat(matter.matter.split("\n").length - 1);
  return processors[extension].parse(padding + matter.content);
}

type JsxElement = Extract<Nodes, { type: "mdxJsxFlowElement" | "mdxJsxTextElement" }>;

function isInclude(node: Nodes): node is JsxElement {
  const jsx = node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
  return jsx && node.name === "include";
}

function textOf(node: Nodes): string {
  if ("children" in node) {
    return node.children.map((child) => textOf(child)).join("");
  }
  return "value" in node ? node.value : "";
}

function attributesOf(element: JsxElement): Map<string, string | null> {
  const attributes = new Map<string, string | null>();
  for (const attribute of element.attributes) {
    const { value } = attribute;
    if (attribute.type === "mdxJsxAttribute" && (typeof value === "string" || value === null)) {
      attributes.set(attribute.name, value);
    }
  }
  return attributes;
}

function readInclude(included: Required<Source>, includeAt: string): string {
  try {
    return readFileSync(included.path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `include at ${includeAt} names ${included.reportedAs}, which cannot be read: ${message}`,
      { cause: error },
    );
  }
}

function includedTree(
  content: string,
  extension: string,
  attributes: Map<string, string | null>,
): Nodes {
  const lang = attributes.get("lang");
  if (typeof lang === "string" || (extension !== ".md" && extension !== ".mdx")) {
    const code: Code = {
      type: "code",
      lang: typeof lang === "string" ? lang : extension.slice(1),
      meta: attributes.get("meta") ?? null,
      value: content,
      position: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    };
    return code;
  }
  return parseFile(frontmatter(content), extension);
}

// Expands <include> as fumadocs-mdx's remark-include does: the path is relative to the file
// holding it, or to the working directory with `cwd`; a file that is not Markdown, or any file
// given a `lang`, is one code block with the element's `meta`.
function collectInclude(element: JsxElement, source: Source, blocks: LocatedCode[]): void {
  const specifier = textOf(element);
  const includeAt = blockAt(locationOf(element, source));
  if (specifier === "") {
    throw new Error(`include at ${includeAt} names no file; put the file's path inside it`);
  }
  const hash = specifier.lastIndexOf("#");
  if (hash !== -1) {
    throw new Error(
      `include at ${includeAt} names section ${specifier.slice(hash + 1)} of ` +
        `${specifier.slice(0, hash)}; the tutorial harness does not expand sections, ` +
        "so include the whole file",
    );
  }
  const attributes = attributesOf(element);
  const base = attributes.has("cwd") ? process.cwd() : dirname(source.path);
  const target = resolve(base, specifier);
  const included = { path: target, reportedAs: relative(process.cwd(), target) };
  const content = readInclude(included, includeAt);
  collectCode(includedTree(content, extname(target), attributes), included, blocks);
}

function collectCode(node: Nodes, source: Source, blocks: LocatedCode[]): void {
  if (node.type === "code") {
    blocks.push({ block: node, source });
  } else if (isInclude(node)) {
    collectInclude(node, source, blocks);
  } else if ("children" in node) {
    for (const child of node.children) {
      collectCode(child, source, blocks);
    }
  }
}

function matterValue(data: unknown, key: string): unknown {
  return typeof data === "object" && data !== null
    ? Object.entries(data).find(([k]) => k === key)?.[1]
    : undefined;
}

function commandOf(data: unknown, key: string): string | undefined {
  const value = matterValue(data, key);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`front matter ${key} is not a string; give it one shell command`);
  }
  return value;
}

function setupTimeoutOf(data: unknown): number {
  const value = matterValue(data, "setup-timeout");
  if (value === undefined) {
    return defaultTimeout;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `front matter setup-timeout is ${JSON.stringify(value)}; ` +
        "give it a positive whole number of seconds",
    );
  }
  return value;
}

function secondsOption({ block, source }: LocatedCode, name: string): number | undefined {
  const word = metaWords(block).find((w) => w.startsWith(`${name}=`));
  if (word === undefined) {
    return undefined;
  }
  const value = word.slice(name.length + 1);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      `run block at ${blockAt(locationOf(block, source))} has ${word}; ` +
        `${name} takes a positive number of seconds`,
    );
  }
  return seconds;
}

function runStep(located: LocatedCode): Step {
  const { block, source } = located;
  const location = locationOf(block, source);
  if (block.lang !== "bash") {
    throw new Error(
      `run block at ${blockAt(location)} is "${block.lang ?? ""}"; ` +
        "run blocks are executed by bash, so mark them ```bash run",
    );
  }
  const step: Step = {
    ...location,
    command: block.value,
    timeout: secondsOption(located, "timeout") ?? defaultTimeout,
  };
  const retry = secondsOption(located, "retry");
  if (retry !== undefined) {
    step.retry = retry;
  }
  return step;
}

function attachExpectation({ block, source }: LocatedCode, step: Step | undefined): void {
  const location = locationOf(block, source);
  if (step === undefined) {
    throw new Error(
      `expect block at ${blockAt(location)} follows no run block; ` +
        "put it after the run block whose output it shows",
    );
  }
  if (step.expect !== undefined) {
    throw new Error(
      `expect block at ${blockAt(location)} is the second for the run block at ` +
        `${blockAt(step)}; ` +
        "merge it into the first",
    );
  }
  step.expect = { ...location, lines: block.value === "" ? [] : block.value.split("\n") };
}

function readBlocks(blocks: LocatedCode[]): Pick<Tutorial, "steps" | "manual"> {
  const steps: Step[] = [];
  const manual: ManualBlock[] = [];
  let afterManual = false;
  for (const located of blocks) {
    const { block, source } = located;
    const run = hasMarker(block, "run");
    if (run && hasMarker(block, "manual")) {
      throw new Error(
        `block at ${blockAt(locationOf(block, source))} is marked both run and manual; ` +
          "a step is one or the other",
      );
    }
    if (run) {
      steps.push(runStep(located));
      afterManual = false;
    } else if (hasMarker(block, "manual")) {
      manual.push({ ...locationOf(block, source), lang: block.lang ?? "" });
      afterManual = true;
    } else if (hasMarker(block, "expect") && !afterManual) {
      attachExpectation(located, steps.at(-1));
    }
  }
  return { steps, manual };
}

/**
 * Reads a tutorial page: each ```bash run block, in page order, with its options and the
 * ```text expect block that follows it; each manual block, which is not run; and the front
 * matter's setup command, setup timeout and cleanup command. An expect block after a manual
 * block is untested with it, and blocks with no marker are ignored. Each <include> is expanded
 * where it stands, so its blocks are the page's, located by their own file.
 *
 * Args:
 *   source: The page's MDX source, front matter included.
 *   pagePath: The page's file, which its includes are relative to.
 *
 * Returns:
 *   The page's steps, its manual blocks, its setup command, if any, with its timeout in
 *   seconds, and its cleanup command, if any.
 *
 * Raises:
 *   Error: a run block is not bash or has a malformed option, a block is both run and
 *     manual, an expect block has no run block to belong to, setup or cleanup is not a string,
 *     or setup-timeout is not a positive whole number; or an include names a section or a
 *     file that cannot be read.
 */
export function parseTutorial(source: string, pagePath: string): Tutorial {
  const matter = frontmatter(source);
  const blocks: LocatedCode[] = [];
  collectCode(parseFile(matter, ".mdx"), { path: resolve(pagePath) }, blocks);
  const tutorial: Tutorial = { ...readBlocks(blocks), setupTimeout: setupTimeoutOf(matter.data) };
  const setup = commandOf(matter.data, "setup");
  if (setup !== undefined) {
    tutorial.setup = setup;
  }
  const cleanup = commandOf(matter.data, "cleanup");
  if (cleanup !== undefined) {
    tutorial.cleanup = cleanup;
  }
  return tutorial;
}
