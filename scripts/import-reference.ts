import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVersions } from "#lib/versions.ts";

const horopter = "https://github.com/horopter-dev/horopter.git";
const referenceDir = "docs/reference";
const contentReferenceDir = join("content", "docs", "reference");

export type ReferenceSource = {
  repository: string;
  tag: string;
  into: string;
};

function markdownPages(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .toSorted();
}

// No credential helper and no prompt: the checkout is anonymous, as a reader's is.
function sparseCheckout({ repository, tag }: ReferenceSource, checkout: string): void {
  const result = spawnSync(
    "git",
    [
      "-c",
      "credential.helper=",
      "clone",
      "--quiet",
      "--depth=1",
      "--filter=blob:none",
      "--no-checkout",
      `--branch=${tag}`,
      repository,
      checkout,
    ],
    { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
  );
  const checkedOut =
    result.status === 0 &&
    spawnSync("git", ["-C", checkout, "sparse-checkout", "set", referenceDir]).status === 0 &&
    spawnSync("git", ["-C", checkout, "checkout", "--quiet"]).status === 0;
  if (!checkedOut) {
    const reason = (result.stderr || result.error?.message || "").trim();
    throw new Error(`cannot check out ${tag} of ${repository}: ${reason}`);
  }
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
 *   Error: the tag cannot be checked out, or holds no pages in `docs/reference/`. The section
 *     is left as it was.
 */
export function importReference(source: ReferenceSource): string[] {
  const checkout = mkdtempSync(join(tmpdir(), "horopter-reference-"));
  try {
    sparseCheckout(source, checkout);
    const from = join(checkout, referenceDir);
    const pages = markdownPages(from);
    if (pages.length === 0) {
      throw new Error(`${source.tag} of ${source.repository} has no pages in ${referenceDir}/`);
    }
    for (const page of markdownPages(source.into)) {
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
  const pages = importReference({ repository: horopter, tag, into: contentReferenceDir });
  console.log(`import-reference: ${pages.length} pages from horopter ${tag}`);
}
