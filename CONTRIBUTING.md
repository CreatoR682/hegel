# Contributing to Hegel

Thank you for your interest in contributing to Hegel! This document outlines how to work on the Hegel source code and run tests.

## Quality And Packaging

- **Test suite**: We maintain a comprehensive test suite using Vitest.
- **Coverage thresholds**: We aim for 80% lines, functions, branches, and statements.
- **CI**: GitHub Actions runs tests on Node 20.x and 22.x.
- **npm package**: The published package ships the compiled `dist/`, the root schema, and the current VSIX only.

## Work In The Hegel Source Repo

The Hegel repo runs hooks and MCP from the local `dist/` directory, not from `node_modules`.

After making source changes in the root project:

```bash
npm run build
```

After making changes to the VS Code extension (`hegel-vscode`) or the schema:

```bash
cd hegel-vscode
npm run build
npm run package
```

Install the `.vsix` path printed when packaging finishes, for example from `hegel-vscode/`:

```bash
cursor --install-extension ./hegel-companion-<version>.vsix
```

Use the `version` from `hegel-vscode/package.json` (the filename is `hegel-companion-<version>.vsix`).

Then fully quit and reopen Cursor so the hook runtime, MCP, and extension-host state reload cleanly.

> **Warning:** `node dist/setup.js .` (or `init .` with `--force`) rewrites `.cursor/hooks.json` and `.cursor/mcp.json` in the target project. In this repo, only run that when you intend to refresh those files (they should contain portable `dist/...` paths, not absolute paths).
