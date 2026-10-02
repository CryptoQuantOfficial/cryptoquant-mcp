export const DEFAULT_MCP_URL = "https://mcp.cryptoquant.com/mcp";

export class ConfigError extends Error {
  override name = "ConfigError";
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * CRYPTOQUANT_MCP_URL overrides the server (stage testing). The API key travels
 * in a header, so plain http is allowed only when it cannot leave the machine.
 */
export function resolveServerUrl(env: NodeJS.ProcessEnv = process.env): URL {
  const raw = env.CRYPTOQUANT_MCP_URL?.trim();
  if (!raw) return new URL(DEFAULT_MCP_URL);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("CRYPTOQUANT_MCP_URL is not a valid URL.");
  }

  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && isLoopback(url.hostname)) return url;
  throw new ConfigError(
    "CRYPTOQUANT_MCP_URL must use https (plain http is allowed only for localhost, 127.0.0.0/8, and [::1]).",
  );
}
