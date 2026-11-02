import { run, describeFailure } from "../exec.js";
import { tokenize } from "../argParse.js";
import type { ChangeAction, PlanResult, ResourceChange } from "../types.js";

export function isAzureDeployApplyLike(command: string): boolean {
  return /\baz\b[^|&;]*\bdeployment\b[^|&;]*\b(group|sub|mg|tenant)\b[^|&;]*\bcreate\b/.test(command);
}

interface WhatIfChange {
  resourceId: string;
  changeType: "Create" | "Delete" | "Modify" | "Deploy" | "Ignore" | "NoChange" | "NoEffect" | "Unsupported";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Azure's own docs disagree on whether `az ... what-if -o json` returns
 * `{ changes }` directly or `{ properties: { changes } }` (the raw ARM
 * WhatIfOperationResult shape) -- the conceptual docs and the REST reference
 * describe it differently and the CLI page is gone. Accept either.
 */
interface WhatIfResponse {
  changes?: WhatIfChange[];
  properties?: { changes?: WhatIfChange[] };
}

function mapAction(changeType: WhatIfChange["changeType"]): ChangeAction {
  switch (changeType) {
    case "Create":
      return "create";
    case "Delete":
      return "delete";
    case "Modify":
    case "Deploy":
      return "update";
    case "Ignore":
    case "NoChange":
    case "NoEffect":
      return "no-op";
    default:
      return "unknown";
  }
}

function resourceTypeFromId(resourceId: string): string {
  const providersIdx = resourceId.indexOf("/providers/");
  if (providersIdx === -1) return resourceId;
  const rest = resourceId.slice(providersIdx + "/providers/".length);
  const segments = rest.split("/");
  // e.g. ["Microsoft.Sql", "servers", "myserver", "databases", "mydb"] -> "Microsoft.Sql/servers/databases"
  const typeParts = [segments[0]];
  for (let i = 1; i < segments.length; i += 2) {
    typeParts.push(segments[i]);
  }
  return typeParts.join("/");
}

function extractTags(change: WhatIfChange): Record<string, string> {
  const source = (change.after ?? change.before ?? {}) as Record<string, unknown>;
  const tags = source.tags;
  if (tags && typeof tags === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return {};
}

export function parseWhatIfJson(json: string): ResourceChange[] {
  const parsed = JSON.parse(json) as WhatIfResponse;
  const changes = parsed.changes ?? parsed.properties?.changes ?? [];

  return changes
    .map((c) => ({
      provider: "azure" as const,
      resourceType: resourceTypeFromId(c.resourceId),
      address: c.resourceId,
      action: mapAction(c.changeType),
      tags: extractTags(c)
    }))
    .filter((c) => c.action !== "no-op");
}

/** Swaps the `create` verb for Azure's own native `what-if` subcommand, keeping every other flag as-is. */
function toWhatIfArgs(command: string): string[] {
  const tokens = tokenize(command);
  const createIdx = tokens.indexOf("create");
  const args = [...tokens];
  if (createIdx !== -1) args[createIdx] = "what-if";
  // drop leading "az" if present -- we invoke the binary directly
  if (args[0] === "az") args.shift();
  if (!args.includes("--no-pretty-print")) args.push("--no-pretty-print");
  if (!args.includes("-o") && !args.includes("--output")) args.push("-o", "json");
  return args;
}

export function getAzureWhatIfPlan(command: string, cwd: string): PlanResult {
  const args = toWhatIfArgs(command);
  const result = run("az", args, cwd);

  if (result.status !== 0) {
    return {
      provider: "azure",
      changes: [],
      degraded: true,
      note: `\`az deployment ... what-if\` failed: ${describeFailure(result, "az")}. Refusing to approve an unverified deployment.`
    };
  }

  try {
    return { provider: "azure", changes: parseWhatIfJson(result.stdout), degraded: false };
  } catch (err) {
    return {
      provider: "azure",
      changes: [],
      degraded: true,
      note: `Could not parse what-if output: ${(err as Error).message}`
    };
  }
}
