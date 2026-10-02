#!/usr/bin/env node

import { invalidKeyMessage, isValidApiKey, keySourceLabel, missingKeyMessage, resolveApiKey } from "./api-key.js";
import { ConfigError, resolveServerUrl } from "./config.js";
import { startProxy } from "./proxy.js";
import { logger } from "./utils.js";

async function main(): Promise<number> {
  let url: URL;
  try {
    url = resolveServerUrl();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`[cryptoquant-mcp] ${error.message}\n`);
      return 1;
    }
    throw error;
  }

  const resolved = resolveApiKey();
  if (!resolved) {
    process.stderr.write(missingKeyMessage());
    return 1;
  }

  if (!isValidApiKey(resolved.key)) {
    process.stderr.write(invalidKeyMessage(resolved.source));
    return 1;
  }

  logger.info(`CryptoQuant MCP proxy → ${url.origin}${url.pathname} (API key from ${keySourceLabel(resolved.source)})`);

  const proxy = await startProxy({ url, apiKey: resolved.key });
  await proxy.closed;
  return 0;
}

main().then(
  (code) => {
    // Let stdout/stderr drain instead of exiting mid-write; force exit if a handle lingers.
    process.exitCode = code;
    setTimeout(() => process.exit(code), 1_000).unref();
  },
  (error: unknown) => {
    logger.error("Fatal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
