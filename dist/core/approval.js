/** Approve all tool calls without prompting. */
export const autoApprove = async () => true;
/** Reject all tool calls. */
export const denyAll = async () => false;
/** Approve only if the predicate returns true. */
export function approveIf(predicate) {
    return async (call) => predicate(call);
}
//# sourceMappingURL=approval.js.map