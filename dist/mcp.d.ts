#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { SessionState } from "./types.js";
export declare function resolveWorkspaceRoot(argv?: string[], cwd?: string): string;
export declare function stateDirForWorkspace(workspaceRoot: string): string;
export declare function getMostRecentSession(stateDir: string, now?: number): Promise<SessionState | null>;
export declare function buildStatusText(session: SessionState): string;
export declare function buildReviewText(session: SessionState): string;
export declare function createServer(stateDir: string): Server;
export declare function runMcpServer(stateDir?: string): Promise<void>;
//# sourceMappingURL=mcp.d.ts.map