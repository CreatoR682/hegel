#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { configHash } from "./hooks-generator.js";
// Re-export shared types/utils for tests and downstream usage
export * from "./commands/types.js";
export * from "./utils/workspace.js";
export * from "./utils/install.js";
export * from "./utils/package-manager.js";
export * from "./utils/path.js";
// Import commands
import { runInit } from "./commands/init.js";
import { runUpdate } from "./commands/update.js";
import { runCleanup } from "./commands/cleanup.js";
import { runUninstall } from "./commands/uninstall.js";
import { defaultDeps } from "./commands/types.js";
export { runUpdate, runCleanup, runUninstall };
export async function runSetup(argv = process.argv, deps = defaultDeps) {
    const rest = argv.slice(2);
    const positional = rest.filter((a) => !a.startsWith("--"));
    const command = positional[0];
    if (command === "update") {
        return runUpdate(argv, deps);
    }
    if (command === "cleanup") {
        return runCleanup(argv, deps);
    }
    if (command === "uninstall") {
        return runUninstall(argv, deps);
    }
    if (command === "init" && positional[1] === "update") {
        deps.error("Error: 'update' is a command, not a project path.");
        deps.error("       If your installed Hegel version does not know `update`, upgrade first:");
        deps.error("         npm install @hegel-dev/companion@latest");
        deps.error("         npx -p @hegel-dev/companion hegel-companion update .");
        return 1;
    }
    let targetDir = command;
    if (targetDir === "init" && positional[1]) {
        targetDir = positional[1];
    }
    if (targetDir === "init") {
        deps.error("Error: 'init' is not a valid project path.");
        deps.error("       Did you mean: npx -p @hegel-dev/companion hegel-companion init .");
        return 1;
    }
    if (!targetDir) {
        deps.log("Usage: npx -p @hegel-dev/companion hegel-companion <command> [options]");
        deps.log("");
        deps.log("Commands:");
        deps.log("  init <project-path>   Scaffold .cursor/hooks.json + register MCP + install VSIX");
        deps.log("  update [project-path] Reinstall @hegel-dev/companion@latest, refresh config,");
        deps.log("                        prune orphan dirs (default path: .)");
        deps.log("  cleanup [project-path] Prune stale concerns and recompute session states");
        deps.log("  uninstall [project-path] Remove Hegel configuration, hooks, MCP, and extension");
        deps.log("");
        deps.log("Use '.' for the current directory. Pass --force on init to bypass safety checks.");
        deps.log("Pass --skip-npm on update or uninstall to skip the dependency step.");
        deps.log("");
        deps.log("Current config:");
        const config = await deps.loadConfig();
        deps.log(`  model:       ${config.model}`);
        deps.log(`  enableLlmAnalysis: ${config.enableLlmAnalysis}`);
        deps.log(`  timeoutSeconds:  ${config.timeoutSeconds}s`);
        deps.log(`  strictness:  ${config.strictness}`);
        deps.log(`  configHash:  ${configHash(config)}`);
        return 1;
    }
    return runInit(argv, deps);
}
function isEntrypoint() {
    return !process.env.VITEST &&
        !!process.argv[1] &&
        import.meta.url === pathToFileURL(process.argv[1]).href;
}
if (isEntrypoint()) {
    runSetup(process.argv, defaultDeps).then((exitCode) => {
        if (exitCode !== 0)
            process.exit(exitCode);
    }).catch((err) => {
        defaultDeps.error(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
//# sourceMappingURL=setup.js.map