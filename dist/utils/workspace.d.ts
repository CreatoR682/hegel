import { access } from "node:fs/promises";
import type { SetupDeps } from "../commands/types.js";
export declare const COMPANION_RULE = "# Hegel Companion Rule\n\nYou are working in a project that uses Hegel, a dialectical companion for AI-assisted development.\nHegel monitors your prompts and responses for quality, context drift, and session health.\n\n## MCP Tools Available\n\nYou have access to the `hegel-mcp` server which provides two tools:\n1. `hegel-status`: Fetch the real-time health status of the current session.\n2. `hegel-review`: Fetch a comprehensive retrospective of the session.\n\n## When to use these tools\n\n- **Proactive Self-Correction**: If the user seems frustrated, repeats the same prompt, or if you feel the conversation is losing focus, call `hegel-status` to check if Hegel has flagged `context-drift` or `prompt-degradation`. Adjust your behavior accordingly.\n- **End-of-Task Summaries**: When completing a significant multi-step task, call `hegel-review` and append a brief session health summary to your final response.\n- **Transparency**: If Hegel blocks a prompt or flags a critical concern, acknowledge it and help the user formulate a better prompt.\n";
export declare function findAncestorHegelInstall(startDir: string, accessFn?: typeof access): Promise<string | null>;
export interface PruneResult {
    pruned: string[];
    skipped: {
        path: string;
        reason: string;
    }[];
}
export declare function pruneOrphanInstalls(projectPath: string, deps: Pick<SetupDeps, "access" | "rm" | "log">): Promise<PruneResult>;
//# sourceMappingURL=workspace.d.ts.map