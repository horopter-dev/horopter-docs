# Development

## Working on it

Tools are pinned in `mise.toml`; `mise install` provides Node, pnpm and prek.

```sh
pnpm install          # lifecycle scripts are off; nothing runs on install
prek install
pnpm dev             # http://localhost:3000
```

Pages are MDX under `content/docs/`, in five sections — Tutorials, How-to, Reference,
Concepts and Contributing — each a folder with an `index.mdx`. `content/docs/meta.json` sets
their sidebar order after the landing page.

Reference holds only its `index.mdx` here. Its other pages are `horopter`'s `docs/reference/`
at the release `HOROPTER_VERSION` pins in `versions`: `pnpm reference` checks them out
anonymously and copies them in, and `pnpm dev`, `pnpm build` and `pnpm types:check` run it
first, so each needs network access to GitHub and fails without it. The copies are gitignored;
change a reference page in `horopter`.

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
`robots.txt` disallowing all crawling, and asset references resolve under the base path. Served
from the root of `docs.horopter.dev`, `robots.txt` stops crawling; the meta tag also keeps out of
search results a page reached by a link, and covers a build under a base path, where crawlers
never read `robots.txt`.

`llms.txt` and `llms-full.txt` give the pages as markdown. `lib/llms.ts` resolves their links
and Cards to site paths as the build writes them, as the HTML pages resolve them, so a page can
link with a root path or a file-relative one, `./`, `../` or bare. The build fails on a link left
unresolved, in a page or in an llms file.

A push to `main` builds and deploys the site with `docs.yaml`.
