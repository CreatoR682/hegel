import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadTranscript, isSafeTranscriptPath } from "./transcript.js";
import * as fs from "node:fs/promises";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

describe("transcript", () => {
  const absoluteTranscriptPath = resolve("fixtures", "transcript.jsonl");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if transcriptPath is null", async () => {
    const result = await loadTranscript(null);
    expect(result).toBeNull();
  });

  it("returns null if file read fails", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"));
    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result).toBeNull();
  });

  it("parses transcript correctly", async () => {
    const mockJsonl = `
{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"hi there"}]}}
{"role":"user","message":{"content":[{"type":"text","text":"how are you?"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"I am good"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);

    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result).not.toBeNull();
    expect(result?.userTurnCount).toBe(2);
    expect(result?.assistantTurnCount).toBe(2);
    expect(result?.lastUserText).toBe("how are you?");
    expect(result?.lastAssistantText).toBe("I am good");
    expect(result?.turns.length).toBe(4);
  });

  it("handles empty transcript", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("");
    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result).toBeNull();
  });

  it("handles malformed jsonl", async () => {
    const mockJsonl = `
{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}
invalid json
{"role":"assistant","message":{"content":[{"type":"text","text":"hi there"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);

    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result).not.toBeNull();
    expect(result?.turns.length).toBe(2);
  });

  it("extracts text from complex blocks", async () => {
    const mockJsonl = `
{"role":"user","message":{"content":[{"type":"text","text":"block text"},{"type":"code","text":"ignore me"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);

    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result?.turns[0].text).toBe("block text");
  });

  it("extracts text from user_query wrapper", async () => {
    const mockJsonl = `
{"role":"user","message":{"content":[{"type":"text","text":"<user_query>actual query</user_query>"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);

    const result = await loadTranscript(absoluteTranscriptPath);
    expect(result?.turns[0].text).toBe("actual query");
  });

  it("recentUserTurns and recentAssistantTurns work", async () => {
    const mockJsonl = `
{"role":"user","message":{"content":[{"type":"text","text":"u1"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"a1"}]}}
{"role":"user","message":{"content":[{"type":"text","text":"u2"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"a2"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);

    const result = await loadTranscript(absoluteTranscriptPath);
    const uTurns = (await import("./transcript.js")).recentUserTurns(result!, 1);
    const aTurns = (await import("./transcript.js")).recentAssistantTurns(result!, 1);

    expect(uTurns.length).toBe(1);
    expect(uTurns[0].text).toBe("u2");
    expect(aTurns.length).toBe(1);
    expect(aTurns[0].text).toBe("a2");
  });

  it("isContextualFollowUp works", async () => {
    const mockJsonl = `
{"role":"assistant","message":{"content":[{"type":"text","text":"Here are options: 1. A, 2. B. What do you think?"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);
    const result = await loadTranscript(absoluteTranscriptPath);
    const isFollowUp = (await import("./transcript.js")).isContextualFollowUp("yes", result!);
    expect(isFollowUp).toBe(true);
  });

  it("lastResponseInvitesFollowUp works", async () => {
    const mockJsonl = `
{"role":"assistant","message":{"content":[{"type":"text","text":"Shall I proceed?"}]}}
    `.trim();
    vi.mocked(fs.readFile).mockResolvedValue(mockJsonl);
    const result = await loadTranscript(absoluteTranscriptPath);
    const invites = (await import("./transcript.js")).lastResponseInvitesFollowUp(result!);
    expect(invites).toBe(true);
  });

  it("rejects non-absolute transcript paths", async () => {
    const result = await loadTranscript("path/to/transcript.jsonl");
    expect(result).toBeNull();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("rejects non-jsonl transcript paths", async () => {
    const result = await loadTranscript(resolve("fixtures", "transcript.txt"));
    expect(result).toBeNull();
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("validates transcript paths", () => {
    expect(isSafeTranscriptPath(absoluteTranscriptPath)).toBe(true);
    expect(isSafeTranscriptPath("path/to/transcript.jsonl")).toBe(false);
    expect(isSafeTranscriptPath(resolve("fixtures", "transcript.txt"))).toBe(false);
  });
});
