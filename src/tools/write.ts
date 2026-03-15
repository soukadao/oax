import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { tool } from "../core/index.js";
import { safePath } from "./safePath.js";

export function createWriteFileTool(cwd: string) {
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
        const resolved = safePath(cwd, args.path as string);
        await mkdir(dirname(resolved), { recursive: true });
        await writeFile(resolved, args.content as string);
        return `File written: ${args.path}`;
      } catch (err) {
        return `Error writing file: ${(err as Error).message}`;
      }
    },
  });
}

export const writeFileTool = createWriteFileTool(process.cwd());
