# CryptoQuant MCP Server

<p align="center">
  <strong>On-Chain Analytics for Claude and AI Coding Agents</strong>
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#mcp-tools">MCP Tools</a> •
  <a href="#authentication">Authentication</a>
</p>

---

## What is this?

CryptoQuant MCP Server brings on-chain analytics directly into your AI assistant:

- **Natural language queries**: Ask in any language - "비트코인 가격 전망?" or "Is BTC overvalued?"
- **Real-time metrics**: MVRV, SOPR, Exchange Flows, Funding Rates
- **Market insights**: AI-powered interpretation of on-chain data
- **Whale tracking**: Monitor large holder movements

---

## Installation

### Quick Start (Claude Desktop, Cursor, etc.)

**Step 1**: Add to your MCP config file:

| App | Config File |
|-----|-------------|
| **Claude Desktop (Mac)** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop (Windows)** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Claude Code** | `~/.claude/mcp.json` or project `.mcp.json` |
| **Cursor** | Project `.cursor/mcp.json` |

```json
{
  "mcpServers": {
    "cryptoquant": {
      "command": "npx",
      "args": ["-y", "cryptoquant-mcp"]
    }
  }
}
```

**Step 2**: Restart your app

**Step 3**: Call `initialize()` to verify connection. Done!

### Local Development

For contributors:

```bash
git clone https://github.com/CryptoQuantOfficial/cryptoquant-mcp.git
cd cryptoquant-mcp
npm install && npm run build
```

---

## MCP Tools

The MCP server provides these tools for API access:

| Tool | Description |
|------|-------------|
| `initialize` | Start session with API key, returns plan info |
| `discover_endpoints` | Browse 245+ available endpoints |
| `get_endpoint_info` | Get endpoint parameter details |
| `query_data` | Query raw API data |
| `describe_metric` | Get metric descriptions and thresholds |
| `list_assets` | List supported assets |
| `reset_session` | Clear session (logout) |

### Supported Assets

BTC, ETH, ALT, Stablecoin, ERC20, TRX, XRP

---

## Natural Language Queries

Ask questions in any language - Claude will route to the right metrics:

| Query | Intent | Metric |
|-------|--------|--------|
| "비트코인 가격 전망이 어때?" | VALUATION | MVRV |
| "Is BTC overvalued?" | VALUATION | MVRV |
| "고래들 움직임 보여줘" | WHALE_ACTIVITY | whale-ratio |
| "What's the funding rate?" | LEVERAGE | funding-rates |
| "익절/손절 상황?" | PROFIT_BEHAVIOR | SOPR |

---

## Authentication

### Option A. Environment Variable (Recommended)

Add your API key to the MCP config:

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

### Option B. Direct Parameter

Call `initialize()` with your API key:

```
initialize(api_key="your-api-key")
```

The key will be saved to `~/.cryptoquant/credentials` for future sessions.

**Get your API key**: [https://cryptoquant.com/settings/api](https://cryptoquant.com/settings/api)

### Managing Credentials

```bash
# Switch accounts
reset_session(clear_stored=true)
initialize(api_key="new-api-key")
```

---

## Requirements

| Component | Requirement |
|-----------|-------------|
| Node.js | v18+ |
| API Access | [CryptoQuant API key](https://cryptoquant.com/settings/api) |

---

## License

MIT License - see [LICENSE](LICENSE)

---

## Development

### Setup

After cloning the repository, install dependencies to set up git hooks:

```bash
npm install
```

This automatically configures [husky](https://typicode.github.io/husky/) for pre-commit hooks.

### Pre-commit Hooks

When committing changes to `src/`, ESLint runs automatically:

- Lint check runs only when files in `src/` are staged
- Commit is blocked if lint errors are found
- Fix errors before committing: `npm run lint`

---

<p align="center">
  <a href="https://cryptoquant.com">CryptoQuant</a> •
  <a href="https://docs.cryptoquant.com">Docs</a> •
  <a href="https://github.com/CryptoQuantOfficial/cryptoquant-mcp/issues">Issues</a>
</p>
