import { resolve, join } from "node:path";
import { defaultDeps } from "./types.js";
import { uninstallPackage } from "../utils/package-manager.js";
import { execCommandSync, getCursorCliCandidates } from "../utils/install.js";
export async function runUninstall(argv = process.argv, deps = defaultDeps) {
    const rest = argv.slice(2);
    const positional = rest.filter((a) => !a.startsWith("--"));
    const targetDir = positional[1] ?? ".";
    const projectPath = resolve(targetDir);
    const skipNpm = rest.includes("--skip-npm");
    deps.log(`Uninstalling Hegel from ${projectPath}...`);
    // 1. Clean up .vscode/settings.json FIRST
    // (If the extension is still running, modifying settings will cause it to
    // re-sync and recreate hegel.config.json. We do this first so we can delete
    // the file afterwards).
    const vscodeDir = join(projectPath, ".vscode");
    const settingsPath = join(vscodeDir, "settings.json");
    try {
        const content = await deps.readFile(settingsPath, "utf-8");
        const parsed = JSON.parse(content);
        let changed = false;
        for (const key of Object.keys(parsed)) {
            if (key.startsWith("hegel.")) {
                delete parsed[key];
                changed = true;
            }
        }
        if (changed) {
            if (Object.keys(parsed).length === 0) {
                await deps.rm(settingsPath, { force: true });
                deps.log(`  Removed empty .vscode/settings.json`);
                try {
                    const remaining = await deps.readdir(vscodeDir);
                    if (remaining.length === 0) {
                        await deps.rm(vscodeDir, { recursive: true, force: true });
                        deps.log(`  Removed empty .vscode directory`);
                    }
                }
                catch {
                    // ignore
                }
            }
            else {
                await deps.writeFile(settingsPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
                deps.log(`  Cleaned Hegel entries from .vscode/settings.json`);
            }
            // Give the still-running extension host a moment to react to the settings
            // change and write its synced hegel.config.json before we delete it.
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    catch {
        // ignore
    }
    // 2. Remove files and directories
    const toRemove = [
        "hegel.config.json",
        ".hegel-state",
        join(".cursor", "rules", "hegel-companion.mdc")
    ];
    for (const relPath of toRemove) {
        const p = join(projectPath, relPath);
        try {
            await deps.rm(p, { recursive: true, force: true });
            deps.log(`  Removed ${relPath}`);
        }
        catch {
            // ignore
        }
    }
    // Also try to remove empty .cursor/rules and .cursor directories
    try {
        const rulesDir = join(projectPath, ".cursor", "rules");
        const rulesFiles = await deps.readdir(rulesDir);
        if (rulesFiles.length === 0) {
            await deps.rm(rulesDir, { recursive: true, force: true });
        }
    }
    catch {
        // ignore
    }
    // 3. Clean up hooks.json
    const hooksPath = join(projectPath, ".cursor", "hooks.json");
    try {
        const content = await deps.readFile(hooksPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed._hegel) {
            delete parsed._hegel;
            // Remove Hegel hooks (we know them by command ending in dist/hook.js)
            if (parsed.hooks) {
                for (const event of Object.keys(parsed.hooks)) {
                    parsed.hooks[event] = parsed.hooks[event].filter((h) => !(h.command && h.command.includes("dist/hook.js")) && !(h.prompt && h.prompt.includes("You are Hegel")));
                    if (parsed.hooks[event].length === 0) {
                        delete parsed.hooks[event];
                    }
                }
            }
            if (Object.keys(parsed.hooks || {}).length === 0) {
                await deps.rm(hooksPath, { force: true });
                deps.log(`  Removed empty .cursor/hooks.json`);
                // Try to remove .cursor if it's now empty
                try {
                    const cursorDir = join(projectPath, ".cursor");
                    const remaining = await deps.readdir(cursorDir);
                    if (remaining.length === 0) {
                        await deps.rm(cursorDir, { recursive: true, force: true });
                        deps.log(`  Removed empty .cursor directory`);
                    }
                }
                catch {
                    // ignore
                }
            }
            else {
                await deps.writeFile(hooksPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
                deps.log(`  Cleaned Hegel entries from .cursor/hooks.json`);
            }
        }
    }
    catch {
        // ignore
    }
    // 4. Clean up mcp.json
    const mcpPath = join(projectPath, ".cursor", "mcp.json");
    try {
        const content = await deps.readFile(mcpPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.mcpServers && parsed.mcpServers["hegel-mcp"]) {
            delete parsed.mcpServers["hegel-mcp"];
            if (Object.keys(parsed.mcpServers).length === 0) {
                await deps.rm(mcpPath, { force: true });
                deps.log(`  Removed empty .cursor/mcp.json`);
                // Try to remove .cursor if it's now empty
                try {
                    const cursorDir = join(projectPath, ".cursor");
                    const remaining = await deps.readdir(cursorDir);
                    if (remaining.length === 0) {
                        await deps.rm(cursorDir, { recursive: true, force: true });
                        deps.log(`  Removed empty .cursor directory`);
                    }
                }
                catch {
                    // ignore
                }
            }
            else {
                await deps.writeFile(mcpPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
                deps.log(`  Cleaned hegel-mcp from .cursor/mcp.json`);
            }
        }
    }
    catch {
        // ignore
    }
    // 5. Uninstall VS Code extension
    deps.log(`  Uninstalling VS Code extension...`);
    try {
        execCommandSync("cursor", ["--uninstall-extension", "hegel.hegel-companion"], deps, { stdio: "ignore" });
        deps.log(`  Uninstalled extension hegel.hegel-companion`);
    }
    catch {
        // Try fallback candidates
        const candidates = getCursorCliCandidates(deps.platform, deps.env);
        let uninstalled = false;
        for (const cand of candidates) {
            try {
                await deps.access(cand);
                execCommandSync(cand, ["--uninstall-extension", "hegel.hegel-companion"], deps, { stdio: "ignore" });
                deps.log(`  Uninstalled extension hegel.hegel-companion via ${cand}`);
                uninstalled = true;
                break;
            }
            catch {
                // ignore
            }
        }
        if (!uninstalled) {
            deps.log(`  Could not automatically uninstall extension. Run manually: cursor --uninstall-extension hegel.hegel-companion`);
        }
    }
    // 6. Uninstall npm package
    if (!skipNpm) {
        deps.log(`  Uninstalling @hegel-dev/companion package...`);
        try {
            await uninstallPackage("@hegel-dev/companion", projectPath, deps);
        }
        catch (err) {
            deps.log(`  Failed to uninstall package: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // 7. Clean up .gitignore
    const gitignorePath = join(projectPath, ".gitignore");
    try {
        const content = await deps.readFile(gitignorePath, "utf-8");
        const lines = content.split(/\r?\n/);
        const toRemoveLines = new Set([
            ".hegel-state",
            ".hegel-state/",
            "hegel.config.json",
            "hegel-mcp",
            "hegel-mcp/",
            "init",
            "init/",
            ".cursor/hooks.json",
            ".cursor/mcp.json",
            ".cursor/rules/hegel-companion.mdc"
        ]);
        const filtered = lines.filter(line => !toRemoveLines.has(line.trim()));
        if (filtered.length !== lines.length) {
            // Remove empty "# Hegel Plugin" or similar headers if they are now orphaned
            const finalLines = [];
            for (let i = 0; i < filtered.length; i++) {
                const line = filtered[i];
                if (line.startsWith("#") && line.toLowerCase().includes("hegel")) {
                    // Check if the next line is empty or another header, meaning this header is orphaned
                    if (i + 1 >= filtered.length || filtered[i + 1].trim() === "" || filtered[i + 1].startsWith("#")) {
                        continue; // skip this orphaned header
                    }
                }
                finalLines.push(line);
            }
            await deps.writeFile(gitignorePath, finalLines.join("\n"), "utf-8");
            deps.log(`  Cleaned Hegel entries from .gitignore`);
        }
    }
    catch {
        // ignore
    }
    deps.log(`✅ Hegel uninstalled successfully.`);
    return 0;
}
//# sourceMappingURL=uninstall.js.map