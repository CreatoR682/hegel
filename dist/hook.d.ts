import type { HookBaseInput } from "./types.js";
type OutputWriter = (obj: Record<string, unknown>) => void;
type InputReader = () => Promise<string>;
export declare function processHookInput(input: HookBaseInput, output?: OutputWriter): Promise<void>;
export declare function processHookJson(raw: string, output?: OutputWriter): Promise<void>;
export declare function runHook(readInput?: InputReader, output?: OutputWriter): Promise<void>;
export {};
//# sourceMappingURL=hook.d.ts.map