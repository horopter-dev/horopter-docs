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

function cardTitles(page: string): string[] {
  const found: string[] = [];
  walk(bodyOf(page), (node) => {
    if (node.type === "mdxJsxFlowElement" && node.name === "Card") {
      for (const attribute of node.attributes) {
        if (attribute.type === "mdxJsxAttribute" && attribute.name === "title") {
          found.push(String(attribute.value));
        }
      }
    }
  });
  return found;
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

const minorWords = new Set(
  [
    ["a", "an", "the"],
    ["and", "but", "for", "nor", "or"],
    ["as", "at", "by", "from", "in", "into", "like", "of", "off", "on", "onto", "out", "over"],
    ["per", "to", "up", "via", "with"],
  ].flat(),
);

function titleOf(page: string): string {
  const { data } = frontmatter(readFileSync(page, "utf8"));
  const title = typeof data === "object" && data !== null && "title" in data ? data.title : "";
  return String(title);
}

function proseOf(heading: Heading): string {
  let prose = "";
  walk(heading, (node) => {
    prose += node.type === "text" ? node.value : node.type === "inlineCode" ? " " : "";
  });
  return prose;
}

function lowercaseMajorWords(title: string): string[] {
  const words = title.split(/\s+/).filter((word) => word !== "");
  return words.filter(
    (word, index) => /^\p{Ll}/u.test(word) && (index === 0 || !minorWords.has(word)),
  );
}

describe.each(pages)("%s", (page) => {
  it("starts its body at H2, the title being the page's H1", () => {
    expect(headings(page).filter((heading) => heading.depth === 1)).toEqual([]);
  });

  it("has no numbered headings", () => {
    const texts = headings(page).map((heading) => textOf(heading));
    expect(texts.filter((text) => numbered.test(text))).toEqual([]);
  });

  it("capitalizes every major word of its title, headings and card titles", () => {
    const titles = [
      titleOf(page),
      ...headings(page).map((heading) => proseOf(heading)),
      ...cardTitles(page),
    ];
    expect(titles.filter((title) => lowercaseMajorWords(title).length > 0)).toEqual([]);
  });

  it("renders <HoropterVersion/> if it has a bash run block", () => {
    const tutorial = parseTutorial(readFileSync(page, "utf8")).steps.length > 0;
    expect(!tutorial || rendersHoropterVersion(page), "a tutorial states its release").toBe(true);
  });
});
