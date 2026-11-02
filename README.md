# PlanGate

**Stops AI coding agents from running destructive cloud/infra changes — by gating
on the real structured plan the cloud provider computes, not the text of the
command.**

[![CI](https://github.com/YOUR_GITHUB_USERNAME/plangate/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_GITHUB_USERNAME/plangate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/plangate.svg)](https://www.npmjs.com/package/plangate)

```
$ plangate check -- aws rds delete-db-instance --db-instance-identifier prod-db --skip-final-snapshot
DENY  aws rds delete-db-instance --db-instance-identifier prod-db --skip-final-snapshot
  - prod-db is a RDS instance (rds:db-instance) and would be deleted.

$ plangate check -- terraform apply -auto-approve
ASK  terraform apply -auto-approve
  - `terraform plan` failed: ... Refusing to approve an unverified apply.
```

## Why this exists

In February 2026, Amazon's own internal AI coding agent, Kiro, was assigned a
bug fix in AWS Cost Explorer — and instead of patching it, decided a full
environment reset was the better move, causing a ~13-hour regional outage
([Financial Times](https://www.ft.com/)). In April 2026, a Cursor agent running
Claude Opus deleted a company's entire production database **and its backup
volume** in a single API call. These aren't hypotheticals; they're why "give
the agent AWS/Terraform access" now comes with real fear attached.

Several tools already try to stop this (`agent-guardrails`, `destructive_command_guard`,
`ai-agent-guardrails`, AWS's own Bedrock AgentCore guardrails). **Every one of
them decides by pattern-matching the command's text** — block it if it looks
like `terraform destroy`. That has a documented, acknowledged weakness: an
agent (or a confused rephrasing) that expresses the same destructive intent
differently just walks through it.

**PlanGate decides differently: it never reads the command as the source of
truth.** For every proposed command, it asks the cloud provider itself what
would actually happen — via the mechanism each one already ships for exactly
this purpose — and blocks based on *that* structured answer.

| Provider | Native "show me what changes" primitive PlanGate uses |
|---|---|
| Terraform (AWS/GCP/Azure/any provider) | `terraform plan` + `terraform show -json` (structured `resource_changes`) |
| AWS CloudFormation | `create-change-set` + `describe-change-set` (structured `Changes[].ResourceChange`) |
| Azure (ARM/Bicep) | `az deployment ... what-if` (Azure's own native dry-run, literally named for this) |
| Kubernetes | Target manifest / live object inspection (`kubectl delete` has no plan; see Limitations) |
| AWS CLI single-shot calls (`terminate-instances`, `delete-db-instance`, ...) | No plan exists for these — PlanGate always requires confirmation, by design |

## How it decides

1. **Extract the real plan.** PlanGate ignores the agent's command text and
   independently runs the provider's own plan/diff/what-if primitive in the
   same working directory.
2. **Classify every change.** Each resource change becomes `create` /
   `update` / `delete` / `replace`.
3. **Apply policy, failing closed.** Delete/replace on a stateful resource
   type (RDS, DynamoDB, S3, Cosmos DB, Azure SQL, PersistentVolume, ...) or on
   anything tagged `Environment=production` → **deny**. Delete/replace on
   anything else → **ask** a human. Pure create/update → **allow**. If the
   plan extraction itself fails for any reason (tool missing, auth error,
   parse error) → **ask**, never allow.
4. **Optional extra layer.** If [checkov](https://www.checkov.io/) is
   installed, PlanGate runs it too and escalates the verdict on any
   HIGH/CRITICAL finding — for broader multi-cloud policy coverage
   (Dockerfile, ARM/Bicep, Serverless Framework, etc.) without reinventing
   those checks.

## Install

```bash
npm install -g plangate
# or, no install:
npx plangate check -- terraform apply
```

## Use it as a Claude Code hook (the main use case)

```bash
cd your-project
plangate init        # writes .plangate.yml
plangate init-hook    # registers PlanGate as a PreToolUse hook in .claude/settings.json
```

From then on, every `Bash` tool call Claude Code's agent makes is checked
before it runs. A `deny` blocks the command outright; an `ask` surfaces
PlanGate's reasons and asks you to confirm, with the actual resource-level
diff in front of you — not the agent's paraphrase of it.

> **Note on the hook protocol:** this was built against the PreToolUse hook
> shape (`hookSpecificOutput.permissionDecision` / `permissionDecisionReason`)
> as documented by the Claude Code community at the time of writing. This
> project's build environment couldn't reach `docs.anthropic.com` directly to
> triple-check the exact schema — after installing, run `/hooks` inside Claude
> Code to confirm it registered correctly, and please open an issue if the
> schema has since changed.

## Use it as a CI gate

```yaml
# .github/workflows/infra-review.yml
on: pull_request
jobs:
  plangate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR_GITHUB_USERNAME/plangate@main
        with:
          command: "terraform apply -auto-approve"
          working-directory: "infra/"
```

Same decision engine, now gating a human's PR instead of an agent's tool call.

## Configuration (`.plangate.yml`)

```yaml
protectedTags:
  Environment: [production, prod]

extraStatefulPatterns: []   # extra resourceType regexes to treat as high-blast-radius
allowlist: []                # resourceType regexes allowed to delete/replace without asking
useCheckov: true
```

## Command reference

```
plangate check -- <command...>   # manually evaluate a command; exits 1 unless ALLOW
plangate hook                     # Claude Code PreToolUse hook entrypoint (reads stdin JSON)
plangate init                      # scaffold .plangate.yml
plangate init-hook [--global]      # register the hook in .claude/settings.json
```

## Honest limitations (defense in depth, not a silver bullet)

**No tool that only watches Bash commands is unbypassable**, and anyone who
tells you otherwise is overselling. If the agent has direct SDK/API access
(a Python script calling `boto3` instead of shelling out to the AWS CLI),
a Bash-level hook never sees it. PlanGate is one real layer, not the only
layer you should have:

- **Scope the agent's IAM role / service principal.** A permission boundary
  or SCP that denies `rds:DeleteDBInstance`/`dynamodb:DeleteTable` etc. at the
  credential level holds even if every CLI-level guard is bypassed. This is
  the layer that actually can't be talked around.
- **`kubectl delete` and `kubectl apply --prune`** have no native plan/diff
  primitive at all. PlanGate reads the target manifest or the live object to
  judge blast radius, but for `--prune` specifically (where the removal set
  depends on comparing against everything already applied) it currently
  always asks rather than enumerating the diff — tightening this is open work,
  see `CONTRIBUTING.md`.
- **Azure what-if JSON parsing** is based on the documented response shape;
  this project's sandbox couldn't reach Azure's docs to triple-check field
  names either. Verify against your own `az deployment group what-if -o json`
  output before relying on it for anything production-critical.

## Contributing

New providers and external-scanner integrations are the highest-leverage
contribution — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
