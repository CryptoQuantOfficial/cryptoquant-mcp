import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

import { getApiBaseUrl } from "../config.js";
import {
  getDiscoverySummary,
  getEndpointByPath,
  getEndpointCatalog,
  getParameterOptions,
  isDiscoveryLoaded,
  searchEndpoints,
  validateEndpointParams,
} from "../discovery.js";
import { getPermissionState } from "../permissions.js";
import {
  getEndpointWindowLimits,
  getPlanLimitsState,
  getRequiredPlan,
  hasEndpointAccess,
  parseDurationToDate,
  validateDateRange,
} from "../plan-limits.js";
import {
  capitalizeFirst,
  errorResponse,
  getPlanNote,
  jsonResponse,
  logger,
} from "../utils.js";

import type { ParsedEndpoint } from "../discovery.js";

function buildRateLimitInfo(response: Response): string | null {
  const limit = response.headers.get("X-RateLimit-Limit");
  const remaining = response.headers.get("X-RateLimit-Remaining");
  const reset = response.headers.get("X-RateLimit-Reset");

  if (!remaining || !limit) return null;

  let info = `${remaining}/${limit} remaining`;
  if (reset) {
    info += ` (resets ${new Date(parseInt(reset) * 1000).toISOString().slice(11, 19)})`;
  }
  return info;
}

// Schema definitions for tools
const discoverEndpointsSchema = {
  asset: z
    .enum(["btc", "eth", "alt", "stablecoin", "erc20", "trx", "xrp"])
    .optional()
    .describe("Asset to discover endpoints for. Omit for all assets."),
  category: z
    .string()
    .optional()
    .describe(
      "Category filter (e.g., market-data, exchange-flows, network-data, miner-flows, etc.)",
    ),
  query: z
    .string()
    .optional()
    .describe("Search term to filter endpoints by path or metric name"),
  include_restricted: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include endpoints not available on your current plan"),
};

const queryDataSchema = {
  endpoint: z
    .string()
    .describe("API endpoint path (e.g., /v1/btc/market-data/mvrv)"),
  params: z
    .object({
      window: z
        .string()
        .optional()
        .describe("Time window granularity (hour, day, block, etc.)"),
      limit: z
        .number()
        .optional()
        .describe("Number of data points to return (max 1000)"),
      from: z.string().optional().describe("Start date (ISO 8601 format)"),
      to: z.string().optional().describe("End date (ISO 8601 format)"),
      exchange: z
        .string()
        .optional()
        .describe("Exchange filter (for exchange-specific data)"),
      symbol: z
        .string()
        .optional()
        .describe("Trading symbol (e.g., btc_usd, btc_usdt)"),
      market: z.string().optional().describe("Market type (spot, perpetual)"),
      token: z
        .string()
        .optional()
        .describe("Token filter (for alt/erc20 data)"),
      miner: z.string().optional().describe("Miner filter (for miner data)"),
      type: z
        .string()
        .optional()
        .describe("Entity type filter (e.g., exchange, entity, miner, bank)"),
    })
    .optional()
    .describe("Query parameters"),
};

const getEndpointInfoSchema = {
  endpoint: z.string().describe("API endpoint path to get information about"),
};

type DiscoverEndpointsParams = z.infer<
  z.ZodObject<typeof discoverEndpointsSchema>
>;
type QueryDataParams = z.infer<z.ZodObject<typeof queryDataSchema>>;
type GetEndpointInfoParams = z.infer<z.ZodObject<typeof getEndpointInfoSchema>>;

function requireAuth(): { content: [{ type: "text"; text: string }] } | null {
  const state = getPermissionState();
  if (!state.authenticated) {
    return errorResponse("Not authenticated", {
      action: "Call initialize() first to authenticate with your API key",
    });
  }
  return null;
}

