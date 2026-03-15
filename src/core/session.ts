import type OpenAI from "openai";
import type {
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses";
import type { ShellResult } from "./shell.js";

/**
 * Conversation history as `ResponseInputItem[]`.
 * Each agent execution gets its own Session (context isolation).
 * Reuse across `Runtime.run()` calls for multi-turn conversation.
 */
export class Session {
  readonly items: ResponseInputItem[];

  constructor(items?: ResponseInputItem[]) {
    this.items = items ? [...items] : [];
  }

  addResponseOutput(output: ResponseOutputItem[]): void {
    for (const item of output) {
      // The SDK may attach extra fields (e.g. parsed_arguments) that the API
      // rejects on round-trip. Strip them before storing.
      const { parsed_arguments, ...clean } = item as unknown as Record<string, unknown>;
      this.items.push(clean as unknown as ResponseInputItem);
    }
  }

  addToolOutput(callId: string, output: string): void {
    this.items.push({
      type: "function_call_output",
      call_id: callId,
      output,
    });
  }

  addShellOutput(callId: string, result: ShellResult): void {
    this.items.push({
      type: "shell_call_output",
      call_id: callId,
      output: [{
        stdout: result.stdout,
        stderr: result.stderr,
        outcome: result.timedOut
          ? { type: "timeout" as const }
          : { type: "exit" as const, exit_code: result.exitCode ?? 1 },
      }],
    });
  }

  async compact(client: OpenAI, model: string, instructions?: string): Promise<void> {
    const result = await client.responses.compact({
      model,
      input: this.items,
      instructions,
    });
    this.items.length = 0;
    this.items.push(...(result.output as ResponseInputItem[]));
  }

  /** Serialize for persistence (disk, DB, etc.). */
  toJSON(): ResponseInputItem[] {
    return [...this.items];
  }

  /** Restore a session from persisted data. */
  static fromJSON(items: ResponseInputItem[]): Session {
    return new Session(items);
  }

  get length(): number {
    return this.items.length;
  }
}
