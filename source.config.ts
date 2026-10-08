import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { llmsMarkdown } from "#lib/llms.ts";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: llmsMarkdown,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig();
