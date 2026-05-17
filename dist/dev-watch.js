/**
 * Development watcher — runs after tsc --watch rebuilds.
 * Watches dist/ for changes, then regenerates hooks.json for the
 * target project specified as the first CLI argument.
 *
 * Usage: node dist/dev-watch.js <project-path>
 * Typically run via: npm run dev -- <project-path>
 */
import { watch } from "node:fs";
import { resolve, join } from "node:path";
import { loadConfig } from "./config.js";
import { writeHooksFile, configHash } from "./hooks-generator.js";
const targetDir = process.argv[2];
if (!targetDir) {
    console.log("Usage: node dist/dev-watch.js <project-path>");
    console.log("Watches for rebuilds and regenerates hooks.json automatically.");
    process.exit(1);
}
const projectPath = resolve(targetDir);
let debounceTimer = null;
async function regenerate() {
    try {
        const config = await loadConfig();
        const updated = await writeHooksFile(projectPath, config);
        const ts = new Date().toLocaleTimeString();
        if (updated) {
            console.log(`[${ts}] ♻️  hooks.json regenerated (hash: ${configHash(config)})`);
        }
        else {
            console.log(`[${ts}] ✓  rebuild detected, hooks.json unchanged`);
        }
    }
    catch (err) {
        console.error("Regeneration failed:", err instanceof Error ? err.message : err);
    }
}
console.log(`Watching dist/ and hegel.config.json for changes...`);
console.log(`Target: ${join(projectPath, ".cursor", "hooks.json")}`);
console.log("");
// Watch the compiled output directory
watch("dist", { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith(".js"))
        return;
    if (debounceTimer)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(regenerate, 300);
});
// Also watch the config file
watch("hegel.config.json", () => {
    if (debounceTimer)
        clearTimeout(debounceTimer);
    debounceTimer = setTimeout(regenerate, 300);
});
regenerate();
//# sourceMappingURL=dev-watch.js.map