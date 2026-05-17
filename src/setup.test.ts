import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access, stat } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HegelConfig } from "./config.js";
import {
  COMPANION_RULE,
  runSetup,
  runUpdate,
  pruneOrphanInstalls,
  readInstalledCompanionVersion,
  findAncestorHegelInstall,
  getCursorCliCandidates,
  installVsCodeExtension,
} from "./setup.js";

// Test helper: rejects every access call so auto-discovery of an installed
// Cursor CLI can't accidentally succeed against the test runner's real
// filesystem (previous tests passed the real `access` fn from fs/promises,
// which would find Cursor in Program Files on a developer machine and
// invalidate the ENOENT-on-PATH code path).
const accessAlwaysRejects = vi.fn(async () => {
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
});

const mockConfig: HegelConfig = {
  model: "auto",
  enableLlmAnalysis: true,
  timeoutSeconds: 15,
  strictness: "balanced",
  observeOnly: false,
};

describe("setup integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-setup-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("prints usage and exits with code 1 when no target path is provided", async () => {
    const logs: string[] = [];
    const writeHooksFileMock = vi.fn();

    const exitCode = await runSetup(["node", "dist/setup.js"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => [],
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(1);
    expect(writeHooksFileMock).not.toHaveBeenCalled();
    const combined = logs.join("\n");
    expect(combined).toContain("Usage: npx -p @hegel-dev/companion hegel-companion <command>");
    expect(combined).toContain("init <project-path>");
    expect(combined).toContain("update [project-path]");
    expect(combined).toContain("Current config:");
  });

  it("writes the companion rule and installs the extension when a vsix is present", async () => {
    const projectDir = join(tempDir, "project");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    const logs: string[] = [];
    const writeHooksFileMock = vi.fn(async () => true);
    const execFileSyncMock = vi.fn();

    await mkdir(projectDir, { recursive: true });
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(join(vscodeDir, "hegel-companion-0.1.0.vsix"), "vsix", "utf-8");

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: execFileSyncMock as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
      // Pin to Linux so we check the direct execFileSync option shape.
      // Windows cmd.exe dispatch has its own dedicated tests below.
      platform: "linux",
    });

    const rulePath = join(projectDir, ".cursor", "rules", "hegel-companion.mdc");
    const rule = await readFile(rulePath, "utf-8");

    expect(exitCode).toBe(0);
    // Without --force, writeHooksFile is called with force=false so the
    // hash-compare short-circuit skips redundant rewrites.
    expect(writeHooksFileMock).toHaveBeenCalledWith(resolve(projectDir), mockConfig, false, false);
    expect(rule).toBe(COMPANION_RULE);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "cursor",
      ["--install-extension", join(vscodeDir, "hegel-companion-0.1.0.vsix")],
      { stdio: "inherit" }
    );
    expect(logs.join("\n")).toContain("Hegel hooks written");
  });

  it("continues when vsix directory is unreadable, reports vsix-not-found at end", async () => {
    const projectDir = join(tempDir, "project");
    const logs: string[] = [];
    const writeHooksFileMock = vi.fn(async () => true);

    await mkdir(projectDir, { recursive: true });

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => ({ ...mockConfig, enableLlmAnalysis: false }),
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => {
        throw new Error("missing extension");
      },
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => tempDir,
    });

    const combined = logs.join("\n");
    expect(exitCode).toBe(0);
    // 1.0.3 changes the warning format — extension install failures now get
    // a prominent block at the END of init output, not a one-liner mid-flow.
    expect(combined).toContain("VS Code extension was NOT installed automatically");
    expect(combined).toContain("not readable");
    expect(combined).toContain("The Hegel sidebar won't appear");
  });

  it("surfaces a 'cursor CLI not found' block when PATH and auto-discovery both fail", async () => {
    // Regression test for the 1.0.3 extension-install UX fix, updated for
    // the 1.0.4 auto-discovery behavior. The setup now tries PATH first and
    // falls back to well-known install paths; only when BOTH fail should the
    // loud cursor-cli-missing block appear. To force that outcome in a test
    // environment we pin platform + env to a zero-candidate combination and
    // reject every access call.
    const projectDir = join(tempDir, "project");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.4.vsix");
    const logs: string[] = [];
    const writeHooksFileMock = vi.fn(async () => true);

    await mkdir(projectDir, { recursive: true });
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(vsixPath, "vsix", "utf-8");

    const enoent = Object.assign(new Error("spawn cursor ENOENT"), { code: "ENOENT" });
    const execFileSyncMock = vi.fn(() => { throw enoent; });

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access: accessAlwaysRejects,
      execFileSync: execFileSyncMock as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
      // Pin platform+env so getCursorCliCandidates is deterministic. Linux
      // with no HOME → only /usr/local/bin/cursor and /usr/bin/cursor, both
      // rejected by accessAlwaysRejects.
      platform: "linux",
      env: {},
    });

    const combined = logs.join("\n");
    expect(exitCode).toBe(0);
    expect(combined).toContain("VS Code extension was NOT installed automatically");
    expect(combined).toContain("'cursor' CLI not found on PATH");
    expect(combined).toContain("no install detected at known locations");
    expect(combined).toContain(`cursor --install-extension "${vsixPath}"`);
    expect(combined).toContain("fully quit and reopen Cursor");
  });

  it("surfaces a generic install-failed block when cursor runs but fails non-ENOENT", async () => {
    const projectDir = join(tempDir, "project");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.3.vsix");
    const logs: string[] = [];
    const writeHooksFileMock = vi.fn(async () => true);

    await mkdir(projectDir, { recursive: true });
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(vsixPath, "vsix", "utf-8");

    const execFileSyncMock = vi.fn(() => { throw new Error("exit code 1: installation checksum mismatch"); });

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: execFileSyncMock as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    const combined = logs.join("\n");
    expect(exitCode).toBe(0);
    expect(combined).toContain("VS Code extension was NOT installed automatically");
    expect(combined).toContain("checksum mismatch");
    expect(combined).toContain(`cursor --install-extension "${vsixPath}"`);
  });

  it("rejects `init init` as the typo it almost always is", async () => {
    const errors: string[] = [];
    const writeHooksFileMock = vi.fn();

    const exitCode = await runSetup(["node", "dist/setup.js", "init", "init"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: (message) => errors.push(message),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(1);
    expect(writeHooksFileMock).not.toHaveBeenCalled();
    expect(errors.join("\n")).toContain("'init' is not a valid project path");
    expect(errors.join("\n")).toContain("init .");
  });

  it("rejects `init update` with upgrade-first guidance", async () => {
    const errors: string[] = [];
    const writeHooksFileMock = vi.fn();

    const exitCode = await runSetup(["node", "dist/setup.js", "init", "update", "."], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: (message) => errors.push(message),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(1);
    expect(writeHooksFileMock).not.toHaveBeenCalled();
    const combined = errors.join("\n");
    expect(combined).toContain("'update' is a command, not a project path");
    expect(combined).toContain("npm install @hegel-dev/companion@latest");
    expect(combined).toContain("npx -p @hegel-dev/companion hegel-companion update .");
  });

  it("refuses to scaffold a nested install inside an existing Hegel project", async () => {
    const parentDir = join(tempDir, "parent");
    const nestedDir = join(parentDir, "hegel-mcp");
    await mkdir(join(parentDir, ".cursor"), { recursive: true });
    await writeFile(join(parentDir, "hegel.config.json"), "{}", "utf-8");
    await writeFile(join(parentDir, ".cursor", "hooks.json"), "{}", "utf-8");

    const errors: string[] = [];
    const writeHooksFileMock = vi.fn();

    const exitCode = await runSetup(["node", "dist/setup.js", nestedDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: (message) => errors.push(message),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(1);
    expect(writeHooksFileMock).not.toHaveBeenCalled();
    expect(errors.join("\n")).toContain("already has a Hegel install");
    expect(errors.join("\n")).toContain("--force");
  });

  it("allows nested install when --force is passed", async () => {
    const parentDir = join(tempDir, "parent2");
    const nestedDir = join(parentDir, "hegel-mcp");
    await mkdir(join(parentDir, ".cursor"), { recursive: true });
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(parentDir, "hegel.config.json"), "{}", "utf-8");
    await writeFile(join(parentDir, ".cursor", "hooks.json"), "{}", "utf-8");

    const writeHooksFileMock = vi.fn(async () => true);

    const exitCode = await runSetup(["node", "dist/setup.js", nestedDir, "--force"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => [],
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(0);
    // --force propagates all the way to writeHooksFile so the hash-compare
    // short-circuit is bypassed and hooks.json is rewritten unconditionally.
    expect(writeHooksFileMock).toHaveBeenCalledWith(resolve(nestedDir), mockConfig, true, false);
  });

  it("uses repo-root-relative dist path for MCP in source-repo mode", async () => {
    // Source-repo mode: projectPath === hegelRoot. MCP args must stay relative so
    // committed .cursor/mcp.json is portable (no machine-specific absolute paths).
    const repoDir = tempDir;
    const writeHooksFileMock = vi.fn(async () => true);

    const exitCode = await runSetup(["node", "dist/setup.js", repoDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => [],
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => repoDir,
    });

    expect(exitCode).toBe(0);
    const mcpContents = await readFile(join(repoDir, ".cursor", "mcp.json"), "utf-8");
    const mcp = JSON.parse(mcpContents);
    const args = mcp.mcpServers["hegel-mcp"].args;
    expect(args).toEqual(["dist/mcp.js"]);
    expect(mcp.mcpServers["hegel-mcp"].env).toBeUndefined();
  });

  it("uses node_modules MCP path in consumer mode", async () => {
    const projectDir = join(tempDir, "consumer-project");
    const hegelRoot = join(tempDir, "hegel-root");
    await mkdir(projectDir, { recursive: true });
    await mkdir(hegelRoot, { recursive: true });
    const writeHooksFileMock = vi.fn(async () => true);

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => [],
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    const mcp = JSON.parse(await readFile(join(projectDir, ".cursor", "mcp.json"), "utf-8"));
    expect(mcp.mcpServers["hegel-mcp"].args).toEqual([
      "node_modules/@hegel-dev/companion/dist/mcp.js",
    ]);
  });

  it("reports 'already up to date' when existing hooks.json matches and --force is not passed", async () => {
    const projectDir = join(tempDir, "existing");
    await mkdir(join(projectDir, ".cursor"), { recursive: true });
    // Seed an existing hooks.json so the pre-flight branch triggers.
    await writeFile(
      join(projectDir, ".cursor", "hooks.json"),
      JSON.stringify({ version: 1, hooks: {}, _hegel: { configHash: "abc", generatedAt: "x" } }),
      "utf-8"
    );
    const logs: string[] = [];
    // writeHooksFile returning false signals "nothing changed" (hash matched).
    const writeHooksFileMock = vi.fn(async () => false);

    const exitCode = await runSetup(["node", "dist/setup.js", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir: async () => [],
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: (message) => logs.push(message),
      error: vi.fn(),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(0);
    expect(writeHooksFileMock).toHaveBeenCalledWith(resolve(projectDir), mockConfig, false, false);
    const combined = logs.join("\n");
    expect(combined).toContain("Existing Hegel install detected");
    expect(combined).toContain("hooks.json is already up to date");
  });
});

describe("getCursorCliCandidates", () => {
  it("returns Windows candidates anchored in LOCALAPPDATA and Program Files", () => {
    const candidates = getCursorCliCandidates("win32", {
      LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
      ProgramFiles: "C:\\Program Files",
    });
    // All Windows candidates should end in cursor.cmd (not Cursor.exe — that
    // would launch a second IDE window instead of running the CLI).
    for (const c of candidates) {
      expect(c.endsWith("cursor.cmd")).toBe(true);
    }
    expect(candidates.some((c) => c.includes("AppData"))).toBe(true);
    expect(candidates.some((c) => c.includes("Program Files"))).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
  });

  it("returns macOS candidates under /Applications and ~/Applications", () => {
    const candidates = getCursorCliCandidates("darwin", { HOME: "/Users/dev" });
    expect(candidates[0]).toBe("/Applications/Cursor.app/Contents/Resources/app/bin/cursor");
    expect(candidates.some((c) => c.includes("/Users/dev/Applications/Cursor.app"))).toBe(true);
  });

  it("returns Linux candidates in /usr and user-local locations", () => {
    const candidates = getCursorCliCandidates("linux", { HOME: "/home/dev" });
    expect(candidates).toContain("/usr/local/bin/cursor");
    expect(candidates).toContain("/usr/bin/cursor");
    expect(candidates.some((c) => c.includes("/home/dev/.local/share/cursor/bin/cursor"))).toBe(true);
    expect(candidates.some((c) => c.includes("/home/dev/.cursor/bin/cursor"))).toBe(true);
  });

  it("gracefully handles missing env vars without throwing", () => {
    expect(getCursorCliCandidates("win32", {})).toEqual([]);
    expect(getCursorCliCandidates("darwin", {})).toEqual([
      "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    ]);
    // Linux always has the hard-coded /usr paths regardless of HOME.
    expect(getCursorCliCandidates("linux", {})).toEqual([
      "/usr/local/bin/cursor",
      "/usr/bin/cursor",
    ]);
  });
});

describe("installVsCodeExtension auto-discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-cursor-discovery-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function baseDeps(overrides: Partial<Parameters<typeof installVsCodeExtension>[1]>) {
    return {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true) as never,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => tempDir,
      ...overrides,
    };
  }

  it("falls back to an auto-discovered absolute path when PATH ENOENTs", async () => {
    // Simulate: `cursor` on PATH is missing (ENOENT), but an install exists
    // at one of the candidate paths. Installer should retry via the
    // absolute path and report `installed` with usedCursorPath set.
    const vscodeDir = join(tempDir, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.4.vsix");
    await writeFile(vsixPath, "vsix", "utf-8");

    // Pin to Linux so we know the exact candidate order.
    const installedPath = "/usr/local/bin/cursor";
    const enoent = Object.assign(new Error("spawn cursor ENOENT"), { code: "ENOENT" });
    const execFileSyncMock = vi
      .fn()
      // First call: `cursor` on PATH → ENOENT
      .mockImplementationOnce(() => { throw enoent; })
      // Second call: absolute path → success (no throw)
      .mockImplementationOnce(() => undefined);

    const accessMock = vi.fn(async (p: string) => {
      if (p === installedPath) return;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const logs: string[] = [];
    const result = await installVsCodeExtension(
      vscodeDir,
      baseDeps({
        execFileSync: execFileSyncMock as never,
        access: accessMock,
        log: (m: string) => logs.push(m),
        platform: "linux",
        env: { HOME: "/home/dev" },
      }) as never
    );

    expect(result.status).toBe("installed");
    expect(result.usedCursorPath).toBe(installedPath);
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "cursor",
      ["--install-extension", vsixPath],
      { stdio: "inherit" }
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      installedPath,
      ["--install-extension", vsixPath],
      { stdio: "inherit" }
    );
    expect(logs.join("\n")).toContain("not on PATH — found install at");
  });

  it("reports install-failed when auto-discovered cursor rejects the install", async () => {
    const vscodeDir = join(tempDir, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.4.vsix");
    await writeFile(vsixPath, "vsix", "utf-8");

    const installedPath = "/usr/local/bin/cursor";
    const enoent = Object.assign(new Error("spawn cursor ENOENT"), { code: "ENOENT" });
    const execFileSyncMock = vi
      .fn()
      .mockImplementationOnce(() => { throw enoent; })
      .mockImplementationOnce(() => { throw new Error("extension signature check failed"); });

    const accessMock = vi.fn(async (p: string) => {
      if (p === installedPath) return;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await installVsCodeExtension(
      vscodeDir,
      baseDeps({
        execFileSync: execFileSyncMock as never,
        access: accessMock,
        platform: "linux",
        env: { HOME: "/home/dev" },
      }) as never
    );

    expect(result.status).toBe("install-failed");
    expect(result.reason).toContain("retry via /usr/local/bin/cursor failed");
    expect(result.reason).toContain("signature check failed");
  });

  it("uses cmd.exe on Windows so cursor.cmd shims launch and paths with spaces survive", async () => {
    // 1.0.5 regression test for the 1.0.4 Windows bug: Node's execFileSync
    // cannot launch `.cmd`/`.bat` files (which is how the `cursor` CLI ships
    // on Windows) directly. We now invoke cmd.exe explicitly instead of using
    // the deprecated shell:true + args[] combination.
    const vscodeDir = join(tempDir, "hegel root with spaces", "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.5.vsix");
    await writeFile(vsixPath, "vsix", "utf-8");

    const execFileSyncMock = vi.fn();

    const result = await installVsCodeExtension(
      vscodeDir,
      baseDeps({
        execFileSync: execFileSyncMock as never,
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" },
      }) as never
    );

    expect(result.status).toBe("installed");
    // Key assertion: cmd.exe is invoked directly, with one quoted command
    // string so PATHEXT resolves `cursor` and the VSIX path can contain spaces.
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "cmd.exe",
      ["/d", "/s", "/c", `cursor "--install-extension" "${vsixPath}"`],
      { stdio: "inherit", windowsVerbatimArguments: true }
    );
  });

  it("uses cmd.exe for an auto-discovered cursor.cmd path on Windows", async () => {
    const vscodeDir = join(tempDir, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.5.vsix");
    await writeFile(vsixPath, "vsix", "utf-8");

    const discoveredCmd =
      "C:\\Users\\x\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd";
    const enoent = Object.assign(new Error("spawn cursor ENOENT"), { code: "ENOENT" });
    const execFileSyncMock = vi
      .fn()
      .mockImplementationOnce(() => { throw enoent; })
      .mockImplementationOnce(() => undefined);

    const accessMock = vi.fn(async (p: string) => {
      if (p === discoveredCmd) return;
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await installVsCodeExtension(
      vscodeDir,
      baseDeps({
        execFileSync: execFileSyncMock as never,
        access: accessMock,
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" },
      }) as never
    );

    expect(result.status).toBe("installed");
    expect(result.usedCursorPath).toBe(discoveredCmd);
    // Both attempts must go through cmd.exe on Windows — the .cmd retry is the
    // specific path that 1.0.4 would have broken even after auto-discovery.
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "cmd.exe",
      ["/d", "/s", "/c", `cursor "--install-extension" "${vsixPath}"`],
      { stdio: "inherit", windowsVerbatimArguments: true }
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      "cmd.exe",
      ["/d", "/s", "/c", `""${discoveredCmd}" "--install-extension" "${vsixPath}""`],
      { stdio: "inherit", windowsVerbatimArguments: true }
    );
  });

  it("short-circuits non-ENOENT errors from PATH without probing candidates", async () => {
    // If `cursor` is on PATH but rejects the install (e.g. signature mismatch),
    // we should NOT fall back to auto-discovered paths — the error is genuine
    // and retrying wastes time + would produce a misleading "retry via X"
    // error message.
    const vscodeDir = join(tempDir, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    const vsixPath = join(vscodeDir, "hegel-companion-1.0.4.vsix");
    await writeFile(vsixPath, "vsix", "utf-8");

    const execFileSyncMock = vi.fn(() => {
      throw new Error("exit code 1: checksum mismatch");
    });
    const accessMock = vi.fn(async () => {
      throw new Error("access should not be called");
    });

    const result = await installVsCodeExtension(
      vscodeDir,
      baseDeps({
        execFileSync: execFileSyncMock as never,
        access: accessMock,
        platform: "linux",
        env: { HOME: "/home/dev" },
      }) as never
    );

    expect(result.status).toBe("install-failed");
    expect(result.reason).toContain("checksum mismatch");
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
    expect(accessMock).not.toHaveBeenCalled();
  });
});

describe("pruneOrphanInstalls", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-prune-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("removes orphan dirs that contain a Hegel marker file", async () => {
    // Simulate the `init hegel-mcp` mistake: a stray hegel-mcp/ dir with its
    // own hegel.config.json scaffolded inside the user's project root.
    const orphan = join(tempDir, "hegel-mcp");
    await mkdir(orphan, { recursive: true });
    await writeFile(join(orphan, "hegel.config.json"), "{}", "utf-8");

    const logs: string[] = [];
    const result = await pruneOrphanInstalls(tempDir, {
      access,
      rm,
      log: (m: string) => logs.push(m),
    });

    expect(result.pruned).toEqual([orphan]);
    expect(result.skipped).toHaveLength(0);
    await expect(stat(orphan)).rejects.toThrow();
    expect(logs.join("\n")).toContain(`Pruned orphan install at ${orphan}`);
  });

  it("does not touch dirs that lack a Hegel marker file", async () => {
    // User's own `init/` dir (e.g. an `init` script directory in their app).
    // Same name as the orphan candidate, but no Hegel markers — must be left
    // strictly alone.
    const userDir = join(tempDir, "init");
    await mkdir(userDir, { recursive: true });
    await writeFile(join(userDir, "user-code.ts"), "// safe", "utf-8");

    const result = await pruneOrphanInstalls(tempDir, { access, rm, log: vi.fn() });

    expect(result.pruned).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].path).toBe(userDir);
    expect(result.skipped[0].reason).toContain("no Hegel marker");
    // Real proof: the user's file is still there.
    await expect(readFile(join(userDir, "user-code.ts"), "utf-8")).resolves.toContain("safe");
  });

  it("skips silently when neither orphan candidate dir exists", async () => {
    const result = await pruneOrphanInstalls(tempDir, { access, rm, log: vi.fn() });
    expect(result.pruned).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it("recognises .cursor/hooks.json as a marker (not just hegel.config.json)", async () => {
    const orphan = join(tempDir, "init");
    await mkdir(join(orphan, ".cursor"), { recursive: true });
    await writeFile(join(orphan, ".cursor", "hooks.json"), "{}", "utf-8");

    const result = await pruneOrphanInstalls(tempDir, { access, rm, log: vi.fn() });
    expect(result.pruned).toEqual([orphan]);
  });
});

describe("readInstalledCompanionVersion", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-version-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns version string from the installed package.json", async () => {
    const pkgDir = join(tempDir, "node_modules", "@hegel-dev", "companion");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name: "@hegel-dev/companion", version: "1.2.3" }),
      "utf-8"
    );

    expect(await readInstalledCompanionVersion(tempDir)).toBe("1.2.3");
  });

  it("returns null when the package isn't installed", async () => {
    expect(await readInstalledCompanionVersion(tempDir)).toBeNull();
  });
});

describe("runUpdate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-update-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Seed a minimal "existing Hegel install" so update doesn't bail out. */
  async function seedInstall(dir: string) {
    await mkdir(join(dir, ".cursor"), { recursive: true });
    await writeFile(join(dir, "hegel.config.json"), JSON.stringify({ model: "auto" }), "utf-8");
    await writeFile(
      join(dir, ".cursor", "hooks.json"),
      JSON.stringify({ version: 1, hooks: {}, _hegel: { configHash: "abc", generatedAt: "x" } }),
      "utf-8"
    );
  }

  it("refuses to update when no Hegel install exists at the path", async () => {
    const errors: string[] = [];
    const exitCode = await runUpdate(["node", "setup.js", "update", tempDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn() as never,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: vi.fn() as never,
      log: vi.fn(),
      error: (m: string) => errors.push(m),
      resolveHegelRoot: () => tempDir,
    });
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("no Hegel install detected");
    expect(errors.join("\n")).toContain("npx -p @hegel-dev/companion hegel-companion init");
  });

  it("runs npm install + delegates to setup with --force in a typical update", async () => {
    const projectDir = join(tempDir, "project");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(join(vscodeDir, "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");
    await seedInstall(projectDir);

    const writeHooksFileMock = vi.fn(async () => true);
    const execFileSyncMock = vi.fn();
    const logs: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
      // Pin to Linux so we check the POSIX-shape options; Windows cmd.exe
      // behavior has dedicated tests below.
      platform: "linux",
    });

    expect(exitCode).toBe(0);
    // First: npm install of the package.
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["install", "@hegel-dev/companion@latest"],
      { stdio: "inherit", cwd: resolve(projectDir) }
    );
    // Then: cursor --install-extension (via the inner runSetup call).
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "cursor",
      ["--install-extension", join(vscodeDir, "hegel-companion-1.0.4.vsix")],
      { stdio: "inherit" }
    );
    // The inner runSetup must be called with --force so hooks.json is rewritten
    // even when the config hash hasn't changed.
    expect(writeHooksFileMock).toHaveBeenCalledWith(resolve(projectDir), mockConfig, true, false);
    const combined = logs.join("\n");
    expect(combined).toContain("Updating Hegel install at");
    expect(combined).toContain("Reminder: fully quit and reopen Cursor");
  });

  it("uses cmd.exe on Windows so npm.cmd resolves in runUpdate", async () => {
    // 1.0.5 regression test — the exact bug CopybarasCircle hit. On Windows
    // `npm` is `npm.cmd` / `npm.ps1`; plain execFileSync throws ENOENT on
    // `npm` even when npm works from an interactive shell. The test proves we
    // now route through cmd.exe without shell:true + args[].
    const projectDir = join(tempDir, "windows-npm");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(join(vscodeDir, "hegel-companion-1.0.5.vsix"), "vsix", "utf-8");
    await seedInstall(projectDir);

    const execFileSyncMock = vi.fn();

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" },
    });

    expect(exitCode).toBe(0);
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      1,
      "cmd.exe",
      ["/d", "/s", "/c", `npm "install" "@hegel-dev/companion@latest"`],
      { stdio: "inherit", cwd: resolve(projectDir), windowsVerbatimArguments: true }
    );
  });

  it("skips npm install in source-repo mode", async () => {
    const repoDir = tempDir;
    await seedInstall(repoDir);
    await mkdir(join(repoDir, "hegel-vscode"), { recursive: true });
    await writeFile(join(repoDir, "hegel-vscode", "hegel-companion-dev.vsix"), "vsix", "utf-8");

    const execFileSyncMock = vi.fn();
    const logs: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", repoDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => repoDir,
    });

    expect(exitCode).toBe(0);
    // npm install must NOT have been invoked — that would clobber the dev tree.
    const npmCalls = execFileSyncMock.mock.calls.filter((c) => c[0] === "npm");
    expect(npmCalls).toHaveLength(0);
    expect(logs.join("\n")).toContain("Source-repo mode detected");
  });

  it("--skip-npm bypasses npm install but still re-runs setup with --force", async () => {
    const projectDir = join(tempDir, "skip-project");
    const hegelRoot = join(tempDir, "hegel-root");
    const vscodeDir = join(hegelRoot, "hegel-vscode");
    await mkdir(vscodeDir, { recursive: true });
    await writeFile(join(vscodeDir, "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");
    await seedInstall(projectDir);

    const execFileSyncMock = vi.fn();
    const writeHooksFileMock = vi.fn(async () => true);

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir, "--skip-npm"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: writeHooksFileMock,
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: vi.fn(),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    expect(execFileSyncMock.mock.calls.filter((c) => c[0] === "npm")).toHaveLength(0);
    expect(writeHooksFileMock).toHaveBeenCalledWith(resolve(projectDir), mockConfig, true, false);
  });

  it("bails with a clear error when npm is not on PATH", async () => {
    const projectDir = join(tempDir, "no-npm");
    await seedInstall(projectDir);

    const enoent = Object.assign(new Error("spawn npm ENOENT"), { code: "ENOENT" });
    const execFileSyncMock = vi.fn(() => { throw enoent; });
    const errors: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: vi.fn(),
      error: (m: string) => errors.push(m),
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain("'npm' not found on PATH");
    expect(errors.join("\n")).toContain("--skip-npm");
  });

  it("prunes orphan hegel-mcp/ left behind by past CLI mistakes", async () => {
    const projectDir = join(tempDir, "with-orphan");
    await seedInstall(projectDir);
    // Seed orphan dir with marker so prune triggers
    const orphan = join(projectDir, "hegel-mcp");
    await mkdir(orphan, { recursive: true });
    await writeFile(join(orphan, "hegel.config.json"), "{}", "utf-8");

    const hegelRoot = join(tempDir, "hegel-root");
    await mkdir(join(hegelRoot, "hegel-vscode"), { recursive: true });
    await writeFile(join(hegelRoot, "hegel-vscode", "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");

    const execFileSyncMock = vi.fn();
    const logs: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir, "--skip-npm"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    await expect(stat(orphan)).rejects.toThrow();
    expect(logs.join("\n")).toContain("Pruned orphan install");
  });

  it("reports version transition when before/after differ", async () => {
    const projectDir = join(tempDir, "version-bump");
    await seedInstall(projectDir);
    // Seed before-version package.json that the update will "upgrade" by
    // overwriting in our fake execFileSync npm step.
    const pkgDir = join(projectDir, "node_modules", "@hegel-dev", "companion");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "package.json"), JSON.stringify({ version: "1.0.3" }), "utf-8");

    const hegelRoot = join(tempDir, "hegel-root");
    await mkdir(join(hegelRoot, "hegel-vscode"), { recursive: true });
    await writeFile(join(hegelRoot, "hegel-vscode", "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");

    // Fake npm install: bump the version on disk to 1.0.4.
    const execFileSyncMock = vi.fn((cmd: string, args: string[]) => {
      if (cmd === "npm" || (cmd === "cmd.exe" && args.join(" ").includes("npm"))) {
        writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ version: "1.0.4" }), "utf-8");
      }
    });
    const logs: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Updated @hegel-dev/companion: 1.0.3 → 1.0.4");
  });

  it("reports 'already at latest' when before == after", async () => {
    const projectDir = join(tempDir, "no-bump");
    await seedInstall(projectDir);
    const pkgDir = join(projectDir, "node_modules", "@hegel-dev", "companion");
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "package.json"), JSON.stringify({ version: "1.0.4" }), "utf-8");

    const hegelRoot = join(tempDir, "hegel-root");
    await mkdir(join(hegelRoot, "hegel-vscode"), { recursive: true });
    await writeFile(join(hegelRoot, "hegel-vscode", "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");

    const execFileSyncMock = vi.fn(); // npm install is a no-op (same version)
    const logs: string[] = [];

    const exitCode = await runUpdate(["node", "setup.js", "update", projectDir], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    const combined = logs.join("\n");
    expect(combined).toContain("already at latest");
    expect(combined).toContain("refreshed hooks + VSIX");
  });

  it("dispatches `update` from runSetup positional arg", async () => {
    const projectDir = join(tempDir, "dispatch");
    await seedInstall(projectDir);
    const hegelRoot = join(tempDir, "hegel-root");
    await mkdir(join(hegelRoot, "hegel-vscode"), { recursive: true });
    await writeFile(join(hegelRoot, "hegel-vscode", "hegel-companion-1.0.4.vsix"), "vsix", "utf-8");

    const execFileSyncMock = vi.fn();
    const logs: string[] = [];

    // Note: argv[2] === "update" should route to runUpdate, which then reads
    // argv[3] as the project path. This proves the subcommand dispatcher works.
    const exitCode = await runSetup(["node", "setup.js", "update", projectDir, "--skip-npm"], {
      loadConfig: async () => mockConfig,
      writeHooksFile: vi.fn(async () => true),
      mkdir,
      writeFile,
      readdir,
      readFile,
      access,
      rm,
      execFileSync: execFileSyncMock as never,
      log: (m: string) => logs.push(m),
      error: vi.fn(),
      resolveHegelRoot: () => hegelRoot,
    });

    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Updating Hegel install at");
  });
});

