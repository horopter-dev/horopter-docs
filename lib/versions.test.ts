import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readVersions } from "#lib/versions.ts";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function repoWith(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "versions-"));
  created.push(dir);
  if (contents !== undefined) {
    writeFileSync(join(dir, "versions"), contents);
  }
  return dir;
}

describe("readVersions", () => {
  it("reads every pin, skipping blank lines", () => {
    const dir = repoWith("HOROPTER_VERSION=v0.7.0\n\nFLUX_VERSION=2.6.4\n");
    expect(readVersions(dir)).toEqual({ HOROPTER_VERSION: "v0.7.0", FLUX_VERSION: "2.6.4" });
  });

  it("keeps an = inside a value", () => {
    const dir = repoWith("HOROPTER_VERSION=v0.7.0\nKIND_NODE_IMAGE=kindest/node@sha256:ab=\n");
    expect(readVersions(dir)["KIND_NODE_IMAGE"]).toBe("kindest/node@sha256:ab=");
  });

  it("accepts a prerelease Horopter", () => {
    expect(readVersions(repoWith("HOROPTER_VERSION=v0.1.0-dev.3\n")).HOROPTER_VERSION).toBe(
      "v0.1.0-dev.3",
    );
  });

  it("names the file when it is missing", () => {
    const dir = repoWith();
    expect(() => readVersions(dir)).toThrow(`cannot read ${join(dir, "versions")}`);
  });

  it.each([
    ["a line with no =", "HOROPTER_VERSION=v0.7.0\nFLUX_VERSION\n", "line 2: expected KEY=value"],
    ["a lowercase key", "HOROPTER_VERSION=v0.7.0\nflux=2\n", "line 2: expected KEY=value"],
    ["a key with a space", "HOROPTER_VERSION=v0.7.0\nFLUX VERSION=2\n", "line 2: expected"],
    ["an empty value", "HOROPTER_VERSION=v0.7.0\nFLUX_VERSION=\n", "line 2: FLUX_VERSION is empty"],
    [
      "a duplicate key",
      "HOROPTER_VERSION=v0.7.0\nHOROPTER_VERSION=v0.6.0\n",
      "line 2: HOROPTER_VERSION is already pinned at line 1",
    ],
    ["no HOROPTER_VERSION", "FLUX_VERSION=2.6.4\n", "no HOROPTER_VERSION line"],
    ["an empty file", "", "no HOROPTER_VERSION line"],
    [
      "a Horopter version that is not a release tag",
      "HOROPTER_VERSION=main\n",
      "line 1: HOROPTER_VERSION must be a release tag, such as v0.7.0",
    ],
  ])("refuses %s, naming the problem", (_, contents, message) => {
    const dir = repoWith(contents);
    expect(() => readVersions(dir)).toThrow(`${join(dir, "versions")}: ${message}`);
  });

  it("reads this repository's pins", () => {
    expect(readVersions().HOROPTER_VERSION).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
