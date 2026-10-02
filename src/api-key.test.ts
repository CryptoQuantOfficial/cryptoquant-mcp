import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { API_KEY_URL, credentialsPath, invalidKeyMessage, isValidApiKey, missingKeyMessage, resolveApiKey } from "./api-key.js";

function tempHome(credentials?: string): string {
  const home = mkdtempSync(join(tmpdir(), "cq-home-"));
  if (credentials !== undefined) {
    mkdirSync(join(home, ".cryptoquant"));
    writeFileSync(credentialsPath(home), credentials);
  }
  return home;
}

const stored = (key: unknown) =>
  JSON.stringify({ api_key: key, created_at: "2026-01-01T00:00:00.000Z", validated_at: "2026-01-01T00:00:00.000Z" });

describe("resolveApiKey", () => {
  it("prefers CRYPTOQUANT_API_KEY over the credentials file", () => {
    const home = tempHome(stored("file-key"));
    expect(resolveApiKey({ env: { CRYPTOQUANT_API_KEY: "env-key" }, home })).toEqual({ key: "env-key", source: "env" });
  });

  it("trims the environment value", () => {
    expect(resolveApiKey({ env: { CRYPTOQUANT_API_KEY: "  env-key \n" }, home: tempHome() })).toEqual({ key: "env-key", source: "env" });
  });

  it("treats a whitespace-only environment value as missing", () => {
    const home = tempHome(stored("file-key"));
    expect(resolveApiKey({ env: { CRYPTOQUANT_API_KEY: "   " }, home })).toEqual({ key: "file-key", source: "credentials" });
  });

  it("falls back to ~/.cryptoquant/credentials", () => {
    expect(resolveApiKey({ env: {}, home: tempHome(stored(" file-key ")) })).toEqual({ key: "file-key", source: "credentials" });
  });

  it("returns null when neither source has a key", () => {
    expect(resolveApiKey({ env: {}, home: tempHome() })).toBeNull();
  });

  it.each([
    ["broken JSON", "{not json"],
    ["empty api_key", stored("")],
    ["non-string api_key", stored(42)],
    ["JSON array", "[]"],
    ["JSON null", "null"],
  ])("ignores a malformed credentials file (%s)", (_label, content) => {
    expect(resolveApiKey({ env: {}, home: tempHome(content) })).toBeNull();
  });

  it("never creates the credentials directory", () => {
    const home = tempHome();
    resolveApiKey({ env: {}, home });
    expect(existsSync(join(home, ".cryptoquant"))).toBe(false);
  });

  it("never modifies an existing credentials file", () => {
    const home = tempHome(stored("file-key"));
    const before = { content: readFileSync(credentialsPath(home), "utf-8"), mtime: statSync(credentialsPath(home)).mtimeMs };
    resolveApiKey({ env: {}, home });
    expect(readFileSync(credentialsPath(home), "utf-8")).toBe(before.content);
    expect(statSync(credentialsPath(home)).mtimeMs).toBe(before.mtime);
  });
});

describe("missingKeyMessage", () => {
  it("shows a config example, the key link, and the remote server option", () => {
    const message = missingKeyMessage();
    expect(message).toContain('"CRYPTOQUANT_API_KEY"');
    expect(message).toContain('"args": ["-y", "cryptoquant-mcp"]');
    expect(message).toContain(API_KEY_URL);
    expect(message).toContain("https://mcp.cryptoquant.com/mcp");
  });
});

describe("isValidApiKey", () => {
  it("accepts a normal key", () => {
    expect(isValidApiKey("cq-test_Key.123~abc")).toBe(true);
  });

  it.each([
    ["newline", "a\nb"],
    ["space", "a b"],
    ["NUL", "a\u0000b"],
    ["non-ASCII letters", "ключ"],
    ["zero-width space", "a\u200Bb"],
    ["empty", ""],
  ])("rejects a key with %s", (_label, key) => {
    expect(isValidApiKey(key)).toBe(false);
  });
});

describe("invalidKeyMessage", () => {
  it("names the source and the key page without any key material", () => {
    const env = invalidKeyMessage("env");
    expect(env).toContain("CRYPTOQUANT_API_KEY");
    expect(env).toContain("invalid characters");
    expect(env).toContain(API_KEY_URL);
    const file = invalidKeyMessage("credentials");
    expect(file).toContain("~/.cryptoquant/credentials");
    expect(file).toContain(API_KEY_URL);
  });
});
