import { createProcessor } from "@mdx-js/mdx";
import { remarkLLMs } from "fumadocs-core/mdx-plugins/remark-llms";
import { describe, expect, it } from "vitest";
import { llmsMarkdown, resolveLinks, siteHref } from "#lib/llms.ts";

async function processedMarkdown(mdx: string): Promise<string> {
  const processor = createProcessor({
    format: "mdx",
    remarkPlugins: [[remarkLLMs, { ...llmsMarkdown, _data: true }]],
  });
  const file = await processor.process(mdx);
  return String(file.data["markdown"]);
}

function fakeResolve(href: string): string {
  return `<${href}>`;
}

describe("resolveLinks over the llms markdown", () => {
  it("resolves a markdown link's href", async () => {
    const text = await processedMarkdown("See the [tutorials](../tutorials/index.mdx).\n");
    expect(await resolveLinks(text, fakeResolve)).toBe(
      "See the [tutorials](<../tutorials/index.mdx>).\n",
    );
  });

  it("renders a Card as a link with its description", async () => {
    const text = await processedMarkdown(
      '<Card title="Try it" href="/tutorials" description="The tutorials." />\n',
    );
    expect(await resolveLinks(text, fakeResolve)).toBe("[Try it](</tutorials>): The tutorials.\n");
  });

  it("renders a Card without a description as a bare link", async () => {
    const text = await processedMarkdown('<Card title="Try it" href="/tutorials" />\n');
    expect(await resolveLinks(text, fakeResolve)).toBe("[Try it](</tutorials>)\n");
  });

  it("renders a Card's body after its description", async () => {
    const text = await processedMarkdown(
      '<Card title="Try it" href="/tutorials" description="The tutorials.">Start here.</Card>\n',
    );
    expect(await resolveLinks(text, fakeResolve)).toBe(
      "[Try it](</tutorials>): The tutorials. Start here.\n",
    );
  });

  it("renders a Card without an href as its title", async () => {
    const text = await processedMarkdown('<Card title="Soon" description="Not yet." />\n');
    expect(await resolveLinks(text, fakeResolve)).toBe("Soon: Not yet.\n");
  });

  it("resolves a reference-style link's definition", async () => {
    const text = await processedMarkdown("See the [guide][g].\n\n[g]: ./style-guide.mdx\n");
    expect(await resolveLinks(text, fakeResolve)).toBe(
      "See the [guide][g].\n\n[g]: <./style-guide.mdx>\n",
    );
  });

  it("keeps a link's formatted text", async () => {
    const text = await processedMarkdown("A [**bold** `code` link](./a.mdx).\n");
    expect(await resolveLinks(text, fakeResolve)).toBe("A [**bold** `code` link](<./a.mdx>).\n");
  });

  it("leaves link-shaped text in code alone", async () => {
    const mdx = "Write `[a](./a.mdx)`.\n\n```md\n[b](../b.mdx)\n```\n";
    const text = await processedMarkdown(mdx);
    expect(await resolveLinks(text, fakeResolve)).toBe(mdx);
  });
});

function resolveRelative(href: string): string {
  return `/horopter-docs/resolved/${href}`;
}

describe("siteHref", () => {
  it.each([
    ["/tutorials", "/horopter-docs/tutorials"],
    ["/", "/horopter-docs/"],
    ["./a.mdx", "/horopter-docs/resolved/./a.mdx"],
    ["../b/index.mdx#x", "/horopter-docs/resolved/../b/index.mdx#x"],
    ["https://example.com/x", "https://example.com/x"],
    ["//example.com/x", "//example.com/x"],
    ["#section", "#section"],
  ])("maps %s to %s under /horopter-docs", (href, expected) => {
    expect(siteHref(href, "/horopter-docs", resolveRelative)).toBe(expected);
  });

  it("leaves a root path unchanged when the site is served from the root", () => {
    expect(siteHref("/tutorials", "", resolveRelative)).toBe("/tutorials");
  });
});
