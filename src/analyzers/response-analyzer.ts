import type { Concern, SessionState, ResponseRecord, TranscriptContext } from "../types.js";
import { totalFilesEdited, totalLinesChanged } from "../state.js";
import { recentAssistantTurns, recentUserTurns } from "../transcript.js";

// ── Pattern Definitions ──

const OVERCONFIDENCE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(this is the (only )?correct|this will definitely|guaranteed to work)\b/i,
    message: "Overconfident language — AI is claiming certainty without caveats",
  },
  {
    pattern: /\b(I've fixed all|all issues are resolved|everything.+works now|completely fixed)\b/i,
    message: "Blanket 'everything fixed' claim — did you verify all edge cases?",
  },
];

const SYCOPHANCY_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b(you'?re (absolutely |completely )?right|I (completely |fully )?agree with your (approach|assessment|analysis))\b/i,
    message: "Sycophantic agreement detected — is the AI genuinely agreeing or just being agreeable?",
  },
];

const MISSING_VERIFICATION = [
  {
    trigger: /\b(refactor|restructur|rewrit|migrat|redesign|overhaul)\b/i,
    check: /\b(test|verify|check|ensure|validate|confirm|run)\b/i,
    message: "Major structural change proposed without explicit verification step",
    suggestion: "Ask: 'How can we verify this refactoring didn't break anything?' before accepting.",
  },
  {
    trigger: /\b(security|auth|access control|credential|secret|token|password|encrypt)\b/i,
    check: /\b(review|audit|test|verify|vulnerabilit)\b/i,
    message: "Security-related change without security review mention",
    suggestion: "Security changes deserve explicit review. Consider asking for a threat model or security-specific test cases.",
  },
];

const SCOPE_CREEP_THRESHOLD = 8;
const LINES_CHANGED_THRESHOLD = 200;
const INTENTIONAL_BROAD_SCOPE_PATTERN = /\b(audit|refactor|fix(es)?|review|update|align|migrate|rename|across|all files|codebase|inconsistenc|cover|coverage|extend|next step|follow-?up|integration-style|also|proceed with|now do)\b/i;

// ── Analyzer ──

