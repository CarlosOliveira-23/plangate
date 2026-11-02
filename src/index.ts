export * from "./types.js";
export { gateCommand, getPlanForCommand } from "./core.js";
export type { GateResult } from "./core.js";
export { evaluatePlan } from "./policy/index.js";
export { isStateful, BUILTIN_STATEFUL_RULES } from "./policy/statefulResourceTypes.js";
export { loadConfig, DEFAULT_CONFIG, DEFAULT_CONFIG_YAML } from "./config.js";

export { parseTerraformPlanJson, isTerraformApplyLike } from "./providers/terraform.js";
export { parseChangeSetJson, isCloudFormationApplyLike } from "./providers/cloudformation.js";
export { parseWhatIfJson, isAzureDeployApplyLike } from "./providers/azure.js";
export { isKubectlDestructive } from "./providers/kubectl.js";
export { isDockerDestructive, extractComposeVolumeNames } from "./providers/docker.js";
export { matchDestructiveDatabaseCommand } from "./providers/database.js";
export { matchSingleShotDestructive } from "./providers/awsSingleShot.js";
