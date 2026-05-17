import { join, dirname, parse } from "node:path";
import { access } from "node:fs/promises";
export const COMPANION_RULE = `# Hegel Companion Rule

You are working in a project that uses Hegel, a dialectical companion for AI-assisted development.
Hegel monitors your prompts and responses for quality, context drift, and session health.

## MCP Tools Available

You have access to the \`hegel-mcp\` server which provides two tools:
1. \`hegel-status\`: Fetch the real-time health status of the current session.
2. \`hegel-review\`: Fetch a comprehensive retrospective of the session.

## When to use these tools

- **Proactive Self-Correction**: If the user seems frustrated, repeats the same prompt, or if you feel the conversation is losing focus, call \`hegel-status\` to check if Hegel has flagged \`context-drift\` or \`prompt-degradation\`. Adjust your behavior accordingly.
- **End-of-Task Summaries**: When completing a significant multi-step task, call \`hegel-review\` and append a brief session health summary to your final response.
- **Transparency**: If Hegel blocks a prompt or flags a critical concern, acknowledge it and help the user formulate a better prompt.
`;
export async function findAncestorHegelInstall(startDir, accessFn = access) {
    const root = parse(startDir).root;
    let current = dirname(startDir);
    while (current && current !== root) {
        try {
            await accessFn(join(current, "hegel.config.json"));
            await accessFn(join(current, ".cursor", "hooks.json"));
            return current;
        }
        catch {
            // keep walking up
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
const ORPHAN_DIR_NAMES = ["hegel-mcp", "init"];
const ORPHAN_MARKER_PATHS = ["hegel.config.json", join(".cursor", "hooks.json")];
export async function pruneOrphanInstalls(projectPath, deps) {
    const result = { pruned: [], skipped: [] };
    for (const name of ORPHAN_DIR_NAMES) {
        const dir = join(projectPath, name);
        try {
            await deps.access(dir);
        }
        catch {
            continue;
        }
        let hasMarker = false;
        for (const marker of ORPHAN_MARKER_PATHS) {
            try {
                await deps.access(join(dir, marker));
                hasMarker = true;
                break;
            }
            catch {
                // try next marker
            }
        }
        if (!hasMarker) {
            result.skipped.push({ path: dir, reason: "no Hegel marker file detected (kept)" });
            continue;
        }
        try {
            await deps.rm(dir, { recursive: true, force: true });
            result.pruned.push(dir);
            deps.log(`  Pruned orphan install at ${dir}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result.skipped.push({ path: dir, reason: `rm failed: ${message}` });
            deps.log(`  Could not prune ${dir}: ${message}`);
        }
    }
    return result;
}
//# sourceMappingURL=workspace.js.map