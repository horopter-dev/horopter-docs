import { getLLMText, textSource } from "#lib/source.ts";

export const revalidate = false;

export async function GET() {
  const pages = await Promise.all(textSource.getPages().map(getLLMText));
  return new Response(pages.join("\n\n"));
}
