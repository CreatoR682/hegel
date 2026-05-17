import { readFile } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";
import type { TranscriptContext, TranscriptTurn } from "./types.js";

interface RawContentBlock {
  type: string;
  text?: string;
}

interface RawTranscriptLine {
  role: "user" | "assistant";
  message?: {
    content?: RawContentBlock[];
  };
}

/**
 * Extracts plain text from a transcript line's content blocks.
 * Strips tool_use blocks, image blocks, and other non-text content.
 * For user messages, strips the <user_query> wrapper tags that Cursor injects.
 */
function extractText(line: RawTranscriptLine): string {
  const blocks = line.message?.content ?? [];
  const textParts: string[] = [];

  for (const block of blocks) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }

  let combined = textParts.join("\n").trim();

  // Cursor wraps user prompts in <user_query>...</user_query> tags
  const queryMatch = combined.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/);
  if (queryMatch) {
    combined = queryMatch[1].trim();
  }

  return combined;
}

function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function isSafeTranscriptPath(transcriptPath: string): boolean {
  return isAbsolute(transcriptPath) && extname(transcriptPath).toLowerCase() === ".jsonl";
}

/**
 * Reads and parses a Cursor transcript JSONL file into structured turns.
 * Returns null if the file is unreadable or empty — callers should
 * treat null as "no transcript available" and fall back to heuristics.
 *
 * The parser is intentionally lenient: malformed lines are skipped,
 * and the hook should never fail because of a transcript issue.
 */
export async function loadTranscript(
  transcriptPath: string | null
): Promise<TranscriptContext | null> {
  if (!transcriptPath) return null;
  if (!isSafeTranscriptPath(transcriptPath)) return null;

  try {
    const raw = await readFile(transcriptPath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const turns: TranscriptTurn[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as RawTranscriptLine;
        if (parsed.role !== "user" && parsed.role !== "assistant") continue;

        const text = extractText(parsed);
        if (!text) continue;

        turns.push({
          role: parsed.role,
          text,
          wordCount: wordCount(text),
        });
      } catch {
        // Skip malformed lines — don't break the hook
      }
    }

    if (turns.length === 0) return null;

    const userTurns = turns.filter((t) => t.role === "user");
    const assistantTurns = turns.filter((t) => t.role === "assistant");

    return {
      turns,
      userTurnCount: userTurns.length,
      assistantTurnCount: assistantTurns.length,
      lastAssistantText: assistantTurns.at(-1)?.text ?? "",
      lastUserText: userTurns.at(-1)?.text ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Returns the last N user turns from the transcript.
 */
export function recentUserTurns(
  ctx: TranscriptContext,
  count: number
): TranscriptTurn[] {
  return ctx.turns
    .filter((t) => t.role === "user")
    .slice(-count);
}

/**
 * Returns the last N assistant turns from the transcript.
 */
export function recentAssistantTurns(
  ctx: TranscriptContext,
  count: number
): TranscriptTurn[] {
  return ctx.turns
    .filter((t) => t.role === "assistant")
    .slice(-count);
}

/**
 * Checks whether the current prompt appears to be a follow-up that references
 * content from the last assistant response (numbered items, file names, etc.).
 * This is critical for reducing false positives on short directives like
 * "fix #3 and #5" or "do that for utils.ts too".
 */
export function isContextualFollowUp(
  prompt: string,
  ctx: TranscriptContext
): boolean {
  const lastResponse = ctx.lastAssistantText;
  if (!lastResponse) return false;

  const trimmed = prompt.trim().toLowerCase();

  // References to numbered items from the assistant's response
  const numberRefs = trimmed.match(/#(\d+)/g);
  if (numberRefs && numberRefs.length > 0) {
    const responseHasNumbers = /#?\d+[.):]\s/.test(lastResponse);
    if (responseHasNumbers) return true;
  }

  // References to file/function names that appear in the last response
  const identifiers = trimmed.match(/\b[\w.-]+\.(ts|js|tsx|jsx|py|rs|go|css|html|json|md)\b/gi);
  if (identifiers) {
    for (const id of identifiers) {
      if (lastResponse.includes(id)) return true;
    }
  }

  // "that", "those", "the same" referring to something the assistant just listed
  const deicticPatterns = /\b(do that|do those|the same|same thing|like above|as above|mentioned above)\b/i;
  if (deicticPatterns.test(trimmed) && lastResponse.length > 100) {
    return true;
  }

  // Short affirmative after a question or proposal from the assistant
  const assistantAskedQuestion = /\?[\s]*$/.test(lastResponse.trim());
  const isShortAffirmative = /^(yes|yeah|yep|sure|go ahead|do it|proceed|ok|okay|correct|exactly|please|go)[\s.,!]?$/i.test(trimmed);
  if (assistantAskedQuestion && isShortAffirmative) return true;

  return false;
}

/**
 * Detects whether the assistant's last response contained a plan, proposal,
 * or question that naturally invites a short directive follow-up.
 */
export function lastResponseInvitesFollowUp(ctx: TranscriptContext): boolean {
  const text = ctx.lastAssistantText;
  if (!text) return false;

  // Ends with a question
  if (/\?\s*$/.test(text.trim())) return true;

  // Contains a numbered list (plan/options)
  if (/\n\s*\d+[.)]\s/.test(text)) return true;

  // Explicit invitation patterns
  if (/\b(which (one|item|option)|ready when you are|want me to|shall I|let me know|would you like)\b/i.test(text)) return true;

  return false;
}
