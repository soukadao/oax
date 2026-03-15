import type { ResponseStreamEvent } from "openai/resources/responses/responses";

/** Identifies which agent in the hierarchy is producing an event. */
export interface AgentContext {
  readonly name: string;
  /** 0 = lead agent, 1 = sub-agent, etc. */
  readonly depth: number;
}

/**
 * Stream event handler shared across the entire agent hierarchy.
 * Every callback receives an AgentContext to identify the source agent.
 */
export interface StreamHandler {
  onTextDelta?(delta: string, agent: AgentContext): void;
  onReasoningDelta?(delta: string, agent: AgentContext): void;
  onToolCallStart?(name: string, callId: string, agent: AgentContext): void;
  /** Called after a tool has been executed and produced a result. */
  onToolResult?(name: string, callId: string, result: string, agent: AgentContext): void;
  onSubAgentStart?(agent: AgentContext, task: string): void;
  onSubAgentDone?(agent: AgentContext, result: string): void;
  onEvent?(event: ResponseStreamEvent, agent: AgentContext): void;
}

/** Dispatch a ResponseStreamEvent to the appropriate StreamHandler callback. */
export function dispatchStreamEvent(
  event: ResponseStreamEvent,
  handler: StreamHandler,
  ctx: AgentContext,
): void {
  handler.onEvent?.(event, ctx);

  switch (event.type) {
    case "response.output_text.delta":
      handler.onTextDelta?.(event.delta, ctx);
      break;
    case "response.reasoning_text.delta":
      handler.onReasoningDelta?.(event.delta, ctx);
      break;
    case "response.output_item.added":
      if (event.item.type === "function_call") {
        handler.onToolCallStart?.(event.item.name, event.item.call_id, ctx);
      }
      break;
  }
}
