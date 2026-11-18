---
name: automation-fix-loop
description: Fixes a UnifyApps automation that failed or did the wrong thing. Takes a failed run (its id, or "the nightly sync failed") or a ticket; finds the run, inspects it step by step, reproduces it with the same input on seed records, finds the cause layer by layer (the input, a step's config or code, a connection, the external system, a called automation), fixes it through the automation agent as a plan, re-runs the same input and the PRD's other acceptance lines, checks every caller, and writes a before/after table. Redeploys when the test run passes (a yes first off UAT). Use when the person types /ua:automation-fix-loop, or says an automation, workflow, sync or schedule failed, ran twice, or wrote the wrong thing.
argument-hint: "<run id | what went wrong | ticket> [automation]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# Automation fix loop

Fix what is wrong with an automation, one issue at a time, each reproduced
before it is touched and re-run after.

Load `ua-safety` before the first tenant read. `N` is
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`;
`T` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" target`;
`RUN` is the run folder `automation/<slug>/fix-<YYYYMMDD-HHMM>/`.

## Gate

`T "<the ask>" --verb fix --json`. An app: "This is an app. Use
`/ua:app-fix-loop` or `/ua:native-fix-loop`." An AI agent: "Use
`/ua:ai-agent-fix-loop`." A ticket about an automation is this loop's.

## Ways in

| The person gives | The issues are |
| --- | --- |
| a run id, or "<automation> failed" | one issue: that run, or the newest failed run from `mcp__plugin_ua_automation-code__list_workflow_runs` |
| a ticket or a list | one issue per ticket: open [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md) § Read a ticket and follow its steps (or read the ticket file a front door wrote), for the description, every comment (a later one outranks the description), and every screenshot and recording |
| "it wrote the wrong thing" | one issue: the record or output named, and the PRD's acceptance line that says what it should be (`N prd get <slug> --part prd`) |

## Run it

1. **Run settings**, one AskUserQuestion, at most four questions: the seed
   records and test accounts to reproduce with; redeploy when the test run
   passes (yes on UAT); the write-back.
2. **Find and read the run**: `mcp__plugin_ua_automation-code__inspect_workflow_run` for the failed run
   (every step's input, output, error, timing) into `RUN/issues/<n>/run.md`.
3. **Reproduce** on seed records: `mcp__plugin_ua_automation-code__trigger_workflow_run` with an input of
   the same shape rebuilt on the seed records, never the original record or
   payload (or the same event on a seed record), inspect again. Not reproduced twice: ask the
   person once what differs (the data, the time, the environment), then park
   it as unreproduced.
4. **Cause**, layer by layer, one line each in `cause.md`: the input (a
   missing or malformed field); the step (its config or code, read with
   `mcp__plugin_ua_automation-code__open_workflow`); the connection (expired, wrong account, a permission);
   the external system (its error, a rate limit); a called automation
   (`mcp__plugin_ua_automation-code__get_workflow_dependencies`, then its own run). Stop at the first layer
   that explains the failure.
5. **Fix** as a plan through `ua-change`: an `automation` task for the
   automation agent (the step's code or config), an `object` task for the
   FDE agent when the data is at fault, a `manual` task for a connection the
   person must renew. The plan approval lists the jobs.
6. **Retest**: re-run the rebuilt input; then the PRD's other acceptance lines
   of the automation (`N prd get <slug> --part prd`), each as a seeded test
   run; then every caller (`mcp__plugin_ua_automation-code__get_workflow_dependencies`): one run each with
   its own input. A fix that breaks a caller is reverted by a new plan task and tried
   again; three attempts, then ask the person once: accept, try once more, or
   stop. When all pass, the redeploy is one more plan task for the automation
   agent (`mcp__plugin_ua_automation-code__deploy_workflow`), asked first off UAT. The `mcp__plugin_ua_automation-code__get_workflow_best_practice_report` findings that block are
   fixed in the same pass.
7. **Finish**: `N plan finish`; the before/after table (the run before, the
   run after, the records before and after); the seed records deleted on the
   person's yes; the comment and status when asked; `N prd classify`
   when the fix changed what the PRD says.

## Rules

- Every fix is a plan task with a read-back; the loop never calls
  `mcp__plugin_ua_automation-code__compile_and_save_workflow` itself.
- Reproduce on seed records and test accounts only; never re-run a real
  send, payment or customer record.
- A failure in an external system is reported, not fixed here: the issue
  says what the system answered and who owns it.
- A failure the PRD explains as a wrong expectation is a PRD fix, parked
  and named for `/ua:automation-scope-loop`.

## Stop fact

Every issue is verified by its re-run, accepted, parked with its reason, or
stopped at the person's choice; every caller still passes; the automation is redeployed where the settings said; the
before/after table is written.

## Outputs

`RUN/issues/<n>/` (run, cause, re-run), `before-after.md`, the builders'
reports; the closing summary `fix · <automation> · <fixed>/<issues> · done | stopped: <why>`,
one line per issue (cause layer, fix, verdict), the callers checked, and
`Next:` the open issues, or nothing.

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

The run settings, the plan approval, the deploy approval off UAT, the
record deletes, the choice after three failed attempts.
