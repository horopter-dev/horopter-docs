// The site is served from the root of `docs.horopter.dev`. BASE_PATH builds it under a path
// instead, e.g. BASE_PATH=/horopter-docs for the GitHub Pages project URL.
export const basePath = process.env.BASE_PATH ?? "";
export const siteUrl = process.env.SITE_URL ?? "https://docs.horopter.dev";
export const projectSiteUrl = "https://www.horopter.dev";

export const appName = "Horopter";

export const productRepo = {
  owner: "horopter-dev",
  name: "horopter",
};
