import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createProcessor } from "@mdx-js/mdx";
import { frontmatter } from "fumadocs-core/content/md/frontmatter";
import type { Code, Nodes } from "mdast";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readVersions } from "#lib/versions.ts";

// The page tests its provisioning-file tab; its kube-prometheus-stack tab is manual, so it is
// held here to the same data source and dashboard as the tested tab.
const page = join("content", "docs", "how-to", "grafana.mdx");
const setupScript = join("journeys", "grafana", "setup.sh");

function codeBlocks(): Code[] {
  const body = createProcessor({ format: "mdx" }).parse(
    frontmatter(readFileSync(page, "utf8")).content,
  );
  const found: Code[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "code") {
      found.push(node);
    } else if ("children" in node) {
      node.children.forEach(walk);
    }
  };
  walk(body);
  return found;
}

function blockWith(marker: "run" | "manual", text: string): string {
  const blocks = codeBlocks().filter(
    (block) => (block.meta ?? "").split(/\s+/).includes(marker) && block.value.includes(text),
  );
  expect(blocks, `one ${marker} block containing ${text}`).toHaveLength(1);
  return blocks[0]?.value ?? "";
}

// The body of the heredoc a run block writes to a path ending in target.
function heredocTo(target: string): string {
  const block = blockWith("run", `${target}"`);
  const heredoc = new RegExp(`${target}" << '?(\\w+)'?\\n(.*?\\n)\\1$`, "ms").exec(block);
  expect(heredoc, `a heredoc writing ${target}`).not.toBeNull();
  return heredoc?.[2] ?? "";
}

type DataSource = { url?: unknown; jsonData?: { allowedHosts?: unknown } };

function withoutURL(source: DataSource): DataSource {
  expect(source.jsonData?.allowedHosts).toEqual([source.url]);
  return { ...source, url: "URL", jsonData: { ...source.jsonData, allowedHosts: ["URL"] } };
}

describe("the Grafana how-to", () => {
  it("gives both tabs the same data source, apart from the URL", () => {
    const tested = heredocTo("datasources/horopter.yaml").replaceAll("\\$", "$");
    const testedSources = (parse(tested) as { datasources: DataSource[] }).datasources;
    const sidecar = parse(blockWith("manual", "additionalDataSources:")) as {
      grafana: { additionalDataSources: DataSource[] };
    };
    expect(testedSources).toHaveLength(1);
    expect(sidecar.grafana.additionalDataSources.map(withoutURL)).toEqual(
      testedSources.map(withoutURL),
    );
  });

  it("gives both tabs the same dashboard, byte for byte", () => {
    const tested = heredocTo("horopter-changes.json");
    const sidecar = parse(blockWith("manual", "grafana_dashboard:")) as {
      data: Record<string, string>;
    };
    expect(sidecar.data["horopter-changes.json"]).toBe(tested);
  });

  it("checks the annotation query of the dashboard it provisions", () => {
    const dashboard = JSON.parse(heredocTo("horopter-changes.json")) as { uid: string };
    expect(blockWith("run", "/api/ds/query")).toContain(`dashboard=${dashboard.uid}\n`);
  });

  it("installs Infinity at the pinned version in both tabs", () => {
    const pinned = readVersions()["INFINITY_VERSION"];
    const installs = [...readFileSync(page, "utf8").matchAll(/infinity-datasource@(\S+)/g)];
    expect(installs.map(([, version]) => version)).toEqual([pinned, pinned]);
  });

  it("runs CI's Grafana with the environment the page has a reader set", () => {
    const environment = blockWith("manual", "GF_PLUGINS_PREINSTALL_SYNC=");
    const names = [...environment.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([, name]) => name);
    const setup = readFileSync(setupScript, "utf8");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(setup, `setup.sh sets ${name} on Grafana`).toContain(`--env ${name}=`);
    }
  });
});
