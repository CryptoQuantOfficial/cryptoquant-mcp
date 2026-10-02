import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const FAKE_INSTRUCTIONS = "Fake CryptoQuant instructions — 온체인 ✓ \"quoted\"\nsecond line";

export type FakeMode = "ok" | "unauthorized" | "server-error";

export interface RecordedRequest {
  method: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export interface FakeRemoteOptions {
  /** Pass GET to the transport so the client's long-lived SSE stream opens (as in production). Default: answer 405. */
  getSse?: boolean;
}

export interface FakeRemote {
  url: URL;
  requests: RecordedRequest[];
  setMode(mode: FakeMode): void;
  close(): Promise<void>;
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "fake-cryptoquant", version: "9.9.9", title: "Fake CryptoQuant" },
    { instructions: FAKE_INSTRUCTIONS },
  );
  server.registerTool("echo", { description: "Echo text back", inputSchema: { text: z.string() } }, async ({ text }) => ({
    content: [{ type: "text", text }],
  }));
  server.registerTool("slow", { description: "Answer after ms milliseconds", inputSchema: { ms: z.number() } }, async ({ ms }) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { content: [{ type: "text", text: "done" }] };
  });
  server.registerTool("hang", { description: "Never answers", inputSchema: {} }, () => new Promise(() => {}));
  return server;
}

/**
 * Mirrors the production route: stateless, one McpServer per request.
 * Production serves a long-lived GET SSE stream; that is opt-in here (`getSse`) and
 * otherwise GET answers 405, which the SDK client treats as "no standalone stream".
 */
export async function startFakeRemote({ getSse = false }: FakeRemoteOptions = {}): Promise<FakeRemote> {
  const requests: RecordedRequest[] = [];
  let mode: FakeMode = "ok";

  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf-8");
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method ?? "", headers: req.headers, body });

    if (req.method !== "POST" && !(getSse && req.method === "GET")) {
      res.writeHead(405).end();
      return;
    }
    if (mode === "unauthorized") {
      res
        .writeHead(401, { "content-type": "application/json", "www-authenticate": 'Bearer error="invalid_token"' })
        .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or expired API key" }, id: null }));
      return;
    }
    if (mode === "server-error") {
      res.writeHead(502, { "content-type": "text/plain" }).end("Bad Gateway");
      return;
    }

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const { port } = http.address() as AddressInfo;

  return {
    url: new URL(`http://127.0.0.1:${port}/mcp`),
    requests,
    setMode: (next) => {
      mode = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        http.closeAllConnections();
        http.close(() => resolve());
      }),
  };
}

/** A loopback URL with nothing listening (connection refused). */
export async function unusedLocalUrl(): Promise<URL> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return new URL(`http://127.0.0.1:${port}/mcp`);
}
