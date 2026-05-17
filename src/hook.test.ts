import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HookBaseInput,
  BeforeSubmitPromptInput,
  StopInput,
  SessionState,
} from "./types.js";
import * as configModule from "./config.js";
import { loadState, saveState } from "./state.js";
import { processHookInput, processHookJson } from "./hook.js";
import { normalizeWorkspacePath } from "./utils/path.js";
import { generateHooksConfig } from "./hooks-generator.js";

function baseInput(): HookBaseInput {
  return {
    conversation_id: "conv-123",
    generation_id: "gen-1",
    model: "gpt-test",
    hook_event_name: "beforeSubmitPrompt",
    cursor_version: "1.0.0",
    workspace_roots: [],
    user_email: null,
    transcript_path: null,
    composer_mode: "agent",
  };
}

describe("hook integration", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), "hegel-hook-test-"));
    process.chdir(tempDir);
    vi.restoreAllMocks();
    vi.spyOn(configModule, "loadConfig").mockResolvedValue({
      model: "auto",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
      observeOnly: false,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns an empty output for invalid json input", async () => {
    const outputs: Array<Record<string, unknown>> = [];

    await processHookJson("{not valid json", (output) => outputs.push(output));

    expect(outputs).toEqual([{}]);
  });

  it("persists ask-mode prompts without running analyzer logic", async () => {
    const outputs: Array<Record<string, unknown>> = [];
    const input: BeforeSubmitPromptInput = {
      ...baseInput(),
      hook_event_name: "beforeSubmitPrompt",
      composer_mode: "ask",
      prompt: "What changed?",
      attachments: [],
    };

    await processHookInput(input, (output) => outputs.push(output));

    const state = await loadState("conv-123");
    expect(outputs).toEqual([{ continue: true }]);
    expect(state.prompts).toHaveLength(1);
    expect(state.prompts[0].prompt).toBe("What changed?");
    expect(state.turnCount).toBe(1);
  });

  it("reviews a completed session and persists session concerns without emitting to chat", async () => {
    const state: SessionState = {
      conversationId: "conv-123",
      startedAt: Date.now() - 35 * 60 * 1000,
      prompts: [],
      responses: [],
      fileEdits: [
        {
          timestamp: Date.now() - 1000,
          filePath: "src/index.ts",
          editCount: 1,
          totalLinesChanged: 150,
        },
      ],
      turnCount: 1,
      compactionCount: 0,
      concerns: [],
    };
    await saveState(state);

    const outputs: Array<Record<string, unknown>> = [];
    const input: StopInput = {
      ...baseInput(),
      hook_event_name: "stop",
      status: "completed",
      loop_count: 0,
    };
    await processHookInput(
      input,
      (output) => outputs.push(output)
    );

    const updated = await loadState("conv-123");
    // Session concerns must still be persisted to state so the sidebar
    // dashboard / MCP review tool can surface them, but `followup_message`
    // must NOT be emitted (it causes Cursor to inject the review as a new
    // agent turn, which we deliberately avoid — see handleStop for details).
    expect(outputs).toEqual([{}]);
    expect(updated.lastReviewedAtTurn).toBe(1);
    expect(updated.concerns.some((concern) => concern.category === "no-checkpoint")).toBe(true);
  });

  it("does not re-run session review on consecutive stops for the same turn", async () => {
    const state: SessionState = {
      conversationId: "conv-123",
      startedAt: Date.now() - 35 * 60 * 1000,
      prompts: [],
      responses: [],
      fileEdits: [],
      turnCount: 1,
      compactionCount: 0,
      concerns: [],
      lastReviewedAtTurn: 1,
    };
    await saveState(state);

    const outputs: Array<Record<string, unknown>> = [];
    const input: StopInput = {
      ...baseInput(),
      hook_event_name: "stop",
      status: "completed",
      loop_count: 0,
    };
    await processHookInput(input, (output) => outputs.push(output));

    const updated = await loadState("conv-123");
    expect(outputs).toEqual([{}]);
    // No new concerns should have been added on the redundant stop.
    expect(updated.concerns).toHaveLength(0);
  });

  it("regenerates hooks.json on beforeSubmitPrompt when config hash differs", async () => {
    // Seed a stale hooks.json with a bogus hash so writeHooksFile must rewrite it.
    const workspaceRoot = tempDir;
    const cursorDir = join(workspaceRoot, ".cursor");
    await (await import("node:fs/promises")).mkdir(cursorDir, { recursive: true });
    await (await import("node:fs/promises")).writeFile(
      join(cursorDir, "hooks.json"),
      JSON.stringify({ version: 1, hooks: {}, _hegel: { configHash: "stale0000000", generatedAt: "2000-01-01T00:00:00.000Z" } }),
      "utf-8"
    );

    vi.spyOn(configModule, "loadConfig").mockResolvedValue({
      model: "grok-4.20",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
      observeOnly: false,
    });

    const outputs: Array<Record<string, unknown>> = [];
    const input: BeforeSubmitPromptInput = {
      ...baseInput(),
      hook_event_name: "beforeSubmitPrompt",
      workspace_roots: [workspaceRoot],
      composer_mode: "ask",
      prompt: "noop",
      attachments: [],
    };

    await processHookInput(input, (output) => outputs.push(output));

    const written = JSON.parse(await readFile(join(cursorDir, "hooks.json"), "utf-8"));
    const expected = generateHooksConfig({
      model: "grok-4.20",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
      observeOnly: false,
    });

    expect(written._hegel.configHash).toBe(expected._hegel?.configHash);
    // The Layer 2 prompt hook should now carry the configured model.
    const promptHook = written.hooks.beforeSubmitPrompt.find((h: { type?: string }) => h.type === "prompt");
    expect(promptHook?.model).toBe("grok-4.20");
  });

  it("regenerates hooks.json on beforeSubmitPrompt even when workspace_roots is empty (falls back to cwd)", async () => {
    // Regression test for the 1.0.1 hot-reload fix: if Cursor doesn't populate
    // workspace_roots, maybeRegenerateHooks used to silently iterate zero items
    // and never write hooks.json, making every UI config change require a
    // manual `init --force`. The fix is to fall back to process.cwd() (which
    // beforeEach has set to the workspace-root tempDir).
    const workspaceRoot = tempDir;
    const cursorDir = join(workspaceRoot, ".cursor");
    const fs = await import("node:fs/promises");
    await fs.mkdir(cursorDir, { recursive: true });
    await fs.writeFile(
      join(cursorDir, "hooks.json"),
      JSON.stringify({ version: 1, hooks: {}, _hegel: { configHash: "stale0000000", generatedAt: "2000-01-01T00:00:00.000Z" } }),
      "utf-8"
    );

    vi.spyOn(configModule, "loadConfig").mockResolvedValue({
      model: "grok-4-20-thinking",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced",
      observeOnly: false,
    });

    const input: BeforeSubmitPromptInput = {
      ...baseInput(),
      hook_event_name: "beforeSubmitPrompt",
      workspace_roots: [],
      composer_mode: "ask",
      prompt: "noop",
      attachments: [],
    };

    await processHookInput(input, () => {});

    const written = JSON.parse(await readFile(join(cursorDir, "hooks.json"), "utf-8"));
    const promptHook = written.hooks.beforeSubmitPrompt.find((h: { type?: string }) => h.type === "prompt");
    expect(promptHook?.model).toBe("grok-4-20-thinking");
    expect(written._hegel.configHash).not.toBe("stale0000000");
  });

  it("normalizes Unix-style Windows paths from workspace_roots (/c:/... → C:\\...)", async () => {
    // Regression test for the 1.0.2 path-normalization fix. Cursor on Windows
    // passes workspace_roots as "/c:/Projects/Foo" (Unix-style). Previously,
    // `mkdir` on that raw string produced "C:\\c:\\Projects\\Foo\\.cursor" —
    // a malformed double-drive-letter path — and the hot-reload failed with
    // ENOENT on every prompt.
    //
    // The fix is platform-gated (only active on win32), so this test only
    // runs on Windows. On other platforms the Unix-style path IS the native
    // format and would not have caused the bug.
    if (process.platform !== "win32") return;

    // normalizeWorkspacePath is a pure function — exercise it directly to
    // keep the test deterministic and not dependent on fs side-effects.
    expect(normalizeWorkspacePath("/c:/Projects/Foo")).toBe("c:/Projects/Foo");
    expect(normalizeWorkspacePath("/C:/Projects/Foo")).toBe("C:/Projects/Foo");
    expect(normalizeWorkspacePath("/d:/other")).toBe("d:/other");
    // Native Windows paths pass through unchanged.
    expect(normalizeWorkspacePath("C:\\Projects\\Foo")).toBe("C:\\Projects\\Foo");
    // Non-drive-letter Unix-style paths (rare on Windows but possible for
    // network/mount paths) pass through unchanged — we only strip when we
    // see the exact "/<letter>:/" pattern that causes the bug.
    expect(normalizeWorkspacePath("/home/user/Foo")).toBe("/home/user/Foo");
  });

  it("skips rewriting hooks.json on beforeSubmitPrompt when hash already matches", async () => {
    const workspaceRoot = tempDir;
    const cursorDir = join(workspaceRoot, ".cursor");
    const fs = await import("node:fs/promises");
    await fs.mkdir(cursorDir, { recursive: true });

    const config = {
      model: "auto",
      enableLlmAnalysis: true,
      timeoutSeconds: 15,
      strictness: "balanced" as const,
      observeOnly: false,
    };
    vi.spyOn(configModule, "loadConfig").mockResolvedValue(config);

    const current = generateHooksConfig(config);
    await fs.writeFile(join(cursorDir, "hooks.json"), JSON.stringify(current), "utf-8");
    const mtimeBefore = (await fs.stat(join(cursorDir, "hooks.json"))).mtimeMs;

    // Small delay so any accidental rewrite would change mtime detectably.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const input: BeforeSubmitPromptInput = {
      ...baseInput(),
      hook_event_name: "beforeSubmitPrompt",
      workspace_roots: [workspaceRoot],
      composer_mode: "ask",
      prompt: "noop",
      attachments: [],
    };
    await processHookInput(input, () => {});

    const mtimeAfter = (await fs.stat(join(cursorDir, "hooks.json"))).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });

  it("resets stale state before handling the event", async () => {
    const staleStartedAt = Date.now() - 5 * 60 * 60 * 1000;
    await saveState({
      conversationId: "conv-123",
      startedAt: staleStartedAt,
      prompts: [],
      responses: [],
      fileEdits: [],
      turnCount: 0,
      compactionCount: 0,
      concerns: [],
    });

    const outputs: Array<Record<string, unknown>> = [];
    const input: BeforeSubmitPromptInput = {
      ...baseInput(),
      hook_event_name: "beforeSubmitPrompt",
      composer_mode: "ask",
      prompt: "Proceed",
      attachments: [],
    };

    await processHookInput(input, (output) => outputs.push(output));

    const updated = await loadState("conv-123");
    expect(updated.startedAt).toBeGreaterThan(staleStartedAt);
    expect(updated.prompts).toHaveLength(1);
    expect(outputs).toEqual([{ continue: true }]);
  });
});
