import { createFromSource } from "fumadocs-core/search/server";
import { source } from "#lib/source.ts";

export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, { language: "english" });
