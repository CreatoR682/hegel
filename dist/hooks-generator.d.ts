import type { HegelConfig } from "./config.js";
interface HookEntry {
    command?: string;
    type?: string;
    prompt?: string;
    model?: string;
    timeout?: number;
    loop_limit?: number;
}
interface HooksConfig {
    version: number;
    hooks: Record<string, HookEntry[]>;
    _hegel?: {
        configHash: string;
        generatedAt: string;
    };
}
/**
 * Computes a hash of the config fields that affect hooks.json content.
 * When this hash changes, hooks.json needs regeneration.
 */
export declare function configHash(config: HegelConfig): string;
/**
 * Reads the _hegel.configHash from an existing hooks.json.
 * Returns null if the file doesn't exist or has no Hegel metadata.
 */
export declare function readExistingHash(hooksFilePath: string): Promise<string | null>;
/**
 * Generates hooks.json content for a target project.
 * This is the shared logic used by both setup.ts (CLI) and
 * the sessionStart hot-reload check.
 */
export declare function generateHooksConfig(config: HegelConfig, isSourceRepo?: boolean): HooksConfig;
/**
 * Writes hooks.json to a target project directory.
 * Returns true if the file was written, false if no update was needed.
 * Pass force=true to always write (used by the setup CLI).
 */
export declare function writeHooksFile(projectPath: string, config: HegelConfig, force?: boolean, isSourceRepo?: boolean): Promise<boolean>;
export {};
//# sourceMappingURL=hooks-generator.d.ts.map