# Changelog

All notable changes to this project will be documented in this file.

## [1.0.22] - 2026-05-17
- docs: Refresh README and CONTRIBUTING for npm version source-of-truth, source-repo portable paths, and VSIX install flow.
- chore: Add `homepage` and `bugs` to `package.json`; align `.cursor-plugin/plugin.json` version with the shipped release.

## [1.0.21] - 2026-05-17
- fix: Source-repo `init` now writes portable hook and MCP paths (`dist/hook.js`, `dist/mcp.js`) instead of absolute filesystem paths, so clones and open-source checkouts do not embed machine-specific locations.

## [1.0.20] - 2026-05-17
- fix: `init` and `update` commands now explicitly verify that `@hegel-dev/companion` is installed in `node_modules` before scaffolding hooks, preventing broken one-shot installs.

## [1.0.19] - 2026-05-17
- fix: Fix a bug where hot-reloading the configuration would rewrite `.cursor/hooks.json` with an absolute path to the global npm cache instead of a relative path to `node_modules`.

## [1.0.18] - 2026-05-17
- feat: Layer 1 now detects and blocks "raw dumps" (large copy-pastes without instructions).
- feat: Layer 1 now escalates pronoun warnings ("it", "this") to warnings if the session context has been heavily compacted.

## [1.0.17] - 2026-05-16
- fix: `uninstall` command now also removes `.cursor/hooks.json`, `.cursor/mcp.json`, and `.cursor/rules/hegel-companion.mdc` from `.gitignore`.

## [1.0.16] - 2026-05-16
- fix: Fix a race condition in `uninstall` where the still-running VS Code extension would re-create `hegel.config.json` immediately after deletion due to settings synchronization.

## [1.0.15] - 2026-05-16
- fix: `uninstall` command now also removes empty `.cursor/rules`, `.cursor`, and `.vscode` directories if they become empty after cleanup.

## [1.0.14] - 2026-05-16
- fix: Update CLI help messages to explicitly recommend `npx -p @hegel-dev/companion hegel-companion` to prevent accidental downloads of the deprecated `hegel-companion` package.

## [1.0.13] - 2026-05-16
- fix: `uninstall` command now also cleans up Hegel-specific entries from `.vscode/settings.json` and `.gitignore`.

## [1.0.12] - 2026-05-16
- feat: Add `uninstall` command to completely remove Hegel from a project.

## [1.0.11] - 2026-05-16
- feat: Add explicit `[Layer 1]` and `[Layer 2]` markers to UI output and sidebar concerns tree to distinguish between fast rule-based checks and LLM deep analysis.
- test: Increase E2E test timeouts to fix Windows CI flakiness.
- test: Add test coverage for the `cleanup` command, raising global branch coverage above 80%.
- docs: Separate maintainer publishing instructions from general contributor guidelines.

## [1.0.10] - 2026-05-01
- Dependency refresh (root + `hegel-vscode`): TypeScript **6**, Vitest **4.1.5**, `@types/node` **25**, `@vscode/vsce` updates; extension `tsconfig` sets `"types": ["vscode", "node"]` for TS 6.
- **`@types/vscode` pinned with `~1.105.0` and `engines.vscode` `^1.105.0`** so the VSIX installs on current Cursor (VS Code **1.105.x**); avoid `^1.105` on typings alone — npm would float to **1.118+** and break packaging or install.

## [1.0.9]
- Removed `observeOnly` mode as it was ineffective for LLM hooks and bypassed the companion's core purpose.
- Sidebar UI renamed "Layer 2" to "Hegel" and "Main Chat" to "Agent".
- `cleanup` command added for session state recomputation.
- `pnpm`/`yarn`/`bun` support added to `init`/`update`.
- Automated E2E tests added to GitHub CI.

## [1.0.8]
- Documentation for Layer 2 `model` passthrough into regenerated `hooks.json`.
- VSIX and package version alignment (no runtime logic change from 1.0.7).

## [1.0.7]
- Layer 1 false-positive reductions (plan execution, release/install thread).
- Expanded verification detection.
- `pruneSupersededConcernsFromState` wired in hooks and stop.
- Documentation single-source (`PROJECT-STATUS.md`).

## [1.0.6]
- Release checklist consolidated.
- Windows update execution hardened.
- `init update` guidance.
- Custom model values preserved in extension config.

## [1.0.5]
- Windows `.cmd` / PATHEXT hotfix for `npm` and Cursor CLI spawning.

## [1.0.4]
- Cursor CLI auto-discovery.
- `hegel-companion update`.
- `.gitattributes` added.
- MCP shebang added.

## [1.0.3]
- Loud VSIX install failure reporting.

## [1.0.2]
- Windows workspace-path normalization.

## [1.0.1]
- Config hot-reload fix.
- Verified Cursor model IDs.

## [1.0.0]
- Migration to `@hegel-dev/companion`.
