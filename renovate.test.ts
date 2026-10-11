import { readFileSync } from "node:fs";
import JSON5 from "json5";
import { describe, expect, it } from "vitest";
import { readVersions, versionsPath } from "#lib/versions.ts";

type CustomManager = {
  customType: string;
  managerFilePatterns: string[];
  matchStrings: string[];
};

const inlineMultiline = "(?m)";

function toRegExp(pattern: string, flags = ""): RegExp {
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    return new RegExp(pattern.slice(1, -1), flags);
  }
  if (pattern.startsWith(inlineMultiline)) {
    return new RegExp(pattern.slice(inlineMultiline.length), `${flags}m`);
  }
  return new RegExp(pattern, flags);
}

function managersOfVersions(): CustomManager[] {
  const config = JSON5.parse<{ customManagers?: CustomManager[] }>(
    readFileSync("renovate.json5", "utf8"),
  );
  return (config.customManagers ?? []).filter(
    (manager) =>
      manager.customType === "regex" &&
      manager.managerFilePatterns.some((pattern) => toRegExp(pattern).test("versions")),
  );
}

function updatedValues(contents: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const manager of managersOfVersions()) {
    for (const matchString of manager.matchStrings) {
      for (const match of contents.matchAll(toRegExp(matchString, "g"))) {
        const line = match[0];
        const currentValue = match.groups?.["currentValue"];
        if (currentValue !== undefined) {
          values.set(line.slice(0, line.indexOf("=")), currentValue);
        }
      }
    }
  }
  return values;
}

describe("renovate.json5", () => {
  it("has a regex manager that updates every pin in versions", () => {
    const contents = readFileSync(versionsPath(), "utf8");
    const updated = updatedValues(contents);
    for (const [key, value] of Object.entries(readVersions())) {
      expect(updated.get(key), `no regex manager in renovate.json5 updates ${key}`).toBe(value);
    }
  });
});
