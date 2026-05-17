import { join, posix as posixPath, win32 as win32Path } from "node:path";
import { access, readdir } from "node:fs/promises";
import type { SetupDeps } from "../commands/types.js";

export type ExtensionInstallStatus =
  | "installed"
  | "vsix-not-found"
  | "cursor-cli-missing"
  | "install-failed";

export interface ExtensionInstallResult {
  status: ExtensionInstallStatus;
  vsixPath?: string;
  reason?: string;
  /** Non-PATH absolute path used, if auto-discovery kicked in. */
  usedCursorPath?: string;
}

export function getCursorCliCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const candidates: string[] = [];
  const pj = platform === "win32" ? win32Path.join : posixPath.join;
  if (platform === "win32") {
    const local = env.LOCALAPPDATA;
    if (local) {
      candidates.push(pj(local, "Programs", "cursor", "resources", "app", "bin", "cursor.cmd"));
      candidates.push(pj(local, "Programs", "Cursor", "resources", "app", "bin", "cursor.cmd"));
    }
    const programFiles = env["ProgramFiles"];
    if (programFiles) {
      candidates.push(pj(programFiles, "Cursor", "resources", "app", "bin", "cursor.cmd"));
    }
  } else if (platform === "darwin") {
    candidates.push("/Applications/Cursor.app/Contents/Resources/app/bin/cursor");
    const home = env.HOME;
    if (home) {
      candidates.push(pj(home, "Applications", "Cursor.app", "Contents", "Resources", "app", "bin", "cursor"));
    }
  } else {
    candidates.push("/usr/local/bin/cursor");
    candidates.push("/usr/bin/cursor");
    const home = env.HOME;
    if (home) {
      candidates.push(pj(home, ".local", "share", "cursor", "bin", "cursor"));
      candidates.push(pj(home, ".cursor", "bin", "cursor"));
    }
  }
  return candidates;
}

function quoteWindowsCmdArg(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function isBareWindowsCommand(command: string): boolean {
  return !/[\\/\s]/.test(command);
}

export function execCommandSync(
  command: string,
  args: string[],
  deps: Pick<SetupDeps, "execFileSync" | "platform">,
  extra: Parameters<SetupDeps["execFileSync"]>[2] = {}
): void {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") {
    deps.execFileSync(command, args, extra);
    return;
  }

  const quotedArgs = args.map(quoteWindowsCmdArg).join(" ");
  const commandLine = isBareWindowsCommand(command)
    ? [command, quotedArgs].filter(Boolean).join(" ")
    : `"${[quoteWindowsCmdArg(command), quotedArgs].filter(Boolean).join(" ")}"`;
  const windowsOptions = {
    ...extra,
    windowsVerbatimArguments: true,
  } as Parameters<SetupDeps["execFileSync"]>[2];
  deps.execFileSync("cmd.exe", ["/d", "/s", "/c", commandLine], windowsOptions);
}

async function findInstalledCursorCli(
  candidates: string[],
  accessFn: typeof access
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await accessFn(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

export async function installVsCodeExtension(
  vscodeDir: string,
  deps: SetupDeps
): Promise<ExtensionInstallResult> {
  let files: string[];
  try {
    files = await deps.readdir(vscodeDir);
  } catch {
    return { status: "vsix-not-found", reason: `${vscodeDir} not readable` };
  }

  const vsixFile = files.find((f) => f.endsWith(".vsix"));
  if (!vsixFile) {
    return { status: "vsix-not-found", reason: `no .vsix file found in ${vscodeDir}` };
  }

  const vsixPath = join(vscodeDir, vsixFile);
  deps.log(`Installing VS Code extension: ${vsixFile}...`);

  try {
    execCommandSync(
      "cursor",
      ["--install-extension", vsixPath],
      deps,
      { stdio: "inherit" }
    );
    return { status: "installed", vsixPath };
  } catch (err) {
    const errno = (err as NodeJS.ErrnoException)?.code;
    if (errno !== "ENOENT") {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "install-failed", vsixPath, reason: message };
    }
  }

  const candidates = getCursorCliCandidates(deps.platform, deps.env);
  const discovered = await findInstalledCursorCli(candidates, deps.access);
  if (!discovered) {
    return {
      status: "cursor-cli-missing",
      vsixPath,
      reason: `'cursor' CLI not found on PATH and no install detected at known locations (${candidates.length} path${candidates.length === 1 ? "" : "s"} checked)`,
    };
  }

  deps.log(`  'cursor' not on PATH — found install at ${discovered}, retrying...`);
  try {
    execCommandSync(
      discovered,
      ["--install-extension", vsixPath],
      deps,
      { stdio: "inherit" }
    );
    return { status: "installed", vsixPath, usedCursorPath: discovered };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "install-failed", vsixPath, reason: `retry via ${discovered} failed: ${message}` };
  }
}
