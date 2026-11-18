---
name: ai-agent-run-test-loop
description: Runs the evaluation experiment of a UnifyApps AI agent, waits for it to finish, writes one report with the scorecard, every case's scores and the judge's reasons, the cost and latency, and the history of earlier runs, and, with --fix, starts the AI agent fix loop on the cases under threshold (otherwise names it as the next command). Creates and rewrites no case or metric. Use when the person types /ua:ai-agent-run-test-loop, or asks to run an AI agent's evals or experiment, or wants its scorecard.
argument-hint: "<agent> [experiment name] [--fix]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Skill, AskUserQuestion, ToolSearch
---

# AI agent test execution

Runs what `/ua:ai-agent-automate-test-loop` made and reports it. The
Evaluation tools load with one ToolSearch.

`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Gate

`T "<the ask>" --verb test --mode run --json`. An app: "This is an app. Use
`/ua:app-run-test-loop`." An automation has no test loops: say "An automation is proven by the test
runs of `/ua:automation-build-loop` and `/ua:automation-fix-loop`." and stop.

## Run it

1. **The experiment**: from `tests/<agent slug>/design/evaluation.json`,
   else `mcp__plugin_ua_evaluation__get_experiments` on the agent and the name in the command; several
   candidates: one AskUserQuestion with up to four, the most recently run
   first. None: "Automate first: `/ua:ai-agent-automate-test-loop <agent>`."
   `mcp__plugin_ua_evaluation__check_experiment_readiness` must pass.
2. **Run**: `mcp__plugin_ua_evaluation__start_experiment_runs`. Poll `mcp__plugin_ua_evaluation__get_experiment_runs` every 30 s,
   waiting in the foreground with
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" pause --seconds 30`;
   never a background sleep. After 30 polls (15 minutes), call `mcp__plugin_ua_evaluation__find_stalled_runs` once; a stalled
   execution is reported as stalled, never as failed, and the report is
   written without it. One line per poll with the progress, a statement, never a question.
3. **Read**: `mcp__plugin_ua_evaluation__get_run_results` (every case, every metric, the judge's
   reason), `mcp__plugin_ua_evaluation__experiment_scorecard`, `mcp__plugin_ua_evaluation__get_run_cost_and_latency`;
   `mcp__plugin_ua_evaluation__export_experiment_run` saved whole as
   `tests/<agent slug>/runs/<runId>/results.json`.
4. **Report**: write `tests/<agent slug>/runs/<runId>/report.md`: the
   scorecard (each metric: score, threshold, pass or fail), one row per case
   (id, journey, each metric's score, the judge's reason in one line, under
   or over threshold), cost and latency, and the last ten runs from
   `tests/<agent slug>/runs/history.jsonl` (one line per run appended now:
   run id, time, scores per metric, cases under threshold). Copy the report
   to `~/Downloads/<agent>-<experiment>-Eval-<date>.md`.
5. **Hand over**: with no case under threshold, say so with the report path
   and stop. Otherwise start `/ua:ai-agent-fix-loop <runId>` in this session
   when the command said `--fix`; else name it as the next command with the
   count. The report is the record of this run.

## Rules

- Run only what exists. Never write a case, a metric or the agent.
- A judge's reason that blames the expectation (the case, not the agent) is
  named in the report as a case to fix in `/ua:ai-agent-design-test-loop`.
- One experiment run per invocation; a re-run is a new run with its own folder.
- No credential or customer record in the report: the results hold the
  cases' own inputs and the agent's answers only.

## Stop fact

Every case has its scores or is listed as stalled, the report and its copy
exist, the history line is written, and the cases under threshold are in
the fix loop or named as the next command.

## Outputs

`tests/<agent slug>/runs/<runId>/results.json`, `report.md`,
`tests/<agent slug>/runs/history.jsonl`, the copy in Downloads; the closing
summary `test-run · <agent> · <experiment> · <passed>/<cases> over threshold · <stalled> stalled`.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run tests/<agent slug>/runs/<runId> --json`.
2. Write `tests/<agent slug>/runs/<runId>/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings (which experiment, `--fix`). Nothing else.
