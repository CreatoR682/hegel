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
exports.findStateDir = findStateDir;
exports.getMostRecentSession = getMostRecentSession;
exports.readLogTail = readLogTail;
exports.listSessions = listSessions;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const STATE_DIR = ".hegel-state";
/**
 * Finds the .hegel-state directory in any workspace folder.
 */
function findStateDir() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders)
        return null;
    for (const folder of folders) {
        const candidate = path.join(folder.uri.fsPath, STATE_DIR);
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
/**
 * Returns the most recently modified session state file.
 */
function getMostRecentSession(stateDir) {
    try {
        const files = fs.readdirSync(stateDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => ({
            name: f,
            fullPath: path.join(stateDir, f),
            mtime: fs.statSync(path.join(stateDir, f)).mtimeMs,
        }))
            .sort((a, b) => b.mtime - a.mtime);
        if (files.length === 0)
            return null;
        const raw = fs.readFileSync(files[0].fullPath, "utf-8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/**
 * Reads the last N lines from hegel.log.
 */
function readLogTail(stateDir, lineCount = 50) {
    try {
        const logPath = path.join(stateDir, "hegel.log");
        if (!fs.existsSync(logPath))
            return [];
        const content = fs.readFileSync(logPath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        return lines.slice(-lineCount);
    }
    catch {
        return [];
    }
}
/**
 * Lists all session files sorted by most recent first.
 */
function listSessions(stateDir) {
    try {
        return fs.readdirSync(stateDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
            const fullPath = path.join(stateDir, f);
            const raw = fs.readFileSync(fullPath, "utf-8");
            return {
                id: f.replace(".json", ""),
                state: JSON.parse(raw),
                mtime: fs.statSync(fullPath).mtimeMs,
            };
        })
            .sort((a, b) => b.mtime - a.mtime);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=state-reader.js.map