export function registerCoreTools(server: McpServer): void {
  server.tool(
    "discover_endpoints",
    "Discover available API endpoints for a specific asset and category. Call initialize() first to get valid asset/category combinations. Returns endpoint paths and parameter options (e.g., window: ['day', 'hour']). Use returned paths with query_data().",
    discoverEndpointsSchema,
    async (params: DiscoverEndpointsParams) => {
      logger.debug("[discover_endpoints] called with:", {
        asset: params.asset || "all",
        category: params.category || "all",
        query: params.query || null,
      });

      const authError = requireAuth();
      if (authError) return authError;

      if (!isDiscoveryLoaded()) {
        logger.debug("[discover_endpoints] discovery not loaded");
        return errorResponse("Discovery data not loaded", {
          action:
            "Discovery may have failed during initialization. Try reset_session() and initialize() again.",
        });
      }

      const endpoints = searchEndpoints({
        asset: params.asset,
        category: params.category,
        query: params.query,
      });

      logger.debug("[discover_endpoints] found", endpoints.length, "endpoints");

      const grouped: Record<string, Record<string, ParsedEndpoint[]>> = {};
      for (const ep of endpoints) {
        grouped[ep.asset] ??= {};
        grouped[ep.asset][ep.category] ??= [];
        grouped[ep.asset][ep.category].push(ep);
      }

      const planState = getPlanLimitsState();

      const catalog = Object.entries(grouped).map(([asset, categories]) => ({
        asset,
        categories: Object.entries(categories).map(([category, eps]) => ({
          category,
          endpoints: eps.map((ep) => {
            const accessible = hasEndpointAccess(ep.path);
            const windowLimits = getEndpointWindowLimits(ep.path);
            const requiredPlan = getRequiredPlan(ep.path);

            const planInfo = planState.loaded
              ? {
                  accessible,
                  ...(Object.keys(windowLimits).length > 0 && {
                    date_limits: windowLimits,
                  }),
                  ...(!accessible && {
                    required_plan: requiredPlan,
                    upgrade_hint: `Upgrade to ${capitalizeFirst(requiredPlan)} for access`,
                  }),
                }
              : {};

            return {
              path: ep.path,
              metric: ep.metric,
              parameters: ep.parameters,
              required_parameters: ep.required_parameters,
              ...planInfo,
            };
          }),
        })),
      }));

      const summary = getDiscoverySummary();

      return jsonResponse({
        success: true,
        filters: {
          asset: params.asset || "all",
          category: params.category || "all",
          query: params.query || null,
        },
        matched_endpoints: endpoints.length,
        total_available: summary?.total_endpoints || 0,
        ...(planState.loaded && {
          plan_info: {
            your_plan: planState.plan,
            note: getPlanNote(planState.plan),
          },
        }),
        catalog,
        tip: "Use get_endpoint_info(endpoint) to see available parameter values for a specific endpoint",
      });
    },
  );

  server.tool(
    "get_endpoint_info",
    "Get detailed information about a specific API endpoint including available parameter values.",
    getEndpointInfoSchema,
    async (params: GetEndpointInfoParams) => {
      logger.debug("[get_endpoint_info] lookup:", params.endpoint);

      const authError = requireAuth();
      if (authError) return authError;

      const endpoint = getEndpointByPath(params.endpoint);
      if (!endpoint) {
        logger.debug("[get_endpoint_info] endpoint not found:", params.endpoint);
        const searchResults = searchEndpoints({
          query: params.endpoint.split("/").pop() || "",
        });
        return errorResponse(`Endpoint not found: ${params.endpoint}`, {
          suggestions: searchResults.slice(0, 5).map((ep) => ep.path),
          tip: "Use discover_endpoints() to browse available endpoints",
        });
      }

      const planState = getPlanLimitsState();
      const accessible = hasEndpointAccess(endpoint.path);
      const windowLimits = getEndpointWindowLimits(endpoint.path);
      const requiredPlan = getRequiredPlan(endpoint.path);

      const dateLimitsInfo: Record<
        string,
        { limit: string; earliest_date: string | null }
      > = {};
      for (const [window, limit] of Object.entries(windowLimits)) {
        const earliestDate = parseDurationToDate(limit);
        dateLimitsInfo[window] = {
          limit,
          earliest_date: earliestDate
            ? earliestDate.toISOString().split("T")[0]
            : null,
        };
      }

      return jsonResponse({
        success: true,
        endpoint: {
          path: endpoint.path,
          asset: endpoint.asset,
          category: endpoint.category,
          metric: endpoint.metric,
        },
        parameters: endpoint.parameters,
        required_parameters: endpoint.required_parameters,
        ...(planState.loaded && {
          plan_access: {
            accessible,
            your_plan: planState.plan,
            ...(Object.keys(dateLimitsInfo).length > 0 && {
              date_limits: dateLimitsInfo,
            }),
            ...(!accessible && {
              required_plan: requiredPlan,
              upgrade_url: "https://cryptoquant.com/pricing",
            }),
          },
        }),
        example_query: buildExampleQuery(endpoint),
      });
    },
  );

  server.tool(
    "query_data",
    "Query raw data from CryptoQuant API. Workflow: initialize() → discover_endpoints(asset, category) → query_data(endpoint, params). Use endpoint paths and parameter values from discover_endpoints response.",
    queryDataSchema,
    async (params: QueryDataParams) => {
      logger.debug("[query_data] called with endpoint:", params.endpoint);
      logger.debug("[query_data] params:", params.params);

      const authError = requireAuth();
      if (authError) return authError;

      const state = getPermissionState();
      const endpoint = getEndpointByPath(params.endpoint);
      if (!endpoint) {
        return errorResponse(`Unknown endpoint: ${params.endpoint}`, {
          action: "Use discover_endpoints() to find valid endpoints",
        });
      }

      const queryParams = params.params || {};
      const validation = validateEndpointParams(endpoint, queryParams);
      if (!validation.valid) {
        const paramOptions = getParameterOptions(params.endpoint);
        return errorResponse("Invalid parameters", {
          details: validation.errors,
          endpoint: params.endpoint,
          available_parameters: paramOptions?.parameters,
          required_parameters: paramOptions?.required,
        });
      }

      const planState = getPlanLimitsState();

      if (planState.loaded) {
        if (!hasEndpointAccess(params.endpoint)) {
          const requiredPlan = getRequiredPlan(params.endpoint);
          return errorResponse("Endpoint not accessible on your plan", {
            your_plan: planState.plan,
            required_plan: requiredPlan,
            upgrade_url: "https://cryptoquant.com/pricing",
            suggestion: `Upgrade to ${capitalizeFirst(requiredPlan)} plan for access to this endpoint`,
          });
        }

        const fromDate = queryParams.from as string | undefined;
        const windowParam = queryParams.window as string | undefined;
        if (fromDate) {
          const dateValidation = validateDateRange(
            params.endpoint,
            fromDate,
            windowParam,
          );
          if (!dateValidation.valid) {
            return errorResponse(
              dateValidation.error || "Date range exceeds plan limit",
              {
                your_plan: planState.plan,
                ...(dateValidation.limit && { limit: dateValidation.limit }),
                ...(dateValidation.earliest_allowed && {
                  earliest_allowed: dateValidation.earliest_allowed,
                }),
                upgrade_url: "https://cryptoquant.com/pricing",
                suggestion:
                  "Upgrade to Premium for unlimited historical data access",
              },
            );
          }
        }
      }

      const apiKey = state.api_key;
      if (!apiKey) {
        return errorResponse("API key not available", {
          action: "Re-initialize with your API key",
        });
      }

      try {
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
          if (value !== undefined && value !== null) {
            urlParams.set(key, String(value));
          }
        }
        if (!urlParams.has("limit")) {
          urlParams.set("limit", "100");
        }
        urlParams.set("source", "mcp");

        const apiUrl = getApiBaseUrl();
        const fullUrl = `${apiUrl}${params.endpoint}?${urlParams.toString()}`;

        logger.debug("[query_data] API request:", fullUrl);

        const response = await fetch(fullUrl, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        logger.debug("[query_data] API response status:", response.status, response.statusText);

        if (!response.ok) {
          const errorBody = await response.text();
          return errorResponse(
            `API request failed: ${response.status} ${response.statusText}`,
            {
              details: errorBody,
              endpoint: params.endpoint,
            },
          );
        }

        let data: Record<string, unknown>;
        try {
          data = (await response.json()) as Record<string, unknown>;
        } catch {
          return errorResponse("Failed to parse API response", {
            endpoint: params.endpoint,
          });
        }

        const rateLimitInfo = buildRateLimitInfo(response);

        return jsonResponse({
          success: true,
          endpoint: params.endpoint,
          params: queryParams,
          ...(rateLimitInfo && { rate_limit: rateLimitInfo }),
          ...data,
        });
      } catch (error) {
        return errorResponse(`Network error: ${error}`, {
          endpoint: params.endpoint,
        });
      }
    },
  );

  server.tool(
    "list_assets",
    "List all supported assets (cryptocurrencies) with their available data categories.",
    {},
    async () => {
      const state = getPermissionState();

      if (!isDiscoveryLoaded()) {
        const defaultAssets = [
          { asset: "BTC", note: "Bitcoin" },
          { asset: "ETH", note: "Ethereum" },
          { asset: "ALT", note: "Alternative coins" },
          { asset: "STABLECOIN", note: "Stablecoins" },
          { asset: "ERC20", note: "ERC-20 tokens" },
        ];
        const note = state.authenticated
          ? "Discovery data not loaded. Try reset_session() and initialize() again."
          : "Call initialize() to load full endpoint catalog";
        return jsonResponse({
          success: true,
          authenticated: state.authenticated,
          assets: defaultAssets,
          note,
        });
      }

      const summary = getDiscoverySummary();
      const catalog = getEndpointCatalog();

      if (!summary || !catalog) {
        return errorResponse("Discovery data not available");
      }

      const assetDetails = summary.assets.map((asset) => {
        const assetEndpoints = catalog.byAsset.get(asset.name) ?? [];
        const categories = new Set(assetEndpoints.map((ep) => ep.category));
        return {
          asset: asset.name.toUpperCase(),
          total_endpoints: asset.count,
          categories: Array.from(categories).sort(),
        };
      });

      return jsonResponse({
        success: true,
        authenticated: state.authenticated,
        total_endpoints: summary.total_endpoints,
        fetched_at: summary.fetched_at,
        assets: assetDetails,
        tip: "Use discover_endpoints(asset='btc') to explore endpoints for a specific asset",
      });
    },
  );

  server.tool(
    "describe_metric",
    "Get detailed description for a specific metric. Use only when user asks 'what is X?' or metric is unfamiliar. Returns thresholds, interpretation guidance, and category info.",
    {
      metric_id: z
        .string()
        .describe(
          "The metric ID to describe (e.g., 'mvrv', 'sopr', 'netflow')",
        ),
    },
    async (params: { metric_id: string }) => {
      logger.debug("[describe_metric] looking up metric:", params.metric_id);

      try {
        const metrics = parseToonMetrics();
        logger.debug("[describe_metric] loaded", metrics.length, "metrics from local data");

        const searchLower = params.metric_id.toLowerCase();
        const metric = metrics.find((m) => m.id.toLowerCase() === searchLower);

        if (!metric) {
          logger.debug("[describe_metric] metric not found:", params.metric_id);
          const suggestions = metrics
            .filter(
              (m) =>
                m.id.toLowerCase().includes(searchLower) ||
                m.name.toLowerCase().includes(searchLower),
            )
            .slice(0, 5)
            .map((m) => m.id);

          return errorResponse(`Unknown metric: ${params.metric_id}`, {
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            tip: "Use discover_endpoints() to find available metrics",
          });
        }

        logger.debug("[describe_metric] found metric:", metric.id, "-", metric.name);

        return jsonResponse({
          success: true,
          metric: {
            id: metric.id,
            name: metric.name,
            category: metric.category,
            asset: metric.asset,
            description: metric.description,
            thresholds: metric.thresholds,
            interpretation: metric.interpretation,
          },
        });
      } catch (error) {
        return errorResponse(`Failed to load metric data: ${error}`);
      }
    },
  );
}

