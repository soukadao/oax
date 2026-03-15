import { glob as nodeGlob } from "node:fs/promises";
import { tool } from "../core/index.js";
export function createGlobTool(defaultCwd) {
    return tool({
        name: "glob",
        description: "Find files matching a glob pattern. Returns matching file paths, one per line.",
        parameters: {
            type: "object",
            properties: {
                pattern: { type: "string", description: "Glob pattern (e.g. \"src/**/*.ts\", \"*.json\")" },
                cwd: { anyOf: [{ type: "string" }, { type: "null" }], description: "Directory to search in. Null = working directory." },
            },
            required: ["pattern", "cwd"],
            additionalProperties: false,
        },
        execute: async (args) => {
            try {
                const matches = [];
                for await (const entry of nodeGlob(args.pattern, {
                    cwd: args.cwd || defaultCwd,
                })) {
                    matches.push(entry);
                }
                if (matches.length === 0)
                    return "No files matched.";
                return matches.sort().join("\n");
            }
            catch (err) {
                return `Error: ${err.message}`;
            }
        },
    });
}
export const globTool = createGlobTool(process.cwd());
//# sourceMappingURL=glob.js.map