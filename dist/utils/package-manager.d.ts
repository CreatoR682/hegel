import { readFile, access } from "node:fs/promises";
import type { SetupDeps } from "../commands/types.js";
/**
 * Reads the version of @hegel-dev/companion from the consumer's
 * node_modules/, returning null if not installed (e.g. source-repo mode).
 */
export declare function readInstalledCompanionVersion(projectPath: string, readFileFn?: typeof readFile): Promise<string | null>;
/**
 * Detect the package manager used in the project by checking for lockfiles.
 */
export declare function detectPackageManager(projectPath: string, accessFn?: typeof access): Promise<"npm" | "pnpm" | "yarn" | "bun">;
export declare function uninstallPackage(pkg: string, cwd: string, deps: Pick<SetupDeps, "execFileSync" | "platform">): Promise<void>;
//# sourceMappingURL=package-manager.d.ts.map