// Tool
export { tool } from "./tool.js";
export type { ToolDef } from "./tool.js";

// Agent
export { agent, isToolDef, isAgentDef, agentToFunctionTool } from "./agent.js";
export type { AgentDef, Invocable } from "./agent.js";

// Shell
export { executeShell } from "./shell.js";
export type { ShellConfig, ShellResult } from "./shell.js";

// Approval
export { autoApprove, denyAll, approveIf } from "./approval.js";
export type { ToolCallInfo, ApprovalFn } from "./approval.js";

// Streaming
export { dispatchStreamEvent } from "./stream.js";
export type { AgentContext, StreamHandler } from "./stream.js";

// Session
export { Session } from "./session.js";

// Runtime
export { Runtime, DefaultRuntime } from "./runtime.js";
export type {
  ReasoningEffort,
  CompactionConfig,
  RuntimeConfig,
  RunOptions,
  FinishReason,
  Usage,
  RunResult,
} from "./runtime.js";

// SDK re-exports
export type {
  Response,
  ResponseInputItem,
  ResponseOutputItem,
  ResponseStreamEvent,
  FunctionTool,
} from "openai/resources/responses/responses";
