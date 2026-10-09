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

Pages are MDX under `content/docs/`, in five sections — Tutorials, How-to, Reference,
Concepts and Contributing — each a folder with an `index.mdx`. `content/docs/meta.json` sets
their sidebar order after the landing page.

`public/brand/` holds the Horopter lockup and favicons, light and dark: copies of the brand's
own files, unchanged. Replace them from the source rather than editing them here.

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

`llms.txt` and `llms-full.txt` give the pages as markdown. `lib/llms.ts` resolves their links
and Cards to site paths as the build writes them, as the HTML pages resolve them, so a page can
link with a root path or a file-relative one. The build fails on a link left unresolved.

A push to `main` builds and deploys the site with `docs.yaml`.

## Tutorials

A tutorial's own code blocks are its test: `scripts/tutorial/` runs a page's `` ```bash run ``
blocks and checks their `` ```text expect `` blocks, against the versions pinned in
`versions`. `tutorials.yaml` runs every tutorial in CI.

```sh
pnpm tutorial scripts/tutorial/fixtures/echo.mdx
```

The site's Contributing section documents both halves: the
[style guide](https://horopter-dev.github.io/horopter-docs/contributing/style-guide/) holds
the markers and their options, and
[Testing a Tutorial](https://horopter-dev.github.io/horopter-docs/contributing/testing-a-tutorial/)
holds running them, reading a failure report, bumping a pin, and why fork and Dependabot
pull requests skip the tutorials.

## Licence

Apache-2.0; see `LICENSE`.
