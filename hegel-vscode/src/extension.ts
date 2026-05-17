import * as vscode from "vscode";
import * as path from "path";
import { findStateDir, getMostRecentSession } from "./state-reader";
import { createStatusBar, updateStatusBar, disposeStatusBar } from "./status-bar";
import { ConcernsTreeProvider } from "./concerns-tree";
import { DashboardPanel } from "./dashboard-panel";
import { setupSettingsSync } from "./settings-sync";

let fileWatcher: vscode.FileSystemWatcher | undefined;
let logWatcher: vscode.FileSystemWatcher | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const stateDir = findStateDir();

  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  const concernsTree = new ConcernsTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("hegel.concerns", concernsTree)
  );

  const log = vscode.window.createOutputChannel("Hegel Companion");
  log.appendLine("Hegel Companion activated.");

  const dashboardPanel = new DashboardPanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardPanel.viewType,
      dashboardPanel
    )
  );

  const refresh = () => {
    const dir = findStateDir();
    if (!dir) {
      updateStatusBar(null);
      concernsTree.update(null);
      dashboardPanel.update(null);
      return;
    }

    const session = getMostRecentSession(dir);
    updateStatusBar(session);
    concernsTree.update(session);
    dashboardPanel.update(session);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("hegel.refreshDashboard", refresh)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hegel.openLog", () => {
      const dir = findStateDir();
      if (!dir) {
        vscode.window.showInformationMessage("No .hegel-state directory found.");
        return;
      }
      const logPath = path.join(dir, "hegel.log");
      vscode.workspace.openTextDocument(logPath).then(
        (doc) => vscode.window.showTextDocument(doc),
        () => vscode.window.showErrorMessage("Could not open hegel.log")
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hegel.openSettings", async () => {
      log.appendLine("Opening native VS Code settings for Hegel...");
      await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:hegel.hegel-companion");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("hegel.clearHistory", async () => {
      const dir = findStateDir();
      if (!dir) {
        vscode.window.showInformationMessage("No session history found.");
        return;
      }
      
      const confirm = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all Hegel session history? This will delete all logs and session states.",
        { modal: true },
        "Clear History"
      );
      
      if (confirm === "Clear History") {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(dir), { recursive: true, useTrash: false });
          vscode.window.showInformationMessage("Hegel session history cleared.");
          refresh();
        } catch (err) {
          vscode.window.showErrorMessage("Failed to clear session history.");
        }
      }
    })
  );

  // Setup safe two-way sync between hegel.config.json and VS Code settings
  setupSettingsSync(context, log);

  // Watch for state file changes
  if (stateDir) {
    const jsonPattern = new vscode.RelativePattern(stateDir, "*.json");
    fileWatcher = vscode.workspace.createFileSystemWatcher(jsonPattern);

    const debouncedRefresh = debounce(refresh, 500);
    fileWatcher.onDidChange(debouncedRefresh);
    fileWatcher.onDidCreate(debouncedRefresh);
    fileWatcher.onDidDelete(debouncedRefresh);
    context.subscriptions.push(fileWatcher);

    const logPattern = new vscode.RelativePattern(stateDir, "hegel.log");
    logWatcher = vscode.workspace.createFileSystemWatcher(logPattern);
    logWatcher.onDidChange(debouncedRefresh);
    context.subscriptions.push(logWatcher);
  }

  // Also poll periodically (backup in case file watcher misses events)
  refreshTimer = setInterval(refresh, 30_000);
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearInterval(refreshTimer);
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration("hegel")) {
        refresh();
      }
    })
  );

  // Initial load
  refresh();

  vscode.window.showInformationMessage("Hegel Companion activated.");
}

export function deactivate(): void {
  disposeStatusBar();
  fileWatcher?.dispose();
  logWatcher?.dispose();
  if (refreshTimer) clearInterval(refreshTimer);
}

function debounce(fn: () => void, delayMs: number): () => void {
  let timer: NodeJS.Timeout | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, delayMs);
  };
}