export function analyzeResponse(
  text: string,
  state: SessionState,
  transcript?: TranscriptContext | null
): { concerns: Concern[] } {
  const concerns: Concern[] = [];
  const ctx = transcript ?? null;

  // 1. Overconfidence detection
  for (const { pattern, message } of OVERCONFIDENCE_PATTERNS) {
    if (pattern.test(text)) {
      concerns.push({
        severity: "warning",
        category: "overconfidence",
        message,
        suggestion: "Ask the AI: 'What could go wrong with this approach?' or 'What edge cases might this miss?'",
      });
      break;
    }
  }

  // 2. Sycophancy detection
  for (const { pattern, message } of SYCOPHANCY_PATTERNS) {
    if (pattern.test(text)) {
      concerns.push({
        severity: "info",
        category: "sycophancy",
        message,
        suggestion: "If the AI immediately agrees with everything, try playing devil's advocate: 'What arguments exist against this approach?'",
      });
      break;
    }
  }

  // 3. Missing verification for risky changes
  const hasCodeChanges = totalFilesEdited(state) > 0 || totalLinesChanged(state) > 0;
  if (hasCodeChanges) {
    for (const { trigger, check, message, suggestion } of MISSING_VERIFICATION) {
      if (trigger.test(text) && !check.test(text)) {
        concerns.push({
          severity: "warning",
          category: "missing-verification",
          message,
          suggestion,
        });
      }
    }
  }

  // 4. Scope creep: too many files touched in the session
  //    Suppress when the session's opening prompt explicitly describes
  //    multi-file work (audit, refactor, fix list, etc.)
  const filesEdited = totalFilesEdited(state);
  if (filesEdited > SCOPE_CREEP_THRESHOLD && state.turnCount > 3) {
    const alreadyWarned = state.concerns.some(
      (c) => c.category === "scope-creep"
    );
    let intentionalBroadScope = false;
    if (ctx) {
      const userTurns = recentUserTurns(ctx, ctx.userTurnCount);
      const firstUser = userTurns[0];
      const recentUsers = userTurns.slice(-3);
      intentionalBroadScope = [firstUser, ...recentUsers]
        .filter((turn): turn is typeof userTurns[number] => !!turn)
        .some((turn) => INTENTIONAL_BROAD_SCOPE_PATTERN.test(turn.text));
    } else if (state.prompts.length > 0) {
      intentionalBroadScope = [state.prompts[0], ...state.prompts.slice(-3)]
        .some((prompt) => INTENTIONAL_BROAD_SCOPE_PATTERN.test(prompt.prompt));
    }

    if (!alreadyWarned && !intentionalBroadScope) {
      concerns.push({
        severity: "warning",
        category: "scope-creep",
        message: `${filesEdited} files modified this session. The scope may be expanding beyond the original intent.`,
        suggestion: "Pause and ask: 'Is this still aligned with what I originally set out to do?' Consider committing what you have and starting a focused follow-up.",
      });
    }
  }

  // 5. Large volume of changes without tests
  const lines = totalLinesChanged(state);
  if (lines > LINES_CHANGED_THRESHOLD) {
    const alreadyWarned = state.concerns.some(
      (c) => c.category === "untested-changes"
    );
    const hasTestActivity = ctx ? 
      recentUserTurns(ctx, 3).some(t => t && /\b(test|spec|jest|vitest|mocha|cypress|playwright)\b/i.test(t.text)) :
      state.prompts.slice(-3).some(p => /\b(test|spec|jest|vitest|mocha|cypress|playwright)\b/i.test(p.prompt));

    if (!alreadyWarned && !hasTestActivity) {
      concerns.push({
        severity: "warning",
        category: "untested-changes",
        message: `${lines} lines changed so far without any test-related activity detected`,
        suggestion: "Consider asking the AI to generate tests for the changes, or run existing tests before continuing.",
      });
    }
  }

  // 6. [Transcript-only] Self-contradiction — the AI reverses a position
  //    it stated in a recent response without acknowledging the change.
  if (ctx && ctx.assistantTurnCount >= 2) {
    const recentResponses = recentAssistantTurns(ctx, 3);
    const contradiction = detectContradiction(text, recentResponses.map((t) => t.text));
    if (contradiction) {
      concerns.push({
        severity: "warning",
        category: "self-contradiction",
        message: contradiction,
        suggestion: "Ask the AI: 'You previously said X but now say Y — what changed?' Contradictions may indicate the AI is guessing rather than reasoning.",
      });
    }
  }

  // 7. [Transcript-only] Non-responsive — the response doesn't address the
  //    user's last request (keyword overlap check).
  //    For multi-topic prompts (bullet points, line breaks), check each
  //    segment individually — the response may focus on one sub-topic.
  if (ctx && ctx.lastUserText) {
    const responseWords = significantWords(text);
    const segments = ctx.lastUserText.split(/\n[-•*]\s*|\n{2,}/).filter(s => s.trim().length > 10);
    const segmentSets = segments.length > 1
      ? segments.map(s => significantWords(s))
      : [significantWords(ctx.lastUserText)];

    const bestRatio = Math.max(
      ...segmentSets.map(userWords => {
        if (userWords.size < 5) return 1;
        const overlap = [...userWords].filter(w => responseWords.has(w)).length;
        return overlap / userWords.size;
      })
    );

    if (bestRatio < 0.05 && text.length > 200) {
      concerns.push({
        severity: "info",
        category: "non-responsive",
        message: "The AI's response has very low overlap with your request — it may be addressing something different",
        suggestion: "Compare the response to your original question. If it's off-topic, re-state your request clearly.",
      });
    }
  }

  return { concerns };
}

/**
 * Checks for simple contradictions between the current response and recent ones.
 * Looks for explicit negation of previously stated positions.
 */
function detectContradiction(
  current: string,
  previousResponses: string[]
): string | null {
  const CONTRADICTION_PAIRS: Array<[RegExp, RegExp, string]> = [
    [
      /\b(you should|I recommend|the (best|right) (approach|way))\b.*\b(not|don't|avoid|instead of)\b.*\b(\w{4,})\b/i,
      /\b(you should|I recommend|the (best|right) (approach|way))\b.*\b(\w{4,})\b/i,
      "AI may have reversed its recommendation",
    ],
    [
      /\b(this (is|was) (not |un)?necessary)\b/i,
      /\b(this (is|was) (not |un)?necessary)\b/i,
      "AI's assessment of necessity may have flipped",
    ],
  ];

  for (const prev of previousResponses) {
    for (const [currentPattern, prevPattern, message] of CONTRADICTION_PAIRS) {
      if (currentPattern.test(current) && prevPattern.test(prev)) {
        const currentNegated = /\b(not|don't|shouldn't|avoid|never)\b/i.test(current);
        const prevNegated = /\b(not|don't|shouldn't|avoid|never)\b/i.test(prev);
        if (currentNegated !== prevNegated) {
          return message;
        }
      }
    }
  }

  return null;
}

function significantWords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "that",
    "this", "these", "those", "with", "from", "into", "for", "and",
    "but", "not", "you", "your", "it", "its", "they", "them", "their",
    "what", "which", "who", "when", "where", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such",
    "than", "too", "very", "just", "also", "here", "there", "then",
    "now", "only", "about", "after", "before", "between", "over",
  ]);
  return new Set(
    text.toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
  );
}

export function buildResponseRecord(
  text: string,
  concerns: Concern[],
  unprompted = false
): ResponseRecord {
  return {
    timestamp: Date.now(),
    textLength: text.length,
    concerns,
    ...(unprompted && { unprompted }),
  };
}
