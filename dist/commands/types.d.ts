import { mkdir, writeFile, readdir, readFile, access, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { writeHooksFile } from "../hooks-generator.js";
import type { HegelConfig } from "../config.js";
export interface SetupDeps {
    loadConfig: (workspaceRoot?: string) => Promise<HegelConfig>;
    writeHooksFile: typeof writeHooksFile;
    mkdir: typeof mkdir;
    writeFile: typeof writeFile;
    readdir: typeof readdir;
    readFile: typeof readFile;
    access: typeof access;
    rm: typeof rm;
    execFileSync: typeof execFileSync;
    log: (message: string) => void;
    error: (message: string) => void;
    resolveHegelRoot: () => string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
}
export declare const defaultDeps: SetupDeps;
//# sourceMappingURL=types.d.ts.map