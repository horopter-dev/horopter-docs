import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Versions = Record<string, string> & { HOROPTER_VERSION: string };

const pinLine = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const releaseTag = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readPin(text: string, number: number, lines: Map<string, number>): [string, string] {
  const match = pinLine.exec(text);
  if (match === null) {
    throw new Error(`line ${number}: expected KEY=value, KEY in capitals; got ${text}`);
  }
  const [, key = "", value = ""] = match;
  const earlier = lines.get(key);
  if (earlier !== undefined) {
    throw new Error(`line ${number}: ${key} is already pinned at line ${earlier}`);
  }
  if (value === "") {
    throw new Error(`line ${number}: ${key} is empty; give it a version`);
  }
  if (key === "HOROPTER_VERSION" && !releaseTag.test(value)) {
    throw new Error(
      `line ${number}: HOROPTER_VERSION must be a release tag, such as v0.7.0; got ${value}`,
    );
  }
  lines.set(key, number);
  return [key, value];
}

function parseVersions(contents: string): Versions {
  const versions: Record<string, string> = {};
  const lines = new Map<string, number>();
  for (const [index, text] of contents.split("\n").entries()) {
    if (text.trim() !== "") {
      const [key, value] = readPin(text, index + 1, lines);
      versions[key] = value;
    }
  }
  const horopterVersion = versions["HOROPTER_VERSION"];
  if (horopterVersion === undefined) {
    throw new Error("no HOROPTER_VERSION line; pin the Horopter release the docs describe");
  }
  return { ...versions, HOROPTER_VERSION: horopterVersion };
}

/** The `versions` file's path under a checkout. */
export function versionsPath(repoRoot: string = process.cwd()): string {
  return join(repoRoot, "versions");
}

/**
 * Reads the versions these docs pin, from the `versions` file: one `KEY=value` line per pin.
 * `HOROPTER_VERSION`, the Horopter release the docs describe, is required.
 *
 * Args:
 *   repoRoot: The directory holding `versions`; the current directory by default, which is
 *     the repository root under `pnpm` and `next`.
 *
 * Returns:
 *   Each pin's value by its key.
 *
 * Raises:
 *   Error: the file cannot be read; a line is not `KEY=value`, repeats a key or has an empty
 *     value; or `HOROPTER_VERSION` is missing or not a release tag.
 */
export function readVersions(repoRoot: string = process.cwd()): Versions {
  const path = versionsPath(repoRoot);
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ${path}: ${reason}`, { cause: error });
  }
  try {
    return parseVersions(contents);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: ${reason}`, { cause: error });
  }
}
