import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMDXComponents } from "#components/mdx.tsx";
import { HoropterVersion, Version } from "#components/version.tsx";
import { readVersions } from "#lib/versions.ts";

describe("Version", () => {
  it.each(Object.entries(readVersions()))("renders the %s pin", (name, value) => {
    expect(renderToStaticMarkup(<Version name={name} />)).toBe(value);
  });

  it("renders any pin, not only Horopter's", () => {
    const dir = mkdtempSync(join(tmpdir(), "version-"));
    try {
      writeFileSync(join(dir, "versions"), "HOROPTER_VERSION=v0.7.0\nFLUX_VERSION=2.6.4\n");
      vi.spyOn(process, "cwd").mockReturnValue(dir);
      expect(renderToStaticMarkup(<Version name="FLUX_VERSION" />)).toBe("2.6.4");
    } finally {
      vi.restoreAllMocks();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails on a name the versions file does not pin, naming it", () => {
    expect(() => renderToStaticMarkup(<Version name="NO_SUCH_PIN" />)).toThrow(
      /<Version name="NO_SUCH_PIN"\/> names no pin in .*versions; it pins HOROPTER_VERSION/,
    );
  });

  it("is available to every page", () => {
    expect(getMDXComponents().Version).toBe(Version);
  });
});

describe("HoropterVersion", () => {
  it("renders the pinned release", () => {
    expect(renderToStaticMarkup(<HoropterVersion />)).toBe(readVersions().HOROPTER_VERSION);
  });

  it("is available to every page", () => {
    expect(getMDXComponents().HoropterVersion).toBe(HoropterVersion);
  });
});
