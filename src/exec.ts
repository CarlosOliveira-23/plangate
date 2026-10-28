import { spawnSync } from "node:child_process";

export interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function run(command: string, args: string[], cwd: string): ExecResult {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const spawnError = result.error ? String(result.error.message ?? result.error) : "";
  return {
    status: result.error ? null : result.status,
    stdout: result.stdout ?? "",
    stderr: [result.stderr ?? "", spawnError].filter(Boolean).join("\n")
  };
}

export function isInstalled(command: string): boolean {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.error === undefined;
}

export function describeFailure(result: ExecResult, binary: string): string {
  if (result.status === null) return `\`${binary}\` is not installed or not on PATH.`;
  return `exit ${result.status}: ${result.stderr.slice(0, 500)}`;
}
