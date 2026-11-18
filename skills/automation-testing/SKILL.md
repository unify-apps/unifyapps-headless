---
user-invocable: false
name: automation-testing
description: Only for the automation-agent builder agent. Saves an automation only when its code compiles clean, reads its best practice score and fixes failing checks toward 90, and test-runs it against the selected tenant without deploying it, through the automation-code MCP tools, then reads the effects back on their own surfaces. Use when an automation needs a save, a best practice score read and fixed, a bounded test run with a controlled payload, or run evidence for a task report.
---

# Direct automation testing

Every step here is a tool on the `automation-code` MCP server. The tools take
no `host`: the tenant comes from the connection. The platform calls an
automation a workflow, so every tool name says `workflow`.

| To | Call | What comes back |
|---|---|---|
| save it | `compile_and_save_workflow` with `code`, plus `workflowId` for an edit; leave it out to create, since a slug or an unknown id answers HTTP 500 and saves nothing | clean code: `ok: true`, the `workflowId`, the new `version` and a `changes` line; code with an error: `ok: false` and findings, and nothing is saved |
| read its best practice score | `get_workflow_best_practice_report` with `workflowIds` (one to ten ids) | for each automation: its `score` out of 100, the saved `version` scored, the score per category (`performance`, `usability`, `security`; a category can be `null`, which is not 0), `passedChecks` of `totalChecks`, and `failing`, the platform's raw failing rows: one row per check per affected node, unsorted, each with `checkId`, `checkTitle`, `checkDescription`, `checkImpact`, `checkCategory`, `impactedEntityId`, `impactedEntityName` and `impactedEntityType`; `notFound` lists ids it could not find or you may not view |
| run the saved draft | `trigger_workflow_run` with `workflowId`, `runType: "workflow_test"` and `triggerInput`; it waits up to 90 seconds | the final status, the STOP node's output, and each failed node's error |
| read a run that outlived the wait | `inspect_workflow_run` with the `runId` | the run's status and node details |
| list recent runs | `list_workflow_runs` with `runType: "workflow_test"` | the runs, newest first |

A test run executes the saved draft on the tenant. It never deploys it.

## Workflow

1. **A clean compile saves.** There is no dry run. Call
   `compile_and_save_workflow` only when the task says to build. Fix every
   finding it names and call it again; a call with findings saved nothing.
2. **Read the best practice score before you test.** Read the score of the
   version you just saved and fix its failing checks toward 90, as § The best
   practice score below says. A fix changes the code, so the test runs come
   after it.
3. **Stay inside the task's authorisation.** A test run executes real nodes
   on the selected tenant. The task's authorisation covers the test effects
   its body names; before a run that would create, update, send, upload,
   delete or call another mutating API the task does not name, report
   `needs_confirmation` with those effects in `error`.
4. **Run one controlled payload per observable outcome**, including each
   rejection path and the all-blank payload. Forms send `""` for optional
   fields nobody filled, so blank and missing are different cases. Use
   fixtures the test owns; never depend on a row a person created or on an
   exact count in a shared table.
5. **Read the verdict, not the call.** The call succeeding only means the run
   was started. Read its `status`: `COMPLETED` or `FAILED`. A `FAILED` run
   names the node and the reason. A run that is still going after the
   tool's 90-second wait returns only its `runId`; read it once more with
   `inspect_workflow_run`, and record it as unverified if it is still not
   finished.
6. **Read each effect on its own surface.** Check the STOP node's output and
   any controlled external effect. A finished run proves the definition
   returned. It does not prove that a downstream record or message is
   correct. Read that effect with the object, connection or app surface's
   own read.
6. **A node that reads session context can fail under a direct test run for a
   reason that is not a bug.** A Check User Connection node reads `aiAgentId`
   from the session variables an AI agent's own run sets; `trigger_workflow_run`
   starts no agent session, so that node sees no `aiAgentId` and fails even
   when the automation is correct. Report that failure as a limit of the test
   run, not as a defect, and verify the node by running the automation through
   the agent instead.

## The best practice score

The platform scores every automation out of 100 against its best practice
checks, in three categories: performance, usability and security. Fix failing
checks toward 90 without changing what the automation does. Each failing
row's own `checkDescription` says what to change: fix each check from it.

