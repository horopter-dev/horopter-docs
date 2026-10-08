import { llms } from "fumadocs-core/source";
import { textSource } from "#lib/source.ts";

export const revalidate = false;

export async function GET() {
  return new Response(await llms(textSource).index());
}
