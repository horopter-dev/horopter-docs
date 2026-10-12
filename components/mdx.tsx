import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { HoropterVersion, Version } from "#components/version.tsx";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    HoropterVersion,
    Tab,
    Tabs,
    Version,
    ...components,
  } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
