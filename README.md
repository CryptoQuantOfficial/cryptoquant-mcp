# CryptoQuant MCP

[![npm version](https://img.shields.io/npm/v/cryptoquant-mcp.svg)](https://www.npmjs.com/package/cryptoquant-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

CryptoQuant on-chain, market, and derivatives data, plus CryptoQuant Research and QuickTake insights, for AI agents through the [Model Context Protocol](https://modelcontextprotocol.io).

This repository contains:

- **Remote server setup** for `https://mcp.cryptoquant.com/mcp` (recommended; you sign in with OAuth)
- **An Agent Plugins / Cursor plugin** (`plugin.json`, `mcp.json`, `skills/`) that connects to the remote server and teaches the agent which metric answers which question
- **A local stdio proxy** (`npx cryptoquant-mcp`) for clients that cannot connect to remote MCP servers. It forwards every message to the remote server unchanged.

<!-- TODO: demo GIF (to be recorded by the CryptoQuant team) -->

## Remote server (recommended)

Server URL: `https://mcp.cryptoquant.com/mcp` (Streamable HTTP, OAuth)

No API key is needed in your config. The first time you connect, your client opens a CryptoQuant sign-in page. More setup details: [CryptoQuant user guide](https://userguide.cryptoquant.com/api/mcp-server-beta/remote-mcp-recommended).

### Claude (claude.ai and Claude Desktop)

Open **Settings → Connectors → Add custom connector** and paste the server URL.

### ChatGPT

Add a custom connector with the server URL (developer mode). Availability depends on your ChatGPT plan.

### Cursor

Install the **CryptoQuant** plugin from the Cursor marketplace (once listed). It adds the remote server and the `cryptoquant-onchain` skill.

Or add the server yourself in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "cryptoquant": {
      "url": "https://mcp.cryptoquant.com/mcp"
    }
  }
}
```

### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "cryptoquant": {
      "type": "http",
      "url": "https://mcp.cryptoquant.com/mcp"
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http cryptoquant https://mcp.cryptoquant.com/mcp
```

Then run `/mcp` in Claude Code to sign in.

## Local install (npx proxy)

For clients that only support local (stdio) servers. Requires Node.js 18+ and a [CryptoQuant API key](https://cryptoquant.com/account/api).

```json
{
  "mcpServers": {
    "cryptoquant": {
      "command": "npx",
      "args": ["-y", "cryptoquant-mcp"],
      "env": {
        "CRYPTOQUANT_API_KEY": "your-api-key"
      }
    }
  }
}
```

| App | Config file |
| --- | --- |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json` |
| Claude Code | project `.mcp.json` |

| Variable | Required | Description |
| --- | --- | --- |
| `CRYPTOQUANT_API_KEY` | Yes | Your API key, sent to the remote server as a bearer token. If it is not set, the key saved by 0.x in `~/.cryptoquant/credentials` is used. |
| `CRYPTOQUANT_MCP_URL` | No | Overrides the server URL (default `https://mcp.cryptoquant.com/mcp`). Must be `https`; plain `http` is accepted only for loopback addresses (`localhost`, `127.0.0.1`, `[::1]`). |

Without a key, the proxy prints setup instructions to stderr and exits.

## Tools

The tools come from the remote server. This list is for reference and may change.

| Tool | Description |
| --- | --- |
| `discover_endpoints` | Find data endpoints by asset and category |
| `get_endpoint_info` | Parameters of an endpoint (window, exchange, token, ...) |
| `query_data` | Query on-chain, market, and derivatives data |
| `describe_metric` | Definition, thresholds, and interpretation of a metric |
| `list_assets` | Supported assets |
| `recent_research` | Latest CryptoQuant Research articles |
| `recent_quicktake` | Latest QuickTake articles from CryptoQuant Verified Authors |
| `query_research` | Search Research articles by topic |
| `query_quicktake` | Search QuickTake articles by topic |

## Assets, dates, and rate limits

- **Assets:** BTC, ETH, XRP, TRX, stablecoins, ERC-20 tokens, and other altcoins. `list_assets` returns the current list.
- **Dates:** `yyyyMMdd` for `window=day` (e.g. `20260115`), `yyyyMMddTHHmmss` for other windows (e.g. `20260115T000000`).
- **Rate limits and history:** depend on your CryptoQuant plan. The server tells the agent your plan's limits when it connects. See [plans](https://cryptoquant.com/pricing).

## Migrating from 0.x

1.0 turns the npm package into a proxy to the remote server, so the local and remote servers now offer the same tools.

- The `initialize` and `reset_session` tools are removed. Set `CRYPTOQUANT_API_KEY` in your MCP config instead. A key you saved in 0.x with `initialize(api_key=...)` keeps working; it is read from `~/.cryptoquant/credentials`.
- QuickTake and Research tools are now available locally.
- The package no longer exports a JavaScript library API.
- `CRYPTOQUANT_API_URL` (the 0.x API base URL override) is no longer used; use `CRYPTOQUANT_MCP_URL` to point at another MCP server.
- `npx -y cryptoquant-mcp` always fetches the latest version, so existing configs switch to 1.0 on the next start. Prompts or workflows that call `initialize` need to be updated.

See [CHANGELOG.md](CHANGELOG.md).

## Development

```bash
git clone https://github.com/CryptoQuantOfficial/cryptoquant-mcp.git
cd cryptoquant-mcp
npm install
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