interface MetricDescription {
  id: string;
  name: string;
  category: string;
  asset: string;
  description: string;
  thresholds: string;
  interpretation: string;
}

function parseToonMetrics(): MetricDescription[] {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const toonPath = join(__dirname, "..", "data", "metrics.toon");

  logger.debug("[parseToonMetrics] loading from:", toonPath);

  let content: string;
  try {
    content = readFileSync(toonPath, "utf-8");
    logger.debug("[parseToonMetrics] file loaded, size:", content.length, "bytes");
  } catch (_err) {
    logger.debug("[parseToonMetrics] file not found, using built-in metrics");
    return getBuiltInMetrics();
  }

  const metrics: MetricDescription[] = [];
  const lines = content.split("\n");

  let schemaFields: string[] = [];
  let dataStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.startsWith("metrics[") &&
      line.includes("{") &&
      line.includes("}:")
    ) {
      const match = line.match(/\{([^}]+)\}/);
      if (match) {
        schemaFields = match[1].split(",").map((f) => f.trim());
        dataStartIndex = i + 1;
        break;
      }
    }
  }

  if (schemaFields.length === 0 || dataStartIndex === -1) {
    return getBuiltInMetrics();
  }

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const values = line.split(",").map((p) => p.trim());
    if (values.length >= schemaFields.length) {
      const metric: MetricDescription = {
        id: values[0] || "",
        name: values[1] || "",
        category: values[2] || "",
        asset: values[3] || "",
        description: values[4] || "",
        thresholds: values[5] || "",
        interpretation: values[6] || "",
      };
      if (metric.id) {
        metrics.push(metric);
      }
    }
  }

  return metrics.length > 0 ? metrics : getBuiltInMetrics();
}