1. **When.** Right after a clean save of an automation's logic, before the
   test runs, and again before `deploy_workflow` only if the version differs
   from the one already scored. The two fix rounds are for the whole task. A
   task that only deploys or only tests reads the score once, reports it, and
   writes its exception lines (item 6) with the reason `task does not save`;
   it makes no fix round and does not hold the deploy. Fix rounds belong to
   the task that saves the logic. A contract shell (an `automation-shell`
   task) is a typed stub that its logic task replaces; do not score it.
2. **Read it.** Call `get_workflow_best_practice_report` once with the
   `workflowIds` of every automation the task saved (one to ten). It scores the
   saved version, so its `version` should match the save's version or, in a
   task that saved nothing, the one `open_workflow` returns now. If it
   differs, or the `score` or `version` is `null`, the score may belong to
   other code: call `open_workflow` once more. If it still differs, put `Best
   Practice score not read: version mismatch` in `unverified`, make no fix
   round, and carry on. A `workflowId` listed under `notFound` is handled the
   same way: a missing automation is never a score of 0, and neither is a
   category score of `null`. A call that fails (`{ok: false, error, hint}`) is
   called once more. When it fails again, or the tenant does not serve the
   tool, put `Best Practice score not read: <reason>` in `unverified` and carry
   on.
3. **90 or more is done.** Make no more saves for best practice, not even for
   one low check. Test (item 7), then report: each check still failing is one
   exception line (item 8), with the reason `score already 90 or more`.
4. **Below 90, run a fix round.** Work the `failing` rows by `checkImpact`:
   `critical`, `high`, `medium`, `low`. Rows with the same `checkId` are one
   check: fix it on each `impactedEntityId`, and name the nodes in the note by
   `impactedEntityName`. Fix a check on nodes this task added or changed,
   unless the task's ask is the score itself ("raise the best practice score",
   "fix the failing checks"): then every node is the task's. Leave a check
   whose fix would change the trigger, the inputs and outputs, what it reads,
   writes or sends, or when it runs. Apply the whole round in one edit of the
   code `open_workflow` returned, save once, and read the score again. A round
   that does not raise the score is undone: save the code you had before it,
   and record its checks as exceptions with the reason `fix lowered the score`.
   An undo is not a round; read the score once more after it, so the report
   names the version you ship.
5. **Two rounds at most.** A save made to fix best practice is a round, even
   when the score does not move; count them. A save that comes back with
   findings is not a round: fix them and save again, as Workflow step 1 says.
   Stop earlier when the score reaches 90 or every check still failing is an
   exception. When two rounds leave the score below 90, stop anyway: each
   check still failing is an exception, with the reason `left after two fix
   rounds`, which you give only after making two.
6. **An exception is a check you leave failing**, with a one-line reason: `fix
   would change behaviour`, `fix lowered the score`, `task does not save`,
   `needs <environment variable, connection, object or automation> outside the
   task`, `left after two fix rounds`, or, on an automation that existed
   before the task, `nodes not changed by this task` (every row of the check
   names a node the task did not add or change, and the task's ask is not the
   score). A check you cannot fix gets a reason of its own that says why.
   Every check left failing is one, at any score. An exception never blocks
   the task; report the score as it stands.
7. **Test after the last round.** A fix round is not done until a test run
   passes on the version you will ship, even when the task names no test: one
   run with a payload the automation accepts, made before the first round (so
   there is an outcome to compare) and again after the last. Rerun any test
   the task names the same way. If a run shows a round changed an outcome,
   returned values included, undo the whole round and record its checks as
   exceptions with the reason `fix would change behaviour`. A fix round with no
   test run after it puts `Test not run: <reason>` in `unverified`.
8. **Report.** A read-back line per automation: `<automation name>: best
   practice 94 (27 of 29 checks) after 1 fix round, first read 71, version 3`,
   the two numbers being the last read's `passedChecks` and `totalChecks`. A
   first read already at 90 or more is `best practice 94 (27 of 29 checks), no
   fix round needed, version 3`. One that stays under 90 says `best practice
   82 (24 of 29 checks), under 90 after 2 fix rounds, first read 71, version
   3`. One `notes` line per check left, never
   prose and never two checks in one line, which the main session shows the
   person:
   `best practice exception: <checkId> <checkTitle> · <impactedEntityName(s)> · <reason>`.

## What the person hears

Report the automation name, the tested outcome, the returned status, and the
external read-back when one was expected. Say the final best practice score
and each exception. Keep node outputs and run ids in the task report unless
the person asks for details. Deployment remains a separate, explicitly
authorised action.
