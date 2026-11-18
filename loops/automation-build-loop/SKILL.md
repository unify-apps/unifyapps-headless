---
name: automation-build-loop
description: Builds one ticket of a UnifyApps automation and proves it. Plans the parts the ticket needs (the objects and fields, the automation's shell, its logic, the connection it uses, the deploy), builds them through the automation agent and the FDE agent as a plan, then replays every given-then acceptance line as a test run with seeded records, inspects each run step by step and reads the records and outputs back, fixing and retrying until each line passes or is accepted; deploys when its test run passes (a yes first off UAT) and keeps the PRD current. Use when the person types /ua:automation-build-loop, or asks to build or extend an automation, workflow, sync or schedule from a ticket, a PRD or a description.
argument-hint: "<ticket link | automation in words> [automation]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# Automation build loop

One ticket at a time: planned, built by the automation agent and the FDE
agent, and proven by test runs on seed records, each inspected step by step.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`;
`RUN` is the run folder `automation/<slug>/build-<YYYYMMDD-HHMM>/`.

## Gate

`T "<the ask>" --verb build --json`. An app: "This is an app. Use
`/ua:app-build-loop` (web) or `/ua:native-build-loop` (mobile)." An AI
agent: "Use `/ua:ai-agent-build-loop`."

## Run it

1. **The ask.** A ticket: open
   [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
   § Read a ticket and follow its steps (or read the ticket file a
   front door wrote), then take from the description, every comment, and
   every screenshot and recording in them: its trigger, contract, steps and
   acceptance lines, the PRD ids it cites (`N prd get <slug> --part prd --json`),
   and what the comments added or changed. Words: the automation as the
   person said it, with new acceptance lines in the PRD's given-then shape,
   shown in the plan approval. What exists: `N cache wf <name>` with
   `--contract` and `--deps`, and `mcp__plugin_ua_automation-code__find_workflow_examples` for the pattern.
2. **Run settings**, one AskUserQuestion, at most four questions: the test
   records to seed (from `loop-test-data`'s rules: throwaway names, deleted
   after); the connection and its test account for each external system;
   be deployed once every line passed (yes on UAT, a yes first elsewhere); the
   ticket write-back, written for the person to apply.
3. **The plan**, a `ua-change` spec and tasks under `RUN/`, in order:
   `object` tasks (`ua:fde-agent`) for new objects or fields; a `record` task
   for the seed records; `automation-shell` → `automation` tasks
   (`ua:automation-agent`: the shell with its trigger and contract, the
   logic as TypeScript compiled and saved with `mcp__plugin_ua_automation-code__compile_and_save_workflow`,
   a test run); a `manual` task when a connection must be made by hand. The
   deploy is not in this plan: step 7 adds it as its own task once every
   line passed. The spec's `acceptance` rows are the
   ticket's lines word for word. `N spec check`, `N plan propose --mode
   zen`, the plan approval, `N plan start`.
4. **Build it**: `ua-change` § Run a plan as written; each builder reports
   its read-back (`mcp__plugin_ua_automation-code__open_workflow` for the saved code,
   `mcp__plugin_ua_automation-code__describe_callable_workflow` for the contract); a question becomes
   `needs_confirmation` and is asked once.
5. **Prove it.** For every acceptance line, in `RUN/accept/<n>/`: seed the
   given records, `mcp__plugin_ua_automation-code__trigger_workflow_run` with the given input (or the event
   that fires it), wait for the run, `mcp__plugin_ua_automation-code__inspect_workflow_run` for every step's
   input, output and error, read the records and outputs back
   (`mcp__plugin_ua_object__get_records`, the caller's answer, the message the test inbox got), and
   judge the line by its own check. `result.md` per line: pass, or fail with
   the step that differed.
6. **Fix and retry.** A failed line becomes one fix task for the part at
   fault, the plan revised, the same builder, then the line replayed; three
   attempts, then ask the person once (AskUserQuestion): accept the line as
   it is, try once more, or stop; a stop lists the line as open.
7. **Finish**: when every line passed, run `mcp__plugin_ua_automation-code__get_workflow_best_practice_report`; a finding it
   marks as an error blocks and is fixed in the same pass, a warning goes in
   the summary. Then the deploy as one more plan task for the automation agent
   (`mcp__plugin_ua_automation-code__deploy_workflow`), asked first off UAT; then `N plan finish`; the seed records deleted with
   one question for all of them: a dry run first, then each delete call's
   `CONFIRM_REQUIRED (d_…)` summary and id in a single AskUserQuestion, as
   `ua:ua-change` § Answers and blocks says. Never ask your own "delete
   these?" first: the gate's question is the only one;
   `N prd classify` and the next PRD version when the build changed what the
   PRD says; the write-back when asked; the closing summary.

## Rules

- The automation agent writes the automation; this loop never calls
  `mcp__plugin_ua_automation-code__compile_and_save_workflow` itself. Every change is a plan task with a
  read-back.
- Test runs use seed records with throwaway names and the test accounts the
  settings named; never a customer's record, never a real send or payment.
- A called automation is built and proven before its caller.
- Reads the PRD, keeps it current, never rewrites its approved version.

## Stop fact

Every acceptance line passed its test run, or was accepted; the plan is
finished; the automation is deployed where the settings said; the seed
records are gone; the PRD is current.

## Outputs

- `RUN/`: the spec, the tasks, `accept/<n>/` (input, run id, steps, records
  after, result), the builders' reports, `board.md`.
- The closing summary: `build · <automation> · <ticket> · <passed>/<lines> · deployed to <env> | not deployed · done | stopped: <why>`,
  each line's verdict, what was built, the open lines, and `Next:` the
  next ticket, or nothing.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run RUN --json`.
2. Write `RUN/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).

## Approvals

The run settings, the plan approval, the deploy approval off UAT, the record
deletes, the choice after three failed attempts.
