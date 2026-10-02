# CryptoQuant MCP

[![npm version](https://img.shields.io/npm/v/cryptoquant-mcp.svg)](https://www.npmjs.com/package/cryptoquant-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

CryptoQuant on-chain, market, and derivatives data, plus CryptoQuant Research and QuickTake insights, for AI agents through the [Model Context Protocol](https://modelcontextprotocol.io).

There are two ways to connect:

- **Remote server (recommended):** `https://mcp.cryptoquant.com/mcp`. You sign in with OAuth, so there is nothing to install and no API key in your config.
- **Local server:** the `cryptoquant-mcp` npm package, for clients that only support local (stdio) servers. Requires an API key.

<!-- TODO: demo GIF (to be recorded by the CryptoQuant team) -->

## Remote server (recommended)

Server URL: `https://mcp.cryptoquant.com/mcp` (Streamable HTTP, OAuth)

The first time you connect, your client opens a CryptoQuant sign-in page. More setup details: [CryptoQuant user guide](https://userguide.cryptoquant.com/api/mcp-server-beta/remote-mcp-recommended).

### Claude (claude.ai and Claude Desktop)

Open **Settings → Connectors → Add custom connector** and paste the server URL.

### ChatGPT

Add a custom connector with the server URL (developer mode). Availability depends on your ChatGPT plan.

### Cursor

Install the **CryptoQuant** plugin from the Cursor marketplace (once listed). It adds the remote server and a skill that maps common market questions to the right metrics.

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

## Local server (npm)

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

If you don't set `CRYPTOQUANT_API_KEY`, call `initialize(api_key="your-api-key")` once. The key is saved to `~/.cryptoquant/credentials` for later sessions. To switch accounts, call `reset_session(clear_stored=true)` and then `initialize` again.

| App | Config file |
| --- | --- |
| Claude Desktop (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json` |
| Claude Code | project `.mcp.json` |

## Tools

The remote server provides these tools. The list is for reference and may change.

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

The current local server (0.2.x) provides the first five tools plus `initialize` and `reset_session`. Research and QuickTake tools are available on the remote server.

## Assets, dates, and rate limits

- **Assets:** BTC, ETH, XRP, TRX, stablecoins, ERC-20 tokens, and other altcoins. `list_assets` returns the current list.
- **Dates:** `yyyyMMdd` for `window=day` (e.g. `20260115`), `yyyyMMddTHHmmss` for other windows (e.g. `20260115T000000`).
- **Rate limits and history:** depend on your CryptoQuant plan. See [plans](https://cryptoquant.com/pricing).

## Development

```bash
git clone https://github.com/CryptoQuantOfficial/cryptoquant-mcp.git
cd cryptoquant-mcp
npm install
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
