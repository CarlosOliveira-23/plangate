import { describe, it, expect } from "vitest";
import { getAwsSingleShotPlan, matchSingleShotDestructive } from "../src/providers/awsSingleShot.js";

describe("matchSingleShotDestructive", () => {
  it("matches known no-dry-run-equivalent destructive calls", () => {
    expect(matchSingleShotDestructive("aws rds delete-db-instance --db-instance-identifier mydb")).toBeDefined();
    expect(matchSingleShotDestructive("aws dynamodb delete-table --table-name Orders")).toBeDefined();
    expect(matchSingleShotDestructive("aws ec2 terminate-instances --instance-ids i-123")).toBeDefined();
    expect(matchSingleShotDestructive("aws s3 rm s3://bucket/ --recursive")).toBeDefined();
  });

  it("does not match read-only or unrelated calls", () => {
    expect(matchSingleShotDestructive("aws rds describe-db-instances")).toBeUndefined();
    expect(matchSingleShotDestructive("aws s3 ls")).toBeUndefined();
  });
});

describe("getAwsSingleShotPlan", () => {
  it("produces a single delete change with a best-effort address", () => {
    const plan = getAwsSingleShotPlan("aws rds delete-db-instance --db-instance-identifier mydb --skip-final-snapshot");
    expect(plan?.degraded).toBe(false);
    expect(plan?.changes).toHaveLength(1);
    expect(plan?.changes[0]).toMatchObject({ action: "delete", resourceType: "rds:db-instance", address: "mydb" });
  });

  it("returns undefined for commands outside its pattern list", () => {
    expect(getAwsSingleShotPlan("aws s3 ls")).toBeUndefined();
  });
});
