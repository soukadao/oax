import type OpenAI from "openai";
import type { Response, ResponseInputItem } from "openai/resources/responses/responses";
import type { ReasoningEffort as SDKReasoningEffort } from "openai/resources/shared";
import { type AgentDef } from "./agent.js";
import type { ApprovalFn } from "./approval.js";
import { type StreamHandler } from "./stream.js";
import { Session } from "./session.js";
/** Reasoning effort levels (excludes "none"). */
export type ReasoningEffort = Exclude<SDKReasoningEffort, "none" | null>;
export interface CompactionConfig {
    /** "server" = context_management param (automatic), "client" = /responses/compact endpoint. */
    readonly mode: "server" | "client";
    readonly threshold?: number;
}
export interface RuntimeConfig {
    readonly client: OpenAI;
    readonly model: string;
    readonly approve?: ApprovalFn;
    /** Max loop iterations per agent. Default: 50. */
    readonly maxTurns?: number;
    /** Max sub-agent nesting depth. Default: 1. */
    readonly maxDepth?: number;
    readonly compaction?: CompactionConfig;
    readonly reasoning?: {
        effort: ReasoningEffort;
    };
    /**
     * Called when the model outputs a message (wants to stop).
     * - `true`   → allow completion, return result
     * - `false`  → continue (model receives generic "keep working" feedback)
     * - `string` → continue with this feedback injected into the conversation
     */
    readonly beforeComplete?: (output: string, session: Session) => Promise<boolean | string>;
}
export interface RunOptions {
    readonly session?: Session;
    readonly stream?: StreamHandler;
    readonly signal?: AbortSignal;
}
/** Why the agent loop terminated. */
export type FinishReason = "complete" | "max_turns" | "max_depth";
/** Aggregated token usage across all turns (and sub-agent invocations). */
export interface Usage {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    totalTokens: number;
}
export interface RunResult {
    readonly output: string;
    readonly finishReason: FinishReason;
    readonly session: Session;
    readonly turns: number;
    readonly usage: Usage;
    readonly response: Response;
}
export declare abstract class Runtime {
    readonly config: RuntimeConfig;
    constructor(config: RuntimeConfig);
    abstract run(agent: AgentDef, input: string | ResponseInputItem[], options?: RunOptions): Promise<RunResult>;
}
export declare class DefaultRuntime extends Runtime {
    run(agent: AgentDef, input: string | ResponseInputItem[], options?: RunOptions): Promise<RunResult>;
    private runAtDepth;
    private callWithStream;
    private handleFunctionCall;
    private handleShellCall;
}
