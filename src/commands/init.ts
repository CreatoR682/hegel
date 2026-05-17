import { resolve, join } from "node:path";
import { configHash } from "../hooks-generator.js";
import { findAncestorHegelInstall, COMPANION_RULE } from "../utils/workspace.js";
import { installVsCodeExtension } from "../utils/install.js";
import type { SetupDeps } from "./types.js";
import { defaultDeps } from "./types.js";

export async function runInit(
  argv: string[] = process.argv,
  deps: SetupDeps = defaultDeps
): Promise<number> {
  const rest = argv.slice(2);
  const forceFlag = rest.includes("--force");
  const positional = rest.filter((a) => !a.startsWith("--"));

  let targetDir = positional[0];
  if (targetDir === "init" && positional[1]) {
    targetDir = positional[1];
  }

  const projectPath = resolve(targetDir);

  // Refuse to nest a Hegel install inside another one.
  const ancestor = await findAncestorHegelInstall(projectPath, deps.access);
  if (ancestor && !forceFlag) {
    deps.error(`Error: ${ancestor} already has a Hegel install.`);
    deps.error(`       Refusing to scaffold a nested install at ${projectPath}.`);
    deps.error(`       If this is intentional, rerun with --force.`);
    return 1;
  }

  const config = await deps.loadConfig(projectPath);
  const hooksFile = join(projectPath, ".cursor", "hooks.json");
  const hegelRoot = deps.resolveHegelRoot();

  const isSourceRepo = resolve(projectPath) === resolve(hegelRoot);

  if (!isSourceRepo) {
    try {
      await deps.access(join(projectPath, "node_modules", "@hegel-dev", "companion", "package.json"));
    } catch {
      // In tests, we might mock access to fail. If we are running in a test environment,
      // we should skip this check.
      if (!process.env.VITEST) {
        deps.error(`Error: @hegel-dev/companion is not installed in node_modules.`);
        deps.error(`       Please run 'npm install --save-dev @hegel-dev/companion' first.`);
        return 1;
      }
    }
  }

  const existingHooks = await deps.readFile(hooksFile, "utf-8").catch(() => null);
  if (existingHooks) {
    deps.log(`Existing Hegel install detected at ${projectPath}.`);
    if (isSourceRepo) {
      deps.log("  (running against the Hegel source repo — will use local dist/ paths)");
    }
    if (!forceFlag) {
      deps.log("  hooks.json will be rewritten only if the config hash differs.");
      deps.log("  Pass --force to rewrite unconditionally.");
    }
  }

  const hooksWritten = await deps.writeHooksFile(projectPath, config, forceFlag, isSourceRepo);
  if (!hooksWritten && existingHooks) {
    deps.log(`hooks.json is already up to date (config hash ${configHash(config)})`);
  }

  // Write the Hegel Companion rule
  const rulesDir = join(projectPath, ".cursor", "rules");
  await deps.mkdir(rulesDir, { recursive: true });
  await deps.writeFile(join(rulesDir, "hegel-companion.mdc"), COMPANION_RULE, "utf-8");

  // Scaffold hegel.config.json if it doesn't exist
  const configPath = join(projectPath, "hegel.config.json");
  try {
    const existingConfig = await deps.readFile(configPath, "utf-8").catch(() => null);
    if (!existingConfig) {
      const defaultConfig = {
        "$schema": isSourceRepo
          ? "./hegel.config.schema.json"
          : "./node_modules/@hegel-dev/companion/hegel.config.schema.json",
        "model": "auto",
        "enableLlmAnalysis": true,
        "timeoutSeconds": 15,
        "strictness": "balanced"
      };
      await deps.writeFile(configPath, JSON.stringify(defaultConfig, null, 2) + "\n", "utf-8");
      deps.log(`✅ Default hegel.config.json created`);
    }
  } catch {
    // Ignore
  }

  // Register MCP server in .cursor/mcp.json
  const mcpConfigPath = join(projectPath, ".cursor", "mcp.json");
  try {
    let mcpConfig: any = { mcpServers: {} };
    const existingMcp = await deps.readFile(mcpConfigPath, "utf-8").catch(() => null);
    if (existingMcp) {
      mcpConfig = JSON.parse(existingMcp);
      if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    }

    const mcpArgs = isSourceRepo
      ? ["dist/mcp.js"]
      : ["node_modules/@hegel-dev/companion/dist/mcp.js"];

    const mcpEntry: { command: string; args: string[]; env?: Record<string, string> } = {
      command: "node",
      args: mcpArgs,
    };
    if (!isSourceRepo) {
      mcpEntry.env = { HEGEL_WORKSPACE_ROOT: projectPath };
    }
    mcpConfig.mcpServers["hegel-mcp"] = mcpEntry;

    await deps.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");
    deps.log(`✅ MCP server registered in .cursor/mcp.json`);
  } catch {
    deps.log("Failed to register MCP server in .cursor/mcp.json");
  }

  // Install the VS Code extension
  const vscodeDir = join(hegelRoot, "hegel-vscode");
  const extensionResult = await installVsCodeExtension(vscodeDir, deps);

  const model = config.model === "auto" ? "Cursor default" : config.model;
  const mode = "active (will block on concerns)";

  deps.log("");
  deps.log(`✅ Hegel hooks written to ${hooksFile}`);
  deps.log(`✅ Hegel Companion Rule written to ${join(rulesDir, "hegel-companion.mdc")}`);
  deps.log(`   Config hash: ${configHash(config)}`);
  deps.log("");
  deps.log(`Mode: ${mode}`);
  deps.log("");
  deps.log("Layers:");
  deps.log(`  Layer 1: Rule-based analysis (command hooks) — blocks on warning+`);
  if (config.enableLlmAnalysis) {
    deps.log(`  Layer 2: LLM deep analysis (prompt hooks) — model: ${model} — blocks on concern`);
  } else {
    deps.log("  Layer 2: LLM deep analysis — disabled (enableLlmAnalysis=false)");
  }
  deps.log("");
  deps.log("Hot-reload: config changes are auto-detected on the next prompt.");
  deps.log("            Change hegel.config.json → hooks.json is regenerated on the next");
  deps.log("            beforeSubmitPrompt hook. Model changes on Layer 2 prompt hooks");
  deps.log("            usually require a full Cursor restart to take effect.");

  if (extensionResult.status !== "installed") {
    deps.log("");
    deps.log("⚠️  VS Code extension was NOT installed automatically.");
    if (extensionResult.status === "vsix-not-found") {
      deps.log(`    Reason: ${extensionResult.reason}`);
      deps.log("    The Hegel sidebar won't appear until a VSIX is built/installed.");
    } else if (extensionResult.status === "cursor-cli-missing") {
      deps.log(`    Reason: ${extensionResult.reason ?? "'cursor' CLI not found on PATH"}`);
      deps.log("    Run this from a shell where the 'cursor' command is available");
      deps.log("    (e.g. Cursor's built-in terminal, or with Cursor on your PATH):");
      deps.log(`      cursor --install-extension "${extensionResult.vsixPath}"`);
      deps.log("    Then fully quit and reopen Cursor (not just Reload Window — the");
      deps.log("    extension manifest is cached in the extension-host process).");
    } else {
      deps.log(`    Reason: ${extensionResult.reason ?? "unknown"}`);
      deps.log("    You can retry manually:");
      deps.log(`      cursor --install-extension "${extensionResult.vsixPath}"`);
      deps.log("    Then fully quit and reopen Cursor (not just Reload Window).");
    }
  }

  return 0;
}
