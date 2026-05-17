import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { SessionState } from "./types";

const STATE_DIR = ".hegel-state";

/**
 * Finds the .hegel-state directory in any workspace folder.
 */
export function findStateDir(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return null;

  for (const folder of folders) {
    const candidate = path.join(folder.uri.fsPath, STATE_DIR);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Returns the most recently modified session state file.
 */
export function getMostRecentSession(stateDir: string): SessionState | null {
  try {
    const files = fs.readdirSync(stateDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f,
        fullPath: path.join(stateDir, f),
        mtime: fs.statSync(path.join(stateDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) return null;

    const raw = fs.readFileSync(files[0].fullPath, "utf-8");
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

/**
 * Reads the last N lines from hegel.log.
 */
export function readLogTail(stateDir: string, lineCount: number = 50): string[] {
  try {
    const logPath = path.join(stateDir, "hegel.log");
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-lineCount);
  } catch {
    return [];
  }
}

/**
 * Lists all session files sorted by most recent first.
 */
export function listSessions(stateDir: string): Array<{ id: string; state: SessionState; mtime: number }> {
  try {
    return fs.readdirSync(stateDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const fullPath = path.join(stateDir, f);
        const raw = fs.readFileSync(fullPath, "utf-8");
        return {
          id: f.replace(".json", ""),
          state: JSON.parse(raw) as SessionState,
          mtime: fs.statSync(fullPath).mtimeMs,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}
