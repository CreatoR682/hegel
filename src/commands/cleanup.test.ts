import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runCleanup } from "./cleanup.js";
import { join } from "node:path";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

describe("cleanup command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "hegel-cleanup-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns 0 and logs if .hegel-state does not exist", async () => {
    const logs: string[] = [];
    const exitCode = await runCleanup(["node", "cleanup.js", tempDir], {
      access: async () => { throw new Error("ENOENT"); },
      log: (m) => logs.push(m),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: vi.fn() as never,
      readFile: vi.fn() as never,
      writeFile: vi.fn() as never,
      rm: vi.fn() as never,
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("No .hegel-state directory found");
  });

  it("processes session files and prunes superseded concerns", async () => {
    const stateDir = join(tempDir, ".hegel-state");
    await mkdir(stateDir, { recursive: true });

    const mockState = {
      conversationId: "test-123",
      startedAt: Date.now(),
      turnCount: 2,
      compactionCount: 0,
      modelsUsed: ["auto"],
      prompts: [],
      responses: [],
      fileEdits: [],
      concerns: [
        { category: "context-drift", sourceText: "Hegel Session Review" },
        { category: "untested-changes", sourceType: "session" },
        { category: "other", sourceType: "prompt" }
      ]
    };

    await writeFile(join(stateDir, "session.json"), JSON.stringify(mockState), "utf-8");
    await writeFile(join(stateDir, "not-json.txt"), "hello", "utf-8");

    const logs: string[] = [];
    const exitCode = await runCleanup(["node", "cleanup.js", tempDir], {
      access: async () => {},
      log: (m) => logs.push(m),
      error: vi.fn(),
      execFileSync: vi.fn() as never,
      mkdir: vi.fn() as never,
      readdir: async () => ["session.json", "not-json.txt"],
      readFile: async (p) => {
        if (p.toString().endsWith("session.json")) return JSON.stringify(mockState);
        return "";
      },
      writeFile: async (p, data) => {
        if (p.toString().endsWith("session.json")) {
          const parsed = JSON.parse(data.toString());
          expect(parsed.concerns.find((c: any) => c.category === "context-drift" && c.sourceText === "Hegel Session Review")).toBeUndefined();
        }
      },
      rm: vi.fn() as never,
      resolveHegelRoot: () => tempDir,
    });

    expect(exitCode).toBe(0);
    expect(logs.join("\n")).toContain("Cleaned up 1 session files");
  });
});
