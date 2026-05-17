import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildPromptAnalysisPrompt, buildResponseAnalysisPrompt } from "./prompts.js";
/**
 * Computes a hash of the config fields that affect hooks.json content.
 * When this hash changes, hooks.json needs regeneration.
 */
export function configHash(config) {
    const significant = {
        enableLlmAnalysis: config.enableLlmAnalysis,
        strictness: config.strictness,
        model: config.model,
        timeoutSeconds: config.timeoutSeconds,
    };
    return createHash("sha256")
        .update(JSON.stringify(significant))
        .digest("hex")
        .slice(0, 12);
}
/**
 * Reads the _hegel.configHash from an existing hooks.json.
 * Returns null if the file doesn't exist or has no Hegel metadata.
 */
export async function readExistingHash(hooksFilePath) {
    try {
        const raw = await readFile(hooksFilePath, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed._hegel?.configHash ?? null;
    }
    catch {
        return null;
    }
}
/**
 * Generates hooks.json content for a target project.
 * This is the shared logic used by both setup.ts (CLI) and
 * the sessionStart hot-reload check.
 */
export function generateHooksConfig(config, isSourceRepo = false) {
    // Source-repo installs use a repo-root-relative path so committed .cursor/config
    // stays portable across machines (absolute paths leak the author's filesystem).
    const hookScript = isSourceRepo
        ? "dist/hook.js"
        : "node_modules/@hegel-dev/companion/dist/hook.js";
    const hooks = {
        version: 1,
        hooks: {
            sessionStart: [
                { command: `node ${hookScript}` },
            ],
            beforeSubmitPrompt: [
                { command: `node ${hookScript}`, timeout: 5 },
            ],
            afterAgentResponse: [
                { command: `node ${hookScript}` },
            ],
            afterFileEdit: [
                { command: `node ${hookScript}` },
            ],
            preCompact: [
                { command: `node ${hookScript}` },
            ],
            stop: [
                { command: `node ${hookScript}`, loop_limit: 1 },
            ],
        },
        _hegel: {
            configHash: configHash(config),
            generatedAt: new Date().toISOString(),
        },
    };
    if (config.enableLlmAnalysis) {
        const promptAnalysis = buildPromptAnalysisPrompt(config.strictness);
        const responseAnalysis = buildResponseAnalysisPrompt(config.strictness);
        const promptHook = {
            type: "prompt",
            prompt: promptAnalysis,
            timeout: config.timeoutSeconds,
        };
        const responseHook = {
            type: "prompt",
            prompt: responseAnalysis,
            timeout: config.timeoutSeconds,
        };
        if (config.model !== "auto") {
            promptHook.model = config.model;
            responseHook.model = config.model;
        }
        hooks.hooks.beforeSubmitPrompt.push(promptHook);
        hooks.hooks.afterAgentResponse.push(responseHook);
    }
    return hooks;
}
/**
 * Writes hooks.json to a target project directory.
 * Returns true if the file was written, false if no update was needed.
 * Pass force=true to always write (used by the setup CLI).
 */
export async function writeHooksFile(projectPath, config, force = false, isSourceRepo = false) {
    const cursorDir = join(projectPath, ".cursor");
    const hooksFile = join(cursorDir, "hooks.json");
    if (!force) {
        const existingHash = await readExistingHash(hooksFile);
        const currentHash = configHash(config);
        if (existingHash === currentHash)
            return false;
    }
    const hooks = generateHooksConfig(config, isSourceRepo);
    await mkdir(cursorDir, { recursive: true });
    await writeFile(hooksFile, JSON.stringify(hooks, null, 2) + "\n", "utf-8");
    return true;
}
//# sourceMappingURL=hooks-generator.js.map