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
exports.createStatusBar = createStatusBar;
exports.updateStatusBar = updateStatusBar;
exports.disposeStatusBar = disposeStatusBar;
const vscode = __importStar(require("vscode"));
let statusBarItem = null;
function createStatusBar() {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "hegel.dashboard.focus";
    statusBarItem.tooltip = "Hegel — click to open dashboard";
    statusBarItem.show();
    updateStatusBar(null);
    return statusBarItem;
}
function updateStatusBar(state) {
    if (!statusBarItem)
        return;
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
    }
    else if (warnings > 0) {
        statusBarItem.text = `$(warning) Hegel: ${warnings} warnings | ${turns}t ${duration}m`;
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
    else if (totalConcerns > 0) {
        statusBarItem.text = `$(info) Hegel: ${totalConcerns} info | ${turns}t ${duration}m`;
        statusBarItem.backgroundColor = undefined;
    }
    else {
        statusBarItem.text = `$(check) Hegel: Clean | ${turns}t ${duration}m`;
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.tooltip = buildTooltip(state, duration);
}
function buildTooltip(state, duration) {
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
function disposeStatusBar() {
    statusBarItem?.dispose();
    statusBarItem = null;
}
//# sourceMappingURL=status-bar.js.map