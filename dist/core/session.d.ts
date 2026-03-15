import type OpenAI from "openai";
import type { ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import type { ShellResult } from "./shell.js";
/**
 * Conversation history as `ResponseInputItem[]`.
 * Each agent execution gets its own Session (context isolation).
 * Reuse across `Runtime.run()` calls for multi-turn conversation.
 */
export declare class Session {
    readonly items: ResponseInputItem[];
    constructor(items?: ResponseInputItem[]);
    addResponseOutput(output: ResponseOutputItem[]): void;
    addToolOutput(callId: string, output: string): void;
    addShellOutput(callId: string, result: ShellResult): void;
    compact(client: OpenAI, model: string, instructions?: string): Promise<void>;
    /** Serialize for persistence (disk, DB, etc.). */
    toJSON(): ResponseInputItem[];
    /** Restore a session from persisted data. */
    static fromJSON(items: ResponseInputItem[]): Session;
    get length(): number;
}
