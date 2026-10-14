# Tutorials

A tutorial's own code blocks are its test: `scripts/tutorial/` runs a page's `` ```bash run ``
blocks and checks their `` ```text expect `` blocks, against the versions pinned in
`versions`. `tutorials.yaml` runs every tutorial in CI.

```sh
pnpm tutorial scripts/tutorial/fixtures/echo.mdx
```

The site's Contributing section documents both halves: the
[style guide](https://docs.horopter.dev/contributing/style-guide/) holds
the markers and their options, and
[Testing a Tutorial](https://docs.horopter.dev/contributing/testing-a-tutorial/)
holds running them, reading a failure report, bumping a pin, and why fork and Dependabot
pull requests skip the tutorials.
