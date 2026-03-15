import type OpenAI from "openai";
import type {
  Response,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseStreamEvent,
  Tool as SDKTool,
  ResponseFunctionToolCall,
  ResponseFunctionShellToolCall,
} from "openai/resources/responses/responses";
import type { ReasoningEffort as SDKReasoningEffort } from "openai/resources/shared";
import { type AgentDef, isAgentDef, isToolDef, agentToFunctionTool } from "./agent.js";
import type { ToolDef } from "./tool.js";
import type { ApprovalFn, ToolCallInfo } from "./approval.js";
import { type StreamHandler, type AgentContext, dispatchStreamEvent } from "./stream.js";
import { Session } from "./session.js";
import { executeShell, type ShellConfig } from "./shell.js";

// ── Types ───────────────────────────────────────────

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
  readonly reasoning?: { effort: ReasoningEffort };
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

// ── Runtime (abstract base) ─────────────────────────

export abstract class Runtime {
  readonly config: RuntimeConfig;

  constructor(config: RuntimeConfig) {
    this.config = config;
  }

  abstract run(
    agent: AgentDef,
    input: string | ResponseInputItem[],
    options?: RunOptions,
  ): Promise<RunResult>;
}

// ── DefaultRuntime (concrete) ───────────────────────

export class DefaultRuntime extends Runtime {
  async run(
    agent: AgentDef,
    input: string | ResponseInputItem[],
    options?: RunOptions,
  ): Promise<RunResult> {
    return this.runAtDepth(agent, input, 0, options);
  }

