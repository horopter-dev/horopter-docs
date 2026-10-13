import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeBlocks, hasMarker } from "#lib/code-blocks.ts";
import { readVersions } from "#lib/versions.ts";

const page = join("content", "docs", "how-to", "flux.mdx");
const installPage = join("content", "docs", "how-to", "install-kubernetes.mdx");
const setupScript = join("journeys", "flux", "setup.sh");

describe("the Flux how-to", () => {
  it("has CI's setup export every value the page has a reader set", () => {
    const pinned = readVersions();
    const manual = codeBlocks(page).filter((block) => hasMarker(block, "manual"));
    const names = manual
      .flatMap((block) => [...block.value.matchAll(/^export ([A-Z][A-Z0-9_]*)=/gm)])
      .map(([, name = ""]) => name)
      .filter((name) => !(name in pinned));
    const setup = readFileSync(setupScript, "utf8");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(setup, `setup.sh exports ${name}`).toMatch(new RegExp(`^export ${name}\\b`, "m"));
    }
  });

  // setup.sh sources the install how-to's functions from the run block that defines them.
  it("finds the install how-to's in_cluster and horoctl functions in one run block", () => {
    const blocks = codeBlocks(installPage).filter(
      (block) =>
        hasMarker(block, "run") &&
        block.value.startsWith("in_cluster() {\n"),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.value).toMatch(/^horoctl\(\) \{$/m);
  });
});
