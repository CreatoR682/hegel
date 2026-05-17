import type { Concern, SessionState, TranscriptContext } from "../types.js";
import {
  sessionDurationMinutes,
  totalFilesEdited,
  totalLinesChanged,
} from "../state.js";
import { recentUserTurns, recentAssistantTurns } from "../transcript.js";

const ACTIVE_STEERING_PATTERN = /\b(test|verify|verification|review|audit|security|coverage|commit|push|fix|implement|update|plan|analy[sz]e|enhancement|tune)\b/i;
const PASSIVE_DELEGATION_PATTERN = /^(continue|go on|go ahead|do it|same|yes|ok|okay|sure|proceed|carry on)[.!]?$/i;
type ConcernConfidence = "high" | "medium" | "low";

const CONCERN_CONFIDENCE: Partial<Record<Concern["category"], ConcernConfidence>> = {
  "context-loss": "high",
  "no-checkpoint": "high",
  "self-contradiction": "high",
  "scope-creep": "medium",
  "prompt-degradation": "medium",
  "missing-verification": "medium",
  "session-trend": "medium",
  "over-delegation": "low",
  "non-responsive": "low",
  "repeated-rephrase": "low",
};

function confidenceForCategory(category: Concern["category"]): ConcernConfidence {
  return CONCERN_CONFIDENCE[category] ?? "medium";
}

function shouldShowInSessionSummary(concern: Concern): boolean {
  return concern.severity !== "info" || confidenceForCategory(concern.category) !== "low";
}

const LATER_VERIFICATION_PATTERN =
  /\b(test|tests|testing|test\.ts|\.test\.|spec\b|jest|vitest|mocha|cypress|playwright|npm run test|npx vitest|run tests?|test suite|coverage|build\b|npm run build|verify|verified|verification|validated?|passed|passing|all clean|green\b|linter|diagnostics|smoke test|no failures|security review|audit)\b/i;

/** Assistant messages that indicate automated tests or builds were run successfully. */
const ASSISTANT_VERIFICATION_PATTERN =
  /\b(\d+\s+tests?\s+passed|tests?\s+passed|vitest(?:\s+run)?|npm run test|test files?\s+(?:\d+|passed)|all tests|exit code:\s*0|✓\s*\d+\s*test)\b/i;

export type SupersessionOptions = {
  lastAssistantText?: string;
  pendingUserPrompt?: string;
};

function hasUserSideVerificationEvidence(
  state: SessionState,
  transcript: TranscriptContext | null,
  pendingUserPrompt?: string
): boolean {
  if (pendingUserPrompt && LATER_VERIFICATION_PATTERN.test(pendingUserPrompt)) {
    return true;
  }
  if (state.prompts.slice(-10).some((p) => LATER_VERIFICATION_PATTERN.test(p.prompt))) {
    return true;
  }
  if (
    transcript &&
    recentUserTurns(transcript, 10).some((turn) =>
      LATER_VERIFICATION_PATTERN.test(turn.text)
    )
  ) {
    return true;
  }
  return false;
}

function hasAssistantTestCompletionEvidence(
  transcript: TranscriptContext | null,
  lastAssistantText?: string
): boolean {
  if (lastAssistantText && ASSISTANT_VERIFICATION_PATTERN.test(lastAssistantText)) {
    return true;
  }
  if (
    transcript &&
    recentAssistantTurns(transcript, 6).some((turn) =>
      ASSISTANT_VERIFICATION_PATTERN.test(turn.text)
    )
  ) {
    return true;
  }
  return false;
}

/** True if this persisted concern is stale given later user or assistant verification activity. */
export function concernSupersededByLaterEvidence(
  concern: Concern,
  state: SessionState,
  transcript: TranscriptContext | null,
  options?: SupersessionOptions
): boolean {
  if (concern.category === "untested-changes") {
    return (
      hasUserSideVerificationEvidence(state, transcript, options?.pendingUserPrompt) ||
      hasAssistantTestCompletionEvidence(transcript, options?.lastAssistantText)
    );
  }
  if (concern.category === "missing-verification") {
    return hasUserSideVerificationEvidence(state, transcript, options?.pendingUserPrompt);
  }
  return false;
}

