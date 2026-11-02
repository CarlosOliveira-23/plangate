import pc from "picocolors";
import { gateCommand } from "../core.js";
import { loadConfig } from "../config.js";

export interface CheckOptions {
  allowAsk?: boolean;
}

function decisionLabel(decision: "allow" | "ask" | "deny"): string {
  if (decision === "allow") return pc.green("ALLOW");
  if (decision === "ask") return pc.yellow("ASK");
  return pc.red("DENY");
}

export async function runCheck(commandParts: string[], options: CheckOptions): Promise<number> {
  const command = commandParts.join(" ");
  const cwd = process.cwd();
  const config = loadConfig(cwd);

  const result = gateCommand(command, cwd, config);

  if (!result.applicable) {
    console.log(pc.dim(`PlanGate does not govern this command, nothing to check:\n  $ ${command}`));
    return 0;
  }

  const verdict = result.verdict!;
  console.log(`${decisionLabel(verdict.decision)}  ${pc.bold(command)}`);
  for (const reason of verdict.reasons) {
    console.log(`  - ${reason}`);
  }

  if (verdict.decision === "deny") return 1;
  if (verdict.decision === "ask") return options.allowAsk ? 0 : 1;
  return 0;
}
