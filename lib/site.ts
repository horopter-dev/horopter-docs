// The site is served from `horopter-dev.github.io/horopter-docs` until it moves to
// `horopter.dev`, which drops the base path. BASE_PATH= builds for the root, e.g. locally.
export const basePath = process.env.BASE_PATH ?? "/horopter-docs";
export const siteUrl = process.env.SITE_URL ?? "https://horopter-dev.github.io";

export const appName = "Horopter";

export const gitConfig = {
  user: "horopter-dev",
  repo: "horopter-docs",
};
