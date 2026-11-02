import { describe, it, expect } from "vitest";
import { tokenize, getFlagValue, getFlagList, hasFlag } from "../src/argParse.js";

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("terraform apply -auto-approve")).toEqual(["terraform", "apply", "-auto-approve"]);
  });

  it("keeps quoted segments as one token", () => {
    expect(tokenize('aws rds delete-db-instance --db-instance-identifier "my db"')).toEqual([
      "aws",
      "rds",
      "delete-db-instance",
      "--db-instance-identifier",
      "my db"
    ]);
  });
});

describe("getFlagValue", () => {
  it("finds a space-separated flag value", () => {
    const tokens = tokenize("aws cloudformation deploy --stack-name my-stack --template-file t.yml");
    expect(getFlagValue(tokens, ["--stack-name"])).toBe("my-stack");
  });

  it("finds an equals-separated flag value", () => {
    const tokens = tokenize("aws cloudformation deploy --stack-name=my-stack");
    expect(getFlagValue(tokens, ["--stack-name"])).toBe("my-stack");
  });

  it("returns undefined when absent", () => {
    expect(getFlagValue(tokenize("terraform apply"), ["--stack-name"])).toBeUndefined();
  });
});

describe("getFlagList", () => {
  it("collects values until the next flag", () => {
    const tokens = tokenize("aws cloudformation deploy --parameter-overrides Foo=1 Bar=2 --capabilities CAPABILITY_IAM");
    expect(getFlagList(tokens, "--parameter-overrides")).toEqual(["Foo=1", "Bar=2"]);
    expect(getFlagList(tokens, "--capabilities")).toEqual(["CAPABILITY_IAM"]);
  });
});

describe("hasFlag", () => {
  it("detects a boolean flag", () => {
    expect(hasFlag(tokenize("kubectl apply -f x.yml --prune"), "--prune")).toBe(true);
    expect(hasFlag(tokenize("kubectl apply -f x.yml"), "--prune")).toBe(false);
  });
});
