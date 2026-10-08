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

## Tutorials

A tutorial's own code blocks are its test. `` ```bash run `` blocks run in page order in one
bash session, in a throwaway directory, so exported variables and `cd` carry forward. A
`` ```text expect `` block after a run block must match that block's output, stdout and stderr
together as a reader sees them, line for line: `...` matches any text within a line, a `...`
line matches one line, and a final `...` line allows any further output.

- `` ```bash run timeout=300 `` limits a block to 300 seconds; the default is 120.
- `` ```bash run retry=5 `` repeats a block every 5 seconds until it succeeds or its timeout
  ends, for a step that waits on something. Each attempt runs in a subshell under `set -e`,
  so a retry block's variables and `cd` do not carry forward; its `expect` block is checked
  against the attempt that succeeded. An attempt succeeds by its exit status, so a readiness
  check matches exact values with `jq -e`, which exits non-zero on `false`, `null` or no
  input, so a failing command feeding it fails the attempt too:

  ```sh
  jq -e '.status.conditions[] | select(.type == "Ready") | .status == "True"' \
    < <(kubectl get kustomization app -o json)
  ```
- `` ```<lang> manual `` is a step the harness cannot run. It is not run, and the report lists
  it as untested. An `expect` block after it is untested with it.
- `cleanup:` in the front matter is a command run after the steps, pass or fail, in the
  directory the session started in, with a 120-second limit. It runs in its own shell, so it
  does not see variables the steps exported. A failing cleanup fails the page.

## The pinned Horopter version

The docs describe one Horopter release, named in `horopter-version` (e.g. `v0.7.0`). A page
renders it with `<HoropterVersion/>`, and the harness gives it to steps and `cleanup:` as
`HOROPTER_VERSION`.

`tutorials.yaml` runs on every pull request, weekly, and on a push to `main` that changes
`horopter-version`. Its three jobs:

- **Harness fixtures** runs `echo.mdx`, which must pass, and `wrong-expect.mdx`, which must
  fail naming its second block.
- **Plan** lists the pages under `content/` that have a `bash run` block, plus the
  `pull-image.mdx` fixture, which pulls a private image at `$HOROPTER_VERSION`. It also
  checks that the workflow's `GITHUB_TOKEN` can read `horoctl` at the pinned release.
- **Tutorial** runs each listed page in its own job, after logging in to GHCR with
  `GITHUB_TOKEN`. When a pull request from a fork or Dependabot cannot read the image, these
  jobs are skipped and Plan leaves a notice saying why. Any other run that cannot read it
  fails Plan, so it cannot pass without testing anything.

While Horopter's images are private, `GITHUB_TOKEN` reads one only if that package's settings
grant this repository Read under "Manage Actions access". Neither GitHub's REST API nor its
Terraform provider manages that list, so it is set by hand for each image a tutorial pulls.

```sh
pnpm tutorial scripts/tutorial/fixtures/echo.mdx
```

## Licence

Apache-2.0; see `LICENSE`.
