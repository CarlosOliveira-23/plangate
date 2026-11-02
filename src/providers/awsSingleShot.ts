import { tokenize, getFlagValue } from "../argParse.js";
import type { PlanResult, ResourceChange } from "../types.js";

/**
 * AWS CLI calls that are irreversibly destructive and have no dry-run or
 * plan equivalent at all -- there is nothing to "diff" before running
 * them, so the only honest policy is: always require an explicit
 * confirmation/allowlist entry, never infer safety from the command text.
 */
const SINGLE_SHOT_PATTERNS: Array<{
  test: RegExp;
  resourceType: string;
  idFlags: string[];
}> = [
  { test: /\baws\s+rds\s+delete-db-instance\b/, resourceType: "rds:db-instance", idFlags: ["--db-instance-identifier"] },
  { test: /\baws\s+rds\s+delete-db-cluster\b/, resourceType: "rds:db-cluster", idFlags: ["--db-cluster-identifier"] },
  { test: /\baws\s+dynamodb\s+delete-table\b/, resourceType: "dynamodb:table", idFlags: ["--table-name"] },
  { test: /\baws\s+ec2\s+terminate-instances\b/, resourceType: "ec2:instance", idFlags: ["--instance-ids"] },
  { test: /\baws\s+elasticache\s+delete-cache-cluster\b/, resourceType: "elasticache:cache-cluster", idFlags: ["--cache-cluster-id"] },
  { test: /\baws\s+elasticache\s+delete-replication-group\b/, resourceType: "elasticache:cache-cluster", idFlags: ["--replication-group-id"] },
  { test: /\baws\s+s3api\s+delete-bucket\b/, resourceType: "s3:bucket", idFlags: ["--bucket"] },
  { test: /\baws\s+s3\s+rb\b/, resourceType: "s3:bucket", idFlags: [] },
  { test: /\baws\s+s3\s+rm\b[^|&;]*--recursive\b/, resourceType: "s3:bucket", idFlags: [] },
  { test: /\baws\s+cloudformation\s+delete-stack\b/, resourceType: "cloudformation:stack", idFlags: ["--stack-name"] }
];

export function matchSingleShotDestructive(command: string): { resourceType: string; idFlags: string[] } | undefined {
  for (const entry of SINGLE_SHOT_PATTERNS) {
    if (entry.test.test(command)) return entry;
  }
  return undefined;
}

function bestEffortAddress(tokens: string[], idFlags: string[]): string {
  for (const flag of idFlags) {
    const value = getFlagValue(tokens, [flag]);
    if (value) return value;
  }
  const s3Uri = tokens.find((t) => t.startsWith("s3://"));
  if (s3Uri) return s3Uri;
  return tokens.filter((t) => !t.startsWith("-")).slice(-1)[0] ?? "(unknown resource)";
}

export function getAwsSingleShotPlan(command: string): PlanResult | undefined {
  const match = matchSingleShotDestructive(command);
  if (!match) return undefined;

  const tokens = tokenize(command);
  const change: ResourceChange = {
    provider: "aws-cli",
    resourceType: match.resourceType,
    address: bestEffortAddress(tokens, match.idFlags),
    action: "delete",
    tags: {}
  };

  return { provider: "aws-cli", changes: [change], degraded: false };
}
