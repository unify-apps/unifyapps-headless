---
name: app-run-test-loop
description: Runs a Test Studio suite or plan of a UnifyApps WEB app through the Test Studio triage loop, which starts the run, polls it to its end and classifies every red (with --heal it also heals the locator ones and files tickets after a yes), then writes one HTML report of every case's result with the triage verdict beside each red and the app's run trend from its loop ledger. Creates and rewrites no case. Use when the person asks to run the automated tests of a web app, wants a test run report, or types /ua:app-run-test-loop.
argument-hint: "<app> [suite or plan name] [--heal]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# App test execution

Load `ua:loop-orchestrator` and follow it for this loop (goal
`test-author`). Its test-author stage keeps execution apart from creation,
and on a WEB app the cases run in Test Studio's own browsers: the
orchestrator's device queue, runners and health checks are not used. Confirm
the app through `loops platform <appId>` first; on a MOBILE app, say
"This is a MOBILE app. The test loops run on WEB apps only." and stop.

This loop runs what `/ua:app-build-test-loop` saved. One engine, not two:
the run itself, the polling and every verdict on a red are
`/ua:app-test-triage-loop`'s, started here with the suite or plan to run.
What this loop adds is the choice of what to run, the report and the trend.
It never writes or approves a case, never changes the app, and never ends a
run early.

`L` below is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs"`;
`REPORT` is `node "${CLAUDE_PLUGIN_ROOT}/loops/app-run-test-loop/scripts/report.mjs"`.
The Test Studio tools are the `app-testing` bridge's, loaded with one
ToolSearch.

## 1. Which suite or plan

Ask only what the request did not name, in one AskUserQuestion:

1. **The app**, when several match; its platform screen URL, resolved as
   `app-test-author` resolves a target.
2. **The suite or plan.** `mcp__plugin_ua_app-testing__fetch_test_suites` and `mcp__plugin_ua_app-testing__fetch_test_plans` on the
   app; a name in the command is matched against both. Several candidates: up
   to four options, the ones run most recently first, each with "<cases>
   cases, last run <date or none>: <passed>/<total>". A suite with no case
   cannot run: say so and send the person to `/ua:app-build-test-loop`.
   The name handed on below is the one exact name picked here, so the triage
   loop never has to choose.

`--heal` lets the triage loop chain the heal and ticket loops after this
run. It is on only when the command says it; never ask.

## 2. The firing

`L firing-id` makes the firing id. Its folder is
`tests/<app slug>/loops/<firing id>/` (`<app slug>`: the app's name in
lowercase with hyphens, the folder the other Test Studio loops use), and the
app's ledger is `tests/<app slug>/loop-ledger.json`, shared with them. The
orchestrator's own run folder keeps the board, the log and the self-review.

## 3. Run and triage

Start `/ua:app-test-triage-loop run <suite or plan name> --firing <firing id> for <app URL>`
in this session, with `--heal` when the person asked for it, and follow it
to its last message. It starts the run, polls it in the foreground, saves
the answer of `mcp__plugin_ua_app-testing__fetch_run_executions` whole as
`<firing>/evidence.json`, writes one ledger row per red with its class,
route and verdict, groups the reds by root cause in `report.md` and ends
with `status.md`; with `--heal` it also heals the locator reds and files one
ticket per root cause after the person's yes. An execution still queued or
running after its polls is stuck: the triage loop names it as a platform
problem, never as failed, and so does the report. A run with no red gives
one firing row, a report reading "no failures" and the judge's close.

The triage loop's own progress lines stand; add nothing between them.

## 4. Report

When the triage loop has ended:

`REPORT --firing tests/<app slug>/loops/<firing id> --ledger tests/<app slug>/loop-ledger.json --app "<app name>" --suite "<suite or plan name>" --url <app URL> --copy ~/Downloads --open --json`

writes `report.html` in the firing folder (one file, nothing loaded from the
network: the counts, the trend over the last ten runs this loop reported,
every case with the step it stopped on and the triage verdict beside it,
the reds first, a case that flips between runs marked flaky),
`summary.json`, one `run-loop` ledger row per execution and one for the
firing, and a dated copy in Downloads named
`<app>-<suite>-TestStudio-<date>.html`, then opens the copy. A firing the
triage loop ran in fallback mode holds the reds only, and the script refuses
it: say so, and that the triage loop's `report.md` is the record of that run.

Check the copy shows the totals and every case before handing it over. No
credential or token goes in a report: it shows only names, results, steps,
verdicts and reasons.

## 5. Finish

Say the report path, the counts, the stuck executions and the triage loop's
closing line. The triage loop's `status.md` is the record of what happened
to the reds; the report is the record of the run.

## Rules

- Run only what Test Studio holds. Never write, rewrite or approve a case,
  and never change the app or its data to make a case pass.
- A timeout, a stuck execution or a platform error is never a confirmed app
  bug; the triage loop decides, and it reads the PRD when a verdict needs it.
- One run per firing. A re-run is a new firing with its own folder and
  report.
