# Contributing to CryptoQuant MCP Server

Thank you for your interest in contributing to CryptoQuant MCP Server! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- [CryptoQuant API key](https://cryptoquant.com/settings/api)

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
├── src/
│   ├── auth/           # Authentication logic
│   ├── cache/          # Caching utilities
│   ├── data/           # Static data files
│   ├── tools/          # MCP tool implementations
│   ├── config.ts       # Configuration
│   ├── discovery.ts    # Endpoint discovery
│   ├── index.ts        # Entry point
│   ├── permissions.ts  # API permissions
│   ├── plan-limits.ts  # Plan-based rate limits
│   └── utils.ts        # Utility functions
├── dist/               # Build output
├── package.json
├── tsconfig.json
└── eslint.config.js
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

#### MCP Tools
- Add new tools in `src/tools/`
- Improve existing tool functionality
- Add new endpoint support

#### Core Features
- Improve authentication in `src/auth/`
- Enhance caching in `src/cache/`
- Fix bugs or improve error handling

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
