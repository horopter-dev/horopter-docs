import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkExport } from "#scripts/check-export.ts";

const basePath = "/horopter-docs";

const goodHtml = `<!DOCTYPE html><html><head>
<meta name="robots" content="noindex, nofollow"/>
<link rel="stylesheet" href="/horopter-docs/_next/static/css/a.css"/>
<script src="/horopter-docs/_next/static/chunks/b.js" async=""></script>
</head><body><a href="/horopter-docs/">Home</a><a href="https://example.com/">x</a></body></html>`;

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function exportDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "check-export-"));
  created.push(dir);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

function goodExport(overrides: Record<string, string> = {}): string {
  return exportDir({
    "index.html": goodHtml,
    "robots.txt": "User-Agent: *\nDisallow: /\n",
    "_next/static/css/a.css": "",
    "_next/static/chunks/b.js": "",
    ...overrides,
  });
}

describe("checkExport", () => {
  it("accepts an export that is not indexed and whose assets resolve under the base path", () => {
    expect(checkExport(goodExport(), basePath)).toEqual([]);
  });

  it("reports a missing robots.txt", () => {
    const dir = exportDir({
      "index.html": goodHtml,
      "_next/static/css/a.css": "",
      "_next/static/chunks/b.js": "",
    });
    expect(checkExport(dir, basePath)).toEqual(["robots.txt is missing"]);
  });

  it("reports a robots.txt that does not disallow everything", () => {
    const dir = goodExport({ "robots.txt": "User-Agent: *\nAllow: /\n" });
    expect(checkExport(dir, basePath)).toEqual([
      "robots.txt does not disallow all crawling: User-Agent: * / Allow: /",
    ]);
  });

  it("reports a robots.txt that disallows only one crawler", () => {
    const dir = goodExport({ "robots.txt": "User-Agent: Googlebot\nDisallow: /\n" });
    expect(checkExport(dir, basePath)).toEqual([
      "robots.txt does not disallow all crawling: User-Agent: Googlebot / Disallow: /",
    ]);
  });

  it("reports a robots.txt whose Disallow: / belongs to another crawler's group", () => {
    const dir = goodExport({
      "robots.txt": "User-Agent: *\nAllow: /\n\nUser-Agent: Bot\nDisallow: /\n",
    });
    expect(checkExport(dir, basePath)).toEqual([
      "robots.txt does not disallow all crawling: " +
        "User-Agent: * / Allow: / / User-Agent: Bot / Disallow: /",
    ]);
  });

  it("reports a page without a robots noindex meta tag", () => {
    const dir = goodExport({ "index.html": goodHtml.replace("noindex, nofollow", "index") });
    expect(checkExport(dir, basePath)).toEqual([
      'index.html has no <meta name="robots"> containing noindex',
    ]);
  });

  it("reports an asset referenced outside the base path", () => {
    const html = goodHtml.replace(
      "/horopter-docs/_next/static/css/a.css",
      "/_next/static/css/a.css",
    );
    expect(checkExport(goodExport({ "index.html": html }), basePath)).toEqual([
      "index.html references /_next/static/css/a.css, outside the base path /horopter-docs",
    ]);
  });

  it("reports an asset under the base path that the export does not contain", () => {
    const html = goodHtml.replace("chunks/b.js", "chunks/missing.js");
    expect(checkExport(goodExport({ "index.html": html }), basePath)).toEqual([
      "index.html references /horopter-docs/_next/static/chunks/missing.js, " +
        "which is not in the export",
    ]);
  });

  it("resolves a directory link to its index.html and ignores query strings and fragments", () => {
    const html = goodHtml.replace(
      '<a href="/horopter-docs/">Home</a>',
      '<a href="/horopter-docs/concepts/?x=1#top">Concepts</a>',
    );
    const dir = goodExport({ "index.html": html, "concepts/index.html": goodHtml });
    expect(checkExport(dir, basePath)).toEqual([]);
  });

  it("checks every html page in the export, not only the root", () => {
    const dir = goodExport({ "concepts/index.html": goodHtml.replace("noindex, nofollow", "all") });
    expect(checkExport(dir, basePath)).toEqual([
      'concepts/index.html has no <meta name="robots"> containing noindex',
    ]);
  });

  it("reports a markdown link in a text file that points outside the base path", () => {
    const dir = goodExport({
      "llms.txt": "# Docs\n\n- [Horopter](/horopter-docs/): ok\n- [Concepts](/concepts): wrong\n",
    });
    expect(checkExport(dir, basePath)).toEqual([
      "llms.txt references /concepts, outside the base path /horopter-docs",
    ]);
  });

  it("checks a bare parenthesised path in a text file, as llms-full.txt writes them", () => {
    const dir = goodExport({ "llms-full.txt": "# Horopter (/horopter-docs/)\n\n# Concepts (/)\n" });
    expect(checkExport(dir, basePath)).toEqual([
      "llms-full.txt references /, outside the base path /horopter-docs",
    ]);
  });

  it("ignores text files other than llms ones, such as Next's page payloads", () => {
    const dir = goodExport({ "index.txt": "page text mentioning (/elsewhere)\n" });
    expect(checkExport(dir, basePath)).toEqual([]);
  });

  it("reports an export with no html pages", () => {
    const dir = exportDir({ "robots.txt": "User-Agent: *\nDisallow: /\n" });
    expect(checkExport(dir, basePath)).toEqual(["the export holds no html pages"]);
  });
});
