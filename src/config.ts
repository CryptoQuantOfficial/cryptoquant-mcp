/**
 * Centralized configuration for CryptoQuant MCP Server
 *
 * API URL Priority:
 * 1. CRYPTOQUANT_API_URL environment variable (optional override)
 * 2. Default production URL
 */

const DEFAULT_API_URL = "https://api.cryptoquant.com/v1";

/**
 * Get the configured API URL.
 * Returns the base URL with /v1 suffix (e.g., "https://api.cryptoquant.com/v1")
 */
export function getApiUrl(): string {
  return process.env.CRYPTOQUANT_API_URL || DEFAULT_API_URL;
}

/**
 * Get the API base URL without version suffix.
 * Returns the base URL (e.g., "https://api.cryptoquant.com")
 */
export function getApiBaseUrl(): string {
  return getApiUrl().replace(/\/v1$/, "");
}
