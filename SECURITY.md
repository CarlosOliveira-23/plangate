# Security Policy

## Supported versions

PlanGate is pre-1.0. Only the latest published release is supported; there's
no backport policy yet.

## Reporting a vulnerability

The most serious class of bug here is a **false negative**: PlanGate
returning `allow` or `ask` for a command that should have been `deny`. If
you find one of those, or any other security issue, please report it
privately rather than opening a public issue, using GitHub's [private
vulnerability reporting](https://github.com/CarlosOliveira-23/plangate/security/advisories/new)
("Report a vulnerability" under the repo's Security tab). It goes straight
to the maintainer and stays private until a fix ships.

This is a solo-maintained project, so there's no formal SLA, but security
reports get priority over everything else. Expect an initial response
within a few days.

## Out of scope

Missing provider coverage, parsing bugs, or a verdict that's stricter than
necessary (a false positive) are real bugs, but they're not
security-sensitive. Please open those as normal public issues instead.
