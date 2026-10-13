import { readFileSync } from "node:fs";
import { createProcessor } from "@mdx-js/mdx";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import type { Code, Nodes } from "mdast";

// Every fenced code block of the page at path, in page order, parsed as the site parses it.
export function codeBlocks(path: string): Code[] {
  const body = createProcessor({ format: "mdx" }).parse(
    frontmatter(readFileSync(path, "utf8")).content,
  );
  const found: Code[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "code") {
      found.push(node);
    } else if ("children" in node) {
      node.children.forEach(walk);
    }
  };
  walk(body);
  return found;
}

// Whether a block's opening fence carries marker, such as run or manual, after its language.
export function hasMarker(block: Code, marker: string): boolean {
  return (block.meta ?? "").split(/\s+/).includes(marker);
}
