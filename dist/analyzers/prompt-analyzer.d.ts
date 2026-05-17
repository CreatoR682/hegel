import type { Concern, SessionState, PromptRecord, TranscriptContext } from "../types.js";
export declare function analyzePrompt(prompt: string, state: SessionState, transcript?: TranscriptContext | null): {
    concerns: Concern[];
    shouldBlock: boolean;
};
export declare function buildPromptRecord(prompt: string, concerns: Concern[]): PromptRecord;
//# sourceMappingURL=prompt-analyzer.d.ts.map