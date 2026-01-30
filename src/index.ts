#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAuthTools } from "./tools/auth.js";
import { registerCoreTools } from "./tools/core.js";
import { logger } from "./utils.js";

// =============================================================================
// Type Exports - Discovery
// =============================================================================
export type {
  EndpointParameter,
  DiscoveryEndpoint,
  DiscoveryResponse,
  ParsedEndpoint,
  EndpointCatalog,
  DiscoverySummary,
} from "./discovery.js";

export {
  fetchDiscoveryEndpoints,
  getEndpointCatalog,
  isDiscoveryLoaded,
  searchEndpoints,
  getEndpointByPath,
  getParameterOptions,
  getDiscoverySummary,
  getAssetCategoryMap,
  resetDiscovery,
} from "./discovery.js";

// =============================================================================
// Type Exports - Permissions
// =============================================================================
export type { PermissionState, InitializeResult } from "./permissions.js";

export {
  initializePermissions,
  getPermissionState,
  setGuestMode,
  resetPermissions,
  clearDiscoveryCache,
  getDiscoveryCachePath,
  getCachedDiscovery,
} from "./permissions.js";

// =============================================================================
// Type Exports - Plan Limits
// =============================================================================
export type {
  DurationLimit,
  UserPlan,
  MetricLimits,
  PlanLimits,
  ApiRateLimit,
  PlanLimitsState,
  FetchPlanLimitsResult,
  DateRangeValidation,
  AccessibleEndpointInfo,
  AccessibleEndpointsSummary,
} from "./plan-limits.js";

export {
  fetchPlanLimits,
  getPlanLimitsState,
  getPlanLimit,
  getEndpointResultLimit,
  getEndpointWindowLimits,
  hasEndpointAccess,
  parseDurationToDate,
  getEarliestAllowedDate,
  validateDateRange,
  getRequiredPlan,
  getApiRateLimit,
  getStaticEndpoints,
  resetPlanLimits,
  loadPlanLimitsFromCache,
  getAccessibleEndpointsSummary,
  detectPlanFromLimits,
} from "./plan-limits.js";

// =============================================================================
// Type Exports - Cache
// =============================================================================
export type {
  MyDiscoveryRawResponse,
  DiscoverySummaryData,
  CacheMetadata,
  DiscoveryCacheSchema,
  CompactInitializeResponse,
} from "./cache/types.js";

export { CACHE_VERSION, CACHE_TTL_DAYS } from "./cache/types.js";

export {
  getCacheFilePath,
  isCacheValid,
  readCache,
  writeCache,
  invalidateCache,
  clearAllCaches,
  getCacheAgeDays,
  getCacheStatus,
  getCachePath,
} from "./cache/storage.js";

export { generateSummary, extractRawResponse } from "./cache/summary.js";

// =============================================================================
// Type Exports - Auth Storage
// =============================================================================
export type { StoredCredentials } from "./auth/storage.js";

export {
  getStoredApiKey,
  saveApiKey,
  updateValidatedAt,
  clearCredentials,
  getCredentialsPath,
} from "./auth/storage.js";

// =============================================================================
// Utility Exports
// =============================================================================
export {
  jsonResponse,
  errorResponse,
  getPlanNote,
  capitalizeFirst,
  logger,
} from "./utils.js";

// =============================================================================
// Config Exports
// =============================================================================
export { getApiUrl, getApiBaseUrl } from "./config.js";

// =============================================================================
// Tool Registration Exports
// =============================================================================
export { registerAuthTools } from "./tools/auth.js";
export { registerCoreTools } from "./tools/core.js";

// =============================================================================
// MCP Server Startup
// =============================================================================
async function main(): Promise<void> {
  const server = new McpServer({
    name: "cryptoquant",
    version: "1.0.0",
  });

  // Register tool categories
  registerAuthTools(server);
  registerCoreTools(server);

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("CryptoQuant MCP Server running on stdio");
}

main().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});
