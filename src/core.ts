import { isTerraformApplyLike, getTerraformPlan } from "./providers/terraform.js";
import { isCloudFormationApplyLike, getCloudFormationPlan } from "./providers/cloudformation.js";
import { isAzureDeployApplyLike, getAzureWhatIfPlan } from "./providers/azure.js";
import { isKubectlDestructive, getKubectlPlan } from "./providers/kubectl.js";
import { isDockerDestructive, getDockerPlan } from "./providers/docker.js";
import { getDatabasePlan } from "./providers/database.js";
import { getAwsSingleShotPlan } from "./providers/awsSingleShot.js";
import { evaluatePlan } from "./policy/index.js";
import { runCheckov } from "./policy/externalScanners.js";
import type { PlanGateConfig, PlanResult, Verdict } from "./types.js";

export interface GateResult {
  /** False means this command is outside PlanGate's scope entirely -- callers should allow it without comment. */
  applicable: boolean;
  verdict?: Verdict;
  plan?: PlanResult;
}

export function getPlanForCommand(command: string, cwd: string): PlanResult | undefined {
  if (isTerraformApplyLike(command)) return getTerraformPlan(cwd);
  if (isCloudFormationApplyLike(command)) return getCloudFormationPlan(command, cwd);
  if (isAzureDeployApplyLike(command)) return getAzureWhatIfPlan(command, cwd);
  if (isKubectlDestructive(command)) return getKubectlPlan(command, cwd);
  if (isDockerDestructive(command)) return getDockerPlan(command, cwd);

  const databasePlan = getDatabasePlan(command);
  if (databasePlan) return databasePlan;

  const singleShot = getAwsSingleShotPlan(command);
  if (singleShot) return singleShot;

  return undefined;
}

export function gateCommand(command: string, cwd: string, config: PlanGateConfig): GateResult {
  const plan = getPlanForCommand(command, cwd);
  if (!plan) return { applicable: false };

  let verdict = evaluatePlan(plan, config);
  if (config.useCheckov && !plan.degraded) {
    verdict = runCheckov(plan, cwd, verdict);
  }

  return { applicable: true, verdict, plan };
}
