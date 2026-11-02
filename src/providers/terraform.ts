import { randomBytes } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { run, describeFailure } from "../exec.js";
import type { ChangeAction, PlanResult, ResourceChange } from "../types.js";

export function isTerraformApplyLike(command: string): boolean {
  return /\bterraform\b[^|&;]*\b(apply|destroy)\b/.test(command);
}

interface TfChange {
  actions: string[];
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

interface TfResourceChange {
  address: string;
  type: string;
  change: TfChange;
}

interface TfPlanJson {
  resource_changes?: TfResourceChange[];
}

function mapAction(actions: string[]): ChangeAction {
  const set = new Set(actions);
  if (set.has("delete") && set.has("create")) return "replace";
  if (set.has("delete")) return "delete";
  if (set.has("create")) return "create";
  if (set.has("update")) return "update";
  if (set.has("no-op") || set.has("read")) return "no-op";
  return "unknown";
}

function extractTags(change: TfChange): Record<string, string> {
  const source = (change.after ?? change.before ?? {}) as Record<string, unknown>;
  const candidate = source.tags_all ?? source.tags ?? {};
  if (candidate && typeof candidate === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(candidate as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return {};
}

export function parseTerraformPlanJson(json: string): ResourceChange[] {
  const parsed = JSON.parse(json) as TfPlanJson;
  const changes = parsed.resource_changes ?? [];

  return changes
    .map((rc) => ({
      provider: "terraform" as const,
      resourceType: rc.type,
      address: rc.address,
      action: mapAction(rc.change.actions),
      tags: extractTags(rc.change)
    }))
    .filter((c) => c.action !== "no-op");
}

/**
 * We never trust the plan an agent claims to have reviewed. We generate our
 * own, in the same working directory, independently of whatever `apply`
 * command was actually proposed.
 */
export function getTerraformPlan(cwd: string): PlanResult {
  const planFile = join(cwd, `.plangate-${randomBytes(6).toString("hex")}.tfplan`);

  try {
    const planRun = run("terraform", ["plan", "-input=false", "-out", planFile], cwd);
    if (planRun.status !== 0) {
      return {
        provider: "terraform",
        changes: [],
        degraded: true,
        note: `\`terraform plan\` failed: ${describeFailure(planRun, "terraform")}. Refusing to approve an unverified apply.`
      };
    }

    const showRun = run("terraform", ["show", "-json", planFile], cwd);
    if (showRun.status !== 0) {
      return {
        provider: "terraform",
        changes: [],
        degraded: true,
        note: `\`terraform show -json\` failed (exit ${showRun.status}). Refusing to approve an unverified apply.`
      };
    }

    return { provider: "terraform", changes: parseTerraformPlanJson(showRun.stdout), degraded: false };
  } catch (err) {
    return {
      provider: "terraform",
      changes: [],
      degraded: true,
      note: `Could not run terraform: ${(err as Error).message}`
    };
  } finally {
    if (existsSync(planFile)) {
      try {
        unlinkSync(planFile);
      } catch {
        // best-effort cleanup
      }
    }
  }
}
