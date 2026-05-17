import { describe, it, expect } from "vitest";
import { formatConcerns, formatBlockMessage } from "./format.js";
import type { Concern } from "./types.js";

describe("format", () => {
  it("formatConcerns returns empty string for no concerns", () => {
    expect(formatConcerns([])).toBe("");
  });

  it("formatConcerns formats concerns correctly", () => {
    const concerns: Concern[] = [
      { severity: "critical", category: "test", message: "critical message", suggestion: "do this" },
      { severity: "warning", category: "test2", message: "warning message" },
      { severity: "info", category: "test3", message: "info message" },
    ];
    const result = formatConcerns(concerns);
    expect(result).toContain("⚖️ Hegel [Layer 1]:");
    expect(result).toContain("🔴 [test] critical message");
    expect(result).toContain("→ do this");
    expect(result).toContain("🟡 [test2] warning message");
    expect(result).toContain("🔵 [test3] info message");
  });

  it("formatBlockMessage formats critical block message", () => {
    const concerns: Concern[] = [
      { severity: "critical", category: "test", message: "critical message", suggestion: "do this" },
      { severity: "info", category: "test3", message: "info message" },
    ];
    const result = formatBlockMessage(concerns);
    expect(result).toContain("⛔ Hegel [Layer 1] blocked this prompt:");
    expect(result).toContain("🔴 critical message");
    expect(result).toContain("→ do this");
    expect(result).not.toContain("🔵"); // Info is filtered out
  });

  it("formatBlockMessage formats warning pause message", () => {
    const concerns: Concern[] = [
      { severity: "warning", category: "test", message: "warning message" },
    ];
    const result = formatBlockMessage(concerns);
    expect(result).toContain("⚖️ Hegel [Layer 1] paused this prompt");
    expect(result).toContain("🟡 warning message");
  });

  it("formatBlockMessage falls back to formatConcerns if no actionable concerns", () => {
    const concerns: Concern[] = [
      { severity: "info", category: "test", message: "info message" },
    ];
    const result = formatBlockMessage(concerns);
    expect(result).toContain("⚖️ Hegel [Layer 1]:");
    expect(result).toContain("🔵 [test] info message");
  });
});
