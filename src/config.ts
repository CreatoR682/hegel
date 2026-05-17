import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface HegelConfig {
  model: string;
  enableLlmAnalysis: boolean;
  timeoutSeconds: number;
  strictness: "relaxed" | "balanced" | "strict";
}

const DEFAULTS: HegelConfig = {
  model: "auto",
  enableLlmAnalysis: true,
  timeoutSeconds: 15,
  strictness: "balanced",
};

function hegelRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function configPath(workspaceRoot: string = process.cwd()): string {
  return join(workspaceRoot, "hegel.config.json");
}

export async function loadConfig(workspaceRoot: string = process.cwd()): Promise<HegelConfig> {
  try {
    const raw = await readFile(configPath(workspaceRoot), "utf-8");
    const parsed = JSON.parse(raw) as Partial<HegelConfig>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
