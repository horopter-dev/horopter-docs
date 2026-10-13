import { describe, expect, it } from "vitest";
import { fileRelative } from "#lib/links.ts";

describe("fileRelative", () => {
  it.each([
    ["configuration.md#horo", "./configuration.md#horo"],
    ["metrics.md", "./metrics.md"],
    ["sub/page.mdx", "./sub/page.mdx"],
  ])("makes the bare relative link %s explicit as %s", (href, expected) => {
    expect(fileRelative(href)).toBe(expected);
  });

  it.each([
    "./a.mdx",
    "../b/index.mdx#x",
    "/tutorials",
    "//example.com/x",
    "https://example.com/x",
    "mailto:someone@example.com",
    "#section",
    "?q=1",
    "",
  ])("leaves %s unchanged", (href) => {
    expect(fileRelative(href)).toBe(href);
  });
});
