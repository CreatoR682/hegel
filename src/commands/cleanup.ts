import { resolve, join } from "node:path";
import type { SetupDeps } from "./types.js";
import { defaultDeps } from "./types.js";

export async function runCleanup(
  argv: string[] = process.argv,
  deps: SetupDeps = defaultDeps
): Promise<number> {
  const rest = argv.slice(2);
  const positional = rest.filter((a) => !a.startsWith("--"));
  const targetDir = positional[1] ?? ".";
  const projectPath = resolve(targetDir);

  const stateDir = join(projectPath, ".hegel-state");
  try {
    await deps.access(stateDir);
  } catch {
    deps.log(`No .hegel-state directory found in ${projectPath}`);
    return 0;
  }

  const { pruneSupersededConcernsFromState, analyzeSession } = await import("../analyzers/session-analyzer.js");

  deps.log(`Cleaning up session state in ${stateDir}...`);
  let cleanedCount = 0;

  const files = await deps.readdir(stateDir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = join(stateDir, file);
    try {
      const content = await deps.readFile(filePath, "utf-8");
      const state = JSON.parse(content);
      
      if (!state.conversationId || !Array.isArray(state.concerns)) continue;
      
      // 1. Remove all old session-level concerns to recompute them cleanly
      state.concerns = state.concerns.filter((c: any) => c.sourceType !== "session");
      
      // 2. Remove context-drift bug where sourceText contains "Hegel Session Review"
      state.concerns = state.concerns.filter((c: any) => 
        !(c.category === "context-drift" && c.sourceText && c.sourceText.includes("Hegel Session Review"))
      );
      
      // 3. Prune superseded response concerns (untested-changes, missing-verification)
      pruneSupersededConcernsFromState(state, null);
      
      // 4. Recompute session-level concerns
      const { concerns: newSessionConcerns } = analyzeSession(state, null);
      for (const c of newSessionConcerns) {
        c.sourceType = "session";
        state.concerns.push(c);
      }
      
      await deps.writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
      cleanedCount++;
    } catch (err) {
      deps.log(`  Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  deps.log(`✅ Cleaned up ${cleanedCount} session files.`);
  return 0;
}
