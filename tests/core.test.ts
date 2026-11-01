import { describe, it, expect } from "vitest";
import { gateCommand } from "../src/core.js";
import { DEFAULT_CONFIG } from "../src/config.js";

describe("gateCommand", () => {
  it("is not applicable to commands outside its scope", () => {
    const result = gateCommand("npm test", process.cwd(), DEFAULT_CONFIG);
    expect(result.applicable).toBe(false);
  });

  it("is not applicable to read-only terraform/aws commands", () => {
    expect(gateCommand("terraform plan", process.cwd(), DEFAULT_CONFIG).applicable).toBe(false);
    expect(gateCommand("aws s3 ls", process.cwd(), DEFAULT_CONFIG).applicable).toBe(false);
  });

  it("recognizes a terraform apply as in-scope and fails closed (asks) when it cannot verify the plan", () => {
    // No terraform binary / no .tf files in this environment -> plan extraction
    // degrades -> policy must fail closed to "ask", never silently "allow".
    const result = gateCommand("terraform apply -auto-approve", process.cwd(), DEFAULT_CONFIG);
    expect(result.applicable).toBe(true);
    expect(result.verdict?.decision).toBe("ask");
  });

  it("denies a single-shot destructive AWS CLI call without needing any external tool", () => {
    const result = gateCommand(
      "aws rds delete-db-instance --db-instance-identifier prod-db --skip-final-snapshot",
      process.cwd(),
      DEFAULT_CONFIG
    );
    expect(result.applicable).toBe(true);
    expect(result.verdict?.decision).toBe("deny");
  });
});
