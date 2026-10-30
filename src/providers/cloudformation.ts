import { randomBytes } from "node:crypto";
import { run, describeFailure } from "../exec.js";
import { tokenize, getFlagValue, getFlagList } from "../argParse.js";
import type { ChangeAction, PlanResult, ResourceChange } from "../types.js";

export function isCloudFormationApplyLike(command: string): boolean {
  return /\baws\b[^|&;]*\bcloudformation\b[^|&;]*\b(deploy|update-stack|create-stack|execute-change-set)\b/.test(
    command
  );
}

interface CfnResourceChange {
  Action: "Add" | "Modify" | "Remove" | "Import" | "Dynamic";
  LogicalResourceId: string;
  ResourceType: string;
  Replacement?: "True" | "False" | "Conditional";
}

interface CfnChange {
  ResourceChange: CfnResourceChange;
}

interface DescribeChangeSetResponse {
  Status?: string;
  StatusReason?: string;
  Changes?: CfnChange[];
}

function mapAction(c: CfnResourceChange): ChangeAction {
  if (c.Action === "Add") return "create";
  if (c.Action === "Remove") return "delete";
  if (c.Action === "Modify") return c.Replacement === "True" ? "replace" : "update";
  return "unknown";
}

export function parseChangeSetJson(json: string, stackTags: Record<string, string>): ResourceChange[] {
  const parsed = JSON.parse(json) as DescribeChangeSetResponse;
  const changes = parsed.Changes ?? [];

  return changes.map((c) => ({
    provider: "cloudformation" as const,
    resourceType: c.ResourceChange.ResourceType,
    address: c.ResourceChange.LogicalResourceId,
    action: mapAction(c.ResourceChange),
    tags: stackTags
  }));
}

function awsArgsFromCommand(tokens: string[]): { region?: string; profile?: string } {
  return {
    region: getFlagValue(tokens, ["--region"]),
    profile: getFlagValue(tokens, ["--profile"])
  };
}

function globalAwsArgs(opts: { region?: string; profile?: string }): string[] {
  const args: string[] = [];
  if (opts.region) args.push("--region", opts.region);
  if (opts.profile) args.push("--profile", opts.profile);
  return args;
}

function stackExists(stackName: string, cwd: string, globalArgs: string[]): boolean {
  const result = run("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName, ...globalArgs], cwd);
  return result.status === 0;
}

function getStackTags(stackName: string, cwd: string, globalArgs: string[]): Record<string, string> {
  const result = run(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      "--query",
      "Stacks[0].Tags",
      "--output",
      "json",
      ...globalArgs
    ],
    cwd
  );
  if (result.status !== 0) return {};
  try {
    const tagList = JSON.parse(result.stdout) as Array<{ Key: string; Value: string }> | null;
    const out: Record<string, string> = {};
    for (const tag of tagList ?? []) out[tag.Key] = tag.Value;
    return out;
  } catch {
    return {};
  }
}

/**
 * Translates the common forms of `aws cloudformation deploy|update-stack|
 * create-stack` into a throwaway change set, reads back the *structured*
 * diff CloudFormation itself computed, then deletes the change set. We
 * never execute it -- the original command (if allowed) does that itself.
 */
export function getCloudFormationPlan(command: string, cwd: string): PlanResult {
  const tokens = tokenize(command);
  const { region, profile } = awsArgsFromCommand(tokens);
  const globalArgs = globalAwsArgs({ region, profile });

  const stackName = getFlagValue(tokens, ["--stack-name"]);
  if (!stackName) {
    return {
      provider: "cloudformation",
      changes: [],
      degraded: true,
      note: "Could not find --stack-name in the proposed command. Refusing to approve an unverified stack change."
    };
  }

  const templateFile = getFlagValue(tokens, ["--template-file", "--template-body"]);
  const templateUrl = getFlagValue(tokens, ["--template-url"]);
  if (!templateFile && !templateUrl && !command.includes("execute-change-set")) {
    return {
      provider: "cloudformation",
      changes: [],
      degraded: true,
      note: "Could not find --template-file/--template-body/--template-url. Refusing to approve an unverified stack change."
    };
  }

  const changeSetName = `plangate-review-${randomBytes(6).toString("hex")}`;
  const exists = stackExists(stackName, cwd, globalArgs);

  const createArgs = [
    "cloudformation",
    "create-change-set",
    "--stack-name",
    stackName,
    "--change-set-name",
    changeSetName,
    "--change-set-type",
    exists ? "UPDATE" : "CREATE",
    ...globalArgs
  ];
  if (templateFile) createArgs.push("--template-body", templateFile.startsWith("file://") ? templateFile : `file://${templateFile}`);
  if (templateUrl) createArgs.push("--template-url", templateUrl);

  const parameterOverrides = getFlagList(tokens, "--parameter-overrides");
  if (parameterOverrides.length > 0) {
    const asJson = parameterOverrides.map((kv) => {
      const [key, ...rest] = kv.split("=");
      return { ParameterKey: key, ParameterValue: rest.join("=") };
    });
    createArgs.push("--parameters", JSON.stringify(asJson));
  }

  const capabilities = getFlagList(tokens, "--capabilities");
  if (capabilities.length > 0) createArgs.push("--capabilities", ...capabilities);

  const createResult = run("aws", createArgs, cwd);
  if (createResult.status !== 0) {
    return {
      provider: "cloudformation",
      changes: [],
      degraded: true,
      note: `Could not create a review change set: ${describeFailure(createResult, "aws")}. Refusing to approve an unverified stack change.`
    };
  }

  try {
    let describeResult = run(
      "aws",
      ["cloudformation", "describe-change-set", "--stack-name", stackName, "--change-set-name", changeSetName, "--output", "json", ...globalArgs],
      cwd
    );

    for (let attempt = 0; attempt < 10; attempt++) {
      if (describeResult.status !== 0) break;
      const parsed = JSON.parse(describeResult.stdout) as DescribeChangeSetResponse;
      if (parsed.Status !== "CREATE_PENDING" && parsed.Status !== "CREATE_IN_PROGRESS") break;
      describeResult = run(
        "aws",
        ["cloudformation", "describe-change-set", "--stack-name", stackName, "--change-set-name", changeSetName, "--output", "json", ...globalArgs],
        cwd
      );
    }

    if (describeResult.status !== 0) {
      return {
        provider: "cloudformation",
        changes: [],
        degraded: true,
        note: "Could not read back the review change set. Refusing to approve an unverified stack change."
      };
    }

    const tags = getStackTags(stackName, cwd, globalArgs);
    return { provider: "cloudformation", changes: parseChangeSetJson(describeResult.stdout, tags), degraded: false };
  } finally {
    run("aws", ["cloudformation", "delete-change-set", "--stack-name", stackName, "--change-set-name", changeSetName, ...globalArgs], cwd);
  }
}
