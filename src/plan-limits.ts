export type DurationLimit = string; // "P0D", "P1D", "P3Y", etc.

// Plan hierarchy based on https://cryptoquant.com/pricing
// Order: basic < advanced < professional < premium < custom
export type UserPlan = "basic" | "advanced" | "professional" | "premium" | "custom" | "unknown";

// API response structure for each metric
// New format: { [windowType]: DurationLimit } e.g., { "day": "P1Y" }
export interface MetricLimits {
  window: { [windowType: string]: DurationLimit };
}

// Structure: asset -> category -> metric -> MetricLimits
export interface PlanLimits {
  [asset: string]: {
    [category: string]: {
      [metric: string]: MetricLimits;
    };
  };
}

export interface ApiRateLimit {
  token: number;
  window: string; // "day", "hour", etc.
}

export interface PlanLimitsState {
  loaded: boolean;
  limits: PlanLimits | null;
  plan: UserPlan;
  statics: string[]; // Static endpoints always available
  apiRateLimit: ApiRateLimit | null;
  fetched_at: number | null;
}

const DEFAULT_STATE: PlanLimitsState = {
  loaded: false,
  limits: null,
  plan: "unknown",
  statics: [],
  apiRateLimit: null,
  fetched_at: null,
};

let planLimitsState: PlanLimitsState = { ...DEFAULT_STATE };

/**
 * Normalize plan name from API (e.g., "PROFESSIONAL") to UserPlan type
 */
function normalizePlanName(apiPlanName: string): UserPlan {
  const normalized = apiPlanName.toLowerCase();
  switch (normalized) {
    case "basic":
      return "basic";
    case "advanced":
      return "advanced";
    case "professional":
      return "professional";
    case "premium":
      return "premium";
    case "custom":
      return "custom";
    default:
      return "unknown";
  }
}

export interface FetchPlanLimitsResult {
  success: boolean;
  error?: string;
  rawResponse?: Record<string, unknown>;
  parsed?: {
    limits: PlanLimits | null;
    statics: string[];
    apiRateLimit: ApiRateLimit | null;
  };
  plan?: UserPlan;
}

