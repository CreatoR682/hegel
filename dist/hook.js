import { stdin } from "node:process";
import { appendFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { loadState, saveState, addPrompt, addResponse, addFileEdit, addConcern, recordModel, } from "./state.js";
import { analyzePrompt, buildPromptRecord, } from "./analyzers/prompt-analyzer.js";
import { analyzeResponse, buildResponseRecord, } from "./analyzers/response-analyzer.js";
import { analyzeSession, pruneSupersededConcernsFromState, } from "./analyzers/session-analyzer.js";
import { loadTranscript } from "./transcript.js";
import { formatBlockMessage } from "./format.js";
import { writeHooksFile } from "./hooks-generator.js";
import { normalizeWorkspacePath } from "./utils/path.js";
async function readStdin() {
    const chunks = [];
    for await (const chunk of stdin) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    // Cursor on Windows prepends a UTF-8 BOM (\uFEFF) to stdin — strip it
    return raw.replace(/^\uFEFF/, "");
}
const LOG_DIR = ".hegel-state";
const LOG_FILE = `${LOG_DIR}/hegel.log`;
/**
 * Returns a copy of `workspace_roots` with every entry normalized. Callers
 * should always use this before passing Cursor-supplied roots to fs APIs.
 */
function normalizedWorkspaceRoots(input) {
    return (input.workspace_roots ?? []).map(normalizeWorkspacePath);
}
/**
 * Detects if the hook is running inside the Hegel project itself.
 * When true, bypass is automatic — you can't develop the guardian while it guards you.
 */
async function isSelfProject(input) {
    const roots = normalizedWorkspaceRoots(input);
    for (const root of roots) {
        try {
            await access(join(root, "hegel.config.json"));
            await access(join(root, ".cursor-plugin", "plugin.json"));
            return true;
        }
        catch {
            // not the Hegel project
        }
    }
    return false;
}
async function shouldBypass(input, config) {
    return isSelfProject(input);
}
async function log(level, event, message) {
    try {
        await mkdir(LOG_DIR, { recursive: true });
        const ts = new Date().toISOString();
        await appendFile(LOG_FILE, `[${ts}] [${level}] [${event}] ${message}\n`, "utf-8");
    }
    catch {
        // logging should never break the hook
    }
}
function shortConversationId(conversationId) {
    return conversationId ? conversationId.slice(0, 8) : "unknown";
}
function summarizeText(text) {
    return `len=${text.length} chars words=${text.split(/\s+/).filter(Boolean).length}`;
}
function writeOutput(obj) {
    process.stdout.write(JSON.stringify(obj) + "\n");
}
/**
 * Hot-reload: regenerate hooks.json if the config hash has changed.
 * Cheap on no-op (hash compare only, no write). We run this from both
 * `sessionStart` and `beforeSubmitPrompt` because Cursor only fires
 * `sessionStart` on extension/hook-runtime init — opening a new chat
 * inside the same IDE window does NOT re-trigger it — so relying on
 * `sessionStart` alone meant UI config changes (model, strictness,
 * observeOnly, …) silently failed to propagate until an IDE restart.
 */
async function maybeRegenerateHooks(workspaceRoots, config, triggerEvent) {
    // Fallback to process.cwd() when Cursor doesn't populate workspace_roots.
    // Without this, hot-reload silently skipped on every prompt (the for-loop
    // iterated zero times), which is what caused model/strictness changes to
    // require a manual `init --force` to propagate. See 1.0.1 session notes.
    const roots = workspaceRoots?.length ? workspaceRoots : [process.cwd()];
    for (const root of roots) {
        try {
            // Determine if we are running in the source repo to pass to writeHooksFile
            let isSourceRepo = false;
            try {
                await access(join(root, "hegel.config.json"));
                await access(join(root, ".cursor-plugin", "plugin.json"));
                isSourceRepo = true;
            }
            catch {
                // not the Hegel project
            }
            const updated = await writeHooksFile(root, config, false, isSourceRepo);
            if (updated) {
                await log("info", `${triggerEvent}:hot-reload`, `Regenerated hooks.json for ${root} (config changed)`);
            }
        }
        catch (err) {
            // Surface errors rather than swallowing them silently — the previous
            // empty catch hid a class of bugs from view.
            const msg = err instanceof Error ? err.message : String(err);
            await log("warn", `${triggerEvent}:hot-reload:error`, `regen failed for ${root}: ${msg}`);
        }
    }
}
async function handleBeforeSubmitPrompt(input, output) {
    const workspaceRoots = normalizedWorkspaceRoots(input);
    const config = await loadConfig(workspaceRoots[0] || process.cwd());
    await maybeRegenerateHooks(workspaceRoots, config, "beforeSubmitPrompt");
    const bypass = await shouldBypass(input, config);
    const state = await loadState(input.conversation_id);
    if (input.session_id)
        state.sessionId = input.session_id;
    if (input.composer_mode)
        state.composerMode = input.composer_mode;
    recordModel(state, input.model);
    const promptText = input.prompt.trim();
    if (input.composer_mode === "ask") {
        await log("info", "beforeSubmitPrompt", `Skipping analysis in ask mode`);
        const record = buildPromptRecord(promptText, []);
        addPrompt(state, record);
        await saveState(state);
        output({ continue: true });
        return;
    }
    // Escape hatch: if the user resubmits the same prompt that was just blocked,
    // let it through — they've seen the warning and chose to proceed.
    if (state.lastBlockedPrompt && state.lastBlockedPrompt === promptText) {
        await log("info", "beforeSubmitPrompt", `Resubmit of blocked prompt — allowing through (${summarizeText(promptText)})`);
        state.lastBlockedPrompt = undefined;
        const record = buildPromptRecord(promptText, []);
        addPrompt(state, record);
        await saveState(state);
        output({ continue: true });
        return;
    }
    const transcript = await loadTranscript(input.transcript_path);
    pruneSupersededConcernsFromState(state, transcript, {
        pendingUserPrompt: promptText,
    });
    const { concerns, shouldBlock } = analyzePrompt(input.prompt, state, transcript);
    await log("info", "beforeSubmitPrompt", `${summarizeText(promptText)} concerns=${concerns.length} block=${shouldBlock} bypass=${bypass} transcript=${transcript ? transcript.turns.length + " turns" : "unavailable"}`);
    const record = buildPromptRecord(promptText, concerns);
    addPrompt(state, record);
    for (const c of concerns) {
        c.sourceText = promptText.length > 200 ? promptText.slice(0, 200) + "..." : promptText;
        c.sourceType = "prompt";
        addConcern(state, c);
    }
    if (shouldBlock && !bypass) {
        state.lastBlockedPrompt = promptText;
        await saveState(state);
        const msg = formatBlockMessage(concerns);
        await log("warn", "beforeSubmitPrompt", `BLOCKED concerns=${concerns.length}`);
        output({ continue: false, user_message: msg });
    }
    else {
        if (shouldBlock && bypass) {
            await log("info", "beforeSubmitPrompt", `BYPASS: would have blocked (${concerns.length} concerns)`);
        }
        state.lastBlockedPrompt = undefined;
        await saveState(state);
        output({ continue: true });
    }
}
async function handleAfterAgentResponse(input, output) {
    const state = await loadState(input.conversation_id);
    if (input.session_id)
        state.sessionId = input.session_id;
    if (input.composer_mode)
        state.composerMode = input.composer_mode;
    recordModel(state, input.model);
    if (input.composer_mode === "ask") {
        await log("info", "afterAgentResponse", `Skipping analysis in ask mode`);
        const record = buildResponseRecord(input.text, [], false);
        addResponse(state, record);
        await saveState(state);
        output({});
        return;
    }
    const transcript = await loadTranscript(input.transcript_path);
    pruneSupersededConcernsFromState(state, transcript, {
        lastAssistantText: input.text,
    });
    const { concerns } = analyzeResponse(input.text, state, transcript);
    const lastPromptTs = state.prompts.at(-1)?.timestamp ?? 0;
    const lastResponseTs = state.responses.at(-1)?.timestamp ?? 0;
    const unprompted = state.prompts.length === 0 || lastResponseTs > lastPromptTs;
    await log("info", "afterAgentResponse", `responseLen=${input.text.length} concerns=${concerns.length} unprompted=${unprompted}`);
    const record = buildResponseRecord(input.text, concerns, unprompted);
    addResponse(state, record);
    if (unprompted)
        state.turnCount++;
    for (const c of concerns) {
        c.sourceText = input.text.length > 200 ? input.text.slice(0, 200) + "..." : input.text;
        c.sourceType = "response";
        addConcern(state, c);
    }
    await saveState(state);
    output({});
}
async function handleAfterFileEdit(input, output) {
    const state = await loadState(input.conversation_id);
    // Approximate change volume as lines removed + lines added.
    // Without a line-level diff this overcounts unchanged lines in partial
    // edits, but correlates better with real change size than max(old, new).
    const totalLines = input.edits.reduce((sum, e) => {
        const oldLines = (e.old_string.match(/\n/g) ?? []).length + 1;
        const newLines = (e.new_string.match(/\n/g) ?? []).length + 1;
        return sum + oldLines + newLines;
    }, 0);
    addFileEdit(state, {
        timestamp: Date.now(),
        filePath: input.file_path,
        editCount: input.edits.length,
        totalLinesChanged: totalLines,
    });
    await saveState(state);
    output({});
}
async function handleStop(input, output) {
    const state = await loadState(input.conversation_id);
    await log("info", "stop", `status=${input.status} loop=${input.loop_count} turns=${state.turnCount}`);
    // Skip session review for aborted turns (e.g. hook blocks, user cancel) and
    // when nothing has changed since the last review (Cursor fires stop per turn).
    const alreadyReviewed = state.lastReviewedAtTurn === state.turnCount;
    if (input.status !== "aborted" && !alreadyReviewed) {
        const transcript = await loadTranscript(input.transcript_path);
        pruneSupersededConcernsFromState(state, transcript);
        const { summary, concerns } = analyzeSession(state, transcript);
        await log("info", "stop:review", summary.replace(/\n/g, " | "));
        for (const c of concerns) {
            c.sourceType = "session";
            addConcern(state, c);
        }
        state.lastReviewedAtTurn = state.turnCount;
        await saveState(state);
    }
    // Session review is intentionally NOT emitted as `followup_message`:
    // Cursor treats stop-hook `followup_message` as a new agent turn, which
    // (a) re-ingests Hegel's own review into the conversation transcript,
    // (b) triggers a redundant assistant response, and
    // (c) causes the prompt-analyzer to flag its own review as context-drift.
    // The review is instead surfaced through the VS Code sidebar dashboard,
    // the status bar, and the MCP `hegel-review` tool.
    output({});
}
async function handlePreCompact(input, output) {
    const workspaceRoots = normalizedWorkspaceRoots(input);
    const config = await loadConfig(workspaceRoots[0] || process.cwd());
    const bypass = await shouldBypass(input, config);
    const state = await loadState(input.conversation_id);
    state.compactionCount++;
    await saveState(state);
    await log("info", "preCompact", `compaction #${state.compactionCount} — ${input.context_usage_percent}% used, compacting ${input.messages_to_compact} messages`);
    if (bypass) {
        output({});
        return;
    }
    const pct = input.context_usage_percent;
    const nth = state.compactionCount;
    const msg = nth >= 3
        ? `⚖️ Hegel: Context compacted ${nth} times (${pct}% used). Early context is severely degraded — strongly consider starting a fresh chat with a summary of key decisions.`
        : pct >= 90
            ? `⚖️ Hegel: Context window at ${pct}% — compacting ${input.messages_to_compact} messages. Important early context may be lost. Consider starting a fresh chat with a summary of key decisions.`
            : `⚖️ Hegel: Context compaction triggered (${pct}% used). Continuing in the same session.`;
    output({ user_message: msg });
}
async function handleSessionStart(input, output) {
    const workspaceRoots = normalizedWorkspaceRoots(input);
    const config = await loadConfig(workspaceRoots[0] || process.cwd());
    const bypass = await shouldBypass(input, config);
    const mode = bypass ? "silent" : "active";
    await log("info", "sessionStart", `Mode: ${mode} (selfProject=${await isSelfProject(input)})`);
    // Hot-reload: regenerate hooks.json if config has changed since last setup.
    // This path fires on extension/hook-runtime init; the same check also runs
    // from `beforeSubmitPrompt` so per-chat UI changes propagate without an
    // IDE restart.
    await maybeRegenerateHooks(workspaceRoots, config, "sessionStart");
    output({
        additional_context: `[Hegel dialectical companion is ${mode} for this session. It will monitor prompt quality, response patterns, and session health.]`,
    });
}
// ── Main Dispatcher ──
export async function processHookInput(input, output = writeOutput) {
    const event = input.hook_event_name;
    await log("info", event ?? "unknown", `conversation=${shortConversationId(input.conversation_id)} model=${input.model}`);
    // Guard against stale state: if startedAt is more than 4 hours old,
    // treat this as a new session (covers missing sessionStart and ID reuse).
    if (event !== "sessionStart") {
        const state = await loadState(input.conversation_id);
        const ageMs = Date.now() - state.startedAt;
        if (ageMs > 4 * 60 * 60 * 1000) {
            await log("info", "stale-state-reset", `State for ${shortConversationId(input.conversation_id)} was ${Math.round(ageMs / 60_000)} min old — resetting startedAt`);
            state.startedAt = Date.now();
            await saveState(state);
        }
    }
    switch (event) {
        case "beforeSubmitPrompt":
            await handleBeforeSubmitPrompt(input, output);
            break;
        case "afterAgentResponse":
            await handleAfterAgentResponse(input, output);
            break;
        case "afterFileEdit":
            await handleAfterFileEdit(input, output);
            break;
        case "stop":
            await handleStop(input, output);
            break;
        case "preCompact":
            await handlePreCompact(input, output);
            break;
        case "sessionStart":
            await handleSessionStart(input, output);
            break;
        default:
            output({});
    }
}
export async function processHookJson(raw, output = writeOutput) {
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch {
        output({});
        return;
    }
    await processHookInput(input, output);
}
export async function runHook(readInput = readStdin, output = writeOutput) {
    const raw = await readInput();
    await processHookJson(raw, output);
}
function isEntrypoint() {
    return !process.env.VITEST &&
        !!process.argv[1] &&
        import.meta.url === pathToFileURL(process.argv[1]).href;
}
if (isEntrypoint()) {
    runHook().catch(async (err) => {
        await log("error", "main", `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
        writeOutput({});
    });
}
//# sourceMappingURL=hook.js.map