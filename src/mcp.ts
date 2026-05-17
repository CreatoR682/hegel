#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import type { SessionState } from "./types.js";
import { sessionDurationMinutes, totalFilesEdited, totalLinesChanged } from "./state.js";

// Look for .hegel-state in the directory where the MCP server was launched
// Cursor launches MCP servers with the workspace root as the CWD.
// If process.argv[2] is provided, use that as the workspace root instead.
const ACTIVE_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function resolveWorkspaceRoot(argv: string[] = process.argv, cwd: string = process.cwd()): string {
  // 1. Explicit environment variable (bulletproof across all shells/spawners)
  if (process.env.HEGEL_WORKSPACE_ROOT) {
    return process.env.HEGEL_WORKSPACE_ROOT;
  }

  // 2. Fallback to argument parsing
  // When run via npx, argv looks like:
  // [0] node
  // [1] .../mcp.js
  // [2] hegel-mcp (sometimes, depending on npx version/args)
  // [3] C:\Projects\CopybarasCircle
  
  // Find the first argument that looks like an absolute path or exists after the script name
  const pathArg = argv.slice(2).find(arg => arg !== "hegel-mcp" && arg !== "--");
  return pathArg ? (isAbsolute(pathArg) ? pathArg : join(cwd, pathArg)) : cwd;
}

export function stateDirForWorkspace(workspaceRoot: string): string {
  return join(workspaceRoot, ".hegel-state");
}

export async function getMostRecentSession(
  stateDir: string,
  now: number = Date.now()
): Promise<SessionState | null> {
  try {
    const files = await readdir(stateDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    
    if (jsonFiles.length === 0) return null;

    const stats = await Promise.all(
      jsonFiles.map(async (f) => {
        const fullPath = join(stateDir, f);
        const s = await stat(fullPath);
        return { name: f, fullPath, mtime: s.mtimeMs };
      })
    );

    stats.sort((a, b) => b.mtime - a.mtime);
    const raw = await readFile(stats[0].fullPath, "utf-8");
    const session = JSON.parse(raw) as SessionState;
    if (now - session.startedAt > ACTIVE_SESSION_MAX_AGE_MS) {
      return null;
    }
    return session;
  } catch (err) {
    // console.error(`Failed to read state dir ${STATE_DIR}:`, err);
    return null;
  }
}

export function buildStatusText(session: SessionState): string {
  const duration = Math.round(sessionDurationMinutes(session));
  const activeConcerns = session.concerns.slice(-5).reverse();

  let statusText = `Hegel Session Status (ID: ${session.conversationId.slice(0, 8)})\n`;
  statusText += `Duration: ${duration}m | Turns: ${session.turnCount} | Compactions: ${session.compactionCount}\n\n`;

  if (activeConcerns.length === 0) {
    statusText += "Health: CLEAN\nNo recent concerns detected.";
  } else {
    const criticalCount = session.concerns.filter(c => c.severity === "critical").length;
    const warningCount = session.concerns.filter(c => c.severity === "warning").length;

    statusText += `Health: ${criticalCount > 0 ? "CRITICAL" : warningCount > 0 ? "WARNING" : "INFO"}\n`;
    statusText += `Total Concerns: ${session.concerns.length} (${criticalCount} critical, ${warningCount} warning)\n\n`;
    statusText += "Recent Concerns:\n";

    for (const c of activeConcerns) {
      statusText += `- [${c.severity.toUpperCase()}] ${c.category}: ${c.message}\n`;
      if (c.suggestion) statusText += `  Suggestion: ${c.suggestion}\n`;
    }
  }

  return statusText;
}

export function buildReviewText(session: SessionState): string {
  const duration = Math.round(sessionDurationMinutes(session));
  const filesEdited = totalFilesEdited(session);
  const linesChanged = totalLinesChanged(session);

  let reviewText = `Hegel Comprehensive Session Review (ID: ${session.conversationId.slice(0, 8)})\n`;
  reviewText += `Duration: ${duration}m | Turns: ${session.turnCount} | Files Edited: ${filesEdited} | Lines Changed: ${linesChanged} | Compactions: ${session.compactionCount}\n\n`;

  if (session.concerns.length === 0) {
    reviewText += "Session was completely clean. Excellent workflow!";
  } else {
    const byCategory = new Map<string, number>();
    for (const c of session.concerns) {
      byCategory.set(c.category, (byCategory.get(c.category) || 0) + 1);
    }

    reviewText += "Concern Categories Summary:\n";
    for (const [cat, count] of byCategory.entries()) {
      reviewText += `- ${cat}: ${count} occurrences\n`;
    }

    reviewText += "\nDetailed Concerns Log:\n";
    for (const c of session.concerns) {
      reviewText += `- [${c.severity.toUpperCase()}] ${c.category}: ${c.message}\n`;
      if (c.suggestion) reviewText += `  Suggestion: ${c.suggestion}\n`;
    }
  }

  return reviewText;
}

export function createServer(stateDir: string): Server {
  const server = new Server(
    {
      name: "hegel-mcp",
      version: "1.0.6",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "hegel-status",
          description: "Fetch the real-time health status of the current Hegel session. Use this mid-task to check for context drift, prompt degradation, or other concerns.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "hegel-review",
          description: "Fetch a comprehensive retrospective of the current Hegel session. Use this at the end of a major task to summarize the session's health and workflow.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const session = await getMostRecentSession(stateDir);

    if (!session) {
      return {
        content: [
          {
            type: "text",
            text: "No active Hegel session found. Ensure you are in a Cursor workspace with Hegel initialized.",
          },
        ],
      };
    }

    if (request.params.name === "hegel-status") {
      return {
        content: [{ type: "text", text: buildStatusText(session) }],
      };
    }

    if (request.params.name === "hegel-review") {
      return {
        content: [{ type: "text", text: buildReviewText(session) }],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}

export async function runMcpServer(stateDir: string = stateDirForWorkspace(resolveWorkspaceRoot())) {
  const server = createServer(stateDir);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isEntrypoint(): boolean {
  return !process.env.VITEST &&
    !!process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  runMcpServer().catch(console.error);
}