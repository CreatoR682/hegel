import type { TranscriptContext, TranscriptTurn } from "./types.js";
export declare function isSafeTranscriptPath(transcriptPath: string): boolean;
/**
 * Reads and parses a Cursor transcript JSONL file into structured turns.
 * Returns null if the file is unreadable or empty — callers should
 * treat null as "no transcript available" and fall back to heuristics.
 *
 * The parser is intentionally lenient: malformed lines are skipped,
 * and the hook should never fail because of a transcript issue.
 */
export declare function loadTranscript(transcriptPath: string | null): Promise<TranscriptContext | null>;
/**
 * Returns the last N user turns from the transcript.
 */
export declare function recentUserTurns(ctx: TranscriptContext, count: number): TranscriptTurn[];
/**
 * Returns the last N assistant turns from the transcript.
 */
export declare function recentAssistantTurns(ctx: TranscriptContext, count: number): TranscriptTurn[];
/**
 * Checks whether the current prompt appears to be a follow-up that references
 * content from the last assistant response (numbered items, file names, etc.).
 * This is critical for reducing false positives on short directives like
 * "fix #3 and #5" or "do that for utils.ts too".
 */
export declare function isContextualFollowUp(prompt: string, ctx: TranscriptContext): boolean;
/**
 * Detects whether the assistant's last response contained a plan, proposal,
 * or question that naturally invites a short directive follow-up.
 */
export declare function lastResponseInvitesFollowUp(ctx: TranscriptContext): boolean;
//# sourceMappingURL=transcript.d.ts.map