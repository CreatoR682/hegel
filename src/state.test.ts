import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";
import { loadState, saveState, addPrompt, addResponse, addFileEdit, addConcern, recentPrompts, sessionDurationMinutes, totalFilesEdited, totalLinesChanged, recordModel, isSafeConversationId } from "./state.js";
import * as fs from "node:fs/promises";
import type { SessionState } from "./types.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

describe("state full coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads existing state", async () => {
    const mockState: SessionState = {
      conversationId: "conv-123",
      startedAt: 1000,
      prompts: [],
      responses: [],
      fileEdits: [],
      turnCount: 0,
      compactionCount: 0,
      concerns: []
    };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockState));
    const state = await loadState("conv-123");
    expect(state.startedAt).toBe(1000);
  });

  it("returns a default state when the file is missing", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const state = await loadState("conv-123");
    expect(state.conversationId).toBe("conv-123");
    expect(state.prompts).toEqual([]);
    expect(state.turnCount).toBe(0);
  });

  it("skips filesystem reads for unsafe conversation ids", async () => {
    const state = await loadState("../escape");
    expect(state.conversationId).toBe("../escape");
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("saveState writes the session file", async () => {
    const state: SessionState = {
      conversationId: "conv-123",
      startedAt: 1000,
      prompts: [],
      responses: [],
      fileEdits: [],
      turnCount: 0,
      compactionCount: 0,
      concerns: []
    };
    await saveState(state);
    expect(fs.mkdir).toHaveBeenCalledWith(".hegel-state", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      join(".hegel-state", "conv-123.json"),
      JSON.stringify(state, null, 2),
      "utf-8"
    );
  });

  it("saveState skips unsafe conversation ids", async () => {
    await saveState({
      conversationId: "../escape",
      startedAt: 1000,
      prompts: [],
      responses: [],
      fileEdits: [],
      turnCount: 0,
      compactionCount: 0,
      concerns: []
    });
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("addResponse adds response", async () => {
    const state = await loadState("conv-123");
    addResponse(state, { timestamp: 123, textLength: 10, concerns: [] });
    expect(state.responses.length).toBe(1);
  });

  it("addFileEdit adds file edit", async () => {
    const state = await loadState("conv-123");
    addFileEdit(state, { timestamp: 123, filePath: "test.ts", editCount: 1, totalLinesChanged: 5 });
    expect(state.fileEdits.length).toBe(1);
  });

  it("addConcern adds concern", async () => {
    const state = await loadState("conv-123");
    addConcern(state, { severity: "info", category: "test", message: "test" });
    expect(state.concerns.length).toBe(1);
  });

  it("recentPrompts returns recent prompts", async () => {
    const state = await loadState("conv-123");
    addPrompt(state, { timestamp: 1, prompt: "p1", wordCount: 1, concerns: [] });
    addPrompt(state, { timestamp: 2, prompt: "p2", wordCount: 1, concerns: [] });
    addPrompt(state, { timestamp: 3, prompt: "p3", wordCount: 1, concerns: [] });
    const recent = recentPrompts(state, 2);
    expect(recent.length).toBe(2);
    expect(recent[0].prompt).toBe("p2");
  });

  it("addPrompt increments turn count", async () => {
    const state = await loadState("conv-123");
    addPrompt(state, { timestamp: 1, prompt: "p1", wordCount: 1, concerns: [] });
    expect(state.turnCount).toBe(1);
  });

  it("sessionDurationMinutes calculates duration", async () => {
    const state = await loadState("conv-123");
    state.startedAt = Date.now() - 120_000; // 2 minutes ago
    const duration = sessionDurationMinutes(state);
    expect(duration).toBeGreaterThanOrEqual(2);
  });

  it("totalFilesEdited calculates unique files", async () => {
    const state = await loadState("conv-123");
    addFileEdit(state, { timestamp: 1, filePath: "test.ts", editCount: 1, totalLinesChanged: 5 });
    addFileEdit(state, { timestamp: 2, filePath: "test.ts", editCount: 1, totalLinesChanged: 5 });
    addFileEdit(state, { timestamp: 3, filePath: "test2.ts", editCount: 1, totalLinesChanged: 5 });
    expect(totalFilesEdited(state)).toBe(2);
  });

  it("totalLinesChanged calculates total lines", async () => {
    const state = await loadState("conv-123");
    addFileEdit(state, { timestamp: 1, filePath: "test.ts", editCount: 1, totalLinesChanged: 5 });
    addFileEdit(state, { timestamp: 2, filePath: "test.ts", editCount: 1, totalLinesChanged: 10 });
    expect(totalLinesChanged(state)).toBe(15);
  });

  it("recordModel records unique models", async () => {
    const state = await loadState("conv-123");
    recordModel(state, "model1");
    recordModel(state, "model1");
    recordModel(state, "model2");
    expect(state.modelsUsed).toEqual(["model1", "model2"]);
  });

  it("validates safe conversation ids", () => {
    expect(isSafeConversationId("cd374336-29e9-402a-a0e1-0aea5c0732c5")).toBe(true);
    expect(isSafeConversationId("../escape")).toBe(false);
  });
});
