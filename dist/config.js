import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const DEFAULTS = {
    model: "auto",
    enableLlmAnalysis: true,
    timeoutSeconds: 15,
    strictness: "balanced",
};
function hegelRoot() {
    return join(dirname(fileURLToPath(import.meta.url)), "..");
}
export function configPath(workspaceRoot = process.cwd()) {
    return join(workspaceRoot, "hegel.config.json");
}
export async function loadConfig(workspaceRoot = process.cwd()) {
    try {
        const raw = await readFile(configPath(workspaceRoot), "utf-8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed };
    }
    catch {
        return { ...DEFAULTS };
    }
}
//# sourceMappingURL=config.js.map