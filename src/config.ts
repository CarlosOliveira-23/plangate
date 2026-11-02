import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { PlanGateConfig } from "./types.js";

export const DEFAULT_CONFIG: PlanGateConfig = {
  protectedTags: {
    Environment: ["production", "prod"],
    environment: ["production", "prod"],
    Env: ["production", "prod"]
  },
  extraStatefulPatterns: [],
  allowlist: [],
  useCheckov: true
};

const CONFIG_FILENAME = ".plangate.yml";

export function loadConfig(cwd: string): PlanGateConfig {
  const path = join(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) return DEFAULT_CONFIG;

  try {
    const raw = readFileSync(path, "utf8");
    const parsed = (yaml.load(raw) as Partial<PlanGateConfig>) ?? {};
    return {
      protectedTags: { ...DEFAULT_CONFIG.protectedTags, ...(parsed.protectedTags ?? {}) },
      extraStatefulPatterns: parsed.extraStatefulPatterns ?? DEFAULT_CONFIG.extraStatefulPatterns,
      allowlist: parsed.allowlist ?? DEFAULT_CONFIG.allowlist,
      useCheckov: parsed.useCheckov ?? DEFAULT_CONFIG.useCheckov
    };
  } catch (err) {
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${(err as Error).message}`);
  }
}

export const DEFAULT_CONFIG_YAML = `# PlanGate configuration
# Tags that force a hard deny on delete/replace, regardless of resource type.
protectedTags:
  Environment: [production, prod]

# Extra resourceType regex patterns treated as stateful/high-blast-radius,
# on top of PlanGate's built-in list (RDS, DynamoDB, S3, Cosmos DB, etc).
extraStatefulPatterns: []

# resourceType regex patterns allowed to be deleted/replaced without
# confirmation. Use sparingly -- this is the escape hatch.
allowlist: []

# Run checkov (if installed) as an extra policy layer on Terraform/
# CloudFormation/Kubernetes files. Set to false to disable.
useCheckov: true
`;
