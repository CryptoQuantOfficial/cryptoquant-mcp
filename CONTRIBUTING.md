# Contributing to CryptoQuant MCP Server

Thank you for your interest in contributing to CryptoQuant MCP Server! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- [CryptoQuant API key](https://cryptoquant.com/account/api)

### Local Development Setup

```bash
# Clone the repository
git clone https://github.com/CryptoQuantOfficial/cryptoquant-mcp.git
cd cryptoquant-mcp

# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## Project Structure

```
cryptoquant-mcp/
├── plugin.json         # Agent Plugins manifest
├── mcp.json            # Remote MCP server for the plugin
├── skills/             # Agent skills shipped with the plugin
├── src/
│   ├── index.ts        # Entry point: resolve URL and key, start the proxy
│   ├── api-key.ts      # API key resolution
│   ├── config.ts       # Server URL validation
│   ├── proxy.ts        # stdio <-> Streamable HTTP relay
│   └── utils.ts        # stderr logger
├── test/               # Integration tests, schemas, fixtures
├── package.json
├── tsconfig.json
└── eslint.config.mjs
```

## How to Contribute

### Reporting Issues

- Use [GitHub Issues](https://github.com/CryptoQuantOfficial/cryptoquant-mcp/issues)
- Include steps to reproduce
- Provide error messages and logs

### Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Run lint: `npm run lint`
5. Commit with conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`
6. Push and create a Pull Request

### Contribution Areas

#### Tools

Tools live in the remote server, not in this repository. Report tool issues here and we will route them.

#### Plugin and proxy

- Improve the `cryptoquant-onchain` skill (`skills/`)
- Proxy reliability and error messages (`src/proxy.ts`)
- Documentation and client setup guides

#### Documentation
- Improve README.md
- Add examples and tutorials

## Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build TypeScript to dist/ |
| `npm run dev` | Run in watch mode |
| `npm run lint` | Run ESLint |
| `npm run test` | Run tests with Vitest |
| `npm run sync:metric-ids` | Refresh test/fixtures/metric-ids.txt from a local server clone |
| `npm start` | Run built server |

### Pre-commit Hooks

When committing changes to `src/`, ESLint runs automatically via husky:

- Commit is blocked if lint errors are found
- Fix errors before committing: `npm run lint`

## Code Style

- Use TypeScript
- Follow existing patterns in the codebase
- Keep functions small and focused
- Add comments for complex logic

## Commit Convention

```
feat: add new feature
fix: bug fix
docs: documentation update
refactor: code refactoring
test: add or update tests
chore: maintenance tasks
```

## Questions?

- Open an [issue](https://github.com/CryptoQuantOfficial/cryptoquant-mcp/issues)
- Check existing issues for similar questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