/** Removes superseded response concerns so the sidebar does not show stale warnings. */
export function pruneSupersededConcernsFromState(
  state: SessionState,
  transcript: TranscriptContext | null,
  options?: SupersessionOptions
): void {
  state.concerns = state.concerns.filter(
    (c) => !concernSupersededByLaterEvidence(c, state, transcript, options)
  );
}

/**
 * Produces a human-readable session summary with accumulated concerns.
 * Called at the stop hook — this is Hegel's "end of turn" dialectical review.
 */
export function analyzeSession(
  state: SessionState,
  transcript?: TranscriptContext | null
): {
  summary: string;
  concerns: Concern[];
} {
  const concerns: Concern[] = [];
  const minutes = sessionDurationMinutes(state);
  const files = totalFilesEdited(state);
  const lines = totalLinesChanged(state);
  const ctx = transcript ?? null;

  // ── Accumulated pattern analysis ──

  // Prompt quality trend — prefer transcript data when available for a
  // more accurate picture of the full conversation, not just hook-tracked turns.
  const median = (counts: number[]) => {
    const sorted = [...counts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  if (ctx && ctx.userTurnCount >= 6) {
    const allUserTurns = recentUserTurns(ctx, ctx.userTurnCount);
    const half = Math.floor(allUserTurns.length / 2);
    const firstCounts = allUserTurns.slice(0, half).map((t) => t.wordCount);
    const secondCounts = allUserTurns.slice(half).map((t) => t.wordCount);
    const medFirst = median(firstCounts);
    const medSecond = median(secondCounts);

    if (medSecond < medFirst * 0.4 && medSecond < 10) {
      concerns.push({
        severity: "warning",
        category: "session-trend",
        message: `Prompt quality declined (transcript): first half median ${Math.round(medFirst)} words, second half median ${Math.round(medSecond)} words`,
        suggestion: "In future sessions, maintain detailed prompts throughout. Consider setting a personal rule: every prompt should have at least one concrete reference (file, function, behavior).",
      });
    }
  } else if (state.prompts.length >= 6) {
    const half = Math.floor(state.prompts.length / 2);
    const firstCounts = state.prompts.slice(0, half).map((p) => p.wordCount);
    const secondCounts = state.prompts.slice(half).map((p) => p.wordCount);
    const medFirst = median(firstCounts);
    const medSecond = median(secondCounts);

    if (medSecond < medFirst * 0.4 && medSecond < 10) {
      concerns.push({
        severity: "warning",
        category: "session-trend",
        message: `Prompt quality declined: first half median ${Math.round(medFirst)} words, second half median ${Math.round(medSecond)} words`,
        suggestion: "In future sessions, maintain detailed prompts throughout. Consider setting a personal rule: every prompt should have at least one concrete reference (file, function, behavior).",
      });
    }
  }

  // Concern frequency
  const allConcerns = state.concerns.filter(
    (concern) => !concernSupersededByLaterEvidence(concern, state, ctx)
  );
  const categoryCounts = new Map<string, number>();
  for (const c of allConcerns) {
    categoryCounts.set(c.category, (categoryCounts.get(c.category) ?? 0) + 1);
  }

  const repeatedCategories = [...categoryCounts.entries()]
    .filter(([category]) => confidenceForCategory(category) !== "low")
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  if (repeatedCategories.length > 0) {
    const details = repeatedCategories
      .map(([cat, count]) => `${cat} (${count}x)`)
      .join(", ");
    concerns.push({
      severity: "info",
      category: "recurring-patterns",
      message: `Recurring concern patterns this session: ${details}`,
      suggestion: "These patterns suggest areas for your development workflow to improve. Consider creating personal rules or checklists for the frequent categories.",
    });
  }

  // Long session without commits — check both state prompts and transcript
  let mentionsCommit = state.prompts.some((p) =>
    /\b(commit|push|save|checkpoint)\b/i.test(p.prompt)
  );
  if (!mentionsCommit && ctx) {
    const userTurns = recentUserTurns(ctx, ctx.userTurnCount);
    mentionsCommit = userTurns.some((t) =>
      /\b(commit|push|save|checkpoint)\b/i.test(t.text)
    );
  }
  if (minutes > 30 && lines > 100 && !mentionsCommit) {
    concerns.push({
      severity: "warning",
      category: "no-checkpoint",
      message: `${Math.round(minutes)} min session with ${lines} lines changed and no commit/checkpoint mentioned`,
      suggestion: "Commit working changes frequently. It's much easier to review and revert small increments than large batches.",
    });
  }

  // [Transcript-only] Conversation depth ratio — if the assistant is producing
  // significantly more text than the user is providing, the user may be
  // over-delegating without steering.
  if (ctx && ctx.userTurnCount >= 3 && ctx.assistantTurnCount >= 3) {
    const userTurns = recentUserTurns(ctx, ctx.userTurnCount);
    const totalUserWords = ctx.turns
      .filter((t) => t.role === "user")
      .reduce((s, t) => s + t.wordCount, 0);
    const totalAssistantWords = ctx.turns
      .filter((t) => t.role === "assistant")
      .reduce((s, t) => s + t.wordCount, 0);

    const recentUserText = userTurns.slice(-4).map((t) => t.text).join("\n");
    const hasActiveSteering = ACTIVE_STEERING_PATTERN.test(recentUserText);
    const passiveTurnCount = userTurns.filter(
      (t) => t.wordCount <= 3 || PASSIVE_DELEGATION_PATTERN.test(t.text.trim())
    ).length;

    if (totalAssistantWords > 0 && totalUserWords > 0) {
      const ratio = totalAssistantWords / totalUserWords;
      if (ratio > 20 && ctx.userTurnCount >= 5 && passiveTurnCount >= 3 && !hasActiveSteering) {
        concerns.push({
          severity: "info",
          category: "over-delegation",
          message: `AI output is ${Math.round(ratio)}x the volume of your input. You may be auto-accepting without enough steering.`,
          suggestion: "Review the AI's outputs more critically. Are you checking the code changes, or just saying 'continue'?",
        });
      }
    }
  }

  // High compaction count — early context is degraded
  if (state.compactionCount >= 2) {
    concerns.push({
      severity: state.compactionCount >= 3 ? "warning" : "info",
      category: "context-loss",
      message: `Context was compacted ${state.compactionCount} times this session. Early instructions and decisions may be lost.`,
      suggestion: "Start a fresh chat with a summary of key decisions so far. Continuing in a heavily compacted session increases the risk of contradictory or off-track changes.",
    });
  }

  // ── Build summary ──

  const warningCount = allConcerns.filter((c) => c.severity === "warning").length;
  const criticalCount = allConcerns.filter((c) => c.severity === "critical").length;

  const models = state.modelsUsed?.join(", ") ?? "unknown";
  const summaryConcerns = concerns.filter(shouldShowInSessionSummary);

  const summaryParts = [
    `📊 Hegel Session Review`,
    `─────────────────────────`,
    `Duration: ${Math.round(minutes)} min | Turns: ${state.turnCount} | Files: ${files} | Lines: ${lines} | Compactions: ${state.compactionCount} | Model: ${models}`,
  ];

  if (ctx) {
    summaryParts.push(
      `Transcript: ${ctx.userTurnCount} user turns, ${ctx.assistantTurnCount} assistant turns`
    );
  }

  if (criticalCount > 0 || warningCount > 0) {
    summaryParts.push(
      `Concerns: ${criticalCount} critical, ${warningCount} warnings`
    );
  }

  if (summaryConcerns.length > 0) {
    summaryParts.push("", "Session-level observations:");
    for (const c of summaryConcerns) {
      const icon = c.severity === "critical" ? "🔴" : c.severity === "warning" ? "🟡" : "🔵";
      summaryParts.push(`${icon} ${c.message}`);
      if (c.suggestion) {
        summaryParts.push(`   → ${c.suggestion}`);
      }
    }
  }

  if (concerns.length === 0 && warningCount === 0) {
    summaryParts.push("", "✅ Clean session — no significant concerns detected.");
  }

  return {
    summary: summaryParts.join("\n"),
    concerns,
  };
}
