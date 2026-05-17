#!/usr/bin/env node
export * from "./commands/types.js";
export * from "./utils/workspace.js";
export * from "./utils/install.js";
export * from "./utils/package-manager.js";
export * from "./utils/path.js";
import { runUpdate } from "./commands/update.js";
import { runCleanup } from "./commands/cleanup.js";
import { runUninstall } from "./commands/uninstall.js";
import { type SetupDeps } from "./commands/types.js";
export { runUpdate, runCleanup, runUninstall };
export declare function runSetup(argv?: string[], deps?: SetupDeps): Promise<number>;
//# sourceMappingURL=setup.d.ts.map