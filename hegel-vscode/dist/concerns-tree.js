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
exports.ConcernsTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class ConcernCategoryNode extends vscode.TreeItem {
    category;
    items;
    count;
    constructor(category, items, count) {
        super(`${category} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
        this.category = category;
        this.items = items;
        this.count = count;
        this.contextValue = "category";
        const maxSeverity = items.reduce((max, c) => {
            const order = { critical: 3, warning: 2, info: 1 };
            return order[c.severity] > order[max] ? c.severity : max;
        }, "info");
        this.iconPath = new vscode.ThemeIcon(maxSeverity === "critical" ? "error" :
            maxSeverity === "warning" ? "warning" : "info", maxSeverity === "critical" ? new vscode.ThemeColor("errorForeground") :
            maxSeverity === "warning" ? new vscode.ThemeColor("list.warningForeground") :
                undefined);
    }
}
class ConcernItemNode extends vscode.TreeItem {
    concern;
    constructor(concern) {
        const isLayer2 = concern.message.startsWith("[Layer 2]");
        const cleanMessage = isLayer2 ? concern.message.replace(/^\[Layer 2\]\s*/i, "") : concern.message;
        const layerTag = isLayer2 ? "Layer 2" : "Layer 1";
        super(cleanMessage, vscode.TreeItemCollapsibleState.None);
        this.concern = concern;
        this.contextValue = "concern";
        this.description = concern.sourceType
            ? `${layerTag} • ${concern.sourceType} • ${concern.severity}`
            : `${layerTag} • ${concern.severity}`;
        let tooltip = cleanMessage;
        if (concern.suggestion) {
            tooltip += `\n\n→ ${concern.suggestion}`;
        }
        if (concern.sourceText) {
            tooltip += `\n\nSource (${concern.sourceType}):\n"${concern.sourceText}"`;
        }
        this.tooltip = tooltip;
        this.iconPath = new vscode.ThemeIcon(concern.severity === "critical" ? "circle-filled" :
            concern.severity === "warning" ? "circle-filled" : "circle-outline", concern.severity === "critical" ? new vscode.ThemeColor("errorForeground") :
            concern.severity === "warning" ? new vscode.ThemeColor("list.warningForeground") :
                new vscode.ThemeColor("list.deemphasizedForeground"));
    }
}
class ConcernsTreeProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    state = null;
    update(state) {
        this.state = state;
        this._onDidChangeTreeData.fire(null);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!this.state)
            return [];
        if (!element) {
            const byCategory = new Map();
            for (const c of this.state.concerns) {
                const list = byCategory.get(c.category) ?? [];
                list.push(c);
                byCategory.set(c.category, list);
            }
            if (byCategory.size === 0) {
                const empty = new vscode.TreeItem("No concerns — clean session");
                empty.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
                return [empty];
            }
            const severityOrder = { critical: 0, warning: 1, info: 2 };
            return [...byCategory.entries()]
                .sort((a, b) => {
                const aMax = Math.min(...a[1].map((c) => severityOrder[c.severity]));
                const bMax = Math.min(...b[1].map((c) => severityOrder[c.severity]));
                return aMax - bMax;
            })
                .map(([cat, items]) => new ConcernCategoryNode(cat, items, items.length));
        }
        if (element instanceof ConcernCategoryNode) {
            return element.items.map((c) => new ConcernItemNode(c));
        }
        return [];
    }
}
exports.ConcernsTreeProvider = ConcernsTreeProvider;
//# sourceMappingURL=concerns-tree.js.map