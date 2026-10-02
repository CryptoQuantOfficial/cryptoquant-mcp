import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_INSTRUCTIONS, startFakeRemote, type FakeRemote } from "./helpers/fake-remote.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const ENTRY = ["--import", "tsx", "src/index.ts"];
const API_KEY = "cq-cli-key-SECRET-5678";

function baseEnv(home: string): Record<string, string> {
  return { PATH: process.env.PATH ?? "", HOME: home };
}

function emptyHome(): string {
  return mkdtempSync(join(tmpdir(), "cq-cli-home-"));
}

function runCli(env: Record<string, string>, { endStdin = true } = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ENTRY, { cwd: repoRoot, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (endStdin) setTimeout(() => child.stdin.end(), 1_500);
  });
}

describe("cryptoquant-mcp CLI", () => {
  let remote: FakeRemote;

  beforeEach(async () => {
    remote = await startFakeRemote();
  });

  afterEach(async () => {
    await remote.close();
  });

  it("exits 1 with setup instructions on stderr when no key is configured", async () => {
    const result = await runCli(baseEnv(emptyHome()), { endStdin: false });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("CRYPTOQUANT_API_KEY");
    expect(result.stderr).toContain("https://cryptoquant.com/account/api");
    expect(result.stderr).toContain("https://mcp.cryptoquant.com/mcp");
  });

  it("exits 1 when CRYPTOQUANT_MCP_URL is plain http to a non-loopback host", async () => {
    const env = { ...baseEnv(emptyHome()), CRYPTOQUANT_API_KEY: API_KEY, CRYPTOQUANT_MCP_URL: "http://example.com/mcp" };
    const result = await runCli(env, { endStdin: false });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("must use https");
    expect(result.stderr).not.toContain(API_KEY);
  });

  it("exits 1 without echoing a key that contains control characters", async () => {
    const env = { ...baseEnv(emptyHome()), CRYPTOQUANT_API_KEY: "SECRET-\u0001-KEY", CRYPTOQUANT_MCP_URL: remote.url.href };
    const result = await runCli(env, { endStdin: false });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("invalid characters");
    expect(result.stderr).not.toContain("SECRET");
  });

  it("exits 0 when stdin closes", async () => {
    const env = { ...baseEnv(emptyHome()), CRYPTOQUANT_API_KEY: API_KEY, CRYPTOQUANT_MCP_URL: remote.url.href };
    const result = await runCli(env);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(API_KEY);
  });

  it("serves a real MCP client end to end, using the 0.x credentials file", async () => {
    const home = emptyHome();
    mkdirSync(join(home, ".cryptoquant"));
    writeFileSync(join(home, ".cryptoquant", "credentials"), JSON.stringify({ api_key: API_KEY }));

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ENTRY,
      cwd: repoRoot,
      env: { ...baseEnv(home), CRYPTOQUANT_MCP_URL: remote.url.href },
      stderr: "pipe",
    });
    const client = new Client({ name: "cli-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      expect(client.getInstructions()).toBe(FAKE_INSTRUCTIONS);
      expect(client.getServerVersion()?.name).toBe("fake-cryptoquant");
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(["echo", "hang", "slow"]);
      const result = await client.callTool({ name: "echo", arguments: { text: "hello" } });
      expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    } finally {
      await client.close();
    }

    const posts = remote.requests.filter((r) => r.method === "POST");
    expect(posts.every((r) => r.headers.authorization === `Bearer ${API_KEY}`)).toBe(true);
    expect(posts.some((r) => r.headers["x-system-key"] !== undefined)).toBe(false);
  });

  it("exits 0 on stdin EOF while the remote's GET SSE stream is open", async () => {
    const sse = await startFakeRemote({ getSse: true });
    try {
      const env = { ...baseEnv(emptyHome()), CRYPTOQUANT_API_KEY: API_KEY, CRYPTOQUANT_MCP_URL: sse.url.href };
      // Raw JSON-RPC rather than an SDK client: the test controls exactly when stdin ends and
      // can assert the child's own exit code.
      const child = spawn(process.execPath, ENTRY, { cwd: repoRoot, env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      child.stdout.on("data", (d) => (stdout += d));
      const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
      const send = (m: object) => child.stdin.write(JSON.stringify(m) + "\n");

      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sse-test", version: "0.0.0" } },
      });
      await vi.waitFor(() => expect(stdout).toContain('"id":1'), { timeout: 10_000 });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      await vi.waitFor(() => expect(sse.requests.some((r) => r.method === "GET")).toBe(true), { timeout: 10_000 });
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "echo", arguments: { text: "hi" } } });
      await vi.waitFor(() => expect(stdout).toContain('"id":2'), { timeout: 10_000 });

      child.stdin.end();
      expect(await exited).toBe(0);
    } finally {
      await sse.close();
    }
  });
});
