import { mkdir, writeFile, readdir, readFile, access, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { writeHooksFile } from "../hooks-generator.js";
export const defaultDeps = {
    loadConfig,
    writeHooksFile,
    mkdir,
    writeFile,
    readdir,
    readFile,
    access,
    rm,
    execFileSync,
    log: console.log,
    error: console.error,
    resolveHegelRoot: () => resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..")),
    platform: process.platform,
    env: process.env,
};
//# sourceMappingURL=types.js.map