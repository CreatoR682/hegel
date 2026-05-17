import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, access, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

describe("E2E Consumer Verification", () => {
  let tempDir: string;
  let hegelRoot: string;

  beforeAll(() => {
    hegelRoot = process.cwd();
    // Build the project first to ensure dist/setup.js is fresh
    execFileSync(process.execPath, [
      join(hegelRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.build.json"
    ], { cwd: hegelRoot, stdio: "ignore" });
  }, 30000);

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-e2e-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("successfully runs init on a mock consumer project", async () => {
    const projectDir = join(tempDir, "consumer");
    
    // Create a mock package.json so the check passes
    await mkdir(join(projectDir, "node_modules", "@hegel-dev", "companion"), { recursive: true });
    await writeFile(join(projectDir, "node_modules", "@hegel-dev", "companion", "package.json"), "{}", "utf-8");

    const env = { ...process.env };
    delete env.VITEST;
    
    // Run `node dist/setup.js init <projectDir>`
    // We mock PATH so it gracefully reports cursor missing instead of failing to spawn it
    const output = execFileSync(process.execPath, [join(hegelRoot, "dist", "setup.js"), "init", projectDir], { 
      cwd: hegelRoot,
      env,
      encoding: "utf-8"
    });
    
    expect(output).toContain("Default hegel.config.json created");
    expect(output).toContain("Hegel hooks written to");

    // Verify .cursor directory and its contents
    await access(join(projectDir, ".cursor"));
    await access(join(projectDir, ".cursor", "hooks.json"));
    await access(join(projectDir, ".cursor", "mcp.json"));
    await access(join(projectDir, ".cursor", "rules", "hegel-companion.mdc"));
    await access(join(projectDir, "hegel.config.json"));

    const hooksContent = JSON.parse(await readFile(join(projectDir, ".cursor", "hooks.json"), "utf-8"));
    expect(hooksContent.hooks).toBeDefined();

    const mcpContent = JSON.parse(await readFile(join(projectDir, ".cursor", "mcp.json"), "utf-8"));
    expect(mcpContent.mcpServers["hegel-mcp"]).toBeDefined();
    
    const configContent = JSON.parse(await readFile(join(projectDir, "hegel.config.json"), "utf-8"));
    expect(configContent.model).toBe("auto");
  }, 30000);

  it("successfully runs update on a mock consumer project", async () => {
    const projectDir = join(tempDir, "consumer-update");
    
    // Create a mock package.json so the check passes
    await mkdir(join(projectDir, "node_modules", "@hegel-dev", "companion"), { recursive: true });
    await writeFile(join(projectDir, "node_modules", "@hegel-dev", "companion", "package.json"), "{}", "utf-8");

    const env = { ...process.env };
    delete env.VITEST;

    // First init the project
    execFileSync(process.execPath, [join(hegelRoot, "dist", "setup.js"), "init", projectDir], { 
      cwd: hegelRoot,
      env,
      encoding: "utf-8"
    });

    // Then run update --skip-npm (since we don't want to actually run npm install in tests)
    const updateOutput = execFileSync(process.execPath, [join(hegelRoot, "dist", "setup.js"), "update", projectDir, "--skip-npm"], { 
      cwd: hegelRoot,
      env,
      encoding: "utf-8"
    });

    expect(updateOutput).toContain("Updating Hegel install at");
    expect(updateOutput).toContain("--skip-npm passed — skipping dependency upgrade");
    expect(updateOutput).toContain("Update complete");

    // Verify files still exist after update
    await access(join(projectDir, ".cursor", "hooks.json"));
    await access(join(projectDir, "hegel.config.json"));
  }, 30000);
});
