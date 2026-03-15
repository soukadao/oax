import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { tool } from "../core/index.js";

export function createGrepTool(defaultCwd: string) {
  return tool({
    name: "grep",
    description: "Search file contents for a regex pattern. Returns matching lines with file path and line number.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern to search for" },
        path: { anyOf: [{ type: "string" }, { type: "null" }], description: "File or directory to search in. Null = current directory." },
        file_pattern: { anyOf: [{ type: "string" }, { type: "null" }], description: "Glob pattern to filter files (e.g. \"*.ts\"). Null = all files." },
      },
      required: ["pattern", "path", "file_pattern"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const pattern = args.pattern as string;
      if (pattern.length > 1000) {
        return "Error: pattern too long (max 1000 characters)";
      }
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, "g");
      } catch (err) {
        return `Error: invalid regex: ${(err as Error).message}`;
      }
      const searchPath = (args.path as string) || defaultCwd;
      const filePattern = (args.file_pattern as string) || "**/*";
      const results: string[] = [];
      const maxResults = 100;

      try {
        const files: string[] = [];
        for await (const entry of glob(filePattern, { cwd: searchPath })) {
          files.push(`${searchPath}/${entry}`);
        }

        for (const file of files.sort()) {
          if (results.length >= maxResults) break;
          try {
            const content = await readFile(file, "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                results.push(`${file}:${i + 1}: ${lines[i]}`);
                regex.lastIndex = 0;
                if (results.length >= maxResults) break;
              }
            }
          } catch {
            // Skip binary/unreadable files
          }
        }

        if (results.length === 0) return "No matches found.";
        const suffix = results.length >= maxResults ? `\n(truncated at ${maxResults} results)` : "";
        return results.join("\n") + suffix;
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
  });
}

export const grepTool = createGrepTool(process.cwd());
