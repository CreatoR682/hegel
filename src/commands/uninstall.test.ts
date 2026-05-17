import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runUninstall } from "./uninstall.js";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("uninstall command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-uninstall-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("removes all hegel artifacts and cleans up hooks and mcp", async () => {
    const projectDir = join(tempDir, "project");
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await mkdir(join(projectDir, ".hegel-state"), { recursive: true });
    
    // Create dummy files
    await writeFile(join(projectDir, "hegel.config.json"), "{}", "utf-8");
    await writeFile(join(projectDir, ".cursor", "rules", "hegel-companion.mdc"), "rule", "utf-8");
    await writeFile(join(projectDir, ".hegel-state", "test.json"), "{}", "utf-8");
    
    // Create hooks.json with Hegel and non-Hegel hooks
    const hooksContent = {
      version: 1,
      _hegel: { configHash: "abc" },
      hooks: {
        sessionStart: [{ command: "node dist/hook.js" }],
        beforeSubmitPrompt: [
          { command: "node dist/hook.js" },
          { command: "echo 'other hook'" }
        ]
      }
    };
    await writeFile(join(projectDir, ".cursor", "hooks.json"), JSON.stringify(hooksContent), "utf-8");

    // Create mcp.json with Hegel and non-Hegel servers
    const mcpContent = {
      mcpServers: {
        "hegel-mcp": { command: "node", args: ["dist/mcp.js"] },
        "other-mcp": { command: "node", args: ["other.js"] }
      }
    };
    await writeFile(join(projectDir, ".cursor", "mcp.json"), JSON.stringify(mcpContent), "utf-8");

    const logs: string[] = [];
    const execFileSyncMock = vi.fn();

    const exitCode = await runUninstall(["node", "setup.js", "uninstall", projectDir, "--skip-npm"], {
      access: async () => {},
      log: (m) => logs.push(m),
      error: vi.fn(),
      execFileSync: execFileSyncMock as never,
      mkdir: vi.fn() as never,
      readdir: vi.fn() as never,
      readFile: async (p) => readFile(p, "utf-8"),
      writeFile: async (p, data) => writeFile(p, data, "utf-8"),
      rm: async (p, opts) => rm(p, opts),
      resolveHegelRoot: () => tempDir,
      platform: "linux",
      env: {}
    });

    expect(exitCode).toBe(0);
    const combinedLogs = logs.join("\n");
    expect(combinedLogs).toContain("Removed hegel.config.json");
    expect(combinedLogs).toContain("Removed .hegel-state");
    expect(combinedLogs).toContain("Cleaned Hegel entries from .cursor/hooks.json");
    expect(combinedLogs).toContain("Cleaned hegel-mcp from .cursor/mcp.json");
    expect(combinedLogs).toContain("Uninstalled extension hegel.hegel-companion");

    // Verify files were removed
    await expect(readFile(join(projectDir, "hegel.config.json"))).rejects.toThrow();
    await expect(readFile(join(projectDir, ".hegel-state", "test.json"))).rejects.toThrow();
    await expect(readFile(join(projectDir, ".cursor", "rules", "hegel-companion.mdc"))).rejects.toThrow();

    // Verify hooks.json was cleaned but kept the other hook
    const newHooks = JSON.parse(await readFile(join(projectDir, ".cursor", "hooks.json"), "utf-8"));
    expect(newHooks._hegel).toBeUndefined();
    expect(newHooks.hooks.sessionStart).toBeUndefined();
    expect(newHooks.hooks.beforeSubmitPrompt.length).toBe(1);
    expect(newHooks.hooks.beforeSubmitPrompt[0].command).toBe("echo 'other hook'");

    // Verify mcp.json was cleaned but kept the other server
    const newMcp = JSON.parse(await readFile(join(projectDir, ".cursor", "mcp.json"), "utf-8"));
    expect(newMcp.mcpServers["hegel-mcp"]).toBeUndefined();
    expect(newMcp.mcpServers["other-mcp"]).toBeDefined();

    // Verify extension uninstall was called
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "cursor",
      ["--uninstall-extension", "hegel.hegel-companion"],
      { stdio: "ignore" }
    );
  });

  it("deletes hooks.json and mcp.json entirely if they become empty", async () => {
    const projectDir = join(tempDir, "project2");
    await mkdir(join(projectDir, ".cursor"), { recursive: true });
    
    // Create hooks.json with ONLY Hegel hooks
    const hooksContent = {
      version: 1,
      _hegel: { configHash: "abc" },
      hooks: {
        sessionStart: [{ command: "node dist/hook.js" }]
      }
    };
    await writeFile(join(projectDir, ".cursor", "hooks.json"), JSON.stringify(hooksContent), "utf-8");

    // Create mcp.json with ONLY Hegel server
    const mcpContent = {
      mcpServers: {
        "hegel-mcp": { command: "node", args: ["dist/mcp.js"] }
      }
    };
    await writeFile(join(projectDir, ".cursor", "mcp.json"), JSON.stringify(mcpContent), "utf-8");

    const exitCode = await runUninstall(["node", "setup.js", "uninstall", projectDir, "--skip-npm"], {
      access: async () => {},
      log: vi.fn(),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: vi.fn() as never,
      readFile: async (p) => readFile(p, "utf-8"),
      writeFile: async (p, data) => writeFile(p, data, "utf-8"),
      rm: async (p, opts) => rm(p, opts),
      resolveHegelRoot: () => tempDir,
      platform: "linux",
      env: {}
    });

    expect(exitCode).toBe(0);
    
    // Verify files were completely deleted
    await expect(readFile(join(projectDir, ".cursor", "hooks.json"))).rejects.toThrow();
    await expect(readFile(join(projectDir, ".cursor", "mcp.json"))).rejects.toThrow();
  });

  it("cleans up .vscode/settings.json and .gitignore and waits for extension to sync", async () => {
    const projectDir = join(tempDir, "project3");
    await mkdir(join(projectDir, ".vscode"), { recursive: true });
    
    const settingsContent = {
      "hegel.model": "auto",
      "hegel.strictness": "strict",
      "editor.formatOnSave": true
    };
    await writeFile(join(projectDir, ".vscode", "settings.json"), JSON.stringify(settingsContent), "utf-8");

    const gitignoreContent = "node_modules\n.hegel-state/\nhegel.config.json\nbuild/";
    await writeFile(join(projectDir, ".gitignore"), gitignoreContent, "utf-8");

    const exitCode = await runUninstall(["node", "setup.js", "uninstall", projectDir, "--skip-npm"], {
      access: async () => {},
      log: vi.fn(),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: vi.fn() as never,
      readFile: async (p) => readFile(p, "utf-8"),
      writeFile: async (p, data) => writeFile(p, data, "utf-8"),
      rm: async (p, opts) => rm(p, opts),
      resolveHegelRoot: () => tempDir,
      platform: "linux",
      env: {}
    });

    expect(exitCode).toBe(0);
    
    const newSettings = JSON.parse(await readFile(join(projectDir, ".vscode", "settings.json"), "utf-8"));
    expect(newSettings["hegel.model"]).toBeUndefined();
    expect(newSettings["hegel.strictness"]).toBeUndefined();
    expect(newSettings["editor.formatOnSave"]).toBe(true);

    const newGitignore = await readFile(join(projectDir, ".gitignore"), "utf-8");
    expect(newGitignore).not.toContain(".hegel-state/");
    expect(newGitignore).not.toContain("hegel.config.json");
    expect(newGitignore).toContain("node_modules");
    expect(newGitignore).toContain("build/");
  });

  it("removes empty .cursor/rules, .cursor, and .vscode directories", async () => {
    const projectDir = join(tempDir, "project4");
    await mkdir(join(projectDir, ".cursor", "rules"), { recursive: true });
    await mkdir(join(projectDir, ".vscode"), { recursive: true });
    
    // Create ONLY Hegel files so directories become empty
    await writeFile(join(projectDir, ".cursor", "hooks.json"), JSON.stringify({ version: 1, _hegel: { configHash: "abc" }, hooks: {} }), "utf-8");
    await writeFile(join(projectDir, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { "hegel-mcp": {} } }), "utf-8");
    await writeFile(join(projectDir, ".cursor", "rules", "hegel-companion.mdc"), "rule", "utf-8");
    await writeFile(join(projectDir, ".vscode", "settings.json"), JSON.stringify({ "hegel.model": "auto" }), "utf-8");

    const exitCode = await runUninstall(["node", "setup.js", "uninstall", projectDir, "--skip-npm"], {
      access: async () => {},
      log: vi.fn(),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: async () => [], // simulate empty directories
      readFile: async (p) => readFile(p, "utf-8"),
      writeFile: async (p, data) => writeFile(p, data, "utf-8"),
      rm: async (p, opts) => rm(p, opts),
      resolveHegelRoot: () => tempDir,
      platform: "linux",
      env: {}
    });

    expect(exitCode).toBe(0);
    
    // Verify directories were removed
    await expect(readFile(join(projectDir, ".cursor", "hooks.json"))).rejects.toThrow();
    await expect(readFile(join(projectDir, ".cursor", "mcp.json"))).rejects.toThrow();
    await expect(readFile(join(projectDir, ".vscode", "settings.json"))).rejects.toThrow();
  });

  it("cleans up orphaned headers in .gitignore", async () => {
    const projectDir = join(tempDir, "project5");
    await mkdir(projectDir, { recursive: true });

    const gitignoreContent = "# Logs\n*.log\n\n# Hegel Plugin\n.hegel-state/\nhegel.config.json\n\n# Other\nbuild/";
    await writeFile(join(projectDir, ".gitignore"), gitignoreContent, "utf-8");

    const exitCode = await runUninstall(["node", "setup.js", "uninstall", projectDir, "--skip-npm"], {
      access: async () => {},
      log: vi.fn(),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: vi.fn() as never,
      readFile: async (p) => readFile(p, "utf-8"),
      writeFile: async (p, data) => writeFile(p, data, "utf-8"),
      rm: async (p, opts) => rm(p, opts),
      resolveHegelRoot: () => tempDir,
      platform: "linux",
      env: {}
    });

    expect(exitCode).toBe(0);
    
    const newGitignore = await readFile(join(projectDir, ".gitignore"), "utf-8");
    expect(newGitignore).not.toContain(".hegel-state/");
    expect(newGitignore).not.toContain("hegel.config.json");
    expect(newGitignore).not.toContain("# Hegel Plugin");
    expect(newGitignore).toContain("# Logs");
    expect(newGitignore).toContain("*.log");
    expect(newGitignore).toContain("# Other");
    expect(newGitignore).toContain("build/");
  });
});
