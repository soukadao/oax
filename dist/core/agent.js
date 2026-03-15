export function agent(options) {
    const tools = options.tools ?? [];
    const seen = new Set();
    for (const t of tools) {
        if (seen.has(t.name)) {
            throw new Error(`Duplicate tool name "${t.name}" in agent "${options.name}"`);
        }
        seen.add(t.name);
    }
    return { kind: "agent", ...options, tools };
}
export function isToolDef(inv) {
    return inv.kind === "tool";
}
export function isAgentDef(inv) {
    return inv.kind === "agent";
}
/** Convert an AgentDef into a FunctionTool for the Responses API. */
export function agentToFunctionTool(def) {
    return {
        type: "function",
        name: def.name,
        description: def.description,
        parameters: {
            type: "object",
            properties: {
                task: { type: "string", description: "Task to delegate to this agent" },
            },
            required: ["task"],
            additionalProperties: false,
        },
        strict: true,
    };
}
//# sourceMappingURL=agent.js.map