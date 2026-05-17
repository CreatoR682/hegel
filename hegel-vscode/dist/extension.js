"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const state_reader_1 = require("./state-reader");
const status_bar_1 = require("./status-bar");
const concerns_tree_1 = require("./concerns-tree");
const dashboard_panel_1 = require("./dashboard-panel");
const settings_sync_1 = require("./settings-sync");
let fileWatcher;
let logWatcher;
let refreshTimer;
function activate(context) {
    const stateDir = (0, state_reader_1.findStateDir)();
    const statusBar = (0, status_bar_1.createStatusBar)();
    context.subscriptions.push(statusBar);
    const concernsTree = new concerns_tree_1.ConcernsTreeProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider("hegel.concerns", concernsTree));
    const log = vscode.window.createOutputChannel("Hegel Companion");
    log.appendLine("Hegel Companion activated.");
    const dashboardPanel = new dashboard_panel_1.DashboardPanel(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(dashboard_panel_1.DashboardPanel.viewType, dashboardPanel));
    const refresh = () => {
        const dir = (0, state_reader_1.findStateDir)();
        if (!dir) {
            (0, status_bar_1.updateStatusBar)(null);
            concernsTree.update(null);
            dashboardPanel.update(null);
            return;
        }
        const session = (0, state_reader_1.getMostRecentSession)(dir);
        (0, status_bar_1.updateStatusBar)(session);
        concernsTree.update(session);
        dashboardPanel.update(session);
    };
    context.subscriptions.push(vscode.commands.registerCommand("hegel.refreshDashboard", refresh));
    context.subscriptions.push(vscode.commands.registerCommand("hegel.openLog", () => {
        const dir = (0, state_reader_1.findStateDir)();
        if (!dir) {
            vscode.window.showInformationMessage("No .hegel-state directory found.");
            return;
        }
        const logPath = path.join(dir, "hegel.log");
        vscode.workspace.openTextDocument(logPath).then((doc) => vscode.window.showTextDocument(doc), () => vscode.window.showErrorMessage("Could not open hegel.log"));
    }));
    context.subscriptions.push(vscode.commands.registerCommand("hegel.openSettings", async () => {
        log.appendLine("Opening native VS Code settings for Hegel...");
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:hegel.hegel-companion");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("hegel.clearHistory", async () => {
        const dir = (0, state_reader_1.findStateDir)();
        if (!dir) {
            vscode.window.showInformationMessage("No session history found.");
            return;
        }
        const confirm = await vscode.window.showWarningMessage("Are you sure you want to clear all Hegel session history? This will delete all logs and session states.", { modal: true }, "Clear History");
        if (confirm === "Clear History") {
            try {
                await vscode.workspace.fs.delete(vscode.Uri.file(dir), { recursive: true, useTrash: false });
                vscode.window.showInformationMessage("Hegel session history cleared.");
                refresh();
            }
            catch (err) {
                vscode.window.showErrorMessage("Failed to clear session history.");
            }
        }
    }));
    // Setup safe two-way sync between hegel.config.json and VS Code settings
    (0, settings_sync_1.setupSettingsSync)(context, log);
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
            if (refreshTimer)
                clearInterval(refreshTimer);
        },
    });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("hegel")) {
            refresh();
        }
    }));
    // Initial load
    refresh();
    vscode.window.showInformationMessage("Hegel Companion activated.");
}
function deactivate() {
    (0, status_bar_1.disposeStatusBar)();
    fileWatcher?.dispose();
    logWatcher?.dispose();
    if (refreshTimer)
        clearInterval(refreshTimer);
}
function debounce(fn, delayMs) {
    let timer;
    return () => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(fn, delayMs);
    };
}
//# sourceMappingURL=extension.js.map