import { readFile } from "node:fs/promises";
import { tool } from "../core/index.js";
import { safePath } from "./safePath.js";
export function createReadFileTool(cwd) {
    return tool({
        name: "read_file",
        description: "Read the contents of a file. Returns the full text content.",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path (absolute or relative to cwd)" },
            },
            required: ["path"],
            additionalProperties: false,
        },
        execute: async (args) => {
            try {
                const resolved = safePath(cwd, args.path);
                return await readFile(resolved, "utf-8");
            }
            catch (err) {
                return `Error reading file: ${err.message}`;
            }
        },
    });
}
export const readFileTool = createReadFileTool(process.cwd());
//# sourceMappingURL=read.js.map