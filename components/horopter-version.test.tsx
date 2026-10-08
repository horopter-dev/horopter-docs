import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HoropterVersion } from "#components/horopter-version.tsx";
import { getMDXComponents } from "#components/mdx.tsx";
import { readHoropterVersion } from "#lib/horopter-version.ts";

describe("HoropterVersion", () => {
  it("renders the pinned release", () => {
    expect(renderToStaticMarkup(<HoropterVersion />)).toBe(readHoropterVersion());
  });

  it("is available to every page", () => {
    expect(getMDXComponents().HoropterVersion).toBe(HoropterVersion);
  });
});
