import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_INSTRUCTIONS, startFakeRemote, unusedLocalUrl, type FakeRemote } from "../test/helpers/fake-remote.js";
import { createHarness, type Harness } from "../test/helpers/stdio-harness.js";
import { API_KEY_REJECTED, startProxy, UPSTREAM_ERROR, type RunningProxy } from "./proxy.js";

const API_KEY = "cq-test-key-SECRET-1234";
const PROTOCOL_VERSION = "2025-06-18";

const INITIALIZE: JSONRPCMessage = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "proxy-test", version: "0.0.0" } },
};
const INITIALIZED: JSONRPCMessage = { jsonrpc: "2.0", method: "notifications/initialized" };
const LIST_TOOLS: JSONRPCMessage = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
const CALL_ECHO: JSONRPCMessage = {
  jsonrpc: "2.0",
  id: "call-3",
  method: "tools/call",
  params: { name: "echo", arguments: { text: "비트코인 MVRV ✓ \"q\"" } },
};

/** Sends the same messages straight to the remote, bypassing the proxy. */
async function direct(url: URL, messages: JSONRPCMessage[]): Promise<JSONRPCMessage[]> {
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
  });
  const received: JSONRPCMessage[] = [];
  transport.onmessage = (m) => received.push(m);
  await transport.start();
  for (const message of messages) {
    await transport.send(message);
    if ("id" in message) {
      await vi.waitFor(() => {
        if (!received.some((m) => "id" in m && m.id === message.id)) throw new Error("waiting");
      });
    }
  }
  await transport.close();
  return received;
}

