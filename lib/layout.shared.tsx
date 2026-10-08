import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Lockup } from "#components/lockup.tsx";
import { gitConfig } from "#lib/site.ts";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Lockup className="h-6 w-auto" /> },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
