---
name: app-build-test-loop
description: Builds the approved test cases of a UnifyApps WEB app into Test Studio UI tests through the Test Studio create loop. It takes the approved case list the discover loop wrote and hands it to the create loop as its case source, so every approved case ends as a saved Test Studio case, an authored one the contract said not to submit, or a parked reason, with no person in the loop after kickoff, and records the result against each case. Invents no case and runs nothing. Use when the person asks to build or automate the approved test cases of a web app in Test Studio, or types /ua:app-build-test-loop.
argument-hint: "<app> [for <app URL>]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# App test build

Load `ua:loop-orchestrator` and follow it for this loop (goal
`test-author`). Its test-author stage keeps creation apart from execution,
and on a WEB app the creation engine is the Test Studio create loop, which
drives its own browsers: the orchestrator's device queue and runners are not
used. Confirm the app through `loops platform <appId>` first; on a MOBILE
app, say "This is a MOBILE app. The test loops run on WEB apps only." and stop.

This loop writes no case itself. It points `/ua:app-test-create-loop` at
the approved cases and lets it run as written: its run contract, its sign-in
of each test user once, its helpers several at once, its gate, its parked
reasons and its evaluator. What this loop adds is the case source, the
approved-only check before it, and the record of what landed.

`C` below is `node "${CLAUDE_PLUGIN_ROOT}/loops/app-discover-test-loop/scripts/cases.mjs"`.

## Run it

1. **The cases.** Read `tests/<app slug>/design/cases.json` and `cases.md`
   (`<app slug>`: the app's name in lowercase with hyphens). No file, or no
   case approved: say "No approved cases for <app>. Run
   `/ua:app-discover-test-loop <app>` first." and stop. Cases still pending or
   with changes requested are named and left out; nothing is approved here.
   Before the hand-off,
   `C render --cases <cases.json> --out <cases.md> --app "<app name>" --url <app URL>`
   rewrites `cases.md` so it holds exactly the approved cases.
2. **The app URL.** The deployed app's URL, or its platform screen URL, from
   the command, `tests/<app slug>/design/cases.json` (`app.url`), or one
   question.
3. **Hand off.** Start `/ua:app-test-create-loop for <app URL>` in this
   session, with the contract's case source set to
   `tests/<app slug>/design/cases.md` and its scope "every case in the
   file". Its kickoff asks its own remaining contract questions once (test
   users, naming, browsers, cleanup), then runs alone and reports. The
   create loop's duplicate rule holds: a case already in Test Studio under
   the same name is parked, never written twice.
4. **Record.** When the create loop's run ends (its report, or
   `/ua:app-test-create-loop resume` after a stall), run
   `C automation --cases <cases.json> --run tests/<app slug>/loops/<firing id>/run.json`:
   each approved case gets its Test Studio case id and state (`saved`,
   `authored` or `parked` with the reason). Close with the counts, the parked
   cases and their reasons, and the next command,
   `/ua:app-run-test-loop <app>`.

## Rules

- Only approved cases are authored. A missing case source, or one with no
  approved case, goes back to `/ua:app-discover-test-loop`; this loop never
  invents or approves a case.
- Never change the app so a case passes the create loop's gate. Never run a
  case; that is `/ua:app-run-test-loop`.
- A case's `source` names the PRD's `R<n>` and `A<n>.<m>` ids; when a step
  or an expected result is unclear, read those lines with
  `prd get <app> --part prd`. The PRD is read only, never changed.

## Stop fact

Every approved case in `cases.json` carries a Test Studio case id, a parked
reason, or the authored-not-submitted state when the contract said not to
submit, read from the create loop's run file; the person has the counts and
the next command.

## Outputs

- `tests/<app slug>/design/cases.json` with `automation` on every approved case.
- The create loop's own run folder and report under `tests/<app slug>/loops/<firing id>/`.
- The closing summary: `test-build · <app> · <saved> saved · <parked> parked · <authored> authored, not submitted`, the parked cases with their reasons, and `Next: /ua:app-run-test-loop <app>`.

## Approvals

The run settings
([approvals](../../skills/native-loops/loop-orchestrator/references/approvals.md)
`settings`), then the create loop's own kickoff contract. Nothing else is
asked.
