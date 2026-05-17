// ── Cursor Hook Payloads ──

export interface HookBaseInput {
  conversation_id: string;
  generation_id: string;
  model: string;
  hook_event_name: string;
  cursor_version: string;
  workspace_roots: string[];
  user_email: string | null;
  transcript_path: string | null;
  session_id?: string;
  composer_mode?: "agent" | "ask" | "edit";
}

export interface BeforeSubmitPromptInput extends HookBaseInput {
  prompt: string;
  attachments: Array<{ type: "file" | "rule"; file_path: string }>;
}

export interface AfterAgentResponseInput extends HookBaseInput {
  text: string;
}

export interface AfterAgentThoughtInput extends HookBaseInput {
  text: string;
  duration_ms?: number;
}

export interface AfterFileEditInput extends HookBaseInput {
  file_path: string;
  edits: Array<{ old_string: string; new_string: string }>;
}

export interface StopInput extends HookBaseInput {
  status: "completed" | "aborted" | "error";
  loop_count: number;
}

export interface SessionStartInput extends HookBaseInput {
  is_background_agent: boolean;
}

export interface SessionEndInput extends HookBaseInput {
  reason: "completed" | "aborted" | "error" | "window_close" | "user_close";
  duration_ms: number;
  is_background_agent: boolean;
  final_status: string;
  error_message?: string;
}

export interface PreCompactInput extends HookBaseInput {
  trigger: "auto" | "manual";
  context_usage_percent: number;
  context_tokens: number;
  context_window_size: number;
  message_count: number;
  messages_to_compact: number;
  is_first_compaction: boolean;
}

// ── Hook Outputs ──

export interface BeforeSubmitPromptOutput {
  continue: boolean;
  user_message?: string;
}

export interface AfterAgentResponseOutput {
  // Observational — no control fields currently
}

export interface StopOutput {
  followup_message?: string;
}

export interface SessionStartOutput {
  env?: Record<string, string>;
  additional_context?: string;
}

// ── Transcript Types ──

export interface TranscriptTurn {
  role: "user" | "assistant";
  /** Plain text content (tool calls and non-text blocks stripped). */
  text: string;
  wordCount: number;
}

/**
 * Parsed conversation context from the Cursor transcript file.
 * Provides the full dialogue history so analyzers can make
 * context-aware decisions instead of relying on heuristics alone.
 */
export interface TranscriptContext {
  turns: TranscriptTurn[];
  /** Number of user messages in the transcript. */
  userTurnCount: number;
  /** Number of assistant messages in the transcript. */
  assistantTurnCount: number;
  /** The last assistant response text (empty string if none). */
  lastAssistantText: string;
  /** The last user message text (empty string if none). */
  lastUserText: string;
}

// ── Hegel Internal Types ──

export type Severity = "info" | "warning" | "critical";

export interface Concern {
  severity: Severity;
  category: string;
  message: string;
  suggestion?: string;
  sourceText?: string;
  sourceType?: "prompt" | "response" | "session";
}

export interface PromptRecord {
  timestamp: number;
  prompt: string;
  wordCount: number;
  concerns: Concern[];
}

export interface ResponseRecord {
  timestamp: number;
  textLength: number;
  concerns: Concern[];
  /** True when the response had no preceding beforeSubmitPrompt event. */
  unprompted?: boolean;
}

export interface FileEditRecord {
  timestamp: number;
  filePath: string;
  editCount: number;
  totalLinesChanged: number;
}

export interface SessionState {
  conversationId: string;
  sessionId?: string;
  composerMode?: "agent" | "ask" | "edit";
  startedAt: number;
  prompts: PromptRecord[];
  responses: ResponseRecord[];
  fileEdits: FileEditRecord[];
  turnCount: number;
  compactionCount: number;
  concerns: Concern[];
  lastBlockedPrompt?: string;
  /** turnCount at last session review, used to suppress redundant stop reviews. */
  lastReviewedAtTurn?: number;
  /** Actual model(s) observed on prompt/response events (not sessionStart). */
  modelsUsed?: string[];
}
