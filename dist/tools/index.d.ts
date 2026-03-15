export { readFileTool, createReadFileTool } from "./read.js";
export { writeFileTool, createWriteFileTool } from "./write.js";
export { editFileTool, createEditFileTool } from "./edit.js";
export { globTool, createGlobTool } from "./glob.js";
export { grepTool, createGrepTool } from "./grep.js";
import type { ToolDef } from "../core/index.js";
/** All built-in coding tools (bound to process.cwd()). */
export declare const codingTools: readonly ToolDef[];
/** Create coding tools bound to a specific working directory. */
export declare function createCodingTools(cwd: string): ToolDef[];
