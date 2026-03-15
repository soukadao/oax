export interface ShellConfig {
    readonly cwd?: string;
    readonly timeoutMs?: number;
}
export interface ShellResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number | null;
    readonly timedOut: boolean;
}
export declare function executeShell(commands: string[], opts?: {
    cwd?: string;
    timeoutMs?: number;
}): Promise<ShellResult>;
