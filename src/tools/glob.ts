import { glob as nodeGlob } from "node:fs/promises";
import { tool } from "../core/index.js";

export function createGlobTool(defaultCwd: string) {
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
        const matches: string[] = [];
        for await (const entry of nodeGlob(args.pattern as string, {
          cwd: (args.cwd as string) || defaultCwd,
        })) {
          matches.push(entry);
        }
        if (matches.length === 0) return "No files matched.";
        return matches.sort().join("\n");
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
  });
}

export const globTool = createGlobTool(process.cwd());
