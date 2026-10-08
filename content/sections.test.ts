import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docs = join("content", "docs");
const sections = ["tutorials", "how-to", "reference", "concepts", "contributing"];

describe("the site's sections", () => {
  it("follow the landing page in the sidebar as the five sections, in order", () => {
    const meta: unknown = JSON.parse(readFileSync(join(docs, "meta.json"), "utf8"));
    expect(meta).toMatchObject({ pages: ["index", ...sections] });
  });

  it.each(sections)("%s has an index page with a title", (section) => {
    const index = join(docs, section, "index.mdx");
    expect(existsSync(index)).toBe(true);
    const frontMatter = /^---\n(.*?)\n---\n/s.exec(readFileSync(index, "utf8"))?.[1] ?? "";
    expect(frontMatter).toMatch(/^title: \S/m);
  });
});
