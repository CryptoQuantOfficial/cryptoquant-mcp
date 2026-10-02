import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { DEFAULT_MCP_URL } from "./config.js";

export const API_KEY_URL = "https://cryptoquant.com/account/api";

export type ApiKeySource = "env" | "credentials";

export interface ResolvedApiKey {
  key: string;
  source: ApiKeySource;
}

export function credentialsPath(home: string = homedir()): string {
  return join(home, ".cryptoquant", "credentials");
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Reads the key that 0.x saved via initialize(api_key=...). Never writes. */
function readStoredKey(path: string): string | null {
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf-8"));
    if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
    return clean((data as { api_key?: unknown }).api_key);
  } catch {
    return null;
  }
}

export function resolveApiKey({
  env = process.env,
  home = homedir(),
}: { env?: NodeJS.ProcessEnv; home?: string } = {}): ResolvedApiKey | null {
  const fromEnv = clean(env.CRYPTOQUANT_API_KEY);
  if (fromEnv) return { key: fromEnv, source: "env" };

  const fromFile = readStoredKey(credentialsPath(home));
  if (fromFile) return { key: fromFile, source: "credentials" };

  return null;
}

/** Printable ASCII only: anything else cannot be sent in an Authorization header. */
export function isValidApiKey(key: string): boolean {
  return /^[\x21-\x7E]+$/.test(key);
}

export function keySourceLabel(source: ApiKeySource): string {
  return source === "env" ? "CRYPTOQUANT_API_KEY" : "~/.cryptoquant/credentials";
}

/** Never includes the key or any part of it. */
export function invalidKeyMessage(source: ApiKeySource): string {
  return [
    `[cryptoquant-mcp] The API key from ${keySourceLabel(source)} contains invalid characters`,
    "(only printable ASCII without spaces is allowed). Check for stray quotes, line breaks, or spaces.",
    "",
    `Get an API key: ${API_KEY_URL}`,
    "",
  ].join("\n");
}

export function missingKeyMessage(): string {
  return [
    "[cryptoquant-mcp] No CryptoQuant API key found.",
    "",
    "Set CRYPTOQUANT_API_KEY in your MCP client config:",
    "",
    "  {",
    '    "mcpServers": {',
    '      "cryptoquant": {',
    '        "command": "npx",',
    '        "args": ["-y", "cryptoquant-mcp"],',
    '        "env": { "CRYPTOQUANT_API_KEY": "<your-api-key>" }',
    "      }",
    "    }",
    "  }",
    "",
    `Get an API key: ${API_KEY_URL}`,
    "",
    "If your client supports remote MCP servers, connect to the remote server instead",
    `and sign in with OAuth (no API key in your config): ${DEFAULT_MCP_URL}`,
    "",
  ].join("\n");
}
