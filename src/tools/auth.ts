import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  initializePermissions,
  resetPermissions,
  getDiscoverySummary,
  getPermissionState,
  clearDiscoveryCache,
  getDiscoveryCachePath,
  getCachedDiscovery,
} from "../permissions.js";
import { getAssetCategoryMap } from "../discovery.js";
import {
  getStoredApiKey,
  saveApiKey,
  clearCredentials,
  getCredentialsPath,
  updateValidatedAt,
} from "../auth/storage.js";
import { getPlanLimitsState, getAccessibleEndpointsSummary } from "../plan-limits.js";
import { getApiUrl } from "../config.js";
import { jsonResponse, getPlanNote, logger } from "../utils.js";

const initializeSchema = {
  api_key: z.string().optional().describe("API key (optional if CRYPTOQUANT_API_KEY env var is set)"),
};

type InitializeParams = z.infer<z.ZodObject<typeof initializeSchema>>;

function resolveApiKey(paramKey?: string): string | undefined {
  if (paramKey) {
    logger.debug("[resolveApiKey] using key from parameter");
    return paramKey;
  }

  const envKey = process.env.CRYPTOQUANT_API_KEY;
  const isEnvKeyValid = envKey && envKey.trim() && !envKey.startsWith("${");
  if (isEnvKeyValid) {
    logger.debug("[resolveApiKey] using key from environment variable");
    return envKey;
  }

  const storedKey = getStoredApiKey();
  if (storedKey) {
    logger.debug("[resolveApiKey] using key from stored credentials");
    return storedKey;
  }

  logger.debug("[resolveApiKey] no API key found");
  return undefined;
}

