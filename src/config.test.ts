import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig, configPath } from "./config.js";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads default config when file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const config = await loadConfig();
    expect(config).toEqual({
      model: "auto",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
    });
  });

  it("merges parsed config with defaults", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({ strictness: "strict" })
    );
    const config = await loadConfig();
    expect(config.strictness).toBe("strict");
    expect(config.model).toBe("auto"); // Default preserved
  });

  it("falls back to defaults when config json is invalid", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("{not valid json");
    const config = await loadConfig();
    expect(config).toEqual({
      model: "auto",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
    });
  });

  it("returns the hegel config path", () => {
    expect(configPath()).toMatch(/hegel\.config\.json$/);
  });
});
