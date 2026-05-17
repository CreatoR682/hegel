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
exports.DashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
class DashboardPanel {
    extensionUri;
    static viewType = "hegel.dashboard";
    view;
    state = null;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: false };
        this.render();
    }
    update(state) {
        this.state = state;
        this.render();
    }
    render() {
        if (!this.view)
            return;
        this.view.webview.html = this.buildHtml(this.state);
    }
    buildHtml(state) {
        if (!state) {
            return this.wrapHtml(`
        <div class="empty-state">
          <div class="empty-icon">&#9878;</div>
          <h2>No Active Session</h2>
          <p>Start a Cursor chat to see Hegel's analysis.</p>
        </div>
      `);
        }
        const duration = Math.round((Date.now() - state.startedAt) / 60_000);
        const files = new Set(state.fileEdits.map((e) => e.filePath)).size;
        const lines = state.fileEdits.reduce((s, e) => s + e.totalLinesChanged, 0);
        const warnings = state.concerns.filter((c) => c.severity === "warning").length;
        const criticals = state.concerns.filter((c) => c.severity === "critical").length;
        const infos = state.concerns.filter((c) => c.severity === "info").length;
        const models = state.modelsUsed?.join(", ") ?? "unknown";
        const config = vscode.workspace.getConfiguration("hegel");
        const l2Model = config.get("model") || "auto";
        const l2Enabled = config.get("enableLlmAnalysis") !== false;
        const healthClass = criticals > 0 ? "health-critical" :
            warnings > 0 ? "health-warning" : "health-clean";
        const healthLabel = criticals > 0 ? "Critical" :
            warnings > 0 ? "Warning" : "Clean";
        const promptsHtml = state.prompts.slice(-8).reverse().map((p) => {
            const time = new Date(p.timestamp).toLocaleTimeString();
            const concernBadges = p.concerns.map((c) => {
                const severity = normalizeSeverity(c.severity);
                return `<span class="badge badge-${severity}">${escapeHtml(c.category)}</span>`;
            }).join(" ");
            const truncated = p.prompt.length > 120 ? p.prompt.slice(0, 120) + "..." : p.prompt;
            return `
        <div class="prompt-item">
          <div class="prompt-header">
            <span class="prompt-time">${time}</span>
            <span class="prompt-words">${p.wordCount}w</span>
          </div>
          <div class="prompt-text">${escapeHtml(truncated)}</div>
          ${concernBadges ? `<div class="prompt-concerns">${concernBadges}</div>` : ""}
        </div>
      `;
        }).join("");
        const recentConcernsHtml = state.concerns.slice(-6).reverse().map((c) => {
            const severity = normalizeSeverity(c.severity);
            const icon = severity === "critical" ? "&#128308;" :
                severity === "warning" ? "&#128992;" : "&#128309;";
            return `
        <div class="concern-item concern-${severity}">
          <span class="concern-icon">${icon}</span>
          <div class="concern-body">
            <div class="concern-msg">${escapeHtml(c.message)}</div>
            ${c.suggestion ? `<div class="concern-suggestion">&rarr; ${escapeHtml(c.suggestion)}</div>` : ""}
            ${c.sourceText ? `<div class="concern-source"><i>"${escapeHtml(c.sourceText)}"</i></div>` : ""}
          </div>
        </div>
      `;
        }).join("");
        return this.wrapHtml(`
      <div class="dashboard">
        <div class="health-banner ${healthClass}">
          <span class="health-label">${healthLabel}</span>
          <span class="session-id">${state.conversationId.slice(0, 8)}</span>
        </div>

        <div class="stats-grid">
          <div class="stat">
            <div class="stat-value">${duration}m</div>
            <div class="stat-label">Duration</div>
          </div>
          <div class="stat">
            <div class="stat-value">${state.turnCount}</div>
            <div class="stat-label">Turns</div>
          </div>
          <div class="stat">
            <div class="stat-value">${files}</div>
            <div class="stat-label">Files</div>
          </div>
          <div class="stat">
            <div class="stat-value">${lines}</div>
            <div class="stat-label">Lines</div>
          </div>
        </div>

        <div class="stats-row">
          <span class="tag tag-critical">${criticals} critical</span>
          <span class="tag tag-warning">${warnings} warning</span>
          <span class="tag tag-info">${infos} info</span>
        </div>

        <div class="model-row">
          Agent: <strong>${escapeHtml(models)}</strong>${state.compactionCount > 0 ? ` · Compactions: <strong>${state.compactionCount}</strong>` : ""}
        </div>
        <div class="model-row">
          Hegel: <strong>${escapeHtml(l2Model)}</strong>${!l2Enabled ? " (Disabled)" : l2Model !== "auto" ? " (routing ID)" : ""}
        </div>

        ${recentConcernsHtml ? `
          <div class="section">
            <h3>Recent Concerns</h3>
            ${recentConcernsHtml}
          </div>
        ` : ""}

        ${promptsHtml ? `
          <div class="section">
            <h3>Recent Prompts</h3>
            ${promptsHtml}
          </div>
        ` : ""}
      </div>
    `);
    }
    wrapHtml(body) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: var(--vscode-sideBar-background);
      --fg: var(--vscode-sideBar-foreground, var(--vscode-foreground));
      --fg-secondary: var(--vscode-descriptionForeground, rgba(255,255,255,0.65));
      --border: var(--vscode-sideBar-border, var(--vscode-widget-border, rgba(128,128,128,0.25)));
      --stat-fg: var(--vscode-editor-foreground, var(--vscode-foreground));
      --critical: #f14c4c;
      --warning: #e9a700;
      --info: #4daafc;
      --clean: #73c991;
      --card-bg: var(--vscode-editor-background, rgba(128,128,128,0.06));
    }

    body {
      margin: 0;
      padding: 8px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--fg);
      background: var(--bg);
    }

    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: var(--fg-secondary);
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }

    .dashboard { display: flex; flex-direction: column; gap: 12px; }

    .health-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 13px;
    }
    .health-clean { background: rgba(115,201,145,0.12); color: var(--clean); border: 1px solid rgba(115,201,145,0.35); }
    .health-warning { background: rgba(233,167,0,0.12); color: var(--warning); border: 1px solid rgba(233,167,0,0.35); }
    .health-critical { background: rgba(241,76,76,0.12); color: var(--critical); border: 1px solid rgba(241,76,76,0.35); }
    .session-id { font-weight: 400; color: var(--fg-secondary); font-size: 11px; font-family: monospace; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }
    .stat {
      text-align: center;
      padding: 8px 4px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 4px;
    }
    .stat-value { font-size: 18px; font-weight: 700; color: var(--stat-fg); }
    .stat-label { font-size: 10px; text-transform: uppercase; color: var(--fg-secondary); margin-top: 2px; }

    .stats-row { display: flex; gap: 8px; justify-content: center; }
    .tag {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }
    .tag-critical { background: rgba(241,76,76,0.15); color: var(--critical); }
    .tag-warning { background: rgba(233,167,0,0.15); color: var(--warning); }
    .tag-info { background: rgba(77,170,252,0.15); color: var(--info); }

    .model-row { font-size: 11px; text-align: center; color: var(--fg-secondary); }

    .section { margin-top: 4px; }
    .section h3 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--fg-secondary);
      margin: 0 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }

    .concern-item {
      display: flex;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      color: var(--fg);
    }
    .concern-icon { flex-shrink: 0; font-size: 10px; margin-top: 2px; }
    .concern-body { flex: 1; min-width: 0; }
    .concern-msg { line-height: 1.4; }
    .concern-suggestion {
      font-size: 11px;
      color: var(--fg-secondary);
      margin-top: 2px;
      font-style: italic;
    }
    .concern-source {
      margin-top: 6px;
      font-size: 10px;
      color: var(--fg-secondary);
      background: var(--card-bg);
      padding: 4px;
      border-radius: 4px;
      border-left: 2px solid var(--border);
      word-break: break-word;
    }

    .prompt-item {
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .prompt-header {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: var(--fg-secondary);
      margin-bottom: 3px;
    }
    .prompt-text {
      font-size: 12px;
      line-height: 1.4;
      word-break: break-word;
    }
    .prompt-concerns { margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; }
    .badge {
      font-size: 9px;
      padding: 1px 6px;
      border-radius: 8px;
      font-weight: 600;
    }
    .badge-critical { background: rgba(244,71,71,0.2); color: var(--critical); }
    .badge-warning { background: rgba(204,167,0,0.2); color: var(--warning); }
    .badge-info { background: rgba(55,148,255,0.2); color: var(--info); }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
    }
}
exports.DashboardPanel = DashboardPanel;
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function normalizeSeverity(severity) {
    return severity === "critical" || severity === "warning" || severity === "info"
        ? severity
        : "info";
}
//# sourceMappingURL=dashboard-panel.js.map