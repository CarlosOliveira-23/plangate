# Contributing to PlanGate

PlanGate's core bet is: **never trust the command text, always verify the structured
plan/diff the cloud provider itself computes.** The highest-leverage contributions
right now are the ones that extend that principle to more ground:

- **A new provider** (`src/providers/`) — anything with a native "show me what
  would change" primitive is a good fit: Pulumi (`pulumi preview --json`), AWS CDK
  (`cdk diff`), GCP Deployment Manager, Ansible (`--check` + `--diff`).
- **A new external scanner integration** (`src/policy/externalScanners.ts`) —
  today only `checkov` is wired in. `tfsec`/`trivy` and `cfn-guard` are natural
  next additions; the `runCheckov` function is meant to be a template, not a
  one-off.
- **Better tag/ownership extraction** — the more reliably PlanGate can tell a
  resource is tagged `Environment=production`, the fewer unnecessary "ask"
  prompts show up for everything else.

## Getting started

```bash
npm install
npm test
npm run build
node dist/cli.js check -- aws rds delete-db-instance --db-instance-identifier test-db
```

## Adding a provider

1. Create `src/providers/yourtool.ts` with:
   - `isYourToolApplyLike(command: string): boolean` — detection.
   - `parseYourToolPlanJson(json: string): ResourceChange[]` — pure parsing,
     easy to unit test with a fixture, no process execution.
   - `getYourToolPlan(command: string, cwd: string): PlanResult` — orchestrates
     running the real dry-run/plan/diff command and calls the pure parser.
     **Fail closed**: any error, missing binary, or unexpected output shape
     must return `{ degraded: true, note: "..." }`, never a silently empty
     `changes: []` that would read as "nothing to worry about."
2. Register it in `src/core.ts`'s `getPlanForCommand`.
3. Add resource-type patterns to `src/policy/statefulResourceTypes.ts` if the
   provider has its own stateful resource type naming.
4. Add a fixture under `tests/fixtures/` and tests mirroring the existing
   provider test files.

## Philosophy, so reviews go faster

- A false positive (one extra confirmation prompt) is an acceptable cost. A
  false negative (a destructive action silently allowed) is not. When in
  doubt in a PR, pick the stricter behavior.
- Don't add detection that depends on parsing free-text/log output when a
  structured (`--json`, `-o json`) form exists. If it doesn't exist for a
  tool you want to support, that's worth noting in the PR rather than
  working around it with regex.

## Pull requests

Run `npm run typecheck && npm test` before opening the PR. Keep provider
additions self-contained (one PR per provider/scanner) so they're easy to
review and bisect.
