import { readFileSync } from "node:fs";

import Ajv2020Module from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

// ajv is CommonJS; under NodeNext the default import is module.exports,
// which also carries the real export as `.default`.
const Ajv2020 = Ajv2020Module.default;

const root = new URL("../", import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, root), "utf-8")) as Record<string, unknown>;
}

function validate2020(schemaPath: string, docPath: string): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const check = ajv.compile(readJson(schemaPath));
  check(readJson(docPath));
  return (check.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

const REMOTE_URL = "https://mcp.cryptoquant.com/mcp";

describe("manifests", () => {
  it("plugin.json matches the Agent Plugins 1.0.0 schema", () => {
    expect(validate2020("test/schemas/plugin.schema.json", "plugin.json")).toEqual([]);
  });

  it("mcp.json matches the Agent Plugins 1.0.0 schema", () => {
    expect(validate2020("test/schemas/mcp.schema.json", "mcp.json")).toEqual([]);
  });

  it("plugin.json and mcp.json target the same Agent Plugins version", () => {
    const version = (schema: unknown) => String(schema).match(/schemas\/([^/]+)\//)?.[1];
    expect(version(readJson("mcp.json").$schema)).toBe(version(readJson("plugin.json").$schema));
  });

  it("plugin.json version follows package.json", () => {
    expect(readJson("plugin.json").version).toBe(readJson("package.json").version);
  });

  it("mcp.json registers exactly one remote server and no credentials", () => {
    const servers = readJson("mcp.json").mcpServers as Record<string, Record<string, unknown>>;
    expect(Object.keys(servers)).toEqual(["cryptoquant"]);
    expect(servers.cryptoquant).toEqual({ type: "streamable-http", url: REMOTE_URL });
  });

  it("package.json declares the MCP Registry name", () => {
    expect(readJson("package.json").mcpName).toBe("com.cryptoquant/mcp-server");
  });
});
