const SEVERITY_ICON = {
    critical: "🔴",
    warning: "🟡",
    info: "🔵",
};
export function formatConcerns(concerns) {
    if (concerns.length === 0)
        return "";
    const lines = ["⚖️ Hegel [Layer 1]:"];
    for (const c of concerns) {
        const icon = SEVERITY_ICON[c.severity] ?? "•";
        lines.push(`${icon} [${c.category}] ${c.message}`);
        if (c.suggestion) {
            lines.push(`   → ${c.suggestion}`);
        }
    }
    return lines.join("\n");
}
export function formatBlockMessage(concerns) {
    const actionable = concerns.filter((c) => c.severity === "critical" || c.severity === "warning");
    if (actionable.length === 0)
        return formatConcerns(concerns);
    const hasCritical = actionable.some((c) => c.severity === "critical");
    const header = hasCritical
        ? "⛔ Hegel [Layer 1] blocked this prompt:"
        : "⚖️ Hegel [Layer 1] paused this prompt — please review:";
    const lines = [header, ""];
    for (const c of actionable) {
        const icon = SEVERITY_ICON[c.severity] ?? "•";
        lines.push(`${icon} ${c.message}`);
        if (c.suggestion) {
            lines.push(`   → ${c.suggestion}`);
        }
    }
    lines.push("", "Revise your prompt, or resubmit the same text to proceed anyway.");
    return lines.join("\n");
}
//# sourceMappingURL=format.js.map