import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangeSetJson, isCloudFormationApplyLike } from "../src/providers/cloudformation.js";

const fixture = readFileSync(join(__dirname, "fixtures/cloudformation-changeset.json"), "utf8");

describe("isCloudFormationApplyLike", () => {
  it("matches deploy, update-stack, create-stack, execute-change-set", () => {
    expect(isCloudFormationApplyLike("aws cloudformation deploy --stack-name s --template-file t.yml")).toBe(true);
    expect(isCloudFormationApplyLike("aws cloudformation update-stack --stack-name s")).toBe(true);
    expect(isCloudFormationApplyLike("aws cloudformation execute-change-set --stack-name s --change-set-name c")).toBe(true);
  });

  it("does not match read-only describe calls", () => {
    expect(isCloudFormationApplyLike("aws cloudformation describe-stacks --stack-name s")).toBe(false);
  });
});

describe("parseChangeSetJson", () => {
  const tags = { Environment: "production" };
  const changes = parseChangeSetJson(fixture, tags);

  it("maps Remove to delete and applies the supplied stack tags", () => {
    const table = changes.find((c) => c.address === "OrdersTable");
    expect(table?.action).toBe("delete");
    expect(table?.tags.Environment).toBe("production");
  });

  it("maps Modify with Replacement=False to update", () => {
    const fn = changes.find((c) => c.address === "ApiFunction");
    expect(fn?.action).toBe("update");
  });

  it("maps Add to create", () => {
    const queue = changes.find((c) => c.address === "NewQueue");
    expect(queue?.action).toBe("create");
  });
});
