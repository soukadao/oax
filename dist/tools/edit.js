import { readFile, writeFile } from "node:fs/promises";
import { tool } from "../core/index.js";
import { safePath } from "./safePath.js";
export function createEditFileTool(cwd) {
    return tool({
        name: "edit_file",
        description: "Replace an exact string in a file. The old_string must appear exactly once in the file.",
        parameters: {
            type: "object",
            properties: {
                path: { type: "string", description: "File path" },
                old_string: { type: "string", description: "Exact string to find (must be unique in the file)" },
                new_string: { type: "string", description: "Replacement string" },
            },
            required: ["path", "old_string", "new_string"],
            additionalProperties: false,
        },
        execute: async (args) => {
            const filePath = safePath(cwd, args.path);
            const oldStr = args.old_string;
            const newStr = args.new_string;
            try {
                const content = await readFile(filePath, "utf-8");
                const count = content.split(oldStr).length - 1;
                if (count === 0) {
                    return `Error: old_string not found in ${args.path}`;
                }
                if (count > 1) {
                    return `Error: old_string found ${count} times in ${args.path}. Must be unique.`;
                }
                await writeFile(filePath, content.replace(oldStr, newStr));
                return `File edited: ${args.path}`;
            }
            catch (err) {
                return `Error editing file: ${err.message}`;
            }
        },
    });
}
export const editFileTool = createEditFileTool(process.cwd());
//# sourceMappingURL=edit.js.map