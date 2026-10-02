import { describe, expect, it } from "vitest";

import { ConfigError, DEFAULT_MCP_URL, resolveServerUrl } from "./config.js";

describe("resolveServerUrl", () => {
  it("defaults to the production server", () => {
    expect(resolveServerUrl({}).href).toBe(DEFAULT_MCP_URL);
    expect(resolveServerUrl({ CRYPTOQUANT_MCP_URL: "  " }).href).toBe(DEFAULT_MCP_URL);
  });

  it("accepts any https URL", () => {
    expect(resolveServerUrl({ CRYPTOQUANT_MCP_URL: "https://mcp.example.com/mcp" }).href).toBe(
      "https://mcp.example.com/mcp",
    );
  });

  it.each(["http://localhost:3000/mcp", "http://127.0.0.1:3000/mcp", "http://127.8.9.10/mcp", "http://[::1]:3000/mcp"])(
    "accepts loopback http (%s)",
    (url) => {
      expect(resolveServerUrl({ CRYPTOQUANT_MCP_URL: url }).href).toBe(url);
    },
  );

  it.each(["http://example.com/mcp", "http://10.0.0.5/mcp", "http://localhost.example.com/mcp", "ftp://localhost/mcp", "not a url"])(
    "rejects %s",
    (url) => {
      expect(() => resolveServerUrl({ CRYPTOQUANT_MCP_URL: url })).toThrow(ConfigError);
    },
  );
});
