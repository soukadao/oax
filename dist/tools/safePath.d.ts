/**
 * Resolve a user-provided path against cwd and ensure the result
 * stays within (or equal to) the cwd directory tree.
 * Throws if path traversal is detected.
 */
export declare function safePath(cwd: string, userPath: string): string;
