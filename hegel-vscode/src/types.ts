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
  startedAt: number;
  prompts: PromptRecord[];
  responses: ResponseRecord[];
  fileEdits: FileEditRecord[];
  turnCount: number;
  compactionCount: number;
  concerns: Concern[];
  lastBlockedPrompt?: string;
  lastReviewedAtTurn?: number;
  modelsUsed?: string[];
}
