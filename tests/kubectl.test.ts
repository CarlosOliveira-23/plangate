import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { isKubectlDestructive, getKubectlPlan } from "../src/providers/kubectl.js";

const fixturesDir = join(__dirname, "fixtures");

describe("isKubectlDestructive", () => {
  it("matches delete and apply --prune", () => {
    expect(isKubectlDestructive("kubectl delete pod my-pod")).toBe(true);
    expect(isKubectlDestructive("kubectl apply -f dir/ --prune")).toBe(true);
  });

  it("does not match a plain apply or get", () => {
    expect(isKubectlDestructive("kubectl apply -f dir/")).toBe(false);
    expect(isKubectlDestructive("kubectl get pods")).toBe(false);
  });
});

describe("getKubectlPlan", () => {
  it("reads manifest files passed to -f and extracts every resource as a delete", () => {
    const plan = getKubectlPlan(`kubectl delete -f k8s-statefulset.yaml`, fixturesDir);
    expect(plan.degraded).toBe(false);
    expect(plan.changes).toHaveLength(2);

    const sts = plan.changes.find((c) => c.resourceType === "StatefulSet");
    expect(sts?.address).toBe("prod/redis");
    expect(sts?.tags.Environment).toBe("production");
  });

  it("degrades on --prune since the removal set can't be enumerated ahead of time", () => {
    const plan = getKubectlPlan("kubectl apply -f dir/ --prune", fixturesDir);
    expect(plan.degraded).toBe(true);
  });

  it("degrades when it cannot identify the target of a bare delete", () => {
    const plan = getKubectlPlan("kubectl delete", fixturesDir);
    expect(plan.degraded).toBe(true);
  });
});
