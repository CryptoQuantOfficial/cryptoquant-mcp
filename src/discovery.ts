import { logger } from "./utils.js";

export interface EndpointParameter {
  [paramName: string]: string[];
}

export interface DiscoveryEndpoint {
  path: string;
  parameters: EndpointParameter;
  required_parameters: string[];
}

export interface DiscoveryResponse {
  status: { code: number; message: string };
  result: { data: DiscoveryEndpoint[] };
}

export interface ParsedEndpoint {
  path: string;
  asset: string;
  category: string;
  metric: string;
  parameters: EndpointParameter;
  required_parameters: string[];
}

export interface EndpointCatalog {
  endpoints: ParsedEndpoint[];
  assets: string[];
  categories: string[];
  byAsset: Map<string, ParsedEndpoint[]>;
  byCategory: Map<string, ParsedEndpoint[]>;
  byAssetCategory: Map<string, ParsedEndpoint[]>;
  fetched_at: number;
}

let endpointCatalog: EndpointCatalog | null = null;

export async function fetchDiscoveryEndpoints(
  apiKey: string,
  apiUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const discoveryUrl = apiUrl.replace(/\/v1$/, "") + "/v1/discovery/endpoints?source=mcp";
    logger.debug("[fetchDiscoveryEndpoints] fetching from:", discoveryUrl);

    const response = await fetch(discoveryUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    logger.debug("[fetchDiscoveryEndpoints] response status:", response.status, response.statusText);

    if (!response.ok) {
      return { success: false, error: `Discovery API failed: ${response.status} ${response.statusText}` };
    }

    let data: DiscoveryResponse;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: "Failed to parse discovery response" };
    }

    if (data.status.code !== 200 || !data.result?.data) {
      return { success: false, error: `Invalid discovery response: ${data.status.message}` };
    }

    endpointCatalog = parseEndpoints(data.result.data);
    logger.debug("[fetchDiscoveryEndpoints] parsed", endpointCatalog.endpoints.length, "endpoints");
    logger.debug("[fetchDiscoveryEndpoints] assets:", endpointCatalog.assets.join(", "));
    logger.debug("[fetchDiscoveryEndpoints] categories:", endpointCatalog.categories.join(", "));

    return { success: true };
  } catch (error) {
    return { success: false, error: `Discovery fetch error: ${error}` };
  }
}

function addToIndex<K>(map: Map<K, ParsedEndpoint[]>, key: K, endpoint: ParsedEndpoint): void {
  const list = map.get(key);
  if (list) {
    list.push(endpoint);
  } else {
    map.set(key, [endpoint]);
  }
}

function parseEndpoints(rawEndpoints: DiscoveryEndpoint[]): EndpointCatalog {
  const endpoints: ParsedEndpoint[] = [];
  const assets = new Set<string>();
  const categories = new Set<string>();
  const byAsset = new Map<string, ParsedEndpoint[]>();
  const byCategory = new Map<string, ParsedEndpoint[]>();
  const byAssetCategory = new Map<string, ParsedEndpoint[]>();

  for (const ep of rawEndpoints) {
    const parts = ep.path.split("/");
    if (parts.length < 5) continue;

    const asset = parts[2];
    const category = parts[3];
    const parsed: ParsedEndpoint = {
      path: ep.path,
      asset,
      category,
      metric: parts.slice(4).join("/"),
      parameters: ep.parameters,
      required_parameters: ep.required_parameters,
    };

    endpoints.push(parsed);
    assets.add(asset);
    categories.add(category);

    addToIndex(byAsset, asset, parsed);
    addToIndex(byCategory, category, parsed);
    addToIndex(byAssetCategory, `${asset}/${category}`, parsed);
  }

  return {
    endpoints,
    assets: Array.from(assets).sort(),
    categories: Array.from(categories).sort(),
    byAsset,
    byCategory,
    byAssetCategory,
    fetched_at: Date.now(),
  };
}

export function getEndpointCatalog(): EndpointCatalog | null {
  return endpointCatalog;
}

export function isDiscoveryLoaded(): boolean {
  return endpointCatalog !== null;
}

function getBaseEndpoints(
  catalog: EndpointCatalog,
  asset?: string,
  category?: string
): ParsedEndpoint[] {
  if (asset && category) {
    return catalog.byAssetCategory.get(`${asset}/${category}`) ?? [];
  }
  if (asset) {
    return catalog.byAsset.get(asset) ?? [];
  }
  if (category) {
    return catalog.byCategory.get(category) ?? [];
  }
  return catalog.endpoints;
}

export function searchEndpoints(options: {
  asset?: string;
  category?: string;
  query?: string;
}): ParsedEndpoint[] {
  logger.debug("[searchEndpoints] search options:", options);

  if (!endpointCatalog) {
    logger.debug("[searchEndpoints] catalog not loaded");
    return [];
  }

  const results = getBaseEndpoints(endpointCatalog, options.asset, options.category);
  logger.debug("[searchEndpoints] base results:", results.length);

  if (!options.query) return results;

  const queryLower = options.query.toLowerCase();
  const filtered = results.filter(
    (ep) => ep.path.toLowerCase().includes(queryLower) || ep.metric.toLowerCase().includes(queryLower)
  );

  logger.debug("[searchEndpoints] filtered by query:", filtered.length);
  return filtered;
}

export function getEndpointByPath(path: string): ParsedEndpoint | undefined {
  return endpointCatalog?.endpoints.find((ep) => ep.path === path);
}

export function validateEndpointParams(
  endpoint: ParsedEndpoint,
  params: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const required of endpoint.required_parameters) {
    if (params[required] === undefined || params[required] === null) {
      errors.push(`Missing required parameter: ${required}`);
    }
  }

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    const allowedValues = endpoint.parameters[key];
    if (allowedValues && typeof value === "string" && !allowedValues.includes(value)) {
      errors.push(`Invalid value for '${key}': '${value}'. Allowed: ${allowedValues.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getParameterOptions(path: string): { parameters: EndpointParameter; required: string[] } | null {
  const endpoint = getEndpointByPath(path);
  if (!endpoint) return null;
  return { parameters: endpoint.parameters, required: endpoint.required_parameters };
}

export interface DiscoverySummary {
  total_endpoints: number;
  assets: { name: string; count: number }[];
  categories: { name: string; count: number }[];
  fetched_at: string | null;
}

export function getDiscoverySummary(): DiscoverySummary | null {
  if (!endpointCatalog) return null;

  return {
    total_endpoints: endpointCatalog.endpoints.length,
    assets: endpointCatalog.assets.map((asset) => ({
      name: asset,
      count: endpointCatalog!.byAsset.get(asset)?.length ?? 0,
    })),
    categories: endpointCatalog.categories.map((cat) => ({
      name: cat,
      count: endpointCatalog!.byCategory.get(cat)?.length ?? 0,
    })),
    fetched_at: new Date(endpointCatalog.fetched_at).toISOString(),
  };
}

export function getAssetCategoryMap(): Record<string, string[]> | null {
  if (!endpointCatalog) return null;

  const result: Record<string, string[]> = {};
  for (const asset of endpointCatalog.assets) {
    const assetEndpoints = endpointCatalog.byAsset.get(asset) ?? [];
    const categories = new Set(assetEndpoints.map((ep) => ep.category));
    result[asset] = Array.from(categories).sort();
  }
  return result;
}

export function resetDiscovery(): void {
  endpointCatalog = null;
}
