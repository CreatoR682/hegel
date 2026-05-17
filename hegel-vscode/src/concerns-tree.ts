import * as vscode from "vscode";
import type { Concern, SessionState } from "./types";

type TreeNode = ConcernCategoryNode | ConcernItemNode;

class ConcernCategoryNode extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly items: Concern[],
    public readonly count: number
  ) {
    super(
      `${category} (${count})`,
      vscode.TreeItemCollapsibleState.Expanded
    );
    this.contextValue = "category";

    const maxSeverity = items.reduce((max, c) => {
      const order = { critical: 3, warning: 2, info: 1 };
      return order[c.severity] > order[max] ? c.severity : max;
    }, "info" as Concern["severity"]);

    this.iconPath = new vscode.ThemeIcon(
      maxSeverity === "critical" ? "error" :
      maxSeverity === "warning" ? "warning" : "info",
      maxSeverity === "critical" ? new vscode.ThemeColor("errorForeground") :
      maxSeverity === "warning" ? new vscode.ThemeColor("list.warningForeground") :
      undefined
    );
  }
}

class ConcernItemNode extends vscode.TreeItem {
  constructor(public readonly concern: Concern) {
    const isLayer2 = concern.message.startsWith("[Layer 2]");
    const cleanMessage = isLayer2 ? concern.message.replace(/^\[Layer 2\]\s*/i, "") : concern.message;
    const layerTag = isLayer2 ? "Layer 2" : "Layer 1";

    super(cleanMessage, vscode.TreeItemCollapsibleState.None);
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

    this.iconPath = new vscode.ThemeIcon(
      concern.severity === "critical" ? "circle-filled" :
      concern.severity === "warning" ? "circle-filled" : "circle-outline",
      concern.severity === "critical" ? new vscode.ThemeColor("errorForeground") :
      concern.severity === "warning" ? new vscode.ThemeColor("list.warningForeground") :
      new vscode.ThemeColor("list.deemphasizedForeground")
    );
  }
}

export class ConcernsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private state: SessionState | null = null;

  update(state: SessionState | null): void {
    this.state = state;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!this.state) return [];

    if (!element) {
      const byCategory = new Map<string, Concern[]>();
      for (const c of this.state.concerns) {
        const list = byCategory.get(c.category) ?? [];
        list.push(c);
        byCategory.set(c.category, list);
      }

      if (byCategory.size === 0) {
        const empty = new vscode.TreeItem("No concerns — clean session");
        empty.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        return [empty as TreeNode];
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
