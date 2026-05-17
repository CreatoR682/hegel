export interface HegelConfig {
    model: string;
    enableLlmAnalysis: boolean;
    timeoutSeconds: number;
    strictness: "relaxed" | "balanced" | "strict";
}
export declare function configPath(workspaceRoot?: string): string;
export declare function loadConfig(workspaceRoot?: string): Promise<HegelConfig>;
//# sourceMappingURL=config.d.ts.map