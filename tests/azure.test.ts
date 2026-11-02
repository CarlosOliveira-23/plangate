import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWhatIfJson, isAzureDeployApplyLike } from "../src/providers/azure.js";

const fixture = readFileSync(join(__dirname, "fixtures/azure-whatif.json"), "utf8");

describe("isAzureDeployApplyLike", () => {
  it("matches az deployment group/sub/mg/tenant create", () => {
    expect(isAzureDeployApplyLike("az deployment group create --resource-group rg --template-file t.json")).toBe(true);
    expect(isAzureDeployApplyLike("az deployment sub create --location eastus --template-file t.json")).toBe(true);
  });

  it("does not match what-if itself or unrelated az commands", () => {
    expect(isAzureDeployApplyLike("az deployment group what-if --resource-group rg")).toBe(false);
    expect(isAzureDeployApplyLike("az group list")).toBe(false);
  });
});

describe("parseWhatIfJson", () => {
  const changes = parseWhatIfJson(fixture);

  it("maps Delete and carries over tags from the before state", () => {
    const db = changes.find((c) => c.address.includes("databases/mydb"));
    expect(db?.action).toBe("delete");
    expect(db?.resourceType).toBe("Microsoft.Sql/servers/databases");
    expect(db?.tags.Environment).toBe("production");
  });

  it("maps Modify to update", () => {
    const site = changes.find((c) => c.address.includes("sites/myapp"));
    expect(site?.action).toBe("update");
  });

  it("drops NoChange entries", () => {
    expect(changes.find((c) => c.address.includes("storageAccounts"))).toBeUndefined();
  });

  it("also accepts the properties.changes wrapper (the raw ARM WhatIfOperationResult shape)", () => {
    const wrapped = JSON.stringify({ status: "Succeeded", properties: { changes: JSON.parse(fixture).changes } });
    expect(parseWhatIfJson(wrapped)).toHaveLength(2);
  });

  it("drops NoEffect entries like NoChange", () => {
    const withNoEffect = JSON.stringify({
      changes: [{ resourceId: "/subscriptions/s/resourceGroups/r/providers/Microsoft.Web/sites/x", changeType: "NoEffect" }]
    });
    expect(parseWhatIfJson(withNoEffect)).toHaveLength(0);
  });
});
