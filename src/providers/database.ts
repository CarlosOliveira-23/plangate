import type { PlanResult, ResourceChange } from "../types.js";

/**
 * Raw DROP/TRUNCATE/FLUSH commands against a self-hosted Postgres/MySQL/
 * Mongo/Redis instance (the common case on a bare VPS without Terraform or
 * CloudFormation in front of it) have no dry-run or plan equivalent at all --
 * the same exception AWS's single-shot calls get (see providers/awsSingleShot.ts):
 * always require explicit confirmation, never infer safety from the command text.
 */
const DESTRUCTIVE_DB_PATTERNS: Array<{ test: RegExp; resourceType: string }> = [
  { test: /\bpsql\b[^|&;]*-c\s*["']?\s*drop\s+database\b/i, resourceType: "database:database" },
  { test: /\bpsql\b[^|&;]*-c\s*["']?\s*drop\s+table\b/i, resourceType: "database:table" },
  { test: /\bpsql\b[^|&;]*-c\s*["']?\s*truncate\b/i, resourceType: "database:table" },
  { test: /\bdropdb\b/, resourceType: "database:database" },
  { test: /\bmysql\b[^|&;]*-e\s*["']?\s*drop\s+database\b/i, resourceType: "database:database" },
  { test: /\bmysql\b[^|&;]*-e\s*["']?\s*drop\s+table\b/i, resourceType: "database:table" },
  { test: /\bmysqladmin\b[^|&;]*\bdrop\b/i, resourceType: "database:database" },
  { test: /\b(?:mongosh|mongo)\b[^|&;]*\bdropDatabase\s*\(/i, resourceType: "database:database" },
  { test: /\bredis-cli\b[^|&;]*\b(?:FLUSHALL|FLUSHDB)\b/i, resourceType: "database:database" }
];

export function matchDestructiveDatabaseCommand(command: string): { resourceType: string } | undefined {
  return DESTRUCTIVE_DB_PATTERNS.find((entry) => entry.test.test(command));
}

function extractTargetName(command: string): string {
  const dropMatch = command.match(/\bdrop\s+(?:database|table)\s+(?:if\s+exists\s+)?["'`]?([\w.]+)/i);
  if (dropMatch) return dropMatch[1];

  const dropdbMatch = command.match(/\bdropdb\b[^|&;]*?([\w-]+)\s*$/);
  if (dropdbMatch) return dropdbMatch[1];

  const mysqladminMatch = command.match(/\bmysqladmin\b[^|&;]*\bdrop\b\s+(?:-f\s+)?([\w-]+)/i);
  if (mysqladminMatch) return mysqladminMatch[1];

  return "(unknown database/table)";
}

export function getDatabasePlan(command: string): PlanResult | undefined {
  const match = matchDestructiveDatabaseCommand(command);
  if (!match) return undefined;

  const change: ResourceChange = {
    provider: "database",
    resourceType: match.resourceType,
    address: extractTargetName(command),
    action: "delete",
    tags: {}
  };

  return { provider: "database", changes: [change], degraded: false };
}
