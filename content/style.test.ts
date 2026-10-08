import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import type { Heading, Nodes } from "mdast";
import { describe, expect, it } from "vitest";
import { parseTutorial } from "#scripts/tutorial/parse.ts";

const pages = readdirSync(join("content", "docs"), { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".mdx"))
  .map((path) => join("content", "docs", path));

const processor = createProcessor({ format: "mdx" });

function walk(node: Nodes, visit: (node: Nodes) => void): void {
  visit(node);
  if ("children" in node) {
    for (const child of node.children) {
      walk(child, visit);
    }
  }
}

function bodyOf(page: string): Nodes {
  return processor.parse(frontmatter(readFileSync(page, "utf8")).content);
}

function headings(page: string): Heading[] {
  const found: Heading[] = [];
  walk(bodyOf(page), (node) => {
    if (node.type === "heading") {
      found.push(node);
    }
  });
  return found;
}

function textOf(heading: Heading): string {
  let text = "";
  walk(heading, (node) => {
    if ("value" in node) {
      text += node.value;
    }
  });
  return text;
}

function rendersHoropterVersion(page: string): boolean {
  let found = false;
  walk(bodyOf(page), (node) => {
    const jsx = node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement";
    found ||= jsx && node.name === "HoropterVersion";
  });
  return found;
}

const numbered = /^(?:(?:step|option)\s+\d+|\d+\.)/i;

describe.each(pages)("%s", (page) => {
  it("starts its body at H2, the title being the page's H1", () => {
    expect(headings(page).filter((heading) => heading.depth === 1)).toEqual([]);
  });

  it("has no numbered headings", () => {
    const texts = headings(page).map((heading) => textOf(heading));
    expect(texts.filter((text) => numbered.test(text))).toEqual([]);
  });

  it("renders <HoropterVersion/> if it has a bash run block", () => {
    const tutorial = parseTutorial(readFileSync(page, "utf8")).steps.length > 0;
    expect(tutorial && !rendersHoropterVersion(page)).toBe(false);
  });
});