function getBuiltInMetrics(): MetricDescription[] {
  return [
    {
      id: "mvrv",
      name: "Market Value to Realized Value",
      category: "market-indicator",
      asset: "btc",
      description:
        "Compares current market cap to realized cap (aggregate cost basis)",
      thresholds:
        "<1 undervalued|1-2.5 neutral|2.5-3.7 overheated|>3.7 extreme",
      interpretation:
        "Primary cycle indicator. Values below 1 historically mark accumulation zones.",
    },
    {
      id: "sopr",
      name: "Spent Output Profit Ratio",
      category: "market-indicator",
      asset: "btc",
      description: "Ratio of price sold to price paid for coins moved on-chain",
      thresholds: "<1 selling at loss|=1 breakeven|>1 selling at profit",
      interpretation:
        "Real-time profit/loss behavior. SOPR=1 often acts as support/resistance.",
    },
    {
      id: "nupl",
      name: "Net Unrealized Profit/Loss",
      category: "market-indicator",
      asset: "btc",
      description:
        "Percentage of coins in profit or loss relative to total market cap",
      thresholds:
        "<0 capitulation|0-0.25 hope|0.25-0.5 belief|0.5-0.75 optimism|>0.75 euphoria",
      interpretation:
        "Sentiment gauge. Extreme values often precede major reversals.",
    },
    {
      id: "netflow",
      name: "Exchange Netflow",
      category: "exchange-flows",
      asset: "btc",
      description:
        "Net flow of BTC into (positive) or out of (negative) exchanges",
      thresholds: "positive sell pressure|negative accumulation",
      interpretation:
        "Key supply dynamics indicator. Sustained outflows suggest accumulation.",
    },
    {
      id: "funding-rates",
      name: "Funding Rates",
      category: "market-data",
      asset: "btc",
      description:
        "Periodic payment between long and short perpetual swap holders",
      thresholds: "<0 bearish|0-0.03% neutral|>0.1% extreme bullish",
      interpretation:
        "Leverage sentiment. Extreme positive rates often precede corrections.",
    },
  ];
}

function buildExampleQuery(endpoint: ParsedEndpoint): string {
  const params: string[] = [];

  for (const required of endpoint.required_parameters) {
    const values = endpoint.parameters[required];
    if (values && values.length > 0) {
      params.push(`${required}=${values[0]}`);
    }
  }

  if (
    endpoint.parameters.window &&
    !endpoint.required_parameters.includes("window")
  ) {
    params.push(`window=${endpoint.parameters.window[0]}`);
  }

  params.push("limit=100");

  const paramStr = params
    .map((p) => {
      const [key, val] = p.split("=");
      return `"${key}": "${val}"`;
    })
    .join(", ");

  return `query_data(endpoint="${endpoint.path}", params={${paramStr}})`;
}