export async function fetchPlanLimits(
  apiKey: string,
  apiUrl: string
): Promise<FetchPlanLimitsResult> {
  try {
    const discoveryUrl = apiUrl.replace(/\/v1$/, "") + "/v1/my/discovery/endpoints?source=mcp";
    const response = await fetch(discoveryUrl, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (response.status === 403 || response.status === 500) {
      planLimitsState = { ...DEFAULT_STATE, loaded: true, plan: "basic", fetched_at: Date.now() };
      return {
        success: true,
        plan: "basic",
        parsed: { limits: null, statics: [], apiRateLimit: null },
      };
    }

    if (!response.ok) {
      return { success: false, error: `Plan limits API failed: ${response.status} ${response.statusText}` };
    }

    let data: Record<string, unknown>;
    try {
      data = await response.json();
    } catch {
      return { success: false, error: "Failed to parse plan limits response" };
    }

    const parsed = parseApiResponse(data);
    // Prefer direct plan name from API, fallback to detection from limits
    const plan = parsed.planName
      ? normalizePlanName(parsed.planName)
      : detectPlanFromLimits(parsed.limits);

    planLimitsState = {
      loaded: true,
      limits: parsed.limits,
      plan,
      statics: parsed.statics,
      apiRateLimit: parsed.apiRateLimit,
      fetched_at: Date.now(),
    };

    return {
      success: true,
      rawResponse: data,
      parsed: {
        limits: parsed.limits,
        statics: parsed.statics,
        apiRateLimit: parsed.apiRateLimit,
      },
      plan,
    };
  } catch (error) {
    return { success: false, error: `Plan limits fetch error: ${error}` };
  }
}

interface ParsedApiResponse {
  limits: PlanLimits | null;
  statics: string[];
  apiRateLimit: ApiRateLimit | null;
  planName: string | null; // Direct plan name from API (e.g., "PROFESSIONAL")
}

function parseApiResponse(data: unknown): ParsedApiResponse {
  const result: ParsedApiResponse = {
    limits: null,
    statics: [],
    apiRateLimit: null,
    planName: null,
  };

  if (!data || typeof data !== "object") return result;

  const obj = data as Record<string, unknown>;

  // Parse plan.name directly from response (new format)
  if (obj.plan && typeof obj.plan === "object") {
    const plan = obj.plan as Record<string, unknown>;
    if (typeof plan.name === "string") {
      result.planName = plan.name;
    }
  }

  // Parse apiEndpoint (the main limits data)
  if (obj.apiEndpoint && typeof obj.apiEndpoint === "object") {
    const apiEndpoint = obj.apiEndpoint as Record<string, unknown>;
    const limits: PlanLimits = {};

    for (const [asset, categories] of Object.entries(apiEndpoint)) {
      // Skip non-asset keys like "statics"
      if (asset === "statics" || typeof categories !== "object" || categories === null) {
        continue;
      }

      limits[asset] = {};

      for (const [category, metrics] of Object.entries(categories as Record<string, unknown>)) {
        if (typeof metrics !== "object" || metrics === null) continue;

        limits[asset][category] = {};

        for (const [metric, metricData] of Object.entries(metrics as Record<string, unknown>)) {
          if (typeof metricData !== "object" || metricData === null) continue;

          const md = metricData as Record<string, unknown>;

          // New format: metric data is directly { windowType: duration }
          // e.g., { "day": "P1Y" } instead of { window: { "day": "P1Y" }, limit: 1000 }
          const windowLimits: { [windowType: string]: DurationLimit } = {};
          let hasValidWindow = false;

          for (const [key, value] of Object.entries(md)) {
            if (typeof value === "string" && /^P\d+[YMWD]$/.test(value)) {
              windowLimits[key] = value;
              hasValidWindow = true;
            }
          }

          if (hasValidWindow) {
            limits[asset][category][metric] = { window: windowLimits };
          }
        }
      }
    }

    // Extract statics from apiEndpoint if present
    if (apiEndpoint.statics && Array.isArray(apiEndpoint.statics)) {
      result.statics = apiEndpoint.statics as string[];
    }

    result.limits = Object.keys(limits).length > 0 ? limits : null;
  }

  // Parse apiRateLimit
  if (obj.apiRateLimit && typeof obj.apiRateLimit === "object") {
    const rl = obj.apiRateLimit as Record<string, unknown>;
    if (typeof rl.token === "number" && typeof rl.window === "string") {
      result.apiRateLimit = {
        token: rl.token,
        window: rl.window,
      };
    }
  }

  return result;
}

function collectDurationCounts(limits: PlanLimits): { p0d: number; p3y: number; p1d: number; total: number } {
  const counts = { p0d: 0, p3y: 0, p1d: 0, total: 0 };

  for (const categories of Object.values(limits)) {
    if (!categories) continue;
    for (const metrics of Object.values(categories)) {
      if (!metrics) continue;
      for (const metricLimits of Object.values(metrics)) {
        if (!metricLimits?.window) continue;
        for (const duration of Object.values(metricLimits.window)) {
          counts.total++;
          if (duration === "P0D") counts.p0d++;
          else if (duration === "P3Y") counts.p3y++;
          else if (duration === "P1D") counts.p1d++;
        }
      }
    }
  }

  return counts;
}

export function detectPlanFromLimits(limits: PlanLimits | null): UserPlan {
  if (!limits) return "basic";

  const counts = collectDurationCounts(limits);
  if (counts.total === 0) return "basic";

  const p1dRatio = counts.p1d / counts.total;
  const p0dRatio = counts.p0d / counts.total;
  const p3yRatio = counts.p3y / counts.total;

  // P1D (1 day only) with low limits = basic plan
  if (p1dRatio > 0.5) return "basic";
  // P0D (unlimited) on most endpoints = premium
  if (p0dRatio > 0.5) return "premium";
  // P3Y (3 years) on many endpoints = professional
  if (p3yRatio > 0.3) return "professional";

  return "advanced";
}

export function getPlanLimitsState(): PlanLimitsState {
  return planLimitsState;
}

interface ParsedEndpointPath {
  asset: string;
  category: string;
  metric: string;
}

function parseEndpointPath(endpointPath: string): ParsedEndpointPath | null {
  const parts = endpointPath.split("/");
  if (parts.length < 5) return null;
  return { asset: parts[2], category: parts[3], metric: parts.slice(4).join("/") };
}

function getMetricLimits(endpointPath: string): MetricLimits | null {
  if (!planLimitsState.limits) return null;

  const parsed = parseEndpointPath(endpointPath);
  if (!parsed) return null;

  const { asset, category, metric } = parsed;
  return planLimitsState.limits[asset]?.[category]?.[metric] ?? null;
}

export function getPlanLimit(endpointPath: string, windowType?: string): DurationLimit | null {
  const metricLimits = getMetricLimits(endpointPath);
  if (!metricLimits?.window) return null;

  if (windowType && metricLimits.window[windowType]) {
    return metricLimits.window[windowType];
  }

  // Return first available window limit
  const windows = Object.keys(metricLimits.window);
  return windows.length > 0 ? metricLimits.window[windows[0]] : null;
}

export function getEndpointResultLimit(_endpointPath: string): number | null {
  // Note: The new API response format no longer includes result limits per endpoint
  // Return null to indicate no specific limit is set
  return null;
}

export function getEndpointWindowLimits(endpointPath: string): Record<string, DurationLimit> {
  const metricLimits = getMetricLimits(endpointPath);
  return metricLimits?.window ?? {};
}

export function hasEndpointAccess(endpointPath: string): boolean {
  if (!planLimitsState.loaded || planLimitsState.plan === "unknown") {
    return true;
  }

  // Check if it's a static endpoint (always accessible)
  if (planLimitsState.statics.includes(endpointPath)) {
    return true;
  }

  if (planLimitsState.plan === "basic" && !planLimitsState.limits) {
    return false;
  }

  // Check if endpoint has explicit limits defined
  const hasLimits = getPlanLimit(endpointPath) !== null;
  if (hasLimits) {
    return true;
  }

  // For premium/professional plans, endpoints not in limits (e.g., status/metadata endpoints)
  // are assumed accessible since these plans have full access
  if (planLimitsState.plan === "premium" || planLimitsState.plan === "professional" || planLimitsState.plan === "custom") {
    return true;
  }

  // For basic/advanced plans, only explicitly listed endpoints are accessible
  return false;
}

export function parseDurationToDate(duration: DurationLimit): Date | null {
  if (duration === "P0D") return null; // Unlimited

  const match = duration.match(/^P(\d+)([YMWD])$/);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const date = new Date();

  switch (unit) {
    case "Y":
      date.setFullYear(date.getFullYear() - value);
      break;
    case "M":
      date.setMonth(date.getMonth() - value);
      break;
    case "W":
      date.setDate(date.getDate() - value * 7);
      break;
    case "D":
      date.setDate(date.getDate() - value);
      break;
    default:
      return null;
  }

  return date;
}

export function getEarliestAllowedDate(endpointPath: string, windowType?: string): Date | null {
  const limit = getPlanLimit(endpointPath, windowType);
  if (!limit) return new Date();
  return parseDurationToDate(limit);
}

export interface DateRangeValidation {
  valid: boolean;
  error?: string;
  earliest_allowed?: string;
  limit?: DurationLimit;
}

export function validateDateRange(
  endpointPath: string,
  fromDate: string | undefined,
  windowType?: string
): DateRangeValidation {
  if (!planLimitsState.loaded || planLimitsState.plan === "unknown") {
    return { valid: true };
  }

  if (!hasEndpointAccess(endpointPath)) {
    return { valid: false, error: "Endpoint not accessible on your plan" };
  }

  if (!fromDate) {
    return { valid: true };
  }

  const limit = getPlanLimit(endpointPath, windowType);
  if (!limit) {
    return { valid: false, error: "No access to this endpoint/window combination" };
  }

  if (limit === "P0D") {
    return { valid: true };
  }

  const earliestDate = parseDurationToDate(limit);
  if (!earliestDate) {
    return { valid: true };
  }

  const requestedDate = new Date(fromDate);
  if (isNaN(requestedDate.getTime())) {
    return { valid: false, error: "Invalid date format" };
  }

  if (requestedDate < earliestDate) {
    return {
      valid: false,
      error: "Date range exceeds plan limit",
      earliest_allowed: earliestDate.toISOString().split("T")[0],
      limit,
    };
  }

  return { valid: true };
}

export function getRequiredPlan(endpointPath: string): UserPlan {
  // TODO: Sync endpoint-to-plan mapping with actual CryptoQuant pricing data
  // Plan hierarchy: basic < advanced < professional < premium < custom
  if (!planLimitsState.limits) return "professional";

  const limit = getPlanLimit(endpointPath);

  switch (limit) {
    case null:
      return "professional";
    case "P0D":
    case "P1D":
      return "basic";
    default:
      return "professional";
  }
}

export function getApiRateLimit(): ApiRateLimit | null {
  return planLimitsState.apiRateLimit;
}

export function getStaticEndpoints(): string[] {
  return planLimitsState.statics;
}

export function resetPlanLimits(): void {
  planLimitsState = { ...DEFAULT_STATE };
}

/**
 * Load plan limits state from cached data (no API call).
 */
export function loadPlanLimitsFromCache(
  limits: PlanLimits | null,
  statics: string[],
  apiRateLimit: ApiRateLimit | null,
  plan: UserPlan
): void {
  planLimitsState = {
    loaded: true,
    limits,
    plan,
    statics,
    apiRateLimit,
    fetched_at: Date.now(),
  };
}

export interface AccessibleEndpointInfo {
  path: string;
  date_limit: string; // "P7D", "P3Y", etc.
}

export interface AccessibleEndpointsSummary {
  count: number;
  // Only included for basic/advanced plans (limited access)
  endpoints?: AccessibleEndpointInfo[];
}

export function getAccessibleEndpointsSummary(totalDiscoveredEndpoints?: number): AccessibleEndpointsSummary {
  const state = planLimitsState;

  if (!state.loaded) {
    return { count: 0 };
  }

  // For basic plan without limits data, no endpoints are accessible
  if (state.plan === "basic" && !state.limits) {
    return { count: 0, endpoints: [] };
  }

  // For premium/professional/custom plans, all discovered endpoints are accessible
  // (status/metadata endpoints not in limits are still accessible)
  if ((state.plan === "premium" || state.plan === "professional" || state.plan === "custom") && totalDiscoveredEndpoints) {
    return { count: totalDiscoveredEndpoints };
  }

  let count = 0;
  const endpoints: AccessibleEndpointInfo[] = [];

  if (state.limits) {
    for (const asset of Object.keys(state.limits)) {
      const categories = state.limits[asset];
      if (!categories) continue;

      for (const category of Object.keys(categories)) {
        const metrics = categories[category];
        if (!metrics) continue;

        for (const metric of Object.keys(metrics)) {
          const metricLimits = metrics[metric];
          if (!metricLimits?.window) continue;

          count++;

          // For basic/advanced plans, include detailed endpoint info
          if (state.plan === "basic" || state.plan === "advanced") {
            const dayLimit = metricLimits.window["day"] || Object.values(metricLimits.window)[0];
            endpoints.push({
              path: `/v1/${asset}/${category}/${metric}`,
              date_limit: dayLimit,
            });
          }
        }
      }
    }
  }

  // Include static endpoints in count
  count += state.statics.length;

  const result: AccessibleEndpointsSummary = { count };

  // Only include endpoints list for basic/advanced plans
  if ((state.plan === "basic" || state.plan === "advanced") && endpoints.length > 0) {
    result.endpoints = endpoints;
  }

  return result;
}
