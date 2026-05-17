import { resolve, join } from "node:path";
import { readInstalledCompanionVersion, detectPackageManager } from "../utils/package-manager.js";
import { pruneOrphanInstalls } from "../utils/workspace.js";
import { execCommandSync } from "../utils/install.js";
import { runInit } from "./init.js";
import type { SetupDeps } from "./types.js";
import { defaultDeps } from "./types.js";

export async function runUpdate(
  argv: string[] = process.argv,
  deps: SetupDeps = defaultDeps
): Promise<number> {
  const rest = argv.slice(2);
  const positional = rest.filter((a) => !a.startsWith("--"));
  const targetDir = positional[1] ?? ".";
  const skipNpm = rest.includes("--skip-npm");

  const projectPath = resolve(targetDir);

  const hasConfig = await deps.access(join(projectPath, "hegel.config.json")).then(() => true).catch(() => false);
  const hasHooks = await deps.access(join(projectPath, ".cursor", "hooks.json")).then(() => true).catch(() => false);
  if (!hasConfig && !hasHooks) {
    deps.error(`Error: no Hegel install detected at ${projectPath}.`);
    deps.error(`       Run 'npx -p @hegel-dev/companion hegel-companion init ${targetDir}' first.`);
    return 1;
  }

  deps.log(`Updating Hegel install at ${projectPath}`);
  deps.log("");

  const hegelRoot = deps.resolveHegelRoot();
  const isSourceRepo = resolve(projectPath) === resolve(hegelRoot);
  const beforeVersion = await readInstalledCompanionVersion(projectPath, deps.readFile);

  if (isSourceRepo) {
    deps.log("Source-repo mode detected — skipping package manager upgrade.");
    deps.log("");
  } else if (skipNpm) {
    deps.log("--skip-npm passed — skipping dependency upgrade.");
    deps.log("");
  } else {
    const pm = await detectPackageManager(projectPath, deps.access);
    const installArgs = pm === "npm" ? ["install", "@hegel-dev/companion@latest"] : ["add", "-D", "@hegel-dev/companion@latest"];
    
    deps.log(`Running: ${pm} ${installArgs.join(" ")}`);
    try {
      execCommandSync(
        pm,
        installArgs,
        deps,
        { stdio: "inherit", cwd: projectPath }
      );
    } catch (err) {
      const errno = (err as NodeJS.ErrnoException)?.code;
      if (errno === "ENOENT") {
        deps.error(`Error: '${pm}' not found on PATH.`);
        deps.error(`       Install Node.js/package manager and rerun, or pass --skip-npm`);
        deps.error("       to refresh hooks/VSIX without touching dependencies.");
        return 1;
      }
      const message = err instanceof Error ? err.message : String(err);
      deps.error(`Error: ${pm} install failed: ${message}`);
      return 1;
    }
    deps.log("");
  }

  const setupArgv = ["node", argv[1] ?? "setup.js", projectPath, "--force"];
  const setupExit = await runInit(setupArgv, deps);
  if (setupExit !== 0) {
    deps.error(`Error: setup re-run failed with exit code ${setupExit}.`);
    return setupExit;
  }

  deps.log("");
  deps.log("Checking for orphan Hegel directories...");
  const prune = await pruneOrphanInstalls(projectPath, deps);
  if (prune.pruned.length === 0 && prune.skipped.length === 0) {
    deps.log("  No orphans found.");
  }

  deps.log("");
  const afterVersion = await readInstalledCompanionVersion(projectPath, deps.readFile);
  if (afterVersion) {
    if (beforeVersion && beforeVersion !== afterVersion) {
      deps.log(`✅ Updated @hegel-dev/companion: ${beforeVersion} → ${afterVersion}`);
    } else if (beforeVersion === afterVersion) {
      deps.log(`✅ @hegel-dev/companion ${afterVersion} (already at latest — refreshed hooks + VSIX)`);
    } else {
      deps.log(`✅ @hegel-dev/companion ${afterVersion} installed.`);
    }
  } else if (isSourceRepo) {
    deps.log("✅ Source-repo update complete (no node_modules version to report).");
  } else {
    deps.log("✅ Update complete (could not read installed version from node_modules).");
  }
  deps.log("");
  deps.log("Reminder: fully quit and reopen Cursor (not just Reload Window) so the");
  deps.log("          updated VSIX manifest is picked up by the extension host.");

  return 0;
}
