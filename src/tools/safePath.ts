import { resolve, relative, isAbsolute } from "node:path";

/**
 * Resolve a user-provided path against cwd and ensure the result
 * stays within (or equal to) the cwd directory tree.
 * Throws if path traversal is detected.
 */
export function safePath(cwd: string, userPath: string): string {
  const resolved = resolve(cwd, userPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Access denied: path is outside the working directory");
  }
  return resolved;
}
