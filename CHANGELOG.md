# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0-beta.1] - 2026-10-02

Pre-release of 1.0.0. Install with `npx -y cryptoquant-mcp@beta`.

### Changed (breaking)

- The npm package is now a stdio proxy to the remote CryptoQuant MCP server (`https://mcp.cryptoquant.com/mcp`). Tools are served by the remote server, so local and remote installs expose the same tools.
- An API key is required. Set `CRYPTOQUANT_API_KEY`; a key saved by 0.x in `~/.cryptoquant/credentials` is still read. Without a key the proxy prints setup instructions and exits.
- Removed the `initialize` and `reset_session` tools.
- Removed the JavaScript library exports.

### Added

- QuickTake and Research tools (`recent_research`, `recent_quicktake`, `query_research`, `query_quicktake`) through the remote server.
- Agent Plugins manifest (`plugin.json`), `mcp.json` for the remote server, and the `cryptoquant-onchain` skill.
- `mcpName` in package.json so the npm package can be listed on the official MCP Registry entry `com.cryptoquant/mcp-server`.
- `CRYPTOQUANT_MCP_URL` to point the proxy at another server (https, or http on a loopback address).

## [0.2.0]

- Local stdio MCP server with endpoint discovery, data queries, and metric descriptions.
