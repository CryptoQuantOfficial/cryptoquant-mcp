/**
 * Summary generation for cached discovery data
 */

import type { DiscoverySummaryData, MyDiscoveryRawResponse } from "./types.js";
import type { PlanLimits } from "../plan-limits.js";

/**
 * Generate summary from parsed plan limits.
 * Counts endpoints and organizes by asset/category.
 */
export function generateSummary(limits: PlanLimits | null, statics: string[]): DiscoverySummaryData {
  const assetData: Map<
    string,
    {
      endpoint_count: number;
      categories: Set<string>;
    }
  > = new Map();

  // Count endpoints from limits
  if (limits) {
    for (const [asset, categories] of Object.entries(limits)) {
      if (!assetData.has(asset)) {
        assetData.set(asset, { endpoint_count: 0, categories: new Set() });
      }
      const data = assetData.get(asset)!;

      for (const [category, metrics] of Object.entries(categories)) {
        data.categories.add(category);
        if (metrics) {
          data.endpoint_count += Object.keys(metrics).length;
        }
      }
    }
  }

  // Count static endpoints (parse asset from path)
  for (const staticPath of statics) {
    const parts = staticPath.split("/");
    if (parts.length >= 4) {
      const asset = parts[2];
      const category = parts[3];

      if (!assetData.has(asset)) {
        assetData.set(asset, { endpoint_count: 0, categories: new Set() });
      }
      const data = assetData.get(asset)!;
      data.endpoint_count++;
      data.categories.add(category);
    }
  }

  // Build summary
  const assets: DiscoverySummaryData["assets"] = [];
  const categoryByAsset: Record<string, string[]> = {};
  let totalEndpoints = 0;

  for (const [asset, data] of assetData.entries()) {
    assets.push({
      name: asset,
      endpoint_count: data.endpoint_count,
      categories: Array.from(data.categories).sort(),
    });
    categoryByAsset[asset] = Array.from(data.categories).sort();
    totalEndpoints += data.endpoint_count;
  }

  // Sort assets alphabetically
  assets.sort((a, b) => a.name.localeCompare(b.name));

  return {
    total_endpoints: totalEndpoints,
    assets,
    category_by_asset: categoryByAsset,
  };
}

/**
 * Extract raw response structure for caching.
 * Only keeps necessary fields.
 */
export function extractRawResponse(
  apiResponse: Record<string, unknown>
): MyDiscoveryRawResponse | null {
  try {
    const apiEndpoint = apiResponse.apiEndpoint;
    const plan = apiResponse.plan as { name?: string } | undefined;
    const apiRateLimit = apiResponse.apiRateLimit as { token?: number; window?: string } | undefined;

    if (!apiEndpoint || typeof apiEndpoint !== "object") {
      return null;
    }

    return {
      apiEndpoint: apiEndpoint as Record<string, unknown>,
      plan: { name: plan?.name || "unknown" },
      apiRateLimit: {
        token: apiRateLimit?.token || 0,
        window: apiRateLimit?.window || "day",
      },
    };
  } catch {
    return null;
  }
}
