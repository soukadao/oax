import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const ALLOWED_SHELLS = new Set([
    "/bin/sh",
    "/bin/bash",
    "/bin/zsh",
    "/usr/bin/sh",
    "/usr/bin/bash",
    "/usr/bin/zsh",
    "/usr/local/bin/bash",
    "/usr/local/bin/zsh",
    "/opt/homebrew/bin/bash",
    "/opt/homebrew/bin/zsh",
]);
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB
function resolveShell() {
    const envShell = process.env.SHELL;
    if (envShell && ALLOWED_SHELLS.has(envShell) && existsSync(envShell)) {
        return envShell;
    }
    return "/bin/sh";
}
export function executeShell(commands, opts) {
    const cmd = commands.join(" && ");
    const timeout = opts?.timeoutMs ?? 30_000;
    const shell = resolveShell();
    return new Promise((resolve) => {
        const proc = spawn(shell, ["-c", cmd], {
            cwd: opts?.cwd ?? process.cwd(),
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env },
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let stdoutBytes = 0;
        let stderrBytes = 0;
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill();
        }, timeout);
        proc.stdout.on("data", (chunk) => {
            stdoutBytes += chunk.length;
            if (stdoutBytes <= MAX_OUTPUT_BYTES) {
                stdout += chunk.toString();
            }
            else if (!stdout.endsWith("\n[output truncated]")) {
                stdout += "\n[output truncated]";
                proc.kill();
            }
        });
        proc.stderr.on("data", (chunk) => {
            stderrBytes += chunk.length;
            if (stderrBytes <= MAX_OUTPUT_BYTES) {
                stderr += chunk.toString();
            }
            else if (!stderr.endsWith("\n[output truncated]")) {
                stderr += "\n[output truncated]";
            }
        });
        proc.on("error", (err) => {
            clearTimeout(timer);
            resolve({ stdout, stderr: stderr || err.message, exitCode: null, timedOut });
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            resolve({ stdout, stderr, exitCode: code, timedOut });
        });
    });
}
//# sourceMappingURL=shell.js.map