# horopter-docs

The documentation site for Horopter: Next.js and Fumadocs, exported as a static site and
published to GitHub Pages at <https://horopter-dev.github.io/horopter-docs/>. The site is not
indexed yet.

## Working on it

Tools are pinned in `mise.toml`; `mise install` provides Node, pnpm and prek.

```sh
pnpm install          # lifecycle scripts are off; nothing runs on install
prek install
BASE_PATH= pnpm dev   # http://localhost:3000, without the /horopter-docs base path
```

Pages are MDX under `content/docs/`.

## Checks

`ci.yaml` runs these on every pull request; run them locally the same way:

```sh
pnpm lint && pnpm format:check && pnpm types:check && pnpm test
pnpm build            # static export to out/, then scripts/check-export.ts
prek run --all-files
```

`pnpm build` fails unless every page carries a robots `noindex` meta tag, the export carries a
`robots.txt` disallowing all crawling, and asset references resolve under the base path. The
meta tag is what keeps the site out of search results: crawlers read `robots.txt` only at a
host's root, and this one is served under `/horopter-docs/`.

A push to `main` builds and deploys the site with `docs.yaml`.

## Licence

Apache-2.0; see `LICENSE`.
