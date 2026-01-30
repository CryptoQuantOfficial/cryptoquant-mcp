# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the CryptoQuant team via [cryptoquant.com/contact](https://cryptoquant.com/contact)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- Acknowledgment within 48 hours
- Regular updates on the progress
- Credit in the security advisory (if desired)

### Scope

This security policy applies to:
- `cryptoquant-mcp` npm package
- This GitHub repository
- Claude Skills and Agents in this repo

### Out of Scope

- CryptoQuant API (report to [cryptoquant.com](https://cryptoquant.com))
- Third-party dependencies (report to respective maintainers)

## Security Best Practices for Users

### API Key Safety

- Never commit API keys to version control
- Use environment variables: `CRYPTOQUANT_API_KEY`
- Credentials are stored securely at `~/.cryptoquant/credentials` with 0600 permissions

### MCP Server

- Always use the official npm package: `cryptoquant-mcp`
- Verify package integrity before installation
- Keep dependencies updated

## Acknowledgments

We thank the security research community for helping keep CryptoQuant Skills secure.
