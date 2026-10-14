import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { baseOptions } from "#lib/layout.shared.tsx";

describe("baseOptions", () => {
  it("links the nav lockup to the project site in the same tab", () => {
    const { title, url } = baseOptions().nav ?? {};
    if (typeof title !== "function") throw new Error("nav title must render its own link");

    const markup = renderToStaticMarkup(createElement(title, { href: url, className: "nav" }));

    expect(markup).toMatch(/<a href="https:\/\/www\.horopter\.dev" class="nav"><img /);
    expect(markup).not.toContain("target=");
  });
});
