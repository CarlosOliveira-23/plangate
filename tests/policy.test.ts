import { describe, it, expect } from "vitest";
import { evaluatePlan } from "../src/policy/index.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import type { PlanResult, ResourceChange } from "../src/types.js";

function change(overrides: Partial<ResourceChange>): ResourceChange {
  return {
    provider: "terraform",
    resourceType: "aws_s3_object",
    address: "aws_s3_object.x",
    action: "create",
    tags: {},
    ...overrides
  };
}

function plan(changes: ResourceChange[], degraded = false): PlanResult {
  return { provider: "terraform", changes, degraded, note: degraded ? "test degrade" : undefined };
}

describe("evaluatePlan", () => {
  it("allows plans with only create/update changes", () => {
    const verdict = evaluatePlan(plan([change({ action: "create" }), change({ action: "update" })]), DEFAULT_CONFIG);
    expect(verdict.decision).toBe("allow");
  });

  it("denies deleting a built-in stateful resource type", () => {
    const verdict = evaluatePlan(
      plan([change({ action: "delete", resourceType: "aws_db_instance" })]),
      DEFAULT_CONFIG
    );
    expect(verdict.decision).toBe("deny");
  });

  it("asks (does not auto-allow) for deleting a non-stateful resource", () => {
    const verdict = evaluatePlan(
      plan([change({ action: "delete", resourceType: "aws_iam_role" })]),
      DEFAULT_CONFIG
    );
    expect(verdict.decision).toBe("ask");
  });

  it("denies any delete/replace on a resource tagged Environment=production, even if the type isn't in the built-in stateful list", () => {
    const verdict = evaluatePlan(
      plan([change({ action: "delete", resourceType: "aws_iam_role", tags: { Environment: "production" } })]),
      DEFAULT_CONFIG
    );
    expect(verdict.decision).toBe("deny");
  });

  it("respects the allowlist escape hatch for an otherwise-stateful type", () => {
    const config = { ...DEFAULT_CONFIG, allowlist: ["^aws_db_instance$"] };
    const verdict = evaluatePlan(plan([change({ action: "delete", resourceType: "aws_db_instance" })]), config);
    expect(verdict.decision).toBe("allow");
  });

  it("does not let the allowlist override a protected-tag match", () => {
    const config = { ...DEFAULT_CONFIG, allowlist: ["^aws_db_instance$"] };
    const verdict = evaluatePlan(
      plan([change({ action: "delete", resourceType: "aws_db_instance", tags: { Environment: "production" } })]),
      config
    );
    expect(verdict.decision).toBe("deny");
  });

  it("respects extraStatefulPatterns from config", () => {
    const config = { ...DEFAULT_CONFIG, extraStatefulPatterns: ["^custom_critical_resource$"] };
    const verdict = evaluatePlan(
      plan([change({ action: "delete", resourceType: "custom_critical_resource" })]),
      config
    );
    expect(verdict.decision).toBe("deny");
  });

  it("fails closed (asks) when the plan is degraded", () => {
    const verdict = evaluatePlan(plan([], true), DEFAULT_CONFIG);
    expect(verdict.decision).toBe("ask");
    expect(verdict.reasons[0]).toContain("test degrade");
  });

  it("escalates deny over ask when both kinds of change are present", () => {
    const verdict = evaluatePlan(
      plan([
        change({ action: "delete", resourceType: "aws_iam_role" }), // ask
        change({ action: "delete", resourceType: "aws_db_instance" }) // deny
      ]),
      DEFAULT_CONFIG
    );
    expect(verdict.decision).toBe("deny");
  });
});
