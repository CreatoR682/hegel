import { describe, it, expect } from "vitest";
import { analyzeSession, pruneSupersededConcernsFromState } from "./session-analyzer.js";
import type { SessionState, TranscriptContext } from "../types.js";

describe("session-analyzer", () => {
  const emptyState: SessionState = {
    conversationId: "test",
    startedAt: Date.now(),
    prompts: [],
    responses: [],
    fileEdits: [],
    turnCount: 0,
    compactionCount: 0,
    concerns: []
  };

  it("analyzes clean session", () => {
    const result = analyzeSession(emptyState, null);
    expect(result.concerns.length).toBe(0);
    expect(result.summary).toContain("Clean session");
  });

  it("flags prompt quality decline using state", () => {
    const state: SessionState = {
      ...emptyState,
      prompts: [
        { timestamp: 1, prompt: "a very long and detailed prompt", wordCount: 7, concerns: [] },
        { timestamp: 2, prompt: "another long prompt", wordCount: 4, concerns: [] },
        { timestamp: 3, prompt: "third long prompt", wordCount: 4, concerns: [] },
        { timestamp: 4, prompt: "fix", wordCount: 1, concerns: [] },
        { timestamp: 5, prompt: "do", wordCount: 1, concerns: [] },
        { timestamp: 6, prompt: "it", wordCount: 1, concerns: [] }
      ]
    };
    const result = analyzeSession(state, null);
    expect(result.concerns.some(c => c.category === "session-trend")).toBe(true);
  });

  it("flags prompt quality decline using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "a very long and detailed prompt", wordCount: 7 },
        { role: "user", text: "another long prompt", wordCount: 4 },
        { role: "user", text: "third long prompt", wordCount: 4 },
        { role: "user", text: "fix", wordCount: 1 },
        { role: "user", text: "do", wordCount: 1 },
        { role: "user", text: "it", wordCount: 1 }
      ],
      userTurnCount: 6,
      assistantTurnCount: 0,
      lastUserText: "it",
      lastAssistantText: ""
    };
    const result = analyzeSession(emptyState, transcript);
    expect(result.concerns.some(c => c.category === "session-trend")).toBe(true);
  });

  it("flags recurring patterns", () => {
    const state: SessionState = {
      ...emptyState,
      concerns: [
        { severity: "warning", category: "prompt-quality", message: "test" },
        { severity: "warning", category: "prompt-quality", message: "test" },
        { severity: "warning", category: "prompt-quality", message: "test" }
      ]
    };
    const result = analyzeSession(state, null);
    const concern = result.concerns.find(c => c.category === "recurring-patterns");
    expect(concern).toBeDefined();
    expect(concern?.message).toContain("prompt-quality (3x)");
  });

  it("does not escalate recurring patterns for low-confidence categories", () => {
    const state: SessionState = {
      ...emptyState,
      concerns: [
        { severity: "info", category: "over-delegation", message: "test" },
        { severity: "info", category: "over-delegation", message: "test" },
        { severity: "info", category: "over-delegation", message: "test" },
      ]
    };
    const result = analyzeSession(state, null);
    expect(result.concerns.some(c => c.category === "recurring-patterns")).toBe(false);
  });

  it("flags long session without commits", () => {
    const state: SessionState = {
      ...emptyState,
      startedAt: Date.now() - (35 * 60 * 1000), // 35 mins ago
      fileEdits: [
        { timestamp: 1, filePath: "test.ts", editCount: 1, totalLinesChanged: 150 }
      ]
    };
    const result = analyzeSession(state, null);
    expect(result.concerns.some(c => c.category === "no-checkpoint")).toBe(true);
  });

  it("filters stale untested and verification concerns after later evidence", () => {
    const state: SessionState = {
      ...emptyState,
      prompts: [
        { timestamp: 1, prompt: "run the full test suite and verify the security fix", wordCount: 10, concerns: [] },
      ],
      responses: [
        { timestamp: 2, textLength: 100, concerns: [] },
      ],
      concerns: [
        { severity: "warning", category: "untested-changes", message: "old", sourceType: "response" },
        { severity: "warning", category: "missing-verification", message: "old", sourceType: "response" },
      ]
    };
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "run the full test suite and verify the security fix", wordCount: 10 },
      ],
      userTurnCount: 1,
      assistantTurnCount: 0,
      lastUserText: "run the full test suite and verify the security fix",
      lastAssistantText: "",
    };

    const result = analyzeSession(state, transcript);
    expect(result.summary).not.toContain("warnings");
    expect(result.concerns.some(c => c.category === "recurring-patterns")).toBe(false);
  });

  it("prunes untested-changes when assistant reports tests passed", () => {
    const state: SessionState = {
      ...emptyState,
      concerns: [
        { severity: "warning", category: "untested-changes", message: "old", sourceType: "response" },
      ],
    };
    pruneSupersededConcernsFromState(state, null, {
      lastAssistantText: "vitest run completed: 12 tests passed",
    });
    expect(state.concerns.some((c) => c.category === "untested-changes")).toBe(false);
  });

  it("does not prune missing-verification from assistant test summary alone", () => {
    const state: SessionState = {
      ...emptyState,
      concerns: [
        { severity: "warning", category: "missing-verification", message: "old", sourceType: "response" },
      ],
    };
    pruneSupersededConcernsFromState(state, null, {
      lastAssistantText: "12 tests passed",
    });
    expect(state.concerns.some((c) => c.category === "missing-verification")).toBe(true);
  });

  it("prunes missing-verification when user prompts mention verification", () => {
    const state: SessionState = {
      ...emptyState,
      prompts: [
        { timestamp: 1, prompt: "run tests and verify the security fix", wordCount: 8, concerns: [] },
      ],
      concerns: [
        { severity: "warning", category: "missing-verification", message: "old", sourceType: "response" },
      ],
    };
    pruneSupersededConcernsFromState(state, null);
    expect(state.concerns.some((c) => c.category === "missing-verification")).toBe(false);
  });

  it("prunes untested-changes when pending prompt says verified", () => {
    const state: SessionState = {
      ...emptyState,
      concerns: [
        { severity: "warning", category: "untested-changes", message: "old", sourceType: "response" },
      ],
    };
    pruneSupersededConcernsFromState(state, null, {
      pendingUserPrompt: "Verified, looks good. One question about the upgrade path.",
    });
    expect(state.concerns.some((c) => c.category === "untested-changes")).toBe(false);
  });

  it("flags high compaction count as warning", () => {
    const state: SessionState = {
      ...emptyState,
      compactionCount: 3,
    };
    const result = analyzeSession(state, null);
    const concern = result.concerns.find(c => c.category === "context-loss");
    expect(concern).toBeDefined();
    expect(concern!.severity).toBe("warning");
  });

  it("flags moderate compaction count as info", () => {
    const state: SessionState = {
      ...emptyState,
      compactionCount: 2,
    };
    const result = analyzeSession(state, null);
    const concern = result.concerns.find(c => c.category === "context-loss");
    expect(concern).toBeDefined();
    expect(concern!.severity).toBe("info");
  });

  it("does not flag single compaction", () => {
    const state: SessionState = {
      ...emptyState,
      compactionCount: 1,
    };
    const result = analyzeSession(state, null);
    expect(result.concerns.some(c => c.category === "context-loss")).toBe(false);
  });

  it("includes compaction count in summary", () => {
    const state: SessionState = {
      ...emptyState,
      compactionCount: 2,
    };
    const result = analyzeSession(state, null);
    expect(result.summary).toContain("Compactions: 2");
  });

  it("flags over-delegation using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "do", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "do", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "do", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "do", wordCount: 1 },
        { role: "user", text: "do", wordCount: 1 }
      ],
      userTurnCount: 5,
      assistantTurnCount: 3,
      lastUserText: "do",
      lastAssistantText: "code"
    };
    const result = analyzeSession(emptyState, transcript);
    expect(result.concerns.some(c => c.category === "over-delegation")).toBe(true);
  });

  it("suppresses over-delegation when recent prompts show active steering", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "review the security findings and implement the fixes", wordCount: 8 },
        { role: "assistant", text: "here is a long security review".repeat(20), wordCount: 120 },
        { role: "user", text: "add tests for hook and mcp integration", wordCount: 7 },
        { role: "assistant", text: "here is a long testing plan".repeat(20), wordCount: 120 },
        { role: "user", text: "now cover setup.ts and rerun tests", wordCount: 6 },
        { role: "assistant", text: "here is more detailed implementation guidance".repeat(20), wordCount: 120 },
        { role: "user", text: "commit and push the coverage updates", wordCount: 6 },
      ],
      userTurnCount: 4,
      assistantTurnCount: 3,
      lastUserText: "commit and push the coverage updates",
      lastAssistantText: "here is more detailed implementation guidance".repeat(20),
    };

    const result = analyzeSession(emptyState, transcript);
    expect(result.concerns.some(c => c.category === "over-delegation")).toBe(false);
  });

  it("keeps low-confidence info concerns out of the session summary", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "continue", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "continue", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "continue", wordCount: 1 },
        { role: "assistant", text: "here is a massive amount of code".repeat(10), wordCount: 100 },
        { role: "user", text: "continue", wordCount: 1 },
        { role: "user", text: "continue", wordCount: 1 }
      ],
      userTurnCount: 5,
      assistantTurnCount: 3,
      lastUserText: "continue",
      lastAssistantText: "code"
    };
    const result = analyzeSession(emptyState, transcript);
    expect(result.concerns.some(c => c.category === "over-delegation")).toBe(true);
    expect(result.summary).not.toContain("auto-accepting without enough steering");
  });
});
