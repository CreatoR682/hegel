import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key) => {
        if (key === "model") return "auto";
        if (key === "enableLlmAnalysis") return true;
        return undefined;
      }
    })
  }
}), { virtual: true });

describe("DashboardPanel", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("disables scripts when resolving the webview", async () => {
    const { DashboardPanel } = await import("../hegel-vscode/src/dashboard-panel.ts");
    const panel = new DashboardPanel({});
    const webviewView = {
      webview: {
        options: {},
        html: "",
      },
    };

    panel.resolveWebviewView(webviewView, {}, {});

    expect(webviewView.webview.options).toEqual({ enableScripts: false });
    expect(webviewView.webview.html).toContain("No Active Session");
  });

  it("escapes user-controlled html and normalizes invalid severity values", async () => {
    const { DashboardPanel } = await import("../hegel-vscode/src/dashboard-panel.ts");
    const panel = new DashboardPanel({});
    const state = {
      conversationId: "session-1234",
      startedAt: Date.now(),
      prompts: [
        {
          timestamp: Date.now(),
          prompt: "<script>alert('prompt')</script>",
          wordCount: 1,
          concerns: [
            {
              severity: 'warning" onclick="alert(1)',
              category: "<img src=x onerror=alert(1)>",
              message: "prompt issue",
            },
          ],
        },
      ],
      responses: [],
      fileEdits: [],
      turnCount: 1,
      compactionCount: 0,
      concerns: [
        {
          severity: 'warning" onclick="alert(1)',
          category: "prompt-quality",
          message: "<script>alert('concern')</script>",
          suggestion: "<b>fix it</b>",
          sourceText: "<img src=x onerror=alert(1)>",
        },
      ],
      modelsUsed: ['model"><script>alert(1)</script>'],
    };

    const html = panel.buildHtml(state);

    expect(html).toContain("&lt;script&gt;alert('prompt')&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert('concern')&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;fix it&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("badge-info");
    expect(html).toContain("concern-info");
    expect(html).not.toContain("onclick=");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });
});
