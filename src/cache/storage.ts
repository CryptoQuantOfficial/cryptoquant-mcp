/**
 * Cache storage operations for discovery response caching
 */

import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, chmodSync } from "fs";
import {
  type DiscoveryCacheSchema,
  type MyDiscoveryRawResponse,
  type DiscoverySummaryData,
  CACHE_VERSION,
  CACHE_TTL_DAYS,
} from "./types.js";
import type { UserPlan, PlanLimits, ApiRateLimit } from "../plan-limits.js";

const CACHE_DIR = join(homedir(), ".cryptoquant");
const CACHE_FILE = join(CACHE_DIR, "discovery-cache.json");

/**
 * Get cache file path.
 */
export function getCacheFilePath(_apiUrl: string): string {
  return CACHE_FILE;
}

/**
 * Check if cache is still valid (not expired and version matches).
 */
export function isCacheValid(cache: DiscoveryCacheSchema, apiUrl: string, apiKeyPrefix: string): boolean {
  // Version check
  if (cache.version !== CACHE_VERSION) {
    return false;
  }

  // API URL must match
  if (cache.metadata.api_url !== apiUrl) {
    return false;
  }

  // API key prefix must match (detects account switch)
  if (cache.metadata.api_key_prefix !== apiKeyPrefix) {
    return false;
  }

  // TTL check
  const expiresAt = new Date(cache.metadata.expires_at);
  if (isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return false;
  }

  return true;
}

/**
 * Read cache from file.
 * Returns null if cache doesn't exist or is invalid JSON.
 */
export function readCache(apiUrl: string): DiscoveryCacheSchema | null {
  const cachePath = getCacheFilePath(apiUrl);

  try {
    if (!existsSync(cachePath)) {
      return null;
    }

    const data = JSON.parse(readFileSync(cachePath, "utf-8"));

    // Basic structure validation
    if (!data.version || !data.metadata || !data.raw_response || !data.summary) {
      return null;
    }

    return data as DiscoveryCacheSchema;
  } catch {
    return null;
  }
}

/**
 * Write cache to file with secure permissions.
 */
export function writeCache(
  apiUrl: string,
  apiKey: string,
  rawResponse: MyDiscoveryRawResponse,
  parsed: {
    limits: PlanLimits | null;
    statics: string[];
    apiRateLimit: ApiRateLimit | null;
  },
  summary: DiscoverySummaryData,
  plan: UserPlan
): void {
  // Ensure directory exists
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

  const cache: DiscoveryCacheSchema = {
    version: CACHE_VERSION,
    metadata: {
      api_url: apiUrl,
      api_key_prefix: apiKey.slice(0, 8),
      cached_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      plan,
    },
    raw_response: rawResponse,
    parsed,
    summary,
  };

  const cachePath = getCacheFilePath(apiUrl);
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), { encoding: "utf-8" });
  chmodSync(cachePath, 0o600);
}

/**
 * Delete cache file.
 */
export function invalidateCache(apiUrl: string): void {
  const cachePath = getCacheFilePath(apiUrl);

  try {
    if (existsSync(cachePath)) {
      unlinkSync(cachePath);
    }
  } catch {
    // Already deleted or inaccessible
  }
}

/**
 * Delete the cache file.
 */
export function clearAllCaches(): void {
  try {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Calculate cache age in days.
 */
export function getCacheAgeDays(cache: DiscoveryCacheSchema): number {
  const cachedAt = new Date(cache.metadata.cached_at);
  const now = new Date();
  const diffMs = now.getTime() - cachedAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get human-readable cache status string.
 */
export function getCacheStatus(cache: DiscoveryCacheSchema | null, fromCache: boolean): string {
  if (!fromCache || !cache) {
    return "fresh";
  }
  const days = getCacheAgeDays(cache);
  return `cached (${days}d old)`;
}

/**
 * Get cache file path for user display.
 */
export function getCachePath(): string {
  return CACHE_DIR;
}
