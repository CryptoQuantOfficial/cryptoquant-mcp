/**
 * stderr logger. stdout is reserved for JSON-RPC messages.
 * Set DEBUG=true or DEBUG=1 for debug output.
 */
function isDebugEnabled(): boolean {
  const debug = process.env.DEBUG;
  return debug === "true" || debug === "1";
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDebugEnabled()) console.error("[DEBUG]", ...args);
  },
  info: (...args: unknown[]) => console.error("[INFO]", ...args),
  warn: (...args: unknown[]) => console.error("[WARN]", ...args),
  error: (...args: unknown[]) => console.error("[ERROR]", ...args),
};
