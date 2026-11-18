---
name: native-report
description: Runs once to render the analytics of one UnifyApps Headless loop run as HTML from the run's run log - tokens per stage and agent, skill and loop call counts, agents run, durations, device use, the issue flow (found, fixed, reopened, open) and the approvals - from a fixed template, so the same run log always gives the same report. Runs only when the person asks, never at the end of a run; with --share, sends an anonymised summary to the UnifyApps Headless team on a yes. Works for a run on a MOBILE app. Use when the person asks how a loop run went, where the time went, how many tokens a run took, or to send the run log to the UnifyApps Headless team.
user-invocable: false
argument-hint: "[run-id | last] [--share]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native report

`native-report [run-id | last] [--share]`

Runs once: the analytics of one run on a MOBILE app, rendered as HTML from
its run log: tokens per stage and agent, skill and loop call counts, agents
run, durations, device use, the issue flow (found, fixed, reopened, open) and
the approvals. It runs **only when the person asks**, never at the end of a run.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this skill (goal
   `report`): the run folders and the run log come from there; no health
   check, no device and no tenant write. When the run's app is WEB (the
   platform in its `board.json`), say
   "This is a WEB app. The web loops' runs have no report yet; read board.md in the run's folder under .nebula/loops/runs/." and stop.
2. Then the steps below, in order.

## When

"How did that run go", "where did the time go", "how many tokens did the
audit take", "report on the last run", "send the run log to the UnifyApps Headless team".

## Inputs

- A run id, or `last` (the newest folder under `.nebula/loops/runs/`).
- `--share`: also send an anonymised summary of the run to the UnifyApps Headless team.

## Mode and limit

`look` on the tenant: reads the run folder only. Writes `tokens.json`,
`metrics.json` and `report.html` into the run folder. `--share` sends a summary
only on the person's yes.

## Steps

1. `loops log tokens <run>`: input, output and cache tokens per agent, agent
   type and stage, summed from Claude Code's transcripts of the session and
   its subagents (the only place tokens are summed); `tokens.json`.
2. `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-run-metrics/scripts/metrics.mjs" collect --run <run>`:
   passes, waits, refusals, environment failures, questions and device calls;
   `metrics.json`.
3. `loops log report <run>`: `report.html` from the fixed template
   `skills/native-loops/loop-orchestrator/templates/run-report.html`. The data fills the
   template; the session writes no HTML, so the same run log always gives the
   same report.
4. Open it for the person as a file link, and say three facts from it in chat:
   where the most time went, which stage used the most tokens, and the issue
   flow in one line.
5. `--share`: `loops log share <run>` writes a short anonymised summary of
   the run (fixed fields only; hosts, ids, names and tenant texts scrubbed);
   show it; on the person's yes, send it as the remarks of
   `ua:give-feedback`, which uploads the redacted session itself, as that
   skill says.

The run log's events and what the report sums are in
[run log](../loop-orchestrator/references/run-log.md).

## Stop fact

`report.html` exists for the run and the person has its link; with `--share`,
the summary is sent or the person said no.

## Outputs

`report.html`, `tokens.json`, `metrics.json`, and with `--share` the summary
and the feedback record's id.

## Approvals

Only the yes to send the summary. No other question.
