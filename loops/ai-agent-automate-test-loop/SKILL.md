---
name: ai-agent-automate-test-loop
description: "Turns the approved test cases of a UnifyApps AI agent into an evaluation that can run: a dataset with one test case per approved conversation, the metrics that check each expected answer (exact, contains, or a judge with the case's rubric), and an experiment binding the agent, the dataset and the metrics, built through the agent builder as a plan and read back, with every case's dataset item recorded against it. Runs nothing. Use when the person types /ua:ai-agent-automate-test-loop, or asks to turn an AI agent's cases into an eval, dataset or experiment."
argument-hint: "<agent>"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# AI agent test automation

The approved conversations become an evaluation the run loop can start: a
dataset, the metrics that check it and an experiment, all made through the
agent builder as one plan.

`N` is `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`.

## Gate

`T "<the ask>" --verb test --mode build --json`. An app: "This is an app.
Use `/ua:app-build-test-loop`." An automation has no test loops: say "An automation is proven by the test
runs of `/ua:automation-build-loop` and `/ua:automation-fix-loop`." and stop.

## Run it

1. **The cases.** `tests/<agent slug>/design/cases.json`; none, or none
   approved: "No approved cases for <agent>. Run
   `/ua:ai-agent-design-test-loop <agent>` first." and stop. Only approved
   cases go further; the rest are named and left out.
2. **Settings**, one AskUserQuestion, at most four questions: the dataset
   (add to the agent's existing one, or a new one named after the agent and
   the PRD version); the judge model when a case needs a judge.
3. **The plan**, one `ua-change` spec with `dataset`, `metric` and
   `experiment` tasks for `ua:agent-builder`, in that order:
   - **Dataset**: `mcp__plugin_ua_evaluation__create_dataset` when new; `mcp__plugin_ua_evaluation__add_test_cases`, one item per
     approved case: the input is the conversation's user turns, the
     expected output the case's `expected`, the metadata its id, journey,
     priority, `source` and the tool calls the steps expect (`Agent calls
     <tool> with <inputs>`), so a tool-called metric has something to check. Read back with `mcp__plugin_ua_evaluation__list_dataset_items`.
   - **Metrics**: for each kind of check the cases use, one metric from
     `mcp__plugin_ua_evaluation__get_metric_library` or made with `mcp__plugin_ua_evaluation__create_metrics` (exact match,
     contains, tool called, a judge whose rubric is the case's `expected`
     sentence), each tried once with `mcp__plugin_ua_evaluation__test_metric` on one item.
   - **Experiment**: `mcp__plugin_ua_evaluation__create_experiments` binding the agent, the dataset and
     the metrics, with the thresholds the PRD's Rollout section gives;
     `mcp__plugin_ua_evaluation__check_experiment_readiness` must pass.
   `N spec check`, the plan approval, `N plan start`, `ua-change` § Run a
   plan, `N plan finish`.
4. **Record.** Write `tests/<agent slug>/design/evaluation.json`: the
   dataset id, the metric ids with the check each stands for, the
   experiment id, and per case its dataset item id. Close with the counts,
   the cases that could not be made into an item (a check no metric can
   express, named), and `Next: /ua:ai-agent-run-test-loop <agent>`.

## Rules

- Only approved cases become items. Nothing is approved here.
- A case that already has an item under the same id is updated, never
  duplicated.
- The experiment is created, never started: that is the run loop's.
- Every write is a plan task with a read-back through the agent builder.

## Stop fact

Every approved case has a dataset item id in `evaluation.json`, or is
named there as one no metric can express; the metrics exist and passed
`mcp__plugin_ua_evaluation__test_metric`; the experiment is ready.

## Outputs

`tests/<agent slug>/design/evaluation.json`, the plan's run folder and
reports; the closing summary `test-automate · <agent> · <items> items · <metrics> metrics · experiment <id>`.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run tests/<agent slug>/automate --json`.
2. Write `tests/<agent slug>/automate/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings and the plan approval.