describe("findAncestorHegelInstall", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-ancestor-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns the ancestor path when one has hegel.config.json and .cursor/hooks.json", async () => {
    const parent = join(tempDir, "parent");
    const nested = join(parent, "nested");
    await mkdir(join(parent, ".cursor"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(join(parent, "hegel.config.json"), "{}", "utf-8");
    await writeFile(join(parent, ".cursor", "hooks.json"), "{}", "utf-8");

    const found = await findAncestorHegelInstall(nested);
    expect(found).toBe(parent);
  });

  it("returns null when no ancestor has both marker files", async () => {
    const parent = join(tempDir, "parent");
    const nested = join(parent, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(join(parent, "hegel.config.json"), "{}", "utf-8");
    // Intentionally no .cursor/hooks.json — partial marker shouldn't match.

    const found = await findAncestorHegelInstall(nested);
    expect(found).toBeNull();
  });

  it("does not match the start directory itself, only strict ancestors", async () => {
    const self = join(tempDir, "self");
    await mkdir(join(self, ".cursor"), { recursive: true });
    await writeFile(join(self, "hegel.config.json"), "{}", "utf-8");
    await writeFile(join(self, ".cursor", "hooks.json"), "{}", "utf-8");

    const found = await findAncestorHegelInstall(self);
    expect(found).toBeNull();
  });
});
