import { Tab as FumadocsTab, Tabs as FumadocsTabs } from "fumadocs-ui/components/tabs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMDXComponents } from "#components/mdx.tsx";
import { Tab, Tabs } from "#components/tabs.tsx";

function render(className?: string): string {
  return renderToStaticMarkup(
    <Tabs items={["Homebrew", "Go"]} {...(className === undefined ? {} : { className })}>
      <Tab value="Homebrew">brew</Tab>
      <Tab value="Go">go</Tab>
    </Tabs>,
  );
}

function renderFumadocs(): string {
  return renderToStaticMarkup(
    <FumadocsTabs items={["Homebrew", "Go"]}>
      <FumadocsTab value="Homebrew">brew</FumadocsTab>
      <FumadocsTab value="Go">go</FumadocsTab>
    </FumadocsTabs>,
  );
}

function rootClasses(markup: string): string[] {
  return (/^<div[^>]*\sclass="([^"]*)"/.exec(markup)?.[1] ?? "").split(" ");
}

describe("Tabs", () => {
  it("is the Tabs that MDX pages use", () => {
    expect(getMDXComponents().Tabs).toBe(Tabs);
    expect(getMDXComponents().Tab).toBe(Tab);
  });

  it("renders the markup its styling targets: a tablist of tabs, the first active", () => {
    const tablist = /<div[^>]*role="tablist"[^>]*>(.*?)<\/div>/.exec(render())?.[1] ?? "";
    const states = [...tablist.matchAll(/<button[^>]*role="tab"[^>]*data-state="(\w+)"/g)];
    expect(states.map(([, state]) => state)).toEqual(["active", "inactive"]);
  });

  it("styles its tabs differently from Fumadocs' default", () => {
    expect(rootClasses(render())).not.toEqual(rootClasses(renderFumadocs()));
  });

  it("keeps its styling when a page adds its own classes", () => {
    const fumadocs = new Set(rootClasses(renderFumadocs()));
    const styling = rootClasses(render()).filter((name) => !fumadocs.has(name));
    expect(rootClasses(render("my-8"))).toEqual(expect.arrayContaining([...styling, "my-8"]));
  });
});
