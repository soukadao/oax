/**
 * Conversation history as `ResponseInputItem[]`.
 * Each agent execution gets its own Session (context isolation).
 * Reuse across `Runtime.run()` calls for multi-turn conversation.
 */
export class Session {
    items;
    constructor(items) {
        this.items = items ? [...items] : [];
    }
    addResponseOutput(output) {
        for (const item of output) {
            // The SDK may attach extra fields (e.g. parsed_arguments) that the API
            // rejects on round-trip. Strip them before storing.
            const { parsed_arguments, ...clean } = item;
            this.items.push(clean);
        }
    }
    addToolOutput(callId, output) {
        this.items.push({
            type: "function_call_output",
            call_id: callId,
            output,
        });
    }
    addShellOutput(callId, result) {
        this.items.push({
            type: "shell_call_output",
            call_id: callId,
            output: [{
                    stdout: result.stdout,
                    stderr: result.stderr,
                    outcome: result.timedOut
                        ? { type: "timeout" }
                        : { type: "exit", exit_code: result.exitCode ?? 1 },
                }],
        });
    }
    async compact(client, model, instructions) {
        const result = await client.responses.compact({
            model,
            input: this.items,
            instructions,
        });
        this.items.length = 0;
        this.items.push(...result.output);
    }
    /** Serialize for persistence (disk, DB, etc.). */
    toJSON() {
        return [...this.items];
    }
    /** Restore a session from persisted data. */
    static fromJSON(items) {
        return new Session(items);
    }
    get length() {
        return this.items.length;
    }
}
//# sourceMappingURL=session.js.map