export function registerAuthTools(server: McpServer): void {
  server.tool(
    "initialize",
    "Initialize CryptoQuant session. MUST be called first before any other CryptoQuant tools. Returns available assets (btc, eth, etc.), metric categories per asset (e.g., market-indicator, network-indicator), and your plan. Use the returned asset_categories to know which discover_endpoints() calls are valid.",
    initializeSchema,
    async (params: InitializeParams) => {
      logger.debug("[initialize] starting initialization");
      const apiKey = resolveApiKey(params.api_key);

      if (!apiKey) {
        logger.debug("[initialize] no API key available");
        return jsonResponse({
          status: "api_key_required",
          message: "API key not found. Please configure using one of these methods:",
          setup_options: [
            {
              method: "Environment Variable (Recommended)",
              instruction: "Add to your MCP config (~/.claude/mcp.json):",
              example: {
                mcpServers: {
                  cryptoquant: {
                    command: "npx",
                    args: ["-y", "@cryptoquant_official/mcp"],
                    env: { CRYPTOQUANT_API_KEY: "your-api-key" },
                  },
                },
              },
            },
            {
              method: "Direct Parameter",
              instruction: "Call initialize with api_key parameter:",
              example: "initialize(api_key='your-api-key')",
            },
          ],
          get_api_key: "https://cryptoquant.com/settings/api",
        });
      }

      const apiUrl = getApiUrl();
      logger.debug("[initialize] using API URL:", apiUrl);

      const result = await initializePermissions(apiKey, apiUrl);
      logger.debug("[initialize] permissions result:", {
        success: result.success,
        from_cache: result.from_cache,
        cache_status: result.cache_status,
        error: result.error,
      });

      if (!result.success) {
        return jsonResponse({
          success: false,
          error: result.error,
          help: {
            check_key: "Check your API key at https://cryptoquant.com/settings/api",
            retry: "Or call initialize(api_key='your-api-key') with a valid key",
          },
        });
      }

      // Save or update credentials based on key source
      if (params.api_key) {
        // Key from parameter: save it (enables key replacement)
        saveApiKey(params.api_key);
      } else if (!process.env.CRYPTOQUANT_API_KEY) {
        // Key from stored credentials: just update validated_at
        updateValidatedAt();
      }

      const discovery = getDiscoverySummary();
      const assetCategories = getAssetCategoryMap();
      const permState = getPermissionState();
      const planState = getPlanLimitsState();
      const cachedDiscovery = getCachedDiscovery();

      const totalEndpoints = discovery?.total_endpoints || cachedDiscovery?.summary.total_endpoints || 0;
      const accessibleSummary = getAccessibleEndpointsSummary(totalEndpoints);

      // Build session info with cache status
      const sessionInfo = {
        plan: permState.plan,
        cache_status: result.cache_status,
        ...(planState.apiRateLimit && {
          rate_limit: `${planState.apiRateLimit.token}/${planState.apiRateLimit.window}`,
        }),
      };

      // Build scope info (compact summary)
      const scopeInfo: Record<string, unknown> = {
        total_endpoints: discovery?.total_endpoints || cachedDiscovery?.summary.total_endpoints || 0,
        accessible: accessibleSummary.count,
        note: "Use discover_endpoints(asset, category) for details",
      };

      // Add asset breakdown from cache summary if available
      if (cachedDiscovery?.summary.assets) {
        const assets: Record<string, { endpoints: number; categories: number }> = {};
        for (const assetInfo of cachedDiscovery.summary.assets) {
          assets[assetInfo.name] = {
            endpoints: assetInfo.endpoint_count,
            categories: assetInfo.categories.length,
          };
        }
        scopeInfo.assets = assets;
      } else if (discovery) {
        // Fallback to discovery data
        const assets: Record<string, { endpoints: number; categories: number }> = {};
        for (const assetInfo of discovery.assets) {
          assets[assetInfo.name] = {
            endpoints: assetInfo.count,
            categories: assetCategories?.[assetInfo.name]?.length || 0,
          };
        }
        scopeInfo.assets = assets;
      }

      const planInfo = {
        plan: permState.plan,
        plan_limits_loaded: planState.loaded,
        accessible_endpoints: accessibleSummary.count,
        // Only include endpoint details for basic/advanced plans (limited access)
        ...(accessibleSummary.endpoints && { accessible_list: accessibleSummary.endpoints }),
        fetched_at: planState.fetched_at ? new Date(planState.fetched_at).toISOString() : null,
        note: getPlanNote(permState.plan),
      };

      return jsonResponse({
        success: true,
        session: sessionInfo,
        scope: scopeInfo,
        discovery: discovery
          ? {
              total_endpoints: discovery.total_endpoints,
              assets: discovery.assets.map((a) => a.name),
              categories: discovery.categories.map((c) => c.name),
              asset_categories: assetCategories,
              fetched_at: discovery.fetched_at,
            }
          : null,
        plan_info: planInfo,
        ...(result.discovery_error && { warning: `Discovery partial: ${result.discovery_error}` }),
      });
    }
  );

  server.tool(
    "reset_session",
    "Clear session and optionally stored credentials. Use cases: (1) Switch accounts - clear_stored=true then initialize(), (2) API key expired - clear_stored=true then initialize(), (3) Refresh session - clear_stored=false. After clearing, call initialize() with your API key.",
    {
      clear_stored: z
        .boolean()
        .optional()
        .describe("If true, also clears stored credentials from ~/.cryptoquant/credentials"),
      clear_cache: z
        .boolean()
        .optional()
        .describe("If true, also clears discovery cache (forces fresh API fetch on next initialize)"),
    },
    async (params: { clear_stored?: boolean; clear_cache?: boolean }) => {
      logger.debug("[reset_session] called with:", {
        clear_stored: params.clear_stored,
        clear_cache: params.clear_cache,
      });

      resetPermissions();

      const apiUrl = getApiUrl();
      const clearedItems: string[] = ["session"];

      if (params.clear_stored) {
        clearCredentials();
        clearedItems.push("credentials");
      }

      if (params.clear_cache) {
        clearDiscoveryCache(apiUrl);
        clearedItems.push("discovery cache");
      }

      const message =
        clearedItems.length === 1
          ? "Session cleared (credentials and cache preserved)"
          : `Cleared: ${clearedItems.join(", ")}`;

      logger.debug("[reset_session] cleared:", clearedItems.join(", "));

      return jsonResponse({
        success: true,
        message,
        ...(params.clear_stored && { credentials_path: getCredentialsPath() }),
        ...(params.clear_cache && { cache_path: getDiscoveryCachePath(apiUrl) }),
      });
    }
  );
}
