import type { PlanGateConfig, PlanResult, ResourceChange, Verdict } from "../types.js";
import { isStateful } from "./statefulResourceTypes.js";

const DESTRUCTIVE: ResourceChange["action"][] = ["delete", "replace"];

function matchesAllowlist(resourceType: string, allowlist: string[]): boolean {
  return allowlist.some((pattern) => new RegExp(pattern).test(resourceType));
}

function tagsMatchProtected(
  tags: Record<string, string>,
  protectedTags: Record<string, string[]>
): string | undefined {
  for (const [key, values] of Object.entries(protectedTags)) {
    const tagValue = tags[key];
    if (tagValue && values.includes(tagValue)) {
      return `${key}=${tagValue}`;
    }
  }
  return undefined;
}

/**
 * Evaluates a structured plan against policy. Fails closed: anything we
 * couldn't confidently classify becomes "ask", never "allow". A false
 * positive costs one confirmation; a false negative is the kind of incident
 * this tool exists to prevent.
 */
export function evaluatePlan(plan: PlanResult, config: PlanGateConfig): Verdict {
  if (plan.degraded) {
    return {
      decision: "ask",
      reasons: [plan.note ?? "Could not safely verify the plan; defaulting to asking for confirmation."],
      changes: plan.changes
    };
  }

  const reasons: string[] = [];
  const severityRank: Record<Verdict["decision"], number> = { allow: 0, ask: 1, deny: 2 };
  let decision: Verdict["decision"] = "allow";

  const escalate = (next: Verdict["decision"]) => {
    if (severityRank[next] > severityRank[decision]) decision = next;
  };

  for (const change of plan.changes) {
    if (!DESTRUCTIVE.includes(change.action)) continue;

    const protectedTag = tagsMatchProtected(change.tags, config.protectedTags);
    if (protectedTag) {
      escalate("deny");
      reasons.push(
        `${change.address} (${change.resourceType}) is tagged ${protectedTag} and would be ${change.action}d.`
      );
      continue;
    }

    if (matchesAllowlist(change.resourceType, config.allowlist)) {
      continue;
    }

    const { stateful, label } = isStateful(change.provider, change.resourceType, config.extraStatefulPatterns);
    if (stateful) {
      escalate("deny");
      reasons.push(`${change.address} is a ${label} (${change.resourceType}) and would be ${change.action}d.`);
    } else {
      escalate("ask");
      reasons.push(`${change.address} (${change.resourceType}) would be ${change.action}d.`);
    }
  }

  if (reasons.length === 0) {
    reasons.push("No destructive or stateful-resource changes detected.");
  }

  return { decision, reasons, changes: plan.changes };
}
