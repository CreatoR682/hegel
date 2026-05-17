import { stdin } from "node:process";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
const LOG_DIR = ".hegel-state";
const DEBUG_LOG = join(LOG_DIR, "debug-raw.log");
async function main() {
    await mkdir(LOG_DIR, { recursive: true });
    const chunks = [];
    for await (const chunk of stdin) {
        chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").replace(/^\uFEFF/, "");
    const ts = new Date().toISOString();
    await appendFile(DEBUG_LOG, `\n=== ${ts} ===\nSTDIN (${raw.length} bytes):\n${raw}\n`, "utf-8");
    let input;
    try {
        input = JSON.parse(raw);
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await appendFile(DEBUG_LOG, `PARSE ERROR: ${errMsg}\n`, "utf-8");
        process.stdout.write(JSON.stringify({ continue: true }) + "\n");
        return;
    }
    await appendFile(DEBUG_LOG, `PARSED event: ${input.hook_event_name}\n`, "utf-8");
    const event = input.hook_event_name;
    if (event === "beforeSubmitPrompt") {
        const prompt = input.prompt ?? "";
        const isLazy = /^(fix it|fix this|do it|make it work)\.?$/i.test(prompt.trim());
        const output = isLazy
            ? { continue: false, user_message: `⚖️ Hegel: Lazy prompt detected — "${prompt}". Please be more specific.` }
            : { continue: true };
        const json = JSON.stringify(output);
        await appendFile(DEBUG_LOG, `STDOUT: ${json}\n`, "utf-8");
        process.stdout.write(json + "\n");
    }
    else if (event === "stop") {
        const output = { followup_message: "📊 Hegel: Session review — debug wrapper active." };
        const json = JSON.stringify(output);
        await appendFile(DEBUG_LOG, `STDOUT: ${json}\n`, "utf-8");
        process.stdout.write(json + "\n");
    }
    else {
        process.stdout.write(JSON.stringify({}) + "\n");
    }
}
main().catch(async (err) => {
    try {
        await mkdir(LOG_DIR, { recursive: true });
        await appendFile(DEBUG_LOG, `FATAL: ${err instanceof Error ? err.stack : String(err)}\n`, "utf-8");
    }
    catch { /* */ }
    process.stdout.write(JSON.stringify({ continue: true }) + "\n");
});
//# sourceMappingURL=debug-wrapper.js.map