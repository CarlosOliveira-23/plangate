<div align="center">

# 🛡️ PlanGate

**Stops AI coding agents from running destructive cloud, VPS, and database
commands. It gates on the real structured plan the target system computes,
not the text of the command.**

[![CI](https://github.com/CarlosOliveira-23/plangate/actions/workflows/ci.yml/badge.svg)](https://github.com/CarlosOliveira-23/plangate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/CarlosOliveira-23/plangate?style=social)](https://github.com/CarlosOliveira-23/plangate/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

```
$ plangate check -- docker compose down -v
DENY  docker compose down -v
  - db_data is a Docker volume (docker:volume) and would be deleted.
  - cache_data is a Docker volume (docker:volume) and would be deleted.

$ plangate check -- terraform apply -auto-approve
ASK  terraform apply -auto-approve
  - `terraform plan` failed: ... Refusing to approve an unverified apply.
```

## 📖 Table of Contents

- [🧨 Why PlanGate Exists](#-why-plangate-exists)
- [🛡️ How It Decides](#️-how-it-decides)
- [🤖 Supported Targets](#-supported-targets)
- [🚀 Quick Start](#-quick-start)
- [🔌 Use It as a Claude Code Hook](#-use-it-as-a-claude-code-hook)
- [🧪 Use It as a CI Gate](#-use-it-as-a-ci-gate)
- [⚙️ Configuration](#️-configuration)
- [🧯 Honest Limitations](#-honest-limitations)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

## 🧨 Why PlanGate Exists

AI coding agents deleting production data isn't a hypothetical. It's a
documented, recurring pattern: an agent misreads a task, runs a destructive
command against the wrong environment, and nothing in between asks "wait,
what does this actually delete?" before it's too late. That gap between an
agent's intent and its blast radius is why handing an agent real infra
access now comes with genuine fear attached.

**And this isn't just a big-cloud problem.** Most write-ups about agents
destroying production assume an AWS account with IAM, backups, and a
platform team behind it. For a lot of the developer community the reality
is simpler: a single VPS (Hostinger, Oracle Cloud's free tier, DigitalOcean,
a home server) running Docker Compose, no backups, no staging, nobody else
around to catch the mistake. The blast radius is smaller in absolute terms,
but it's bigger relative to the person running it. PlanGate treats both as
first-class: Terraform, CloudFormation, and Azure for the enterprise case;
Docker Compose and direct Postgres/MySQL/Mongo/Redis access for everyone
else.

Several tools already try to stop this (`agent-guardrails`,
`destructive_command_guard`, `ai-agent-guardrails`, AWS's own Bedrock
AgentCore guardrails), and **every one of them decides by pattern-matching
the command's text**: block it if it looks like `terraform destroy`. One of
them says so plainly in its own source: unrecognized commands are allowed
by default. That's a fail-open design, and it has a known weakness its own
authors acknowledge. An agent, or just a confused rephrasing, that
expresses the same destructive intent differently walks right through it.

**PlanGate decides differently.** It never treats the command text as the
source of truth, and it never fails open. For every proposed command, it
asks the target system itself what would actually happen, using the
mechanism each one already ships for exactly this purpose, or by reading
the one structured source that does exist (a compose file, a live
manifest). It blocks based on that answer. When no structured answer is
possible at all, it asks a human instead of guessing.

## 🛡️ How It Decides

1. **Extract the real plan.** PlanGate ignores the agent's command text and
   independently runs the target's own plan/diff/what-if primitive (or reads
   the one structured file that describes the blast radius) in the same
   working directory.
2. **Classify every change.** Each resource change becomes `create` /
   `update` / `delete` / `replace`.
3. **Apply policy, failing closed:**

   | Situation | Verdict |
   |---|---|
   | Delete/replace on a stateful resource (RDS, DynamoDB, S3, Cosmos DB, Azure SQL, PersistentVolume, Docker volume, a database/table, ...) | **deny** |
   | Delete/replace on anything tagged `Environment=production` | **deny**, regardless of type |
   | Delete/replace on anything else | **ask** a human |
   | Pure create/update | **allow** |
   | Plan extraction itself fails (tool missing, auth error, parse error, nothing to read) | **ask**, never allow |

4. **Optional extra layer.** If [checkov](https://www.checkov.io/) is
   installed, PlanGate runs it too and escalates the verdict on any
   HIGH/CRITICAL finding. That gives broader multi-cloud policy coverage
   (Dockerfile, ARM/Bicep, Serverless Framework, etc.) without reinventing
   those checks.

## 🤖 Supported Targets

**Tier 1: structured plan/diff, read directly from the provider**

| Target | Native "show me what changes" primitive PlanGate uses |
|---|---|
| Terraform (AWS/GCP/Azure/any provider) | `terraform plan` + `terraform show -json` (structured `resource_changes`) |
| AWS CloudFormation | `create-change-set` + `describe-change-set` (structured `Changes[].ResourceChange`) |
| Azure (ARM/Bicep) | `az deployment ... what-if` (Azure's own native dry-run, literally named for this) |

**Tier 2: no native dry-run, so PlanGate reads the one structured source that exists**

| Target | What PlanGate reads instead |
|---|---|
| Kubernetes (`kubectl delete`, `apply --prune`) | The target manifest, or the live object's labels |
| Docker Compose (`docker compose down -v`) | The compose file's own `volumes:` section (skips `external: true` volumes, which `-v` doesn't delete) |
| `docker volume rm <names>` | The volume names given directly on the command line |

**Tier 3: genuinely no plan exists anywhere, so PlanGate always requires confirmation by design**

| Target | Examples |
|---|---|
| AWS CLI single-shot calls | `terminate-instances`, `delete-db-instance`, `delete-table`, `delete-bucket`, ... |
| Docker, unenumerable scope | `docker volume prune`, `docker system prune --volumes`, `docker rm -v <container>` |
| Direct database access | `psql`/`mysql` `DROP DATABASE`/`DROP TABLE`/`TRUNCATE`, `dropdb`, `mysqladmin drop`, `mongosh --eval "db.dropDatabase()"`, `redis-cli FLUSHALL`/`FLUSHDB` |

## 🚀 Quick Start

```bash
npm install -g plangate
# or, no install:
npx plangate check -- terraform apply
```

```bash
cd your-project
plangate init         # writes .plangate.yml
plangate init-hook     # registers PlanGate as a Claude Code PreToolUse hook
```

## 🔌 Use It as a Claude Code Hook

This is the main use case: every `Bash` tool call Claude Code's agent makes
is checked before it runs. A `deny` blocks the command outright; an `ask`
surfaces PlanGate's reasons and asks you to confirm, with the actual
resource-level diff in front of you instead of the agent's paraphrase of it.

> **Hook protocol:** verified against the official Claude Code hooks
> reference (`hookSpecificOutput.permissionDecision` /
> `permissionDecisionReason`, `allow`/`ask`/`deny`). One thing to know: the
> registered hook runs `npx plangate hook`, so every matched `Bash` call pays
> `npx`'s cold-start latency. If that's noticeable, install PlanGate globally
> and edit the `command` in `.claude/settings.json` to call the `plangate`
> binary directly instead.

## 🧪 Use It as a CI Gate

```yaml
# .github/workflows/infra-review.yml
on: pull_request
jobs:
  plangate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: CarlosOliveira-23/plangate@v0.1.1
        with:
          command: "terraform apply -auto-approve"
          working-directory: "infra/"
```

Same decision engine, now gating a human's PR instead of an agent's tool call.

## ⚙️ Configuration

`.plangate.yml`, scaffolded by `plangate init`:

```yaml
protectedTags:
  Environment: [production, prod]

extraStatefulPatterns: []   # extra resourceType regexes to treat as high-blast-radius
allowlist: []                # resourceType regexes allowed to delete/replace without asking
useCheckov: true
```

**Command reference:**

```
plangate check -- <command...>   # manually evaluate a command; exits 1 unless ALLOW
plangate hook                     # Claude Code PreToolUse hook entrypoint (reads stdin JSON)
plangate init                      # scaffold .plangate.yml
plangate init-hook [--global]      # register the hook in .claude/settings.json
```

## 🧯 Honest Limitations

**No tool that only watches Bash commands is unbypassable**, and anyone who
tells you otherwise is overselling. If the agent has direct SDK/API access
(a Python script calling `boto3`, or a database driver instead of shelling
out to the CLI), a Bash-level hook never sees it. PlanGate is one real layer,
not the only layer you should have:

- **Scope the agent's IAM role / service principal.** A permission boundary
  or SCP that denies `rds:DeleteDBInstance`/`dynamodb:DeleteTable` etc. at the
  credential level holds even if every CLI-level guard is bypassed. On a bare
  VPS, the equivalent is: don't run the agent as a user that can `sudo`, and
  don't let it hold your database's root/admin credentials directly.
- **`kubectl delete` and `kubectl apply --prune`**, and **`docker volume
  prune`/`docker system prune --volumes`/`docker rm -v`**, have no native
  plan/diff primitive and no enumerable removal set ahead of time. PlanGate
  asks for confirmation rather than guessing. Tightening this further (e.g.
  live-inspecting a container's mounts before `docker rm -v`) is open work;
  see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Azure what-if JSON parsing** handles both response shapes Microsoft's own
  docs describe (`{ changes }` and the raw ARM `{ properties: { changes } }`),
  since the conceptual docs and the REST reference disagree and the CLI-specific
  page no longer exists. Verify against your own `az deployment group what-if
  -o json` output before relying on it for anything production-critical.
- **Nothing here has run against real cloud credentials or a real VPS** in
  this project's own CI. Tests use realistic fixtures, not live
  infrastructure. Validate against a real staging environment before
  trusting it in production.

## 🤝 Contributing

New providers and external-scanner integrations are the highest-leverage
contribution. See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE)

---

<div align="center">

If PlanGate stopped an agent from doing something you'd have regretted, a ⭐ helps the next person find it before they need it.

[![Star History Chart](https://api.star-history.com/svg?repos=CarlosOliveira-23/plangate&type=Date)](https://star-history.com/#CarlosOliveira-23/plangate&Date)

</div>
