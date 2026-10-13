import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { importReference } from "#scripts/import-reference.ts";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "import-reference-test-"));
  created.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
    ].concat(args),
    { cwd, stdio: "ignore", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } },
  );
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function horopterRepository(tag: string, files: Record<string, string>): string {
  const dir = scratchDir();
  git(dir, "init", "--quiet", "--initial-branch=main");
  writeFiles(dir, files);
  git(dir, "add", ".");
  git(dir, "commit", "--quiet", "--message=release");
  git(dir, "tag", tag);
  return pathToFileURL(dir).href;
}

function contentDir(files: Record<string, string> = {}): string {
  const dir = join(scratchDir(), "reference");
  mkdirSync(dir);
  writeFiles(dir, files);
  return dir;
}

const release = {
  "README.md": "# horopter\n",
  "docs/agents/domain.md": "agents\n",
  "docs/reference_test.go": "package docs\n",
  "docs/reference/http-api.md": "---\ntitle: HTTP API\n---\n",
  "docs/reference/metrics.md": "---\ntitle: Metrics\n---\n",
};

describe("importReference", () => {
  it("copies docs/reference/'s pages at the tag, and nothing else", () => {
    const repository = horopterRepository("v1.2.3", release);
    const into = contentDir({ "index.mdx": "index\n" });

    expect(importReference({ repository, tag: "v1.2.3", into })).toEqual([
      "http-api.md",
      "metrics.md",
    ]);
    expect(readdirSync(into).toSorted()).toEqual(["http-api.md", "index.mdx", "metrics.md"]);
    expect(readFileSync(join(into, "metrics.md"), "utf8")).toBe("---\ntitle: Metrics\n---\n");
  });

  it("removes a page imported earlier that the release no longer has", () => {
    const repository = horopterRepository("v1.2.3", release);
    const into = contentDir({ "index.mdx": "index\n", "retired.md": "old\n" });

    importReference({ repository, tag: "v1.2.3", into });

    expect(readdirSync(into)).not.toContain("retired.md");
    expect(readdirSync(into)).toContain("index.mdx");
  });

  it("fails, naming the tag and repository, when the tag does not exist", () => {
    const repository = horopterRepository("v1.2.3", release);
    const into = contentDir({ "index.mdx": "index\n", "metrics.md": "kept\n" });

    expect(() => importReference({ repository, tag: "v9.9.9", into })).toThrow(
      `cannot check out v9.9.9 of ${repository}`,
    );
    expect(readFileSync(join(into, "metrics.md"), "utf8")).toBe("kept\n");
  });

  it("fails when the release has no docs/reference/ pages", () => {
    const repository = horopterRepository("v0.1.0", { "README.md": "# horopter\n" });
    const into = contentDir({ "index.mdx": "index\n" });

    expect(() => importReference({ repository, tag: "v0.1.0", into })).toThrow(
      `v0.1.0 of ${repository} has no pages in docs/reference/`,
    );
  });
});
