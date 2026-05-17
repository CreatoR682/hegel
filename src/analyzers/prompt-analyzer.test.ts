import { describe, it, expect } from "vitest";
import { analyzePrompt } from "./prompt-analyzer.js";
import type { SessionState, TranscriptContext } from "../types.js";

describe("prompt-analyzer", () => {
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

  it("allows good prompts", () => {
    const prompt = "Please update the user authentication flow in src/auth.ts to use JWT tokens instead of session cookies. Make sure to handle token expiration.";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.length).toBe(0);
    expect(result.shouldBlock).toBe(false);
  });

  it("flags lazy prompts", () => {
    const prompt = "fix it";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.some(c => c.category === "prompt-quality")).toBe(true);
    expect(result.shouldBlock).toBe(true);
  });

  it("flags missing context", () => {
    const prompt = "fix the bug where it crashes";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.some(c => c.category === "prompt-quality")).toBe(true);
  });

  it("flags missing criteria for large tasks", () => {
    const prompt = "refactor the entire database layer to use prisma";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.some(c => c.category === "missing-criteria")).toBe(true);
  });

  it("suppresses missing-criteria when executing an attached plan", () => {
    const prompt =
      "Implement the plan as specified. Do not recreate todos — they already exist. Continue until complete.";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.some(c => c.category === "missing-criteria")).toBe(false);
  });

  it("suppresses missing-criteria for Cursor-style attached plan prompts", () => {
    const prompt =
      "Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.\n\nTo-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.";
    const result = analyzePrompt(prompt, emptyState, null);
    expect(result.concerns.some(c => c.category === "missing-criteria")).toBe(false);
  });

  it("allows contextual follow-ups when transcript is available", () => {
    const prompt = "yes";
    const transcript: TranscriptContext = {
      turns: [],
      userTurnCount: 1,
      assistantTurnCount: 1,
      lastUserText: "should we use redis?",
      lastAssistantText: "We could use redis for caching. Shall I proceed?"
    };
    const result = analyzePrompt(prompt, emptyState, transcript);
    expect(result.concerns.some(c => c.severity === "info")).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });

  it("flags rapid fire prompts", () => {
    const now = Date.now();
    const state: SessionState = {
      ...emptyState,
      prompts: [
        { timestamp: now - 30000, prompt: "p1", wordCount: 2, concerns: [] },
        { timestamp: now - 20000, prompt: "p2", wordCount: 2, concerns: [] },
        { timestamp: now - 10000, prompt: "p3", wordCount: 2, concerns: [] }
      ]
    };
    const result = analyzePrompt("no wait fix this instead", state, null);
    expect(result.concerns.some(c => c.category === "rapid-fire")).toBe(true);
  });

  it("flags prompt degradation using state when no transcript", () => {
    const state: SessionState = {
      ...emptyState,
      prompts: [
        { timestamp: 1, prompt: "a long prompt with lots of words and context", wordCount: 9, concerns: [] },
        { timestamp: 2, prompt: "another detailed prompt with context", wordCount: 6, concerns: [] },
        { timestamp: 3, prompt: "third prompt with some words", wordCount: 5, concerns: [] }
      ]
    };
    const result = analyzePrompt("fix", state, null);
    expect(result.concerns.some(c => c.category === "prompt-degradation")).toBe(true);
  });

  it("flags prompt degradation using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "a long prompt with lots of words and context", wordCount: 9 },
        { role: "user", text: "another detailed prompt with context", wordCount: 6 },
        { role: "user", text: "third prompt with some words", wordCount: 5 },
        { role: "user", text: "fourth prompt here", wordCount: 4 }
      ],
      userTurnCount: 4,
      assistantTurnCount: 0,
      lastUserText: "fourth prompt here",
      lastAssistantText: ""
    };
    const result = analyzePrompt("fix", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "prompt-degradation")).toBe(true);
  });

  it("suppresses prompt degradation for operational follow-ups", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "please review the security changes and add tests for the fix", wordCount: 11 },
        { role: "user", text: "next, extend the integration coverage to setup.ts", wordCount: 7 },
        { role: "user", text: "make sure the full suite passes before we finish", wordCount: 9 },
        { role: "user", text: "commit and push all the changes we made", wordCount: 8 }
      ],
      userTurnCount: 4,
      assistantTurnCount: 0,
      lastUserText: "commit and push all the changes we made",
      lastAssistantText: ""
    };
    const result = analyzePrompt("commit and push all the changes we made", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "prompt-degradation")).toBe(false);
  });

  it("flags session fatigue", () => {
    const state: SessionState = {
      ...emptyState,
      startedAt: Date.now() - (65 * 60 * 1000), // 65 minutes ago
      turnCount: 10
    };
    const result = analyzePrompt("hello", state, null);
    expect(result.concerns.some(c => c.category === "session-fatigue")).toBe(true);
  });

  it("flags repeated rephrase using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "please fix the authentication bug", wordCount: 6 },
        { role: "user", text: "fix the authentication bug please", wordCount: 5 },
        { role: "user", text: "please fix the authentication bug again", wordCount: 6 }
      ],
      userTurnCount: 3,
      assistantTurnCount: 0,
      lastUserText: "please fix the authentication bug again",
      lastAssistantText: ""
    };
    const result = analyzePrompt("hello", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "repeated-rephrase")).toBe(true);
  });

  it("flags context drift using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "let's work on the database", wordCount: 6 },
        { role: "assistant", text: "I have updated the database schema", wordCount: 6 },
        { role: "user", text: "great, now let's add some indexes", wordCount: 6 }
      ],
      userTurnCount: 2,
      assistantTurnCount: 1,
      lastUserText: "great, now let's add some indexes",
      lastAssistantText: "I have updated the database schema"
    };
    const result = analyzePrompt("can you please change the primary button color to something completely different in the main header component", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "context-drift")).toBe(true);
  });

  it("suppresses context drift for release-thread operational follow-ups", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "Prepare the 1.0.6 vsix release and document consumer upgrade steps.", wordCount: 12 },
        { role: "assistant", text: "Here is the packaging pipeline: bump version, vsce package, upload artifact.", wordCount: 12 },
        { role: "user", text: "Will macOS Cursor users need a different install path than Windows for the companion?", wordCount: 14 },
      ],
      userTurnCount: 2,
      assistantTurnCount: 1,
      lastUserText:
        "Will macOS Cursor users need a different install path than Windows for the companion?",
      lastAssistantText: "Here is the packaging pipeline: bump version, vsce package, upload artifact.",
    };
    const result = analyzePrompt(
      "Will macOS Cursor users need a different install path than Windows for the companion?",
      emptyState,
      transcript
    );
    expect(result.concerns.some(c => c.category === "context-drift")).toBe(false);
  });

  it("suppresses context drift when prompt relates to session's opening plan", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "Audit the codebase. Fix issues: strictness mismatch, observeOnly docs, compaction counter, session concerns", wordCount: 16 },
        { role: "assistant", text: "I found 8 issues. Let me fix them one by one.", wordCount: 12 },
        { role: "user", text: "Fix the strictness enum mismatch between config and vscode settings", wordCount: 10 },
        { role: "assistant", text: "Done, changed lax to relaxed in the extension package.json", wordCount: 10 },
        { role: "user", text: "Now integrate the compaction counter into session analysis and dashboard", wordCount: 11 }
      ],
      userTurnCount: 3,
      assistantTurnCount: 2,
      lastUserText: "Fix the strictness enum mismatch between config and vscode settings",
      lastAssistantText: "Done, changed lax to relaxed in the extension package.json"
    };
    const result = analyzePrompt("Now integrate the compaction counter into session analysis and dashboard", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "context-drift")).toBe(false);
  });

  it("flags raw dumps without instructions", () => {
    const dump = "function foo() { return 1; }\n".repeat(10);
    const { concerns, shouldBlock } = analyzePrompt(dump, emptyState, null);
    expect(shouldBlock).toBe(true);
    expect(concerns[0].message).toContain("raw dump");
  });

  it("allows raw dumps if they contain instruction words", () => {
    const dump = "function foo() { return 1; }\n".repeat(10) + "\nfix this error";
    const { concerns, shouldBlock } = analyzePrompt(dump, emptyState, null);
    // It might still flag it as vague ("fix this"), but not as a raw dump
    expect(concerns.some(c => c.message.includes("raw dump"))).toBe(false);
  });

  it("escalates pronoun warnings when compaction count is high", () => {
    const state: SessionState = { ...emptyState, compactionCount: 3 };
    const { concerns, shouldBlock } = analyzePrompt("fix this issue with it", state, null);
    
    const pronounConcern = concerns.find(c => c.message.includes("Pronoun-heavy"));
    expect(pronounConcern).toBeDefined();
    expect(pronounConcern?.severity).toBe("warning");
    expect(pronounConcern?.message).toContain("High risk due to context compaction");
    expect(shouldBlock).toBe(true);
  });
});
