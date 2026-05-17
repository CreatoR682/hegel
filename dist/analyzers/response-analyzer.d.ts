import type { Concern, SessionState, ResponseRecord, TranscriptContext } from "../types.js";
export declare function analyzeResponse(text: string, state: SessionState, transcript?: TranscriptContext | null): {
    concerns: Concern[];
};
export declare function buildResponseRecord(text: string, concerns: Concern[], unprompted?: boolean): ResponseRecord;
//# sourceMappingURL=response-analyzer.d.ts.map