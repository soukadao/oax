/** Information about a pending tool/shell call. */
export interface ToolCallInfo {
  readonly type: "function_call" | "shell_call";
  readonly name?: string;
  readonly arguments?: string;
  readonly commands?: string[];
}

/**
 * `true` → execute, `false` → reject, `string` → reject with reason.
 */
export type ApprovalFn = (call: ToolCallInfo) => Promise<boolean | string>;

/** Approve all tool calls without prompting. */
export const autoApprove: ApprovalFn = async () => true;

/** Reject all tool calls. */
export const denyAll: ApprovalFn = async () => false;

/** Approve only if the predicate returns true. */
export function approveIf(
  predicate: (call: ToolCallInfo) => boolean | string,
): ApprovalFn {
  return async (call) => predicate(call);
}
