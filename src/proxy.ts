import type { Readable, Writable } from "node:stream";

import { StreamableHTTPClientTransport, StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import { API_KEY_URL } from "./api-key.js";
import { logger } from "./utils.js";

export const API_KEY_REJECTED = -32001;
export const UPSTREAM_ERROR = -32603;
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export interface ProxyOptions {
  url: URL;
  apiKey: string;
  stdin?: Readable;
  stdout?: Writable;
  requestTimeoutMs?: number;
}

export interface RunningProxy {
  /** Resolves once stdin has ended (or close() was called) and both transports are closed. */
  closed: Promise<void>;
  close(): Promise<void>;
}

type RequestId = string | number;

interface PendingRequest {
  method: string;
  timer: ReturnType<typeof setTimeout>;
}

function isRequest(message: JSONRPCMessage): message is JSONRPCMessage & { id: RequestId; method: string } {
  return "method" in message && "id" in message && message.id !== undefined;
}

function isResponse(message: JSONRPCMessage): message is JSONRPCMessage & { id: RequestId } {
  return "id" in message && !("method" in message) && ("result" in message || "error" in message);
}

function label(message: JSONRPCMessage): string {
  return "method" in message ? message.method : "response";
}

function summarize(error: unknown, redact: Redact): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : "";
  const text = redact(`${message}${cause}`);
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

type Redact = (text: string) => string;

function toRpcError(error: unknown, redact: Redact): { code: number; message: string } {
  if (error instanceof StreamableHTTPError && error.code === 401) {
    return {
      code: API_KEY_REJECTED,
      message: `CryptoQuant rejected the API key. Check CRYPTOQUANT_API_KEY, or create a key at ${API_KEY_URL}`,
    };
  }
  return { code: UPSTREAM_ERROR, message: `CryptoQuant MCP server request failed: ${summarize(error, redact)}` };
}

/**
 * Relays JSON-RPC between a stdio MCP client and the remote Streamable HTTP server.
 * Messages are forwarded as is; the proxy only answers on the server's behalf when
 * a request cannot reach it (401, network, 5xx, timeout).
 */
export async function startProxy(options: ProxyOptions): Promise<RunningProxy> {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  const local = new StdioServerTransport(stdin, stdout);
  const remote = new StreamableHTTPClientTransport(options.url, {
    requestInit: { headers: { Authorization: `Bearer ${options.apiKey}` } },
  });

  // The one place that scrubs the key from anything that can reach stdout or stderr.
  const redact: Redact = (text) => (options.apiKey ? text.split(options.apiKey).join("***") : text);

  const pending = new Map<RequestId, PendingRequest>();
  let closing = false;
  let markClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    markClosed = resolve;
  });

  const reply = (message: JSONRPCMessage): void => {
    if (closing) return;
    local.send(message).catch((error) => logger.error("Failed to write to stdout:", summarize(error, redact)));
  };

  const settle = (id: RequestId): PendingRequest | undefined => {
    const entry = pending.get(id);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    pending.delete(id);
    return entry;
  };

  const fail = (id: RequestId, error: { code: number; message: string }): void => {
    if (!settle(id)) return; // already answered or timed out
    reply({ jsonrpc: "2.0", id, error });
  };

  remote.onmessage = (message) => {
    if (isResponse(message)) {
      const entry = settle(message.id);
      if (!entry) {
        logger.warn(`Dropping a late or unknown response (id ${String(message.id)})`);
        return;
      }
      if (entry.method === "initialize" && "result" in message) {
        const version = (message.result as { protocolVersion?: unknown }).protocolVersion;
        if (typeof version === "string") remote.setProtocolVersion(version);
      }
    }
    reply(message);
  };
  // The SDK reports a failed send() here as well as by rejecting it, so this is the single
  // warn for request failures; the send() catch below only builds the JSON-RPC error.
  remote.onerror = (error) => {
    if (closing || error.name === "AbortError") return;
    logger.warn("Remote transport error:", summarize(error, redact));
  };

  local.onmessage = (message) => {
    if (isRequest(message)) {
      const id = message.id;
      settle(id); // a client reusing a pending id must not leave the old timer running
      const timer = setTimeout(
        () => fail(id, { code: UPSTREAM_ERROR, message: `CryptoQuant MCP server did not respond within ${timeoutMs / 1000}s` }),
        timeoutMs,
      );
      pending.set(id, { method: message.method, timer });
    }
    if ("method" in message && message.method === "notifications/cancelled" && "params" in message) {
      const requestId = (message.params as { requestId?: unknown } | undefined)?.requestId;
      if (typeof requestId === "string" || typeof requestId === "number") settle(requestId);
    }
    remote.send(message).catch((error) => {
      if (isRequest(message)) {
        fail(message.id, toRpcError(error, redact));
      } else {
        logger.warn(`Failed to forward ${label(message)}:`, summarize(error, redact));
      }
    });
  };
  local.onerror = (error) => logger.warn("Invalid message from client:", summarize(error, redact));

  const shutdown = async (): Promise<void> => {
    if (closing) return closed;
    closing = true;
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    await remote.close().catch(() => undefined);
    await local.close().catch(() => undefined);
    markClosed();
    return closed;
  };

  stdin.once("end", () => void shutdown());
  stdin.once("close", () => void shutdown());

  await remote.start();
  await local.start();

  return { closed, close: shutdown };
}
