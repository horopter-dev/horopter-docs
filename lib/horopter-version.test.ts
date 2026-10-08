import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readHoropterVersion } from "#lib/horopter-version.ts";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function repoWith(contents?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "horopter-version-"));
  created.push(dir);
  if (contents !== undefined) {
    writeFileSync(join(dir, "horopter-version"), contents);
  }
  return dir;
}

describe("readHoropterVersion", () => {
  it("reads the pinned release without its trailing newline", () => {
    expect(readHoropterVersion(repoWith("v0.7.0\n"))).toBe("v0.7.0");
  });

  it("accepts a prerelease", () => {
    expect(readHoropterVersion(repoWith("v0.1.0-dev.3\n"))).toBe("v0.1.0-dev.3");
  });

  it("names the file when it is missing", () => {
    const dir = repoWith();
    expect(() => readHoropterVersion(dir)).toThrow(`cannot read ${join(dir, "horopter-version")}`);
  });

  it.each([
    ["empty", ""],
    ["missing its v", "0.7.0\n"],
    ["two lines", "v0.7.0\nv0.6.0\n"],
    ["a branch", "main\n"],
  ])("refuses a file that is %s", (_, contents) => {
    expect(() => readHoropterVersion(repoWith(contents))).toThrow(
      /must hold one release tag, such as v0\.7\.0/,
    );
  });

  it("reads this repository's pin", () => {
    expect(readHoropterVersion()).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
