import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Code } from "mdast";
import { describe, expect, it } from "vitest";
import { codeBlocks, hasMarker } from "#lib/code-blocks.ts";
import { parse } from "yaml";
import { readVersions } from "#lib/versions.ts";

// The page's workflows cannot run in docs CI, so they are held here to the gh steps that set
// their secret and variable, and to record-action's inputs.
const page = join("content", "docs", "how-to", "github-action.mdx");
const setupScript = join("journeys", "github-action", "setup.sh");

// record-action v0.1.0's action.yml inputs.
const recordActionInputs = [
  "run",
  "subject",
  "type",
  "name",
  "title",
  "actor",
  "attributes",
  "url",
  "key",
  "strict",
  "horo-version",
];

function manualBlocks(): Code[] {
  return codeBlocks(page).filter((block) => hasMarker(block, "manual"));
}

type Step = { uses?: string; with?: Record<string, unknown> };
type Workflow = { jobs: Record<string, { strategy?: { matrix?: unknown }; steps: Step[] }> };

function workflows(): Workflow[] {
  const found = manualBlocks()
    .filter((block) => block.lang === "yaml" && block.value.includes("\njobs:"))
    .map((block) => parse(block.value) as Workflow);
  expect(found.length).toBeGreaterThan(0);
  return found;
}

function isRecordStep(step: Step): boolean {
  return step.uses?.startsWith("horopter-dev/record-action@") ?? false;
}

function recordSteps(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs).flatMap((job) => job.steps.filter(isRecordStep));
}

describe("the GitHub Action how-to", () => {
  it("passes every workflow the secret and variable its gh steps set", () => {
    const gh = manualBlocks()
      .map((block) => block.value)
      .join("\n");
    const secret = /gh secret set (\w+)/.exec(gh)?.[1];
    const variable = /gh variable set (\w+)/.exec(gh)?.[1];
    expect(secret).toBe("HOROPTER_INGRESS_KEY");
    expect(variable).toBe("HOROPTER_INGRESS_URL");
    for (const workflow of workflows()) {
      const steps = recordSteps(workflow);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        uses: "horopter-dev/record-action@v1",
        with: { key: `\${{ secrets.${secret} }}`, url: `\${{ vars.${variable} }}` },
      });
    }
  });

  it("gives record-action only its own inputs, and both it requires", () => {
    for (const step of workflows().flatMap(recordSteps)) {
      const given = Object.keys(step.with ?? {});
      expect(recordActionInputs).toEqual(expect.arrayContaining(given));
      expect(given).toEqual(expect.arrayContaining(["run", "subject"]));
    }
  });

  // Without name every leg shares one ref, and record-action fails the step before it runs.
  it("names the record step in every matrix job, and shows one", () => {
    const matrixJobs = workflows()
      .flatMap((workflow) => Object.values(workflow.jobs))
      .filter((job) => job.strategy?.matrix !== undefined);
    expect(matrixJobs.length).toBeGreaterThan(0);
    for (const job of matrixJobs) {
      const names = job.steps.filter(isRecordStep).map((step) => step.with?.["name"]);
      expect(names).not.toContain(undefined);
    }
  });

  it("has CI's setup export every value the page has a reader set", () => {
    const pinned = readVersions();
    const names = manualBlocks()
      .flatMap((block) => [...block.value.matchAll(/^export ([A-Z][A-Z0-9_]*)=/gm)])
      .map(([, name = ""]) => name)
      .filter((name) => !(name in pinned));
    const setup = readFileSync(setupScript, "utf8");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(setup, `setup.sh exports ${name}`).toMatch(new RegExp(`^export ${name}\\b`, "m"));
    }
  });
});
