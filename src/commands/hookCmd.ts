import { loadConfig } from "../config.js";
import { buildHookOutput, type ClaudeCodeHookInput } from "../hook.js";

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function runHook(): Promise<number> {
  let raw: string;
  try {
    raw = await readStdin();
  } catch {
    // No stdin available -- nothing to decide on, stay silent and allow.
    return 0;
  }

  if (!raw.trim()) return 0;

  let input: ClaudeCodeHookInput;
  try {
    input = JSON.parse(raw) as ClaudeCodeHookInput;
  } catch {
    // Malformed payload: don't guess, don't block unrelated work.
    return 0;
  }

  const cwd = input.cwd ?? process.cwd();
  const config = loadConfig(cwd);

  try {
    const output = buildHookOutput(input, config);
    if (output) {
      process.stdout.write(JSON.stringify(output));
    }
  } catch (err) {
    // Fail closed: if PlanGate itself crashes while evaluating a
    // potentially destructive command, ask a human rather than silently
    // allowing it through.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `PlanGate hit an internal error and could not verify this command safely: ${(err as Error).message}`
        }
      })
    );
  }

  return 0;
}