  private async runAtDepth(
    agent: AgentDef,
    input: string | ResponseInputItem[],
    depth: number,
    options?: RunOptions,
  ): Promise<RunResult> {
    const { config } = this;
    const maxTurns = config.maxTurns ?? 50;
    const maxDepth = config.maxDepth ?? 1;
    const session = options?.session ?? new Session();
    const model = agent.model ?? config.model;
    const ctx: AgentContext = { name: agent.name, depth };

    // Build tool maps
    const toolMap = new Map<string, ToolDef>();
    const agentMap = new Map<string, AgentDef>();
    const sdkTools: SDKTool[] = [];

    for (const inv of agent.tools) {
      if (isToolDef(inv)) {
        toolMap.set(inv.name, inv);
        sdkTools.push({
          type: "function",
          name: inv.name,
          description: inv.description,
          parameters: inv.parameters,
          strict: true,
        });
      } else if (isAgentDef(inv)) {
        agentMap.set(inv.name, inv);
        sdkTools.push(agentToFunctionTool(inv));
      }
    }

    if (agent.shell) {
      sdkTools.push({
        type: "shell" as const,
        environment: { type: "local" as const },
      });
    }

    // Add input to session
    const inputItems: ResponseInputItem[] =
      typeof input === "string" ? [{ role: "user", content: input }] : input;
    session.items.push(...inputItems);

    const usage: Usage = {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
    };

    let lastResponse!: Response;
    let turns = 0;

    while (turns < maxTurns) {
      turns++;

      // Client-side compaction
      if (
        config.compaction?.mode === "client" &&
        config.compaction.threshold &&
        session.length > config.compaction.threshold
      ) {
        await session.compact(config.client, model, agent.instructions);
      }

      // Build API params
      const params: Record<string, unknown> = {
        model,
        input: session.items,
        tools: sdkTools.length > 0 ? sdkTools : undefined,
        instructions: agent.instructions,
      };

      if (config.reasoning) {
        params.reasoning = { effort: config.reasoning.effort };
      }

      if (agent.outputSchema) {
        params.text = {
          format: {
            type: "json_schema",
            name: `${agent.name}_output`,
            schema: agent.outputSchema,
            strict: true,
          },
        };
      }

      // Server-side compaction
      if (config.compaction?.mode === "server" && config.compaction.threshold) {
        params.context_management = [{
          type: "compaction",
          compact_threshold: config.compaction.threshold,
        }];
      }

      // Call Responses API
      let response: Response;

      if (options?.stream) {
        response = await this.callWithStream(
          config.client, params, options.stream, ctx, options.signal,
        );
      } else {
        response = await config.client.responses.create(
          { ...params, stream: false } as Parameters<typeof config.client.responses.create>[0],
          { signal: options?.signal },
        ) as Response;
      }

      lastResponse = response;
      accumulateUsage(usage, response);

      // Classify output
      const kind = classifyOutput(response.output);
      session.addResponseOutput(response.output);

      if (kind === "message") {
        // beforeComplete hook
        if (config.beforeComplete) {
          const decision = await config.beforeComplete(response.output_text, session);
          if (decision !== true) {
            const feedback = typeof decision === "string" ? decision : "Continue working.";
            session.items.push({ role: "user", content: feedback });
            continue;
          }
        }

        return {
          output: response.output_text,
          finishReason: "complete",
          session,
          turns,
          usage,
          response,
        };
      }

      // Handle tool calls
      for (const item of response.output) {
        if (item.type === "function_call") {
          const call = item as ResponseFunctionToolCall;

          if (agentMap.has(call.name)) {
            // Sub-agent invocation
            if (depth >= maxDepth) {
              session.addToolOutput(call.call_id, `Error: max nesting depth (${maxDepth}) exceeded`);
              options?.stream?.onToolResult?.(call.name, call.call_id, `Error: max depth exceeded`, ctx);
              continue;
            }

            const subAgent = agentMap.get(call.name)!;
            let task: string;
            try {
              task = (JSON.parse(call.arguments) as { task: string }).task;
            } catch {
              session.addToolOutput(call.call_id, "Error: invalid arguments");
              options?.stream?.onToolResult?.(call.name, call.call_id, "Error: invalid arguments", ctx);
              continue;
            }

            options?.stream?.onSubAgentStart?.({ name: subAgent.name, depth: depth + 1 }, task);

            const subResult = await this.runAtDepth(
              subAgent, task, depth + 1,
              { stream: options?.stream, signal: options?.signal },
            );

            accumulateUsage(usage, undefined, subResult.usage);
            session.addToolOutput(call.call_id, subResult.output);
            options?.stream?.onToolResult?.(call.name, call.call_id, subResult.output, ctx);
            options?.stream?.onSubAgentDone?.({ name: subAgent.name, depth: depth + 1 }, subResult.output);
          } else {
            // Regular function call
            await this.handleFunctionCall(call, toolMap, config.approve, session, options?.stream, ctx);
          }
        } else if (item.type === "shell_call") {
          await this.handleShellCall(
            item as ResponseFunctionShellToolCall,
            config.approve, session, agent.shell, options?.stream, ctx,
          );
        }
      }
    }

    // Max turns exceeded
    return {
      output: lastResponse.output_text,
      finishReason: "max_turns",
      session,
      turns,
      usage,
      response: lastResponse,
    };
  }

  private async callWithStream(
    client: OpenAI,
    params: Record<string, unknown>,
    handler: StreamHandler,
    ctx: AgentContext,
    signal?: AbortSignal,
  ): Promise<Response> {
    const stream = client.responses.stream(
      params as Parameters<typeof client.responses.stream>[0],
      { signal },
    );

    for await (const event of stream) {
      dispatchStreamEvent(event as ResponseStreamEvent, handler, ctx);
    }

    return stream.finalResponse() as Promise<Response>;
  }

  private async handleFunctionCall(
    call: ResponseFunctionToolCall,
    toolMap: Map<string, ToolDef>,
    approve: ApprovalFn | undefined,
    session: Session,
    stream: StreamHandler | undefined,
    ctx: AgentContext,
  ): Promise<void> {
    const info: ToolCallInfo = {
      type: "function_call",
      name: call.name,
      arguments: call.arguments,
    };

    const decision = approve ? await approve(info) : false;
    if (decision !== true) {
      const reason = typeof decision === "string" ? decision : "Tool call rejected (no approval function configured)";
      session.addToolOutput(call.call_id, `Error: ${reason}`);
      stream?.onToolResult?.(call.name, call.call_id, `Error: ${reason}`, ctx);
      return;
    }

    const tool = toolMap.get(call.name);
    if (!tool) {
      const msg = `Error: Unknown tool "${call.name}"`;
      session.addToolOutput(call.call_id, msg);
      stream?.onToolResult?.(call.name, call.call_id, msg, ctx);
      return;
    }

    try {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>;
      } catch {
        session.addToolOutput(call.call_id, "Error: invalid tool arguments");
        stream?.onToolResult?.(call.name, call.call_id, "Error: invalid tool arguments", ctx);
        return;
      }
      const result = await tool.execute(args);
      session.addToolOutput(call.call_id, result);
      stream?.onToolResult?.(call.name, call.call_id, result, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const sanitized = message.length > 200 ? message.slice(0, 200) + "..." : message;
      session.addToolOutput(call.call_id, `Error: ${sanitized}`);
      stream?.onToolResult?.(call.name, call.call_id, `Error: ${sanitized}`, ctx);
    }
  }

  private async handleShellCall(
    call: ResponseFunctionShellToolCall,
    approve: ApprovalFn | undefined,
    session: Session,
    shellOpts: boolean | ShellConfig | undefined,
    stream: StreamHandler | undefined,
    ctx: AgentContext,
  ): Promise<void> {
    const commands = call.action.commands;

    const info: ToolCallInfo = {
      type: "shell_call",
      commands,
    };

    const decision = approve ? await approve(info) : false;
    if (decision !== true) {
      const reason = typeof decision === "string" ? decision : "Shell call rejected (no approval function configured)";
      const result = { stdout: "", stderr: `Error: ${reason}`, exitCode: 1 as number | null, timedOut: false };
      session.addShellOutput(call.call_id, result);
      stream?.onToolResult?.("shell", call.call_id, `Error: ${reason}`, ctx);
      return;
    }

    const cwd = (typeof shellOpts === "object" ? shellOpts.cwd : undefined) ?? process.cwd();
    const timeoutMs =
      (typeof shellOpts === "object" ? shellOpts.timeoutMs : undefined) ??
      call.action.timeout_ms ??
      undefined;

    const result = await executeShell(commands, { cwd, timeoutMs: timeoutMs ?? undefined });
    session.addShellOutput(call.call_id, result);

    const stdoutPreview = result.stdout.length > 500 ? result.stdout.slice(0, 500) + "..." : result.stdout;
    const summary = result.timedOut
      ? `Timed out. stdout: ${stdoutPreview}`
      : `Exit ${result.exitCode}. stdout: ${stdoutPreview}`;
    stream?.onToolResult?.("shell", call.call_id, summary, ctx);
  }
}

// ── Helpers ─────────────────────────────────────────

type OutputKind = "message" | "tool_calls";

function classifyOutput(output: ResponseOutputItem[]): OutputKind {
  const hasToolCall = output.some(
    (item) => item.type === "function_call" || item.type === "shell_call",
  );
  return hasToolCall ? "tool_calls" : "message";
}

function accumulateUsage(target: Usage, response?: Response, subUsage?: Usage): void {
  if (response?.usage) {
    target.inputTokens += response.usage.input_tokens;
    target.outputTokens += response.usage.output_tokens;
    target.totalTokens += response.usage.total_tokens;
    target.reasoningTokens += response.usage.output_tokens_details?.reasoning_tokens ?? 0;
    target.cachedInputTokens += response.usage.input_tokens_details?.cached_tokens ?? 0;
  }
  if (subUsage) {
    target.inputTokens += subUsage.inputTokens;
    target.outputTokens += subUsage.outputTokens;
    target.totalTokens += subUsage.totalTokens;
    target.reasoningTokens += subUsage.reasoningTokens;
    target.cachedInputTokens += subUsage.cachedInputTokens;
  }
}
