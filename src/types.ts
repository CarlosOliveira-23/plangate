export type Provider = "terraform" | "cloudformation" | "azure" | "kubernetes" | "aws-cli" | "docker" | "database";

export type ChangeAction = "create" | "update" | "delete" | "replace" | "no-op" | "unknown";

/** One resource-level change, normalized from whatever structured plan/diff/change-set format the provider produced. */
export interface ResourceChange {
  provider: Provider;
  /** Provider-native resource type, e.g. "aws_db_instance" or "AWS::RDS::DBInstance". */
  resourceType: string;
  /** Best-effort human-readable address/name/ARN for the resource. */
  address: string;
  action: ChangeAction;
  /** Tags/labels found on the resource, if the plan format exposed them. Best-effort, may be empty. */
  tags: Record<string, string>;
}

/** The outcome of extracting a structured plan from a proposed command. */
export interface PlanResult {
  provider: Provider;
  changes: ResourceChange[];
  /** True if we could not confidently produce a structured plan (tool missing, auth failure, parse error, etc). */
  degraded: boolean;
  /** Human-readable explanation, always set when degraded, optional otherwise. */
  note?: string;
}

export type Decision = "allow" | "ask" | "deny";

export interface Verdict {
  decision: Decision;
  reasons: string[];
  changes: ResourceChange[];
}

export interface StatefulRule {
  provider: Provider;
  /** Regex (as source string) matched against ResourceChange.resourceType. */
  pattern: string;
  label: string;
}

export interface PlanGateConfig {
  /** Tag keys/values that always force a hard deny on delete/replace, regardless of resource type. */
  protectedTags: Record<string, string[]>;
  /** Additional resourceType regex patterns (beyond the built-in defaults) treated as stateful/high-blast-radius. */
  extraStatefulPatterns: string[];
  /** resourceType regex patterns explicitly allowed to be deleted/replaced without confirmation (escape hatch). */
  allowlist: string[];
  /** Run checkov (if installed) as an extra policy layer. Default true. */
  useCheckov: boolean;
}
