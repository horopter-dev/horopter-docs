import type { LLMsOptions } from "fumadocs-core/mdx-plugins/remark-llms";
import {
  type PlaceholderData,
  renderPlaceholder,
} from "fumadocs-core/mdx-plugins/remark-llms.runtime";

function placeholder(data: PlaceholderData): string {
  return `\0${JSON.stringify(data)}\0`;
}

// The processed markdown is written at build time, before any page has a URL, so links, link
// definitions and Cards leave it as placeholders that resolveLinks renders once the loader can
// resolve them.
export const llmsMarkdown: LLMsOptions = {
  mdxAsPlaceholder: ["Card"],
  stringify(node, _parent, state, info) {
    switch (node.type) {
      case "link":
        return placeholder({
          name: "a",
          attributes: { href: node.url },
          children: state.containerPhrasing(node, info),
        });
      case "definition":
        return placeholder({
          name: "definition",
          attributes: { href: node.url, label: node.label ?? node.identifier },
          children: "",
        });
      default:
        return undefined;
    }
  },
};

function stringAttribute(attributes: Record<string, unknown>, name: string): string {
  const value = attributes[name];
  return typeof value === "string" ? value : "";
}

function renderCard(
  { attributes, children }: PlaceholderData,
  resolve: (href: string) => string,
): string {
  const title = stringAttribute(attributes, "title");
  const href = stringAttribute(attributes, "href");
  const name = href === "" ? title : `[${title}](${resolve(href)})`;
  const about = [stringAttribute(attributes, "description"), children.trim()]
    .filter((text) => text !== "")
    .join(" ");
  return about === "" ? name : `${name}: ${about}`;
}

/**
 * Renders the link, link definition and Card placeholders in a page's processed markdown as
 * markdown.
 *
 * Args:
 *   markdown: The page's processed markdown, from `getText("processed")`.
 *   resolve: Maps a link's href as written in the page to the href a reader can follow.
 *
 * Returns:
 *   The markdown with every placeholder rendered.
 */
export function resolveLinks(markdown: string, resolve: (href: string) => string): Promise<string> {
  return renderPlaceholder(markdown, {
    a: ({ attributes, children }) =>
      `[${children}](${resolve(stringAttribute(attributes, "href"))})`,
    definition: ({ attributes }) => {
      const href = resolve(stringAttribute(attributes, "href"));
      return `[${stringAttribute(attributes, "label")}]: ${href}`;
    },
    Card: (data) => renderCard(data, resolve),
  });
}

/**
 * Maps an href as written in a page to one that resolves on the published site.
 *
 * Args:
 *   href: The href as written.
 *   basePath: The path the site is served under, e.g. `/horopter-docs`.
 *   resolveRelative: Resolves a file-relative href, such as `../tutorials/index.mdx`.
 *
 * Returns:
 *   A root path under the base path, a resolved file-relative link, or the href unchanged.
 */
export function siteHref(
  href: string,
  basePath: string,
  resolveRelative: (href: string) => string,
): string {
  if (href.startsWith("./") || href.startsWith("../")) {
    return resolveRelative(href);
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    return `${basePath}${href}`;
  }
  return href;
}
