import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionState } from "./types.js";
import {
  buildReviewText,
  buildStatusText,
  getMostRecentSession,
  resolveWorkspaceRoot,
  stateDirForWorkspace,
} from "./mcp.js";

function createSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    conversationId: "session-a",
    startedAt: Date.now() - 5_000,
    prompts: [],
    responses: [],
    fileEdits: [],
    turnCount: 1,
    compactionCount: 0,
    concerns: [],
    ...overrides,
  };
}

describe("mcp integration helpers", () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-mcp-test-"));
    stateDir = join(tempDir, ".hegel-state");
    await mkdir(stateDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves the workspace root from argv", () => {
    const root = resolveWorkspaceRoot(["node", "dist/mcp.js", "workspace"], "C:\\repo");
    expect(root).toBe(join("C:\\repo", "workspace"));
    expect(stateDirForWorkspace(root)).toBe(join(root, ".hegel-state"));
  });

  it("returns the most recent session by mtime", async () => {
    const firstPath = join(stateDir, "a.json");
    const secondPath = join(stateDir, "b.json");
    await writeFile(firstPath, JSON.stringify(createSession({ conversationId: "older" })), "utf-8");
    await writeFile(secondPath, JSON.stringify(createSession({ conversationId: "newer" })), "utf-8");
    await utimes(firstPath, new Date(1_000), new Date(1_000));
    await utimes(secondPath, new Date(2_000), new Date(2_000));

    const session = await getMostRecentSession(stateDir, 10_000);

    expect(session?.conversationId).toBe("newer");
  });

  it("ignores stale sessions", async () => {
    const now = Date.now();
    await writeFile(
      join(stateDir, "stale.json"),
      JSON.stringify(createSession({ startedAt: now - 5 * 60 * 60 * 1000 })),
      "utf-8"
    );

    const session = await getMostRecentSession(stateDir, now);

    expect(session).toBeNull();
  });

  it("builds status and review text without leaking source text", () => {
    const session = createSession({
      concerns: [
        {
          severity: "warning",
          category: "prompt-quality",
          message: "Prompt was too vague",
          suggestion: "Reference a file",
          sourceText: "secret prompt content",
          sourceType: "prompt",
        },
      ],
      fileEdits: [
        {
          timestamp: Date.now(),
          filePath: "src/index.ts",
          editCount: 1,
          totalLinesChanged: 10,
        },
      ],
    });

    const status = buildStatusText(session);
    const review = buildReviewText(session);

    expect(status).toContain("Health: WARNING");
    expect(status).toContain("Reference a file");
    expect(status).not.toContain("secret prompt content");
    expect(status).not.toContain("Source (");
    expect(review).toContain("prompt-quality: 1 occurrences");
    expect(review).not.toContain("secret prompt content");
  });
});
