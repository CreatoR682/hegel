import type { SetupDeps } from "../commands/types.js";
export type ExtensionInstallStatus = "installed" | "vsix-not-found" | "cursor-cli-missing" | "install-failed";
export interface ExtensionInstallResult {
    status: ExtensionInstallStatus;
    vsixPath?: string;
    reason?: string;
    /** Non-PATH absolute path used, if auto-discovery kicked in. */
    usedCursorPath?: string;
}
export declare function getCursorCliCandidates(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): string[];
export declare function execCommandSync(command: string, args: string[], deps: Pick<SetupDeps, "execFileSync" | "platform">, extra?: Parameters<SetupDeps["execFileSync"]>[2]): void;
export declare function installVsCodeExtension(vscodeDir: string, deps: SetupDeps): Promise<ExtensionInstallResult>;
//# sourceMappingURL=install.d.ts.map