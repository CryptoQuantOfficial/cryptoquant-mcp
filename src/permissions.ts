import {
  clearAllCaches,
  getCacheFilePath,
  getCacheStatus,
  invalidateCache,
  isCacheValid,
  readCache,
  writeCache,
} from "./cache/storage.js";
import { extractRawResponse, generateSummary } from "./cache/summary.js";
import { fetchDiscoveryEndpoints, resetDiscovery } from "./discovery.js";
import { logger } from "./utils.js";
import {
  fetchPlanLimits,
  getPlanLimitsState,
  loadPlanLimitsFromCache,
  resetPlanLimits,
} from "./plan-limits.js";

import type { UserPlan } from "./plan-limits.js";

import type {
  DiscoveryCacheSchema,
  DiscoverySummaryData,
} from "./cache/types.js";

export interface PermissionState {
  authenticated: boolean;
  api_key: string | null;
  cached_at: number | null;
  plan: UserPlan;
  plan_limits_loaded: boolean;
  from_cache: boolean;
}

const DEFAULT_STATE: PermissionState = {
  authenticated: false,
  api_key: null,
  cached_at: null,
  plan: "unknown",
  plan_limits_loaded: false,
  from_cache: false,
};

let permissionState: PermissionState = { ...DEFAULT_STATE };
let cachedDiscovery: DiscoveryCacheSchema | null = null;

export interface InitializeResult {
  success: boolean;
  error?: string;
  discovery_error?: string;
  from_cache: boolean;
  cache_status: string;
  summary?: DiscoverySummaryData;
}

export async function initializePermissions(
  apiKey: string,
  apiUrl: string,
): Promise<InitializeResult> {
  logger.debug("[initializePermissions] starting with API URL:", apiUrl);
  const apiKeyPrefix = apiKey.slice(0, 8);

  // 1. Try cache first for /my/discovery data
  const cache = readCache(apiUrl);
  logger.debug("[initializePermissions] cache status:", cache ? "found" : "not found");

  if (cache && isCacheValid(cache, apiUrl, apiKeyPrefix)) {
    logger.debug("[initializePermissions] using valid cache, plan:", cache.metadata.plan);
    // Load plan limits from cache
    loadPlanLimitsFromCache(
      cache.parsed.limits,
      cache.parsed.statics,
      cache.parsed.apiRateLimit,
      cache.metadata.plan,
    );

    // Still need to fetch /discovery/endpoints for parameter options
    const discoveryResult = await fetchDiscoveryEndpoints(apiKey, apiUrl);
    if (!discoveryResult.success) {
      // Discovery failed but we have cache - continue with warning
      logger.warn(`Discovery fetch failed, using cache: ${discoveryResult.error}`);
    }

    const cacheStatus = getCacheStatus(cache, true);
    cachedDiscovery = cache;

    permissionState = {
      authenticated: true,
      api_key: apiKey,
      cached_at: Date.now(),
      plan: cache.metadata.plan,
      plan_limits_loaded: true,
      from_cache: true,
    };

    return {
      success: true,
      from_cache: true,
      cache_status: cacheStatus,
      summary: cache.summary,
    };
  }

  // 2. Cache miss or invalid - fetch fresh data
  logger.debug("[initializePermissions] cache miss or invalid, fetching fresh data");

  try {
    // Fetch /discovery/endpoints (for parameter options)
    logger.debug("[initializePermissions] fetching /discovery/endpoints");
    const discoveryResult = await fetchDiscoveryEndpoints(apiKey, apiUrl);
    if (!discoveryResult.success) {
      logger.debug("[initializePermissions] discovery fetch failed:", discoveryResult.error);
      return {
        success: false,
        error: discoveryResult.error,
        from_cache: false,
        cache_status: "none",
      };
    }
    logger.debug("[initializePermissions] discovery fetch succeeded");

    // Fetch /my/discovery/endpoints (for plan limits)
    logger.debug("[initializePermissions] fetching /my/discovery/endpoints");
    const planResult = await fetchPlanLimits(apiKey, apiUrl);
    logger.debug("[initializePermissions] plan limits fetch:", planResult.success ? "success" : "failed");
    const planState = getPlanLimitsState();

    if (!planResult.success) {
      logger.warn(`Plan limits fetch failed: ${planResult.error}`);
    }

    // 3. Generate summary and write cache
    if (planResult.success && planResult.rawResponse && planResult.parsed) {
      const rawResponse = extractRawResponse(planResult.rawResponse);
      if (rawResponse) {
        const summary = generateSummary(
          planResult.parsed.limits,
          planResult.parsed.statics,
        );
        writeCache(
          apiUrl,
          apiKey,
          rawResponse,
          planResult.parsed,
          summary,
          planResult.plan || "unknown",
        );

        // Store for later use
        const newCache = readCache(apiUrl);
        cachedDiscovery = newCache;

        permissionState = {
          authenticated: true,
          api_key: apiKey,
          cached_at: Date.now(),
          plan: planState.plan,
          plan_limits_loaded: planState.loaded,
          from_cache: false,
        };

        return {
          success: true,
          from_cache: false,
          cache_status: "fresh",
          summary,
        };
      }
    }

    // Cache write failed but auth succeeded
    permissionState = {
      authenticated: true,
      api_key: apiKey,
      cached_at: Date.now(),
      plan: planState.plan,
      plan_limits_loaded: planState.loaded,
      from_cache: false,
    };

    return { success: true, from_cache: false, cache_status: "none" };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error}`,
      from_cache: false,
      cache_status: "none",
    };
  }
}

export function getPermissionState(): PermissionState {
  return permissionState;
}

export function setGuestMode(): void {
  permissionState = {
    ...DEFAULT_STATE,
    cached_at: Date.now(),
    from_cache: false,
  };
}

export function resetPermissions(): void {
  permissionState = { ...DEFAULT_STATE };
  cachedDiscovery = null;
  resetDiscovery();
  resetPlanLimits();
}

/**
 * Clear discovery cache (called by reset_session with clear_cache=true).
 */
export function clearDiscoveryCache(apiUrl?: string): void {
  if (apiUrl) {
    invalidateCache(apiUrl);
  } else {
    clearAllCaches();
  }
  cachedDiscovery = null;
}

/**
 * Get cache file path for user display.
 */
export function getDiscoveryCachePath(apiUrl: string): string {
  return getCacheFilePath(apiUrl);
}

/**
 * Get current cached discovery data (for summary in response).
 */
export function getCachedDiscovery(): DiscoveryCacheSchema | null {
  return cachedDiscovery;
}

export { getDiscoverySummary } from "./discovery.js";
