import { run, isInstalled } from "../exec.js";
import type { PlanResult, Verdict } from "../types.js";

interface CheckovFailedCheck {
  check_id?: string;
  check_name?: string;
  severity?: string | null;
  resource?: string;
  file_path?: string;
}

interface CheckovReport {
  results?: { failed_checks?: CheckovFailedCheck[] };
}

function collectFailedChecks(parsed: unknown): CheckovFailedCheck[] {
  const reports = Array.isArray(parsed) ? (parsed as CheckovReport[]) : [parsed as CheckovReport];
  return reports.flatMap((r) => r?.results?.failed_checks ?? []);
}

/**
 * Checkov is an optional *extra* signal, not PlanGate's core safety
 * mechanism -- if it's missing, misconfigured, or its JSON shape changed
 * between versions, we fail OPEN here (leave the verdict as the plan-diff
 * engine decided it) rather than blocking everything just because a
 * third-party scanner didn't run. The plan-diff + stateful-resource check
 * is what you can rely on even with checkov uninstalled.
 */
export function runCheckov(plan: PlanResult, cwd: string, verdict: Verdict): Verdict {
  if (!isInstalled("checkov")) return verdict;

  try {
    const result = run("checkov", ["-d", cwd, "--compact", "--quiet", "-o", "json"], cwd);
    if (!result.stdout.trim()) return verdict;

    const parsed = JSON.parse(result.stdout);
    const failedChecks = collectFailedChecks(parsed);
    const severe = failedChecks.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH");

    if (severe.length === 0) return verdict;

    const reasons = [
      ...verdict.reasons,
      `checkov flagged ${severe.length} HIGH/CRITICAL issue(s): ${severe
        .slice(0, 3)
        .map((c) => c.check_id)
        .join(", ")}${severe.length > 3 ? ", ..." : ""}`
    ];

    const decision = verdict.decision === "deny" ? "deny" : "ask";
    return { ...verdict, decision, reasons };
  } catch {
    return verdict;
  }
}
