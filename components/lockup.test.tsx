import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Lockup } from "#components/lockup.tsx";
import { basePath } from "#lib/site.ts";

function images(markup: string): Record<string, string>[] {
  return [...markup.matchAll(/<img\s([^>]*?)\/?>/g)].map(([, attributes = ""]) =>
    Object.fromEntries(
      [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
    ),
  );
}

describe("Lockup", () => {
  const [light, dark] = images(renderToStaticMarkup(<Lockup className="h-6" />));

  it("renders the light lockup under the base path, hidden in dark mode", () => {
    expect(light).toMatchObject({
      src: `${basePath}/brand/lockup.svg`,
      class: "h-6 dark:hidden",
    });
  });

  it("renders the dark lockup under the base path, shown only in dark mode", () => {
    expect(dark).toMatchObject({
      src: `${basePath}/brand/lockup-dark.svg`,
      class: "h-6 hidden dark:block",
    });
  });

  it("names Horopter for screen readers", () => {
    expect([light?.["alt"], dark?.["alt"]]).toEqual(["Horopter", "Horopter"]);
  });

  it("references only images the site publishes", () => {
    for (const image of [light, dark]) {
      const src = image?.["src"] ?? "";
      expect(existsSync(join("public", src.slice(basePath.length)))).toBe(true);
    }
  });
});
