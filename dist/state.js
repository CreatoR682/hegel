import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
const STATE_DIR = ".hegel-state";
const SAFE_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
function createEmptyState(conversationId) {
    return {
        conversationId,
        startedAt: Date.now(),
        prompts: [],
        responses: [],
        fileEdits: [],
        turnCount: 0,
        compactionCount: 0,
        concerns: [],
    };
}
export function isSafeConversationId(conversationId) {
    return SAFE_CONVERSATION_ID.test(conversationId);
}
function statePath(conversationId) {
    if (!isSafeConversationId(conversationId))
        return null;
    return join(STATE_DIR, `${conversationId}.json`);
}
export async function loadState(conversationId) {
    const path = statePath(conversationId);
    if (!path)
        return createEmptyState(conversationId);
    try {
        const raw = await readFile(path, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return createEmptyState(conversationId);
    }
}
export async function saveState(state) {
    const path = statePath(state.conversationId);
    if (!path)
        return;
    await mkdir(STATE_DIR, { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
}
export function addPrompt(state, record) {
    state.prompts.push(record);
    state.turnCount++;
}
export function addResponse(state, record) {
    state.responses.push(record);
}
export function addFileEdit(state, record) {
    state.fileEdits.push(record);
}
export function addConcern(state, concern) {
    state.concerns.push(concern);
}
export function recentPrompts(state, count = 5) {
    return state.prompts.slice(-count);
}
export function sessionDurationMinutes(state) {
    return (Date.now() - state.startedAt) / 60_000;
}
export function totalFilesEdited(state) {
    const paths = new Set(state.fileEdits.map((e) => e.filePath));
    return paths.size;
}
export function totalLinesChanged(state) {
    return state.fileEdits.reduce((sum, e) => sum + e.totalLinesChanged, 0);
}
export function recordModel(state, model) {
    if (!state.modelsUsed)
        state.modelsUsed = [];
    if (!state.modelsUsed.includes(model)) {
        state.modelsUsed.push(model);
    }
}
//# sourceMappingURL=state.js.map