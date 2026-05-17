import type { Concern, SessionState, TranscriptContext } from "../types.js";
export type SupersessionOptions = {
    lastAssistantText?: string;
    pendingUserPrompt?: string;
};
/** True if this persisted concern is stale given later user or assistant verification activity. */
export declare function concernSupersededByLaterEvidence(concern: Concern, state: SessionState, transcript: TranscriptContext | null, options?: SupersessionOptions): boolean;
/** Removes superseded response concerns so the sidebar does not show stale warnings. */
export declare function pruneSupersededConcernsFromState(state: SessionState, transcript: TranscriptContext | null, options?: SupersessionOptions): void;
/**
 * Produces a human-readable session summary with accumulated concerns.
 * Called at the stop hook — this is Hegel's "end of turn" dialectical review.
 */
export declare function analyzeSession(state: SessionState, transcript?: TranscriptContext | null): {
    summary: string;
    concerns: Concern[];
};
//# sourceMappingURL=session-analyzer.d.ts.map