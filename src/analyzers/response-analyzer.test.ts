import { describe, it, expect } from "vitest";
import { analyzeResponse } from "./response-analyzer.js";
import type { SessionState, TranscriptContext } from "../types.js";

describe("response-analyzer", () => {
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

  it("allows good responses", () => {
    const response = "Here is the updated function. I have added error handling for the null case. You should run the unit tests to verify this works in your environment.";
    const result = analyzeResponse(response, emptyState, null);
    expect(result.concerns.length).toBe(0);
  });

  it("flags overconfidence", () => {
    const response = "this will definitely work without any issues.";
    const result = analyzeResponse(response, emptyState, null);
    expect(result.concerns.some(c => c.category === "overconfidence")).toBe(true);
  });

  it("flags sycophancy", () => {
    const response = "you're absolutely right, that is the best way to do it.";
    const result = analyzeResponse(response, emptyState, null);
    expect(result.concerns.some(c => c.category === "sycophancy")).toBe(true);
  });

  it("flags missing verification for risky changes", () => {
    const state: SessionState = {
      ...emptyState,
      fileEdits: [{ timestamp: 1, filePath: "test.ts", editCount: 1, totalLinesChanged: 10 }]
    };
    const response = "I have completed the refactoring of the auth module.";
    const result = analyzeResponse(response, state, null);
    expect(result.concerns.some(c => c.category === "missing-verification")).toBe(true);
  });

  it("flags scope creep", () => {
    const state: SessionState = {
      ...emptyState,
      turnCount: 5,
      fileEdits: Array.from({ length: 9 }, (_, i) => ({
        timestamp: i + 1,
        filePath: `f${i + 1}.ts`,
        editCount: 1,
        totalLinesChanged: 10,
      })),
    };
    const result = analyzeResponse("done", state, null);
    expect(result.concerns.some(c => c.category === "scope-creep")).toBe(true);
  });

  it("suppresses scope creep when first prompt indicates broad work", () => {
    const state: SessionState = {
      ...emptyState,
      turnCount: 5,
      prompts: [{ timestamp: 1, prompt: "Audit the codebase and fix all inconsistencies", wordCount: 8, concerns: [] }],
      fileEdits: Array.from({ length: 9 }, (_, i) => ({
        timestamp: i + 1,
        filePath: `f${i + 1}.ts`,
        editCount: 1,
        totalLinesChanged: 10,
      })),
    };
    const result = analyzeResponse("done", state, null);
    expect(result.concerns.some(c => c.category === "scope-creep")).toBe(false);
  });

  it("suppresses scope creep when recent transcript turns explicitly broaden follow-up scope", () => {
    const state: SessionState = {
      ...emptyState,
      turnCount: 5,
      fileEdits: Array.from({ length: 9 }, (_, i) => ({
        timestamp: i + 1,
        filePath: `f${i + 1}.ts`,
        editCount: 1,
        totalLinesChanged: 10,
      })),
    };
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "review the current test coverage", wordCount: 5 },
        { role: "assistant", text: "I found gaps in hook.ts and mcp.ts", wordCount: 8 },
        { role: "user", text: "great, extend the coverage to setup.ts as the next step", wordCount: 10 },
      ],
      userTurnCount: 2,
      assistantTurnCount: 1,
      lastUserText: "great, extend the coverage to setup.ts as the next step",
      lastAssistantText: "I found gaps in hook.ts and mcp.ts",
    };
    const result = analyzeResponse("done", state, transcript);
    expect(result.concerns.some(c => c.category === "scope-creep")).toBe(false);
  });

  it("flags untested changes", () => {
    const state: SessionState = {
      ...emptyState,
      fileEdits: [
        { timestamp: 1, filePath: "f1.ts", editCount: 1, totalLinesChanged: 300 }
      ]
    };
    const result = analyzeResponse("done", state, null);
    expect(result.concerns.some(c => c.category === "untested-changes")).toBe(true);
  });

  it("flags self-contradiction using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "assistant", text: "you should use global state", wordCount: 6 },
        { role: "assistant", text: "you should avoid using global state", wordCount: 8 }
      ],
      userTurnCount: 0,
      assistantTurnCount: 2,
      lastUserText: "",
      lastAssistantText: "you should avoid using global state"
    };
    const result = analyzeResponse("you should avoid using global state", emptyState, transcript);
    expect(result.concerns.some(c => c.category === "self-contradiction")).toBe(true);
  });

  it("flags non-responsive using transcript", () => {
    const transcript: TranscriptContext = {
      turns: [
        { role: "user", text: "please update the database schema for the users table", wordCount: 9 },
        { role: "assistant", text: "I have changed the button color to blue in the header component", wordCount: 12 }
      ],
      userTurnCount: 1,
      assistantTurnCount: 1,
      lastUserText: "please update the database schema for the users table",
      lastAssistantText: "I have changed the button color to blue in the header component"
    };
    const result = analyzeResponse("I have changed the button color to blue in the header component. ".repeat(20), emptyState, transcript);
    expect(result.concerns.some(c => c.category === "non-responsive")).toBe(true);
  });
});
