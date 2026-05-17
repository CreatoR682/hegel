import { mkdir, writeFile, readdir, readFile, access, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { writeHooksFile } from "../hooks-generator.js";
import type { HegelConfig } from "../config.js";

export interface SetupDeps {
  loadConfig: (workspaceRoot?: string) => Promise<HegelConfig>;
  writeHooksFile: typeof writeHooksFile;
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  readdir: typeof readdir;
  readFile: typeof readFile;
  access: typeof access;
  rm: typeof rm;
  execFileSync: typeof execFileSync;
  log: (message: string) => void;
  error: (message: string) => void;
  resolveHegelRoot: () => string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export const defaultDeps: SetupDeps = {
  loadConfig,
  writeHooksFile,
  mkdir,
  writeFile,
  readdir,
  readFile,
  access,
  rm,
  execFileSync,
  log: console.log,
  error: console.error,
  resolveHegelRoot: () => resolve(join(dirname(fileURLToPath(import.meta.url)), "..", "..")),
  platform: process.platform,
  env: process.env,
};