describe("startProxy", () => {
  let remote: FakeRemote;
  let io: Harness;
  let proxy: RunningProxy | undefined;
  let stderr: string[];

  beforeEach(async () => {
    remote = await startFakeRemote();
    io = createHarness();
    stderr = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    });
  });

  afterEach(async () => {
    await proxy?.close();
    proxy = undefined;
    await remote.close();
    vi.restoreAllMocks();
  });

  async function start(url: URL = remote.url, requestTimeoutMs?: number) {
    proxy = await startProxy({ url, apiKey: API_KEY, stdin: io.stdin, stdout: io.stdout, requestTimeoutMs });
  }

  it("forwards initialize, tools/list, and tools/call unchanged", async () => {
    await start();
    io.send(INITIALIZE);
    const init = await io.response(1);
    io.send(INITIALIZED);
    io.send(LIST_TOOLS);
    const list = await io.response(2);
    io.send(CALL_ECHO);
    const call = await io.response("call-3");

    const expected = await direct(remote.url, [INITIALIZE, INITIALIZED, LIST_TOOLS, CALL_ECHO]);
    expect([init, list, call]).toEqual(expected);

    const result = (init as unknown as { result: { instructions: string; serverInfo: { name: string } } }).result;
    expect(result.instructions).toBe(FAKE_INSTRUCTIONS);
    expect(result.serverInfo.name).toBe("fake-cryptoquant");
    expect((call as unknown as { result: { content: { text: string }[] } }).result.content[0].text).toBe("비트코인 MVRV ✓ \"q\"");
  });

  it("sends the bearer key, no system key, and the negotiated protocol version", async () => {
    await start();
    io.send(INITIALIZE);
    await io.response(1);
    io.send(INITIALIZED);
    io.send(LIST_TOOLS);
    await io.response(2);

    const posts = remote.requests.filter((r) => r.method === "POST");
    expect(posts.length).toBeGreaterThanOrEqual(3);
    for (const request of posts) {
      expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(request.headers["x-system-key"]).toBeUndefined();
    }
    expect(posts[0].headers["mcp-protocol-version"]).toBeUndefined();
    for (const request of posts.slice(1)) {
      expect(request.headers["mcp-protocol-version"]).toBe(PROTOCOL_VERSION);
    }
  });

  it("turns a 401 into error -32001 for that request id and keeps running", async () => {
    await start();
    remote.setMode("unauthorized");
    io.send(INITIALIZE);
    const rejected = await io.response(1);
    expect(rejected).toMatchObject({ jsonrpc: "2.0", id: 1, error: { code: API_KEY_REJECTED } });
    expect((rejected as { error: { message: string } }).error.message).toContain("https://cryptoquant.com/account/api");

    remote.setMode("ok");
    io.send({ ...INITIALIZE, id: 11 });
    expect(await io.response(11)).toHaveProperty("result");
  });

  it("turns a 5xx into error -32603 for that request id and keeps running", async () => {
    await start();
    remote.setMode("server-error");
    io.send(LIST_TOOLS);
    expect(await io.response(2)).toMatchObject({ id: 2, error: { code: UPSTREAM_ERROR } });

    remote.setMode("ok");
    io.send({ ...LIST_TOOLS, id: 12 });
    expect(await io.response(12)).toHaveProperty("result");
  });

  it("turns an unreachable server into error -32603", async () => {
    await start(await unusedLocalUrl());
    io.send(LIST_TOOLS);
    expect(await io.response(2)).toMatchObject({ id: 2, error: { code: UPSTREAM_ERROR } });
  });

  it("never includes the API key in errors or logs", async () => {
    const previousDebug = process.env.DEBUG;
    process.env.DEBUG = "1";
    try {
      const all: JSONRPCMessage[] = [];
      const run = async (url: URL, timeout: number | undefined, id: number, message: JSONRPCMessage, mode?: "unauthorized" | "server-error") => {
        io = createHarness();
        await start(url, timeout);
        if (mode) remote.setMode(mode);
        io.send({ ...message, id });
        await io.response(id, 3_000);
        await proxy!.close();
        remote.setMode("ok");
        all.push(...io.messages);
      };

      await run(await unusedLocalUrl(), undefined, 21, LIST_TOOLS);
      await run(remote.url, undefined, 22, LIST_TOOLS, "unauthorized");
      await run(remote.url, undefined, 23, LIST_TOOLS, "server-error");
      await run(remote.url, 200, 24, { jsonrpc: "2.0", id: 24, method: "tools/call", params: { name: "hang", arguments: {} } });

      expect(all).toHaveLength(4);
      expect(JSON.stringify(all)).not.toContain(API_KEY);
      expect(stderr.join("\n")).not.toContain(API_KEY);
    } finally {
      if (previousDebug === undefined) delete process.env.DEBUG;
      else process.env.DEBUG = previousDebug;
    }
  });

  it("redacts a key that undici rejects as an invalid header value", async () => {
    const badKey = "SECRET\nKEY-123";
    proxy = await startProxy({ url: remote.url, apiKey: badKey, stdin: io.stdin, stdout: io.stdout });
    io.send(LIST_TOOLS);
    const response = await io.response(2);
    expect(response).toHaveProperty("error");
    await new Promise((resolve) => setTimeout(resolve, 100));
    for (const text of [JSON.stringify(io.messages), stderr.join("\n")]) {
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain("KEY-123");
    }
  });

  it("times out a request the remote never answers", async () => {
    await start(remote.url, 300);
    io.send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "hang", arguments: {} } });
    const timedOut = await io.response(5, 3_000);
    expect(timedOut).toMatchObject({ id: 5, error: { code: UPSTREAM_ERROR } });
    expect((timedOut as { error: { message: string } }).error.message).toMatch(/did not respond/);
  });

  it("drops a response that arrives after the timeout", async () => {
    await start(remote.url, 200);
    io.send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "slow", arguments: { ms: 600 } } });
    await io.response(6, 3_000);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const answers = io.messages.filter((m) => "id" in m && m.id === 6);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ error: { code: UPSTREAM_ERROR } });
    expect(stderr.join("\n")).toContain("Dropping a late");
  });

  it("does not time out a request the client cancelled", async () => {
    await start(remote.url, 300);
    io.send({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "hang", arguments: {} } });
    await vi.waitFor(() => expect(remote.requests.length).toBeGreaterThan(0));
    io.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7, reason: "user" } });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(io.messages.filter((m) => "id" in m && m.id === 7)).toEqual([]);
    expect(remote.requests.some((r) => JSON.stringify(r.body).includes("notifications/cancelled"))).toBe(true);
  });

  it("restarts the timer when a client reuses a pending request id", async () => {
    await start(remote.url, 400);
    const hang = { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "hang", arguments: {} } } as const;
    io.send(hang);
    await new Promise((resolve) => setTimeout(resolve, 250));
    io.send(hang);
    await new Promise((resolve) => setTimeout(resolve, 250));
    // 500ms after the first send: the first timer must have been cleared.
    expect(io.messages.filter((m) => "id" in m && m.id === 8)).toEqual([]);
    await io.response(8, 3_000);
  });

  it("does not answer a notification that failed to forward", async () => {
    await start();
    remote.setMode("server-error");
    io.send(INITIALIZED);
    await vi.waitFor(() => expect(remote.requests.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(io.messages).toEqual([]);
    expect(stderr.join("\n")).toContain("notifications/initialized");
  });

  it("resolves closed when stdin ends", async () => {
    await start();
    io.stdin.end();
    await expect(proxy!.closed).resolves.toBeUndefined();
  });
});
