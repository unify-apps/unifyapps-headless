---
name: native-audit
description: Runs once over the pages of a UnifyApps MOBILE app and finds everything wrong with them, then stops - six read-only checks (UI against the approved design, touch feedback, performance, security, data, logic), run as parallel agents per page group, with device checks queued for test runners on the simulator pool, merged into one ranked board of issues. Runs an impact analysis so every page that shares a module or a card is in scope. Changes nothing on the tenant and ends by offering the fix loop. Use when the person asks to audit a page or a mobile app, find what is wrong with it, check every screen, or check touch feedback, performance, security, data or logic before a demo, a handover or a rebuild.
user-invocable: false
argument-hint: "<app | page[,page]> [ui,touch-feedback,perf,security,data,logic]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native audit

`native-audit <app | page[,page]> [ui,touch-feedback,perf,security,data,logic]`

Runs once: finds everything wrong with the pages in scope of a MOBILE app, as
ranked issues, and stops there. Fixing is `/ua:native-fix-loop`,
whose quick audit runs these same checks.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this skill (goal
   `audit`): the platform, health, resume, the run folder, the impact analysis,
   the device queue, the board and the run log come from there.
   On a WEB app (`loops platform` answers it), say
   "This is a WEB app. Use /ua:app-fix-loop; its find-issues way in runs the audit." and stop.
2. Then the steps below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below.

## When

"Audit the Leave page", "what is wrong with this app", "check every screen",
"is this page built right", "focus on perf", "do the buttons give feedback",
"is this page secure", before a rebuild or a handover.

## Inputs

- The scope: an app, one or more pages, a shared module or a card page.
- The focus: any subset of the six checks; all of them by default. Words map
  to checks: "looks, design, pixel" → `ui`; "taps, buttons, feedback" →
  `touch-feedback`; "slow, perf" → `perf`; "security, access, identity" →
  `security`; "data, empty, errors" → `data`; "logic, prune, built right" →
  `logic`.
- The version: draft by default; published when the person says so.

## Mode and limit

`look` only. No tenant write, no builder, no publish. On the device only taps
that navigate or open sheets. Automation test runs only for automations that
write nothing.

## Scope rules

`loops impact <appId> --page <id>` for each page asked: the page, every shared
module it uses (audited once, as its own group) and every card page it hosts
join `scope.json`. A module or card asked by name pulls in its dependents as
pages to look at for that module's issues only. The whole app: every page the
route map reaches (`loop-route-map`), plus modules and cards.

## Steps

```
scope ─► design intake (only for ui, when the store is missing)
      ─► audit: one check agent per page group × check, up to maxAgents at once
             config checks in the agent · device checks queued
      ─► test-and-fix test runners drain the queue (measure only: issues, no fixes)
      ─► merge ─► ranked board ─► fix approval
```

The six checks, the check agent and its brief, and the merge into the ranked
board are in [audit checks](../loop-orchestrator/references/audit-checks.md);
each check has its own stage file:
[ui](../loop-orchestrator/references/stages/audit-ui.md),
[touch-feedback](../loop-orchestrator/references/stages/audit-touch-feedback.md),
[perf](../loop-orchestrator/references/stages/audit-perf.md),
[security](../loop-orchestrator/references/stages/audit-security.md),
[data](../loop-orchestrator/references/stages/audit-data.md),
[logic](../loop-orchestrator/references/stages/audit-logic.md). The design
intake is [design intake](../loop-orchestrator/references/stages/design-intake.md);
the test runners are [test-and-fix](../loop-orchestrator/references/stages/test-and-fix.md).

## Stop fact, outputs, approvals

**Stops when** every page in scope has issues, an explicit `ok` or a
`Not reached` reason for every check in focus; every queued request is done or
failed with a reason; and the board is written.

**Outputs:** the issue logs, `issues/merged.md`, the board (ranked), the
version audited and how it was proven, and `Not reached`.

**Approvals:** the run settings only when the scope or the design is unclear;
the fix approval at the end ("<n> issues open. Fix them now?"), which starts
`/ua:native-fix-loop` with `issues/merged.md`. Nothing on the tenant
changed.
