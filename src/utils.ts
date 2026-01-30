/**
 * Shared utility functions for CryptoQuant MCP Server
 */

import type { UserPlan } from "./plan-limits.js";

// =============================================================================
// Logger - Debug logging controlled by DEBUG environment variable
// =============================================================================

/**
 * Check if debug logging is enabled.
 * Set DEBUG=true or DEBUG=1 to enable debug output.
 */
function isDebugEnabled(): boolean {
  const debug = process.env.DEBUG;
  return debug === "true" || debug === "1";
}

/**
 * Logger with level-based output.
 * - debug: Only shown when DEBUG=true (use for detailed tracing)
 * - info: Always shown (use for important status messages)
 * - warn: Always shown (use for warnings)
 * - error: Always shown (use for errors)
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (isDebugEnabled()) {
      console.error("[DEBUG]", ...args);
    }
  },
  info: (...args: unknown[]) => {
    console.error("[INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.error("[WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[ERROR]", ...args);
  },
};

/**
 * Create a JSON response for MCP tools.
 */
export function jsonResponse(data: unknown): {
  content: [{ type: "text"; text: string }];
} {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/**
 * Create an error response for MCP tools.
 */
export function errorResponse(
  error: string,
  extra?: Record<string, unknown>,
): { content: [{ type: "text"; text: string }] } {
  return jsonResponse({ success: false, error, ...extra });
}

/**
 * Get a human-readable note for a plan type.
 * Plan hierarchy: basic < advanced < professional < premium < custom
 */
export function getPlanNote(plan: UserPlan | string): string {
  switch (plan) {
    case "custom":
      return "Custom enterprise plan with tailored access";
    case "premium":
      return "Full access to all data";
    case "professional":
      return "3-year data history limit on most endpoints";
    case "advanced":
      return "Extended endpoint access with some data limits";
    case "basic":
      return "Limited endpoint access. Upgrade for more data.";
    default:
      return "Plan not detected";
  }
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
