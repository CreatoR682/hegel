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
exports.setupSettingsSync = setupSettingsSync;
const vscode = __importStar(require("vscode"));
let isSyncing = false;
function setupSettingsSync(context, log) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return;
    const configPath = vscode.Uri.joinPath(workspaceFolders[0].uri, "hegel.config.json");
    // 1. Watch for VS Code settings changes and write to hegel.config.json
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (!e.affectsConfiguration("hegel") || isSyncing)
            return;
        try {
            isSyncing = true;
            const config = vscode.workspace.getConfiguration("hegel");
            const settings = {
                "$schema": "./hegel.config.schema.json",
                model: config.get("model"),
                enableLlmAnalysis: config.get("enableLlmAnalysis"),
                timeoutSeconds: config.get("timeoutSeconds"),
                strictness: config.get("strictness"),
            };
            await vscode.workspace.fs.writeFile(configPath, Buffer.from(JSON.stringify(settings, null, 2), "utf-8"));
            log.appendLine("Synced VS Code settings to hegel.config.json");
        }
        catch (err) {
            log.appendLine(`Failed to sync settings to JSON: ${err}`);
        }
        finally {
            // Add a small delay to prevent the file watcher from bouncing back immediately
            setTimeout(() => {
                isSyncing = false;
            }, 1000);
        }
    }));
    // 2. Watch for hegel.config.json changes and update VS Code settings
    const configWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolders[0], "hegel.config.json"));
    const syncFromJsonToSettings = async () => {
        if (isSyncing)
            return;
        try {
            isSyncing = true;
            const data = await vscode.workspace.fs.readFile(configPath);
            const json = JSON.parse(Buffer.from(data).toString("utf-8"));
            const config = vscode.workspace.getConfiguration("hegel");
            // Only update if values actually changed to prevent loops
            const updates = [];
            for (const key of ["model", "enableLlmAnalysis", "timeoutSeconds", "strictness"]) {
                if (json[key] !== undefined && json[key] !== config.get(key)) {
                    updates.push(config.update(key, json[key], vscode.ConfigurationTarget.Workspace));
                }
            }
            if (updates.length > 0) {
                await Promise.all(updates);
                log.appendLine("Synced hegel.config.json to VS Code settings");
            }
        }
        catch (err) {
            log.appendLine(`Failed to sync JSON to settings: ${err}`);
        }
        finally {
            setTimeout(() => {
                isSyncing = false;
            }, 1000);
        }
    };
    configWatcher.onDidChange(syncFromJsonToSettings);
    configWatcher.onDidCreate(syncFromJsonToSettings);
    context.subscriptions.push(configWatcher);
    // Initial sync from JSON to settings on startup
    syncFromJsonToSettings();
}
//# sourceMappingURL=settings-sync.js.map