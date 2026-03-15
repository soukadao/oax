import { isAgentDef, isToolDef, agentToFunctionTool } from "./agent.js";
import { dispatchStreamEvent } from "./stream.js";
import { Session } from "./session.js";
import { executeShell } from "./shell.js";
// ── Runtime (abstract base) ─────────────────────────
export class Runtime {
    config;
    constructor(config) {
        this.config = config;
    }
}
// ── DefaultRuntime (concrete) ───────────────────────
export class DefaultRuntime extends Runtime {
    async run(agent, input, options) {
        return this.runAtDepth(agent, input, 0, options);
    }
    async runAtDepth(agent, input, depth, options) {
        const { config } = this;
        const maxTurns = config.maxTurns ?? 50;
        const maxDepth = config.maxDepth ?? 1;
        const session = options?.session ?? new Session();
        const model = agent.model ?? config.model;
        const ctx = { name: agent.name, depth };
        // Build tool maps
        const toolMap = new Map();
        const agentMap = new Map();
        const sdkTools = [];
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
            }
            else if (isAgentDef(inv)) {
                agentMap.set(inv.name, inv);
                sdkTools.push(agentToFunctionTool(inv));
            }
        }
        if (agent.shell) {
            sdkTools.push({
                type: "shell",
                environment: { type: "local" },
            });
        }
        // Add input to session
        const inputItems = typeof input === "string" ? [{ role: "user", content: input }] : input;
        session.items.push(...inputItems);
        const usage = {
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
            totalTokens: 0,
        };
        let lastResponse;
        let turns = 0;
        while (turns < maxTurns) {
            turns++;
            // Client-side compaction
            if (config.compaction?.mode === "client" &&
                config.compaction.threshold &&
                session.length > config.compaction.threshold) {
                await session.compact(config.client, model, agent.instructions);
            }
            // Build API params
            const params = {
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
            let response;
            if (options?.stream) {
                response = await this.callWithStream(config.client, params, options.stream, ctx, options.signal);
            }
            else {
                response = await config.client.responses.create({ ...params, stream: false }, { signal: options?.signal });
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
                    const call = item;
                    if (agentMap.has(call.name)) {
                        // Sub-agent invocation
                        if (depth >= maxDepth) {
                            session.addToolOutput(call.call_id, `Error: max nesting depth (${maxDepth}) exceeded`);
                            options?.stream?.onToolResult?.(call.name, call.call_id, `Error: max depth exceeded`, ctx);
                            continue;
                        }
                        const subAgent = agentMap.get(call.name);
                        let task;
                        try {
                            task = JSON.parse(call.arguments).task;
                        }
                        catch {
                            session.addToolOutput(call.call_id, "Error: invalid arguments");
                            options?.stream?.onToolResult?.(call.name, call.call_id, "Error: invalid arguments", ctx);
                            continue;
                        }
                        options?.stream?.onSubAgentStart?.({ name: subAgent.name, depth: depth + 1 }, task);
                        const subResult = await this.runAtDepth(subAgent, task, depth + 1, { stream: options?.stream, signal: options?.signal });
                        accumulateUsage(usage, undefined, subResult.usage);
                        session.addToolOutput(call.call_id, subResult.output);
                        options?.stream?.onToolResult?.(call.name, call.call_id, subResult.output, ctx);
                        options?.stream?.onSubAgentDone?.({ name: subAgent.name, depth: depth + 1 }, subResult.output);
                    }
                    else {
                        // Regular function call
                        await this.handleFunctionCall(call, toolMap, config.approve, session, options?.stream, ctx);
                    }
                }
                else if (item.type === "shell_call") {
                    await this.handleShellCall(item, config.approve, session, agent.shell, options?.stream, ctx);
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
    async callWithStream(client, params, handler, ctx, signal) {
        const stream = client.responses.stream(params, { signal });
        for await (const event of stream) {
            dispatchStreamEvent(event, handler, ctx);
        }
        return stream.finalResponse();
    }
    async handleFunctionCall(call, toolMap, approve, session, stream, ctx) {
        const info = {
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
            let args;
            try {
                args = JSON.parse(call.arguments);
            }
            catch {
                session.addToolOutput(call.call_id, "Error: invalid tool arguments");
                stream?.onToolResult?.(call.name, call.call_id, "Error: invalid tool arguments", ctx);
                return;
            }
            const result = await tool.execute(args);
            session.addToolOutput(call.call_id, result);
            stream?.onToolResult?.(call.name, call.call_id, result, ctx);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const sanitized = message.length > 200 ? message.slice(0, 200) + "..." : message;
            session.addToolOutput(call.call_id, `Error: ${sanitized}`);
            stream?.onToolResult?.(call.name, call.call_id, `Error: ${sanitized}`, ctx);
        }
    }
    async handleShellCall(call, approve, session, shellOpts, stream, ctx) {
        const commands = call.action.commands;
        const info = {
            type: "shell_call",
            commands,
        };
        const decision = approve ? await approve(info) : false;
        if (decision !== true) {
            const reason = typeof decision === "string" ? decision : "Shell call rejected (no approval function configured)";
            const result = { stdout: "", stderr: `Error: ${reason}`, exitCode: 1, timedOut: false };
            session.addShellOutput(call.call_id, result);
            stream?.onToolResult?.("shell", call.call_id, `Error: ${reason}`, ctx);
            return;
        }
        const cwd = (typeof shellOpts === "object" ? shellOpts.cwd : undefined) ?? process.cwd();
        const timeoutMs = (typeof shellOpts === "object" ? shellOpts.timeoutMs : undefined) ??
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
function classifyOutput(output) {
    const hasToolCall = output.some((item) => item.type === "function_call" || item.type === "shell_call");
    return hasToolCall ? "tool_calls" : "message";
}
function accumulateUsage(target, response, subUsage) {
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
//# sourceMappingURL=runtime.js.map