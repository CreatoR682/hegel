import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  SessionState,
  Concern,
  PromptRecord,
  ResponseRecord,
  FileEditRecord,
} from "./types.js";

const STATE_DIR = ".hegel-state";
const SAFE_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function createEmptyState(conversationId: string): SessionState {
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

export function isSafeConversationId(conversationId: string): boolean {
  return SAFE_CONVERSATION_ID.test(conversationId);
}

function statePath(conversationId: string): string | null {
  if (!isSafeConversationId(conversationId)) return null;
  return join(STATE_DIR, `${conversationId}.json`);
}

export async function loadState(
  conversationId: string
): Promise<SessionState> {
  const path = statePath(conversationId);
  if (!path) return createEmptyState(conversationId);

  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as SessionState;
  } catch {
    return createEmptyState(conversationId);
  }
}

export async function saveState(state: SessionState): Promise<void> {
  const path = statePath(state.conversationId);
  if (!path) return;

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(
    path,
    JSON.stringify(state, null, 2),
    "utf-8"
  );
}

export function addPrompt(
  state: SessionState,
  record: PromptRecord
): void {
  state.prompts.push(record);
  state.turnCount++;
}

export function addResponse(
  state: SessionState,
  record: ResponseRecord
): void {
  state.responses.push(record);
}

export function addFileEdit(
  state: SessionState,
  record: FileEditRecord
): void {
  state.fileEdits.push(record);
}

export function addConcern(
  state: SessionState,
  concern: Concern
): void {
  state.concerns.push(concern);
}

export function recentPrompts(
  state: SessionState,
  count: number = 5
): PromptRecord[] {
  return state.prompts.slice(-count);
}

export function sessionDurationMinutes(state: SessionState): number {
  return (Date.now() - state.startedAt) / 60_000;
}

export function totalFilesEdited(state: SessionState): number {
  const paths = new Set(state.fileEdits.map((e) => e.filePath));
  return paths.size;
}

export function totalLinesChanged(state: SessionState): number {
  return state.fileEdits.reduce((sum, e) => sum + e.totalLinesChanged, 0);
}

export function recordModel(state: SessionState, model: string): void {
  if (!state.modelsUsed) state.modelsUsed = [];
  if (!state.modelsUsed.includes(model)) {
    state.modelsUsed.push(model);
  }
}
