import { loader } from "fumadocs-core/source";
import { docs } from "#.source/server.ts";
import { resolveLinks, siteHref } from "#lib/llms.ts";
import { basePath } from "#lib/site.ts";

export const source = loader({
  baseUrl: "/",
  source: docs.toFumadocsSource(),
});

// Next adds the base path to rendered links but not to text a route handler writes, so the
// llms text routes read page URLs from a loader that carries it.
export const textSource = loader({
  baseUrl: basePath === "" ? "/" : basePath,
  source: docs.toFumadocsSource(),
});

export async function getLLMText(page: (typeof textSource)["$inferPage"]) {
  const processed = await resolveLinks(await page.data.getText("processed"), (href) =>
    siteHref(href, basePath, (relative) => textSource.resolveHref(relative, page)),
  );
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
