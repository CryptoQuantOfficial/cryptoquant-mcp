import { PassThrough } from "node:stream";

import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { vi } from "vitest";

export interface Harness {
  stdin: PassThrough;
  stdout: PassThrough;
  messages: JSONRPCMessage[];
  send(message: JSONRPCMessage): void;
  response(id: string | number, timeoutMs?: number): Promise<JSONRPCMessage>;
}

export function createHarness(): Harness {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const messages: JSONRPCMessage[] = [];
  let buffer = "";

  stdout.setEncoding("utf-8");
  stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) messages.push(JSON.parse(line) as JSONRPCMessage);
    }
  });

  return {
    stdin,
    stdout,
    messages,
    send: (message) => {
      stdin.write(JSON.stringify(message) + "\n");
    },
    response: (id, timeoutMs = 5_000) =>
      vi.waitFor(
        () => {
          const found = messages.find((m) => "id" in m && m.id === id && !("method" in m));
          if (!found) throw new Error(`no response for id ${String(id)} yet`);
          return found;
        },
        { timeout: timeoutMs, interval: 10 },
      ),
  };
}
