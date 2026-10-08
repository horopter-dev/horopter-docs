import { readFileSync } from "node:fs";
import { join } from "node:path";

const releaseTag = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Reads the Horopter release these docs describe, from the `horopter-version` file.
 *
 * Args:
 *   repoRoot: The directory holding `horopter-version`; the current directory by default,
 *     which is the repository root under `pnpm` and `next`.
 *
 * Returns:
 *   The release tag, such as `v0.7.0`.
 *
 * Raises:
 *   Error: the file cannot be read, or does not hold exactly one release tag.
 */
export function readHoropterVersion(repoRoot: string = process.cwd()): string {
  const path = join(repoRoot, "horopter-version");
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ${path}: ${reason}`, { cause: error });
  }
  const version = contents.trim();
  if (!releaseTag.test(version)) {
    throw new Error(
      `${path} must hold one release tag, such as v0.7.0; it holds ${JSON.stringify(contents)}`,
    );
  }
  return version;
}
