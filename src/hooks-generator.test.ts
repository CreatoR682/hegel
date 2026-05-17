import { describe, it, expect, vi, beforeEach } from "vitest";
import { configHash, readExistingHash, generateHooksConfig, writeHooksFile } from "./hooks-generator.js";
import type { HegelConfig } from "./config.js";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe("hooks-generator", () => {
  const mockConfig: HegelConfig = {
    model: "auto",
    enableLlmAnalysis: true,
    timeoutSeconds: 15,
    strictness: "balanced",
    observeOnly: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configHash generates consistent hash", () => {
    const hash1 = configHash(mockConfig);
    const hash2 = configHash({ ...mockConfig });
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(12);
  });

  it("configHash changes when significant fields change", () => {
    const hash1 = configHash(mockConfig);
    const hash2 = configHash({ ...mockConfig, strictness: "relaxed" });
    expect(hash1).not.toBe(hash2);
  });

  it("readExistingHash returns hash from file", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ _hegel: { configHash: "123456" } }));
    const hash = await readExistingHash("hooks.json");
    expect(hash).toBe("123456");
  });

  it("readExistingHash returns null on error", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const hash = await readExistingHash("hooks.json");
    expect(hash).toBeNull();
  });

  it("generateHooksConfig includes LLM hooks when enabled", () => {
    const hooks = generateHooksConfig(mockConfig);
    expect(hooks.hooks.beforeSubmitPrompt.some(h => h.type === "prompt")).toBe(true);
    expect(hooks.hooks.afterAgentResponse.some(h => h.type === "prompt")).toBe(true);
  });

  it("generateHooksConfig excludes LLM hooks when disabled", () => {
    const hooks = generateHooksConfig({ ...mockConfig, enableLlmAnalysis: false });
    expect(hooks.hooks.beforeSubmitPrompt.some(h => h.type === "prompt")).toBe(false);
    expect(hooks.hooks.afterAgentResponse.some(h => h.type === "prompt")).toBe(false);
  });

  it("writeHooksFile writes when force is true", async () => {
    const result = await writeHooksFile("/test", mockConfig, true);
    expect(result).toBe(true);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it("writeHooksFile skips write when hash matches", async () => {
    const hash = configHash(mockConfig);
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ _hegel: { configHash: hash } }));
    const result = await writeHooksFile("/test", mockConfig, false);
    expect(result).toBe(false);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("writeHooksFile writes when hash differs", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ _hegel: { configHash: "oldhash" } }));
    const result = await writeHooksFile("/test", mockConfig, false);
    expect(result).toBe(true);
    expect(fs.writeFile).toHaveBeenCalled();
  });
});
