import * as vscode from "vscode";
import type { SessionState } from "./types";

let statusBarItem: vscode.StatusBarItem | null = null;

export function createStatusBar(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "hegel.dashboard.focus";
  statusBarItem.tooltip = "Hegel — click to open dashboard";
  statusBarItem.show();
  updateStatusBar(null);
  return statusBarItem;
}

export function updateStatusBar(state: SessionState | null): void {
  if (!statusBarItem) return;

  if (!state) {
    statusBarItem.text = "$(circle-outline) Hegel: No session";
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const warnings = state.concerns.filter((c) => c.severity === "warning").length;
  const criticals = state.concerns.filter((c) => c.severity === "critical").length;
  const totalConcerns = state.concerns.length;

  const duration = Math.round((Date.now() - state.startedAt) / 60_000);
  const turns = state.turnCount;

  if (criticals > 0) {
    statusBarItem.text = `$(error) Hegel: ${criticals} critical, ${warnings} warn`;
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  } else if (warnings > 0) {
    statusBarItem.text = `$(warning) Hegel: ${warnings} warnings | ${turns}t ${duration}m`;
    statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (totalConcerns > 0) {
    statusBarItem.text = `$(info) Hegel: ${totalConcerns} info | ${turns}t ${duration}m`;
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = `$(check) Hegel: Clean | ${turns}t ${duration}m`;
    statusBarItem.backgroundColor = undefined;
  }

  statusBarItem.tooltip = buildTooltip(state, duration);
}

function buildTooltip(state: SessionState, duration: number): string {
  const files = new Set(state.fileEdits.map((e) => e.filePath)).size;
  const lines = state.fileEdits.reduce((s, e) => s + e.totalLinesChanged, 0);
  const models = state.modelsUsed?.join(", ") ?? "unknown";

  const parts = [
    `Session: ${state.conversationId.slice(0, 8)}...`,
    `Duration: ${duration} min | Turns: ${state.turnCount}`,
    `Files: ${files} | Lines: ${lines} | Compactions: ${state.compactionCount}`,
    `Model: ${models}`,
    `Concerns: ${state.concerns.length} total`,
  ];

  if (state.concerns.length > 0) {
    parts.push("");
    const recent = state.concerns.slice(-3);
    for (const c of recent) {
      const icon = c.severity === "critical" ? "!!" : c.severity === "warning" ? "!" : "i";
      parts.push(`[${icon}] ${c.category}: ${c.message.slice(0, 60)}`);
    }
  }

  return parts.join("\n");
}

export function disposeStatusBar(): void {
  statusBarItem?.dispose();
  statusBarItem = null;
}
