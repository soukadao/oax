/** A function tool with execution logic. */
export interface ToolDef {
    readonly kind: "tool";
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly execute: (args: Record<string, unknown>) => Promise<string>;
}
export declare function tool(options: Omit<ToolDef, "kind">): ToolDef;
