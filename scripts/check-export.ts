import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { basePath as siteBasePath } from "#lib/site.ts";

const robotsMeta = /<meta\s+name="robots"\s+content="([^"]*)"/i;
const htmlReference = /\s(?:href|src)="(\/[^"]*)"/g;
const textReference = /\((\/[^)\s]*)\)/g;
const definitionReference = /^ {0,3}\[(?!\^)[^\]\n]+\]:\s*(\/[^\s]*)/gm;
const linkTarget = /\]\(([^)\s]+)|^ {0,3}\[(?!\^)[^\]\n]+\]:\s*(\S+)/gm;
const followable = /^(?:\/|#|[a-z][a-z\d+.-]*:)/i;
const code = /(`+)[\s\S]*?\1/g;
const placeholder = /\0(.*?)\0/gs;

function filesEndingWith(dir: string, extension: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (entry.endsWith(extension) && statSync(join(dir, entry)).isFile()) {
      files.push(entry);
    }
  }
  return files.toSorted();
}

function wildcardGroupDisallowsAll(lines: string[]): boolean {
  let agents: string[] = [];
  let inRules = false;
  for (const line of lines) {
    const [field = "", value = ""] = line.split(/:(.*)/).map((part) => part.trim());
    if (field.toLowerCase() === "user-agent") {
      agents = inRules ? [value] : [...agents, value];
      inRules = false;
    } else {
      inRules = true;
      if (agents.includes("*") && field.toLowerCase() === "disallow" && value === "/") {
        return true;
      }
    }
  }
  return false;
}

function checkRobotsTxt(outDir: string): string[] {
  const path = join(outDir, "robots.txt");
  if (!existsSync(path)) {
    return ["robots.txt is missing"];
  }
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return wildcardGroupDisallowsAll(lines)
    ? []
    : [`robots.txt does not disallow all crawling: ${lines.join(" / ")}`];
}

function exportPathFor(reference: string, basePath: string): string {
  const path = reference.replace(/[?#].*$/, "").slice(basePath.length);
  return path === "" || path.endsWith("/") ? `${path}index.html` : path;
}

function checkReferences(
  outDir: string,
  file: string,
  references: Iterable<RegExpMatchArray>,
  basePath: string,
): string[] {
  const problems: string[] = [];
  for (const [, reference = ""] of references) {
    if (reference !== basePath && !reference.startsWith(`${basePath}/`)) {
      problems.push(`${file} references ${reference}, outside the base path ${basePath}`);
    } else if (!existsSync(join(outDir, exportPathFor(reference, basePath)))) {
      problems.push(`${file} references ${reference}, which is not in the export`);
    }
  }
  return problems;
}

function checkPage(outDir: string, page: string, basePath: string): string[] {
  const html = readFileSync(join(outDir, page), "utf8");
  const noindex = robotsMeta.exec(html)?.[1]?.includes("noindex") ?? false;
  return [
    ...(noindex ? [] : [`${page} has no <meta name="robots"> containing noindex`]),
    ...checkReferences(outDir, page, html.matchAll(htmlReference), basePath),
  ];
}

function relativeLinks(file: string, text: string): string[] {
  const problems: string[] = [];
  for (const [, inline, defined] of text.matchAll(linkTarget)) {
    const target = inline ?? defined ?? "";
    if (!followable.test(target)) {
      problems.push(`${file} links ${target}, a relative link no reader can follow`);
    }
  }
  return problems;
}

function checkTextFile(outDir: string, file: string, basePath: string): string[] {
  const text = readFileSync(join(outDir, file), "utf8");
  const prose = text.replaceAll(code, "");
  return [
    ...checkReferences(outDir, file, prose.matchAll(textReference), basePath),
    ...checkReferences(outDir, file, prose.matchAll(definitionReference), basePath),
    ...checkReferences(outDir, file, prose.matchAll(htmlReference), basePath),
    ...relativeLinks(file, prose),
    ...Array.from(
      text.matchAll(placeholder),
      ([, inner]) => `${file} holds an unrendered placeholder: ${inner}`,
    ),
  ];
}

/**
 * Checks a static export is fit to publish before the site is indexed: robots.txt
 * disallows all crawling, every page carries a robots noindex meta tag, every
 * root-relative reference in a page or an llms text file sits under the base
 * path and resolves to a file in the export, and an llms text file holds no
 * relative link and no unrendered placeholder. Code in an llms text file is not
 * checked for links.
 *
 * Args:
 *   outDir: The `next build` export directory.
 *   basePath: The path the site is served under, e.g. `/horopter-docs`.
 *
 * Returns:
 *   One message per problem found; empty when the export passes.
 */
export function checkExport(outDir: string, basePath: string): string[] {
  const pages = filesEndingWith(outDir, ".html");
  if (pages.length === 0) {
    return ["the export holds no html pages"];
  }
  return [
    ...checkRobotsTxt(outDir),
    ...pages.flatMap((page) => checkPage(outDir, page, basePath)),
    ...filesEndingWith(outDir, ".txt")
      .filter((file) => file.startsWith("llms"))
      .flatMap((file) => checkTextFile(outDir, file, basePath)),
  ];
}

if (import.meta.main) {
  const outDir = process.argv[2] ?? "out";
  const problems = checkExport(outDir, siteBasePath);
  for (const problem of problems) {
    console.error(`check-export: ${problem}`);
  }
  if (problems.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`check-export: ${relative(".", outDir)} passes under ${siteBasePath}`);
  }
}
