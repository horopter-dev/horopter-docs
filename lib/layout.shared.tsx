import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { LockupLink } from "#components/lockup-link.tsx";
import { productRepo, projectSiteUrl } from "#lib/site.ts";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: LockupLink, url: projectSiteUrl },
    githubUrl: `https://github.com/${productRepo.owner}/${productRepo.name}`,
    themeSwitch: { mode: "light-dark-system" },
  };
}
