import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "../core/index.js";
import { safePath } from "./safePath.js";
export function createWriteFileTool(cwd) {
    return tool({
        name: "write_file",
        description: "Create or overwrite a file with the given content. Creates parent directories if needed.",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path (absolute or relative to cwd)" },
                content: { type: "string", description: "File content to write" },
            },
            required: ["path", "content"],
            additionalProperties: false,
        },
        execute: async (args) => {
            try {
                const resolved = safePath(cwd, args.path);
                await mkdir(dirname(resolved), { recursive: true });
                await writeFile(resolved, args.content);
                return `File written: ${args.path}`;
            }
            catch (err) {
                return `Error writing file: ${err.message}`;
            }
        },
    });
}
export const writeFileTool = createWriteFileTool(process.cwd());
//# sourceMappingURL=write.js.map