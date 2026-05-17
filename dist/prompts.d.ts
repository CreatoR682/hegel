/**
 * LLM prompt templates for Hegel's Layer 2 deep analysis.
 *
 * Prompt-based hooks in Cursor return { ok: boolean, reason?: string }.
 * When ok=false, Cursor blocks the action and shows the reason.
 * $ARGUMENTS is auto-replaced with the hook input JSON.
 */
export type StrictnessLevel = "relaxed" | "balanced" | "strict";
export declare function buildPromptAnalysisPrompt(strictness: StrictnessLevel): string;
export declare function buildResponseAnalysisPrompt(strictness: StrictnessLevel): string;
//# sourceMappingURL=prompts.d.ts.map