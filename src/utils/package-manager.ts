import { readFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { SetupDeps } from "../commands/types.js";
import { execCommandSync } from "./install.js";

/**
 * Reads the version of @hegel-dev/companion from the consumer's
 * node_modules/, returning null if not installed (e.g. source-repo mode).
 */
export async function readInstalledCompanionVersion(
  projectPath: string,
  readFileFn: typeof readFile = readFile
): Promise<string | null> {
  try {
    const pkgPath = join(projectPath, "node_modules", "@hegel-dev", "companion", "package.json");
    const contents = await readFileFn(pkgPath, "utf-8");
    const parsed = JSON.parse(contents);
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Detect the package manager used in the project by checking for lockfiles.
 */
export async function detectPackageManager(
  projectPath: string,
  accessFn: typeof access = access
): Promise<"npm" | "pnpm" | "yarn" | "bun"> {
  try { await accessFn(join(projectPath, "pnpm-lock.yaml")); return "pnpm"; } catch {}
  try { await accessFn(join(projectPath, "yarn.lock")); return "yarn"; } catch {}
  try { await accessFn(join(projectPath, "bun.lockb")); return "bun"; } catch {}
  try { await accessFn(join(projectPath, "bun.lock")); return "bun"; } catch {}
  return "npm";
}

export async function uninstallPackage(
  pkg: string,
  cwd: string,
  deps: Pick<SetupDeps, "execFileSync" | "platform">
): Promise<void> {
  const pm = await detectPackageManager(cwd);
  const args = pm === "npm" ? ["uninstall", pkg] : ["remove", pkg];
  execCommandSync(pm, args, deps, { stdio: "inherit", cwd });
}
