import { describe, it, expect } from "vitest";
import { buildPromptAnalysisPrompt, buildResponseAnalysisPrompt } from "./prompts.js";

describe("prompts", () => {
  it("includes relaxed strictness guidance in prompt analysis", () => {
    const prompt = buildPromptAnalysisPrompt("relaxed");
    expect(prompt).toContain("Only flag serious issues");
    expect(prompt).toContain("## Strictness level: relaxed");
  });

  it("includes balanced strictness guidance in response analysis", () => {
    const prompt = buildResponseAnalysisPrompt("balanced");
    expect(prompt).toContain("Flag prompts that lack specificity");
    expect(prompt).toContain("## Strictness level: balanced");
  });

  it("includes strict strictness guidance in both prompts", () => {
    const promptAnalysis = buildPromptAnalysisPrompt("strict");
    const responseAnalysis = buildResponseAnalysisPrompt("strict");
    expect(promptAnalysis).toContain("Scrutinize every prompt rigorously");
    expect(responseAnalysis).toContain("Scrutinize every prompt rigorously");
  });
});
