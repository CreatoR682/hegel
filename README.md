# Hegel Companion

**Dialectical companion for AI-assisted development.**

Hegel sits alongside your Cursor IDE sessions and provides real-time critical thinking oversight — catching lazy prompts, flagging overconfident AI responses, tracking session quality degradation, and nudging you to maintain engineering rigor.

Named after Georg Wilhelm Friedrich Hegel's dialectical method: every thesis (your prompt) deserves an antithesis (critical review) before reaching synthesis (better code).

## Two-Layer Analysis

### Layer 1: Fast Rule-Based Checks (command hooks)
Runs in milliseconds, zero cost. Always active.

- Detects vague/lazy prompts ("fix it", "do the same", single-word confirmations)
- Catches prompt quality degradation over the session
- Flags rapid-fire prompting without review pauses
- Tracks scope creep and untested changes
- Detects overconfident AI language and sycophancy patterns
- Session fatigue warnings
- Tuned heuristics for common workflows: attached-plan execution (fewer spurious `missing-criteria` nags), release/install/consumer threads (fewer spurious `context-drift` flags), and pruning stale test warnings after later verification evidence

### Layer 2: LLM Deep Analysis (prompt hooks)
Uses your Cursor subscription models. Optional, configurable.

- **Important Limitation:** Because of how Cursor currently implements `type: "prompt"` hooks, Layer 2 LLM evaluations are only presented as ephemeral blocking UI popups in the chat. They are *not* recorded in the session history and do not appear in the Hegel dashboard or MCP tools.
- When you pick a concrete model in settings (anything other than `auto`), setup regenerates `.cursor/hooks.json` so Layer 2 hooks request that routing ID explicitly.
- Nuanced prompt quality evaluation beyond pattern matching
- Contextual assessment of whether a prompt has enough detail for its intent
- AI response review for missing edge cases, security blind spots, and scope creep
- Detects when you're blindly continuing from a previous AI response

## Setup

### Installation

Install the package and run the setup CLI from your Cursor project root. Hegel automatically detects and supports `npm`, `pnpm`, `yarn`, and `bun` based on your project lockfiles.

Using npm as an example:

```bash
npm install --save-dev @hegel-dev/companion
npx hegel-companion init .
```

Or, for a one-shot install without adding a dependency:

```bash
npx -p @hegel-dev/companion hegel-companion init .
```

> **Note:** This package was previously published as `hegel-companion`. That name is now deprecated — use `@hegel-dev/companion` for new installs. The CLI command (`hegel-companion`) is unchanged.

The bundled sidebar VSIX declares **`engines.vscode` ^1.105.0** with **`@types/vscode` ~1.105.0**, aligned with Cursor builds that report VS Code **1.105.x** (see `hegel-vscode/package.json`).

**Current npm release:** The version in the root `package.json` is what ships to npm as [`@hegel-dev/companion`](https://www.npmjs.com/package/@hegel-dev/companion); use `CHANGELOG.md` for release notes.

**Developing this repository:** After `npm run build`, `node dist/setup.js . --force` (same as `hegel-companion init . --force`) regenerates `.cursor/hooks.json` and `.cursor/mcp.json` with **repo-root-relative** `dist/hook.js` and `dist/mcp.js` paths, so those files stay portable across machines when committed.

This single command will:
1. Generate `.cursor/hooks.json` to wire up the analysis layers.
2. Scaffold a default `hegel.config.json` in your project root.
3. Register the `hegel-mcp` server in `.cursor/mcp.json`.
4. Install the Hegel Cursor extension for the sidebar dashboard.
5. Add a `.cursor/rules/hegel-companion.mdc` rule so the AI knows how to use the MCP tools.

### Update An Existing Install

For projects that already have Hegel installed:

```bash
npm install @hegel-dev/companion@latest
npx -p @hegel-dev/companion hegel-companion update .
```

If an older local install does not recognize `update`, run the same two commands
above. The first command upgrades the CLI; the second refreshes hooks, MCP, and
the bundled sidebar extension.

### Clean Up Old Sessions

To recompute session states and prune stale concerns or bugs from older versions, run:

```bash
npx -p @hegel-dev/companion hegel-companion cleanup .
```

### Uninstall

To completely remove Hegel from a project, run:

```bash
npx -p @hegel-dev/companion hegel-companion uninstall .
```

This command will:
1. Remove `hegel.config.json` and `.hegel-state/`.
2. Remove `.cursor/rules/hegel-companion.mdc`.
3. Clean up `.cursor/hooks.json` and `.cursor/mcp.json` (removing them entirely if they are empty).
4. Clean up Hegel-specific settings from `.vscode/settings.json`.
5. Clean up Hegel-specific entries from `.gitignore`.
6. Uninstall the VS Code extension from Cursor.
7. Uninstall the `@hegel-dev/companion` npm package.

### Configure

The easiest way to configure Hegel is through the **Cursor Settings UI**:

1. Open Settings (`Cmd/Ctrl + ,`)
2. Search for **"Hegel"**
3. Adjust your model, strictness, and other preferences.

These settings automatically sync to a `hegel.config.json` file in your project root, which you can commit to version control to share team-wide standards.

*(Note: Configuration changes are automatically detected when you start a new chat session).*

## Architecture

Hegel operates as a local, privacy-first system:
- **Hooks**: Intercepts prompts and responses via Cursor's `.cursor/hooks.json`.
- **State**: Session state is stored locally in `.hegel-state/` as JSON files.
- **MCP Server**: Provides `hegel-status` and `hegel-review` tools to the AI.
- **Cursor Extension**: Reads the local state to power the sidebar dashboard and status bar.

## Philosophy

> "The owl of Minerva spreads its wings only with the falling of the dusk."
> — Hegel, *Philosophy of Right*

Unlike Minerva's owl, Hegel doesn't wait for dusk. It watches in real time, helping you think critically *during* the creative process, not only in retrospect.

## License

MIT
