import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVersions } from "#lib/versions.ts";

const horopterRepository = "https://github.com/horopter-dev/horopter.git";
const referenceDir = "docs/reference";
const contentReferenceDir = join("content", "docs", "reference");

// No user or system config, credential helper or prompt: the checkout is anonymous, as a
// reader's is.
const anonymousGit = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  SSH_ASKPASS: "",
};

export type ReferenceSource = {
  repository: string;
  tag: string;
  into: string;
};

function git(
  { repository, tag }: ReferenceSource,
  command: string,
  args: string[],
  cwd?: string,
): void {
  const result = spawnSync("git", ["-c", "credential.helper=", command, ...args], {
    cwd,
    encoding: "utf8",
    env: anonymousGit,
  });
  if (result.status !== 0) {
    const reason = (result.stderr || result.error?.message || "").trim();
    throw new Error(`cannot check out ${tag} of ${repository}: git ${command}: ${reason}`);
  }
}

function sparseCheckout(source: ReferenceSource, checkout: string): void {
  git(source, "clone", [
    "--quiet",
    "--depth=1",
    "--filter=blob:none",
    "--no-checkout",
    `--branch=${source.tag}`,
    source.repository,
    checkout,
  ]);
  git(source, "sparse-checkout", ["set", referenceDir], checkout);
  git(source, "checkout", ["--quiet"], checkout);
}

function referencePages({ repository, tag }: ReferenceSource, dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      throw new Error(
        `${tag} of ${repository} holds ${entry.name} in ${referenceDir}/; ` +
          "only *.md pages at its top level can be imported",
      );
    }
    pages.push(entry.name);
  }
  return pages.toSorted();
}

function importedPages(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".md"));
}

/**
 * Replaces the Reference section's imported pages with `docs/reference/`'s pages from a
 * Horopter release, by an anonymous sparse checkout of that tag. Pages the section holds of
 * its own, such as `index.mdx`, are kept.
 *
 * Args:
 *   source: The repository to check out, the release tag, and the section's directory.
 *
 * Returns:
 *   The file names of the pages imported.
 *
 * Raises:
 *   Error: the tag cannot be checked out, holds no pages in `docs/reference/`, or holds
 *     something there other than top-level `*.md` pages. The section is left as it was.
 */
export function importReference(source: ReferenceSource): string[] {
  const checkout = mkdtempSync(join(tmpdir(), "horopter-reference-"));
  try {
    sparseCheckout(source, checkout);
    const from = join(checkout, referenceDir);
    const pages = referencePages(source, from);
    if (pages.length === 0) {
      throw new Error(`${source.tag} of ${source.repository} has no pages in ${referenceDir}/`);
    }
    for (const page of importedPages(source.into)) {
      rmSync(join(source.into, page));
    }
    for (const page of pages) {
      copyFileSync(join(from, page), join(source.into, page));
    }
    return pages;
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const tag = readVersions().HOROPTER_VERSION;
  const pages = importReference({ repository: horopterRepository, tag, into: contentReferenceDir });
  console.log(`import-reference: ${pages.length} pages from horopter ${tag}`);
}
