/**
 * Cache schema types for CryptoQuant discovery caching
 */

import type { UserPlan, ApiRateLimit, PlanLimits } from "../plan-limits.js";

export const CACHE_VERSION = 1;
export const CACHE_TTL_DAYS = 7;

/**
 * Raw API response structure from /my/discovery/endpoints
 */
export interface MyDiscoveryRawResponse {
  apiEndpoint: Record<string, unknown>;
  plan: { name: string };
  apiRateLimit: { token: number; window: string };
}

/**
 * Summary data generated from the raw response
 */
export interface DiscoverySummaryData {
  total_endpoints: number;
  assets: Array<{
    name: string;
    endpoint_count: number;
    categories: string[];
  }>;
  category_by_asset: Record<string, string[]>;
}

/**
 * Cache metadata for validation
 */
export interface CacheMetadata {
  api_url: string;
  api_key_prefix: string; // First 8 chars for debugging
  cached_at: string; // ISO timestamp
  expires_at: string; // cached_at + 7 days
  plan: UserPlan;
}

/**
 * Full cache schema stored in file
 */
export interface DiscoveryCacheSchema {
  version: typeof CACHE_VERSION;
  metadata: CacheMetadata;
  raw_response: MyDiscoveryRawResponse;
  parsed: {
    limits: PlanLimits | null;
    statics: string[];
    apiRateLimit: ApiRateLimit | null;
  };
  summary: DiscoverySummaryData;
}

/**
 * Compact response format for initialize() tool
 */
export interface CompactInitializeResponse {
  success: boolean;
  session: {
    plan: UserPlan;
    rate_limit: string; // e.g., "100/min"
    cache_status: string; // "fresh", "cached (Xd old)"
  };
  scope: {
    total_endpoints: number;
    accessible: number;
    assets: Record<
      string,
      {
        endpoints: number;
        categories: number;
      }
    >;
    note: string;
  };
}
