import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTerraformPlanJson, isTerraformApplyLike } from "../src/providers/terraform.js";

const fixture = readFileSync(join(__dirname, "fixtures/terraform-plan.json"), "utf8");

describe("isTerraformApplyLike", () => {
  it("matches apply and destroy", () => {
    expect(isTerraformApplyLike("terraform apply -auto-approve")).toBe(true);
    expect(isTerraformApplyLike("terraform destroy")).toBe(true);
  });

  it("does not match read-only plan", () => {
    expect(isTerraformApplyLike("terraform plan")).toBe(false);
    expect(isTerraformApplyLike("terraform validate")).toBe(false);
  });
});

describe("parseTerraformPlanJson", () => {
  const changes = parseTerraformPlanJson(fixture);

  it("maps delete+create to replace", () => {
    const db = changes.find((c) => c.address === "aws_db_instance.main");
    expect(db?.action).toBe("replace");
    expect(db?.tags.Environment).toBe("production");
  });

  it("maps a lone delete to delete", () => {
    const role = changes.find((c) => c.address === "aws_iam_role.worker");
    expect(role?.action).toBe("delete");
  });

  it("maps a lone create to create", () => {
    const obj = changes.find((c) => c.address === "aws_s3_object.config");
    expect(obj?.action).toBe("create");
  });

  it("drops no-op/read entries entirely", () => {
    expect(changes.find((c) => c.address === "data.aws_ami.base")).toBeUndefined();
  });
});
