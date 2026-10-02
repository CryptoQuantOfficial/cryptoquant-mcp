import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseMetricIds } from "./helpers/metric-ids.js";

const SKILL_DIR = "cryptoquant-onchain";
const skillUrl = new URL(`../skills/${SKILL_DIR}/SKILL.md`, import.meta.url);
const fixtureUrl = new URL("./fixtures/metric-ids.txt", import.meta.url);
const serverToon = new URL("../../cryptoquant-mcp-server/data/metrics.toon", import.meta.url);

const TOOL_NAMES = new Set([
  "discover_endpoints",
  "get_endpoint_info",
  "query_data",
  "describe_metric",
  "list_assets",
  "recent_research",
  "recent_quicktake",
  "query_research",
  "query_quicktake",
]);

function parseSkill(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md has no frontmatter");
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^([a-z-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return { fields, body: match[2] };
}

function mappingTableIds(body: string): string[] {
  const section = body.split(/^## /m).find((s) => s.startsWith("Question to metric map"));
  if (!section) throw new Error("mapping section not found");
  const rows = section.split("\n").filter((line) => line.startsWith("|"));
  const ids = rows.flatMap((row) => [...row.matchAll(/`([a-z0-9_-]+)`/g)].map((m) => m[1]));
  return [...new Set(ids)].filter((id) => !TOOL_NAMES.has(id));
}

const skill = parseSkill(readFileSync(skillUrl, "utf-8"));
const knownIds = new Set(readFileSync(fixtureUrl, "utf-8").split("\n").filter(Boolean));

describe("cryptoquant-onchain skill", () => {
  it("frontmatter name matches the directory name", () => {
    expect(skill.fields.name).toBe(SKILL_DIR);
    expect(skill.fields.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("description says what and when, within 1024 characters", () => {
    expect(skill.fields.description.length).toBeGreaterThan(0);
    expect(skill.fields.description.length).toBeLessThanOrEqual(1024);
  });

  it("declares the MIT license", () => {
    expect(skill.fields.license).toBe("MIT");
  });

  it("body stays within 500 lines", () => {
    expect(skill.body.split("\n").length).toBeLessThanOrEqual(500);
  });

  it("every metric id in the mapping table exists on the server", () => {
    const ids = mappingTableIds(skill.body);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id) => !knownIds.has(id))).toEqual([]);
  });

  it.skipIf(!existsSync(serverToon))("metric id fixture matches the local server clone", () => {
    const current = parseMetricIds(readFileSync(serverToon, "utf-8"));
    expect([...knownIds].sort()).toEqual(current);
  });
});
