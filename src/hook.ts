import { gateCommand } from "./core.js";
import type { PlanGateConfig, Verdict } from "./types.js";

export interface ClaudeCodeHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { command?: string };
  cwd?: string;
}

export interface ClaudeCodePermissionOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "allow" | "ask" | "deny";
    permissionDecisionReason: string;
  };
}

function formatReason(verdict: Verdict, command: string): string {
  const header =
    verdict.decision === "deny"
      ? "PlanGate blocked this command:"
      : verdict.decision === "ask"
        ? "PlanGate wants human confirmation for this command:"
        : "PlanGate reviewed this command's actual plan/diff and found nothing destructive:";

  const lines = [header, `  $ ${command}`, "", ...verdict.reasons.map((r) => `- ${r}`)];
  return lines.join("\n");
}

/**
 * Pure decision function: given a Claude Code PreToolUse payload, returns
 * the JSON to print to stdout, or `undefined` to stay silent (command is
 * outside PlanGate's scope -- no comment, no noise).
 */
export function buildHookOutput(
  input: ClaudeCodeHookInput,
  config: PlanGateConfig
): ClaudeCodePermissionOutput | undefined {
  if (input.tool_name !== "Bash") return undefined;
  const command = input.tool_input?.command;
  if (!command) return undefined;

  const cwd = input.cwd ?? process.cwd();
  const result = gateCommand(command, cwd, config);
  if (!result.applicable || !result.verdict) return undefined;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: result.verdict.decision,
      permissionDecisionReason: formatReason(result.verdict, command)
    }
  };
}
