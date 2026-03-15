import type { FunctionTool } from "openai/resources/responses/responses";
import type { ToolDef } from "./tool.js";
import type { ShellConfig } from "./shell.js";
/**
 * Agent specification — a role definition for an LLM loop.
 *
 * An agent IS a tool from the parent's perspective:
 * the Runtime converts it to a FunctionTool with a single `task: string` parameter.
 * Each invocation runs in its own Session (context isolation).
 */
export interface AgentDef {
    readonly kind: "agent";
    readonly name: string;
    readonly description: string;
    readonly instructions: string;
    readonly tools: readonly Invocable[];
    readonly shell?: boolean | ShellConfig;
    /** Override the Runtime's default model for this agent. */
    readonly model?: string;
    /**
     * JSON Schema for structured output.
     * When set, the Responses API is called with `text.format = { type: "json_schema", schema }`,
     * guaranteeing the agent's output conforms to this schema.
     */
    readonly outputSchema?: Record<string, unknown>;
}
export declare function agent(options: Omit<AgentDef, "kind" | "tools"> & {
    tools?: Invocable[];
}): AgentDef;
/**
 * Discriminated union of everything that can appear in an Agent's tool list.
 * - `ToolDef`  — a function tool (kind: "tool")
 * - `AgentDef` — a sub-agent (kind: "agent"), composed into the parent as a tool
 */
export type Invocable = ToolDef | AgentDef;
export declare function isToolDef(inv: Invocable): inv is ToolDef;
export declare function isAgentDef(inv: Invocable): inv is AgentDef;
/** Convert an AgentDef into a FunctionTool for the Responses API. */
export declare function agentToFunctionTool(def: AgentDef): FunctionTool;
