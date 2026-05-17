import { recentPrompts, sessionDurationMinutes } from "../state.js";
import { isContextualFollowUp, lastResponseInvitesFollowUp, recentUserTurns } from "../transcript.js";
// ── Pattern Definitions ──
const LAZY_PATTERNS = [
    { pattern: /^(fix it|fix this|do it|make it work|same thing|again)\.?$/i, label: "extremely vague directive" },
    { pattern: /^(yes|no|ok|sure|go ahead|yep|yeah|continue|proceed)\.?$/i, label: "single-word confirmation without context" },
    { pattern: /^do the same (for|with|to)/i, label: "'do the same' without specifying what" },
    { pattern: /^(now do|and also|next)\b.{0,20}$/i, label: "short chained request lacking self-contained context" },
    { pattern: /^[\s\S]{100,}$/i, label: "raw dump without instructions" } // Catch large dumps with no clear directive
];
const MISSING_CONTEXT_SIGNALS = [
    { test: (p) => p.length < 15 && !p.includes("?"), message: "Very short prompt without a question — the AI will guess your intent" },
    { test: (p) => /\b(it|this|that|these|those)\b/i.test(p) && p.split(/\s+/).length < 8, message: "Pronoun-heavy short prompt — 'it'/'this' may be ambiguous after context compaction" },
];
const ACCEPTANCE_CRITERIA_HINTS = [
    /\b(implement|create|build|add|write|refactor|migrate|redesign)\b/i,
];
const HAS_CRITERIA = [
    /\b(should|must|ensure|verify|test|expect|accept|criteria|requirement)\b/i,
    /\b(when|if|unless|given|then)\b/i,
    /\d+/, // numbers often indicate concrete specs
];
/** User is driving a pre-defined plan / checklist rather than inventing scope ad hoc. */
const PLAN_OR_CHECKLIST_EXECUTION = /\b(attached(?:\s+for\s+your\s+reference)?|attach(?:ed|ing)?\s+(?:a\s+)?(?:the\s+)?plan|the plan as specified|implementation plan|plan file|do not edit the plan|don't edit the plan|(?:to-?do'?s?|to-?dos?)\s+(?:from|already|have been|are)|(?:don't|do not)\s+recreate\s+to-?dos?|complete all (?:the )?to-?dos?|all to-?dos?|mark (?:them|to-?dos?) as|in_progress|workstream|until complete|as specified in)\b/i;
/** Install, packaging, and consumer-upgrade threads share vocabulary that looks like "drift" vs a generic prior turn. */
const RELEASE_OR_INSTALL_THREAD = /\b(install|update|uninstall|npm|npx|package\.json|publish|registry|macos|darwin|windows|linux|cursor\s+cli|vsix|@hegel|hegel-dev|companion|consumer|downstream|release|verification checklist|bootstrap)\b/i;
const OPERATIONAL_FOLLOW_UP = /\b(commit|push|open pr|pull request|run tests?|test suite|coverage|build|review findings|update status|continue with|proceed with|release)\b/i;
// ── Analyzer ──
export function analyzePrompt(prompt, state, transcript) {
    const concerns = [];
    const words = prompt.trim().split(/\s+/);
    const wc = words.length;
    const ctx = transcript ?? null;
    // When a transcript is available, determine whether this prompt is a
    // natural follow-up to the preceding assistant response.  This single
    // flag gates most of the false-positive suppression below.
    const isFollowUp = ctx ? isContextualFollowUp(prompt, ctx) : false;
    const responseInvitedThis = ctx ? lastResponseInvitesFollowUp(ctx) : false;
    const isOperationalFollowUp = OPERATIONAL_FOLLOW_UP.test(prompt);
    const isFileReference = /^@\S+/.test(prompt.trim()) || prompt.includes("```");
    // 1. Lazy/vague prompt detection
    //    Suppress when the assistant just asked a question or presented options
    //    and the user is responding with a short affirmative/directive.
    for (const { pattern, label } of LAZY_PATTERNS) {
        if (pattern.test(prompt.trim())) {
            // Special handling for raw dumps: only flag if there are no instruction words
            if (label === "raw dump without instructions") {
                const hasInstructions = /\b(fix|update|change|add|remove|refactor|explain|what|how|why|help|error|bug|issue)\b/i.test(prompt);
                if (hasInstructions)
                    continue;
            }
            if (isFollowUp || responseInvitedThis) {
                concerns.push({
                    severity: "info",
                    category: "prompt-quality",
                    message: `Short directive ("${prompt.trim().slice(0, 40)}") — appears to be a contextual follow-up`,
                });
            }
            else {
                concerns.push({
                    severity: "warning",
                    category: "prompt-quality",
                    message: `Lazy prompt detected: ${label}`,
                    suggestion: "Rewrite with specific intent, context, and expected outcome. What exactly should change, and how will you verify it worked?",
                });
            }
        }
    }
    // 2. Missing context signals
    //    Suppress pronoun-heavy warning when pronouns clearly refer to the
    //    assistant's last response (transcript available and follow-up detected).
    //    Also suppress if the session has been compacted heavily, as pronouns become riskier.
    for (const { test, message } of MISSING_CONTEXT_SIGNALS) {
        if (test(prompt)) {
            if (isFollowUp && state.compactionCount < 3)
                continue;
            const severity = state.compactionCount >= 3 ? "warning" : "info";
            const compactionWarning = state.compactionCount >= 3 ? " (High risk due to context compaction)" : "";
            concerns.push({
                severity,
                category: "prompt-quality",
                message: message + compactionWarning,
                suggestion: "Add explicit references to files, functions, or behaviors instead of relying on pronouns.",
            });
        }
    }
    // 3. Significant task without acceptance criteria
    const isSignificantTask = ACCEPTANCE_CRITERIA_HINTS.some((r) => r.test(prompt));
    const hasCriteria = HAS_CRITERIA.some((r) => r.test(prompt));
    const executingAttachedPlan = PLAN_OR_CHECKLIST_EXECUTION.test(prompt);
    if (isSignificantTask && !hasCriteria && wc > 5 && !executingAttachedPlan) {
        concerns.push({
            severity: "info",
            category: "missing-criteria",
            message: "Task request without acceptance criteria",
            suggestion: "Consider adding: what 'done' looks like, edge cases to handle, or how to verify the result.",
        });
    }
    // 4. Prompt quality degradation over the session
    //    With a transcript, use actual user turn word counts for a more accurate
    //    comparison than the state-tracked PromptRecords (which only start
    //    tracking once the hook is installed).
    const recent = recentPrompts(state, 5);
    // Cap individual prompt word counts at 100 to prevent massive error logs
    // from artificially inflating the average and causing false positives.
    const capWc = (count) => Math.min(count, 100);
    if (ctx && ctx.userTurnCount >= 4) {
        const userTurns = recentUserTurns(ctx, 6);
        if (userTurns.length >= 4) {
            const avgRecent = userTurns.slice(0, -1).reduce((s, t) => s + capWc(t.wordCount), 0) / (userTurns.length - 1);
            if (wc < avgRecent * 0.4 && wc < 15 && !isFollowUp && !isOperationalFollowUp && !isFileReference) {
                concerns.push({
                    severity: "warning",
                    category: "prompt-degradation",
                    message: `Your prompts are getting shorter (transcript avg ${Math.round(avgRecent)} words → ${wc} now). Quality may be degrading.`,
                    suggestion: "Take a moment to formulate a complete, self-contained request. The AI performs better with clear context.",
                });
            }
        }
    }
    else if (recent.length >= 3) {
        const avgRecentLength = recent.reduce((s, r) => s + capWc(r.wordCount), 0) / recent.length;
        if (wc < avgRecentLength * 0.4 && wc < 15 && !isFollowUp && !isOperationalFollowUp && !isFileReference) {
            concerns.push({
                severity: "warning",
                category: "prompt-degradation",
                message: `Your prompts are getting shorter (avg ${Math.round(avgRecentLength)} words → ${wc} now). Quality may be degrading.`,
                suggestion: "Take a moment to formulate a complete, self-contained request. The AI performs better with clear context.",
            });
        }
    }
    // 5. Long session fatigue warning
    const minutes = sessionDurationMinutes(state);
    if (minutes > 60 && state.turnCount > 0 && state.turnCount % 10 === 0) {
        concerns.push({
            severity: "info",
            category: "session-fatigue",
            message: `Session running for ${Math.round(minutes)} minutes with ${state.turnCount} turns. Consider stepping back for a high-level review.`,
            suggestion: "Open a new chat to review the overall changes made so far, or take a break to re-evaluate the approach.",
        });
    }
    // 6. Rapid-fire prompts without review
    if (recent.length >= 3) {
        const lastThreeTimestamps = recent.slice(-3).map((r) => r.timestamp);
        const gaps = [];
        for (let i = 1; i < lastThreeTimestamps.length; i++) {
            gaps.push(lastThreeTimestamps[i] - lastThreeTimestamps[i - 1]);
        }
        const avgGapSeconds = gaps.reduce((s, g) => s + g, 0) / gaps.length / 1000;
        if (avgGapSeconds < 15) {
            concerns.push({
                severity: "warning",
                category: "rapid-fire",
                message: "Rapid-fire prompting detected — average gap between prompts is under 15 seconds",
                suggestion: "Slow down. Are you reviewing the AI's responses before sending the next prompt? Quick iterations often lead to compounding errors.",
            });
        }
    }
    // 7. [Transcript-only] Repeated rephrasings — user struggling with the same request
    if (ctx && ctx.userTurnCount >= 3) {
        const lastUserTurns = recentUserTurns(ctx, 4);
        if (lastUserTurns.length >= 3) {
            const similarities = countSimilarPairs(lastUserTurns.map((t) => t.text.toLowerCase()));
            if (similarities >= 2) {
                concerns.push({
                    severity: "info",
                    category: "repeated-rephrase",
                    message: "You appear to be rephrasing the same request multiple times. The AI may not understand what you need.",
                    suggestion: "Try a different approach: break the task into smaller steps, provide a concrete example of expected output, or reference specific code.",
                });
            }
        }
    }
    // 8. [Transcript-only] Context drift — current prompt is unrelated to the
    //    ongoing conversation thread without explicit topic change
    if (ctx && ctx.userTurnCount >= 2 && wc > 10) {
        const lastUser = ctx.lastUserText;
        const lastAssistant = ctx.lastAssistantText;
        if (lastUser && lastAssistant) {
            const combined = (lastUser + " " + lastAssistant).toLowerCase();
            const currentWords = new Set(words.map((w) => w.toLowerCase()).filter((w) => w.length > 4));
            const overlapCount = [...currentWords].filter((w) => combined.includes(w)).length;
            const overlapRatio = currentWords.size > 0 ? overlapCount / currentWords.size : 1;
            if (overlapRatio < 0.1 && currentWords.size > 8) {
                // Before flagging, check overlap with the session's first user prompt.
                // In checklist-style sessions the user works through numbered items —
                // each item has different vocabulary but relates to the opening plan.
                const firstUserTurn = recentUserTurns(ctx, ctx.userTurnCount)[0];
                let relatedToSessionPlan = false;
                if (firstUserTurn && firstUserTurn !== ctx.turns.find(t => t.text === lastUser)) {
                    const planWords = firstUserTurn.text.toLowerCase();
                    const planOverlap = [...currentWords].filter((w) => planWords.includes(w)).length;
                    const planRatio = planOverlap / currentWords.size;
                    if (planRatio >= 0.15)
                        relatedToSessionPlan = true;
                }
                const releaseThreadFollowUp = RELEASE_OR_INSTALL_THREAD.test(prompt) ||
                    recentReleaseThreadContext(state, ctx);
                if (!relatedToSessionPlan && !releaseThreadFollowUp) {
                    concerns.push({
                        severity: "info",
                        category: "context-drift",
                        message: "This prompt appears unrelated to the current conversation thread",
                        suggestion: "Consider starting a new chat for unrelated topics. Mixing contexts in a single session can confuse the AI and lead to errors.",
                    });
                }
            }
        }
    }
    // Block on warning+ severity so the user actually sees Hegel's feedback.
    // Cursor only surfaces beforeSubmitPrompt's user_message when continue=false.
    const shouldBlock = concerns.some((c) => c.severity === "critical" || c.severity === "warning");
    return { concerns, shouldBlock };
}
/**
 * Counts how many adjacent pairs of strings share significant word overlap,
 * indicating the user is rephrasing the same request.
 */
function countSimilarPairs(texts) {
    let count = 0;
    for (let i = 1; i < texts.length; i++) {
        const prev = new Set(texts[i - 1].split(/\s+/).filter((w) => w.length > 3));
        const curr = new Set(texts[i].split(/\s+/).filter((w) => w.length > 3));
        if (prev.size === 0 || curr.size === 0)
            continue;
        const overlap = [...curr].filter((w) => prev.has(w)).length;
        const ratio = overlap / Math.min(prev.size, curr.size);
        if (ratio > 0.5)
            count++;
    }
    return count;
}
function recentReleaseThreadContext(state, ctx) {
    const fromState = recentPrompts(state, 5)
        .map((r) => r.prompt)
        .join("\n");
    if (RELEASE_OR_INSTALL_THREAD.test(fromState))
        return true;
    const fromTranscript = recentUserTurns(ctx, 6)
        .map((t) => t.text)
        .join("\n");
    return RELEASE_OR_INSTALL_THREAD.test(fromTranscript);
}
export function buildPromptRecord(prompt, concerns) {
    return {
        timestamp: Date.now(),
        prompt,
        wordCount: prompt.trim().split(/\s+/).length,
        concerns,
    };
}
//# sourceMappingURL=prompt-analyzer.js.map