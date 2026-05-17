import type { SessionState, Concern, PromptRecord, ResponseRecord, FileEditRecord } from "./types.js";
export declare function isSafeConversationId(conversationId: string): boolean;
export declare function loadState(conversationId: string): Promise<SessionState>;
export declare function saveState(state: SessionState): Promise<void>;
export declare function addPrompt(state: SessionState, record: PromptRecord): void;
export declare function addResponse(state: SessionState, record: ResponseRecord): void;
export declare function addFileEdit(state: SessionState, record: FileEditRecord): void;
export declare function addConcern(state: SessionState, concern: Concern): void;
export declare function recentPrompts(state: SessionState, count?: number): PromptRecord[];
export declare function sessionDurationMinutes(state: SessionState): number;
export declare function totalFilesEdited(state: SessionState): number;
export declare function totalLinesChanged(state: SessionState): number;
export declare function recordModel(state: SessionState, model: string): void;
//# sourceMappingURL=state.d.ts.map