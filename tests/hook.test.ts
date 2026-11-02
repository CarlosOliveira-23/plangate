import { describe, it, expect } from "vitest";
import { buildHookOutput } from "../src/hook.js";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("buildHookOutput", () => {
  it("stays silent for non-Bash tools", () => {
    const output = buildHookOutput({ tool_name: "Read", tool_input: {} }, DEFAULT_CONFIG);
    expect(output).toBeUndefined();
  });

  it("stays silent for Bash commands outside PlanGate's scope", () => {
    const output = buildHookOutput({ tool_name: "Bash", tool_input: { command: "npm test" } }, DEFAULT_CONFIG);
    expect(output).toBeUndefined();
  });

  it("denies a single-shot destructive AWS call via the structured hookSpecificOutput shape", () => {
    const output = buildHookOutput(
      {
        tool_name: "Bash",
        tool_input: { command: "aws dynamodb delete-table --table-name Orders" },
        cwd: process.cwd()
      },
      DEFAULT_CONFIG
    );

    expect(output?.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(output?.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(output?.hookSpecificOutput.permissionDecisionReason).toContain("DynamoDB table");
  });

  it("asks for confirmation when a plan cannot be verified (fail closed)", () => {
    const output = buildHookOutput(
      { tool_name: "Bash", tool_input: { command: "terraform apply -auto-approve" }, cwd: process.cwd() },
      DEFAULT_CONFIG
    );
    expect(output?.hookSpecificOutput.permissionDecision).toBe("ask");
  });
});
