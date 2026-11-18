---
name: native-triage
description: Runs once over a client's issue list, a QA or PM sheet, tickets on a Jira, Linear or GitHub board, a CSV, pasted text, or a dry run of a UnifyApps MOBILE app on another environment, and turns them into issues with exactly one layer and one owner each, optionally with a read-only look at the moved copy on a simulator - then, on a yes, hands the issues to the fix loop, where an issue an automation owns becomes an automation job, deployed once its test run passes. Changes nothing on any environment. Use when the person pastes a ticket link, a CSV or a list of issues, asks to triage the client's issues or a dry run, work through a board, or check an on-prem copy.
user-invocable: false
argument-hint: "<board or issue link | CSV path | pasted list> [copy endpoint]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native triage

`native-triage <board or issue link | CSV path | pasted list> [copy endpoint]`

Runs once: turns a client's issue list, a QA or PM sheet, tickets on a board,
or a dry run of a MOBILE app on another environment into issues with one
layer and one owner each, then (on a yes) hands the issues owned here to
`/ua:native-fix-loop`.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this skill (goal
   `triage`): the platform, health, resume, the run folder, the impact
   analysis, the device queue, the board and the run log come from there.
   On a WEB app (`loops platform` answers it), say
   "This is a WEB app. Use /ua:app-fix-loop with the list; its find-issues way in triages it." and stop.
2. Then the steps below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below.

## When

"Here is the QA list from the dry run", "triage the client's issues", "work
through this board", "check the on-prem copy", "solve these tickets", a pasted
ticket link or CSV about an app.

## Inputs

- One or more lists
  ([triage stage](../loop-orchestrator/references/stages/triage.md) § Load the lists).
- Optionally the endpoint of a moved copy, for a read-only look on the
  simulators.
- The rules from the run settings: statuses in scope, the status after a verified
  fix, whether results are written back.

## Mode and limit

`look` only, on every environment: no UnifyApps Headless or MCP call against the copy's
environment, no tap that writes or sends, no personal data copied, a sign-in
never written down. Source-tenant reads only.

## Scope rules

Each item maps to pages from the source's cache (`ua cache paths`, page
names); an item that fits no page is `needs repro`. `loops impact` adds the
module or card behind an item that shows on several pages.

## Steps

```
load the lists ─► (optional) test runners look at the copy, read-only, published
  ─► one triage row per item and per device issue (one layer taxonomy)
  ─► triage table ─► fix approval ─► fix with the issues owned here
```

[Triage stage](../loop-orchestrator/references/stages/triage.md); the copy's
look uses [test-and-fix](../loop-orchestrator/references/stages/test-and-fix.md)'s
test runner with the copy's rules.

## Stop fact

Every input item and every device issue has exactly one triage row, every reservation
is released, and nothing changed on either environment.

## Outputs

`issues/triage-<n>.md` with the counts by layer and owner, and the sections
`Needs a person on the client side`, `Migration gaps` and
`Decided, not changed` for the person. The issues owned here (`page`, `module`,
`card`, `platform`, `automation`) are also in `issues/merged.md` for
`/ua:native-fix-loop`, where an issue an automation owns becomes an
automation job: saved and test-run as a draft, deployed once its test run
passes. A `needs repro` item the person picks goes to the fix loop's
reproduce stage as a reported issue.

## Approvals

The run settings (the rules, once), the fix approval. Write-back to the source happens only
after a fix passed, in `/ua:native-fix-loop`, through the write-back approval.
