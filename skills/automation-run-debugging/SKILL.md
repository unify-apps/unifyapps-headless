---
user-invocable: false
name: automation-run-debugging
description: Read when an existing automation is broken, stuck, produces the wrong value, completes without the expected effect, or has a failed run. Covers safe reproduction, run evidence, silent failures, and repair through Workflow Agent. Not for authoring test cases, suites, or plans.
---

# Automation run debugging

Diagnose the observed run before editing the TypeScript. Keep the automation's `workflowId` through every repair.

## Reproduce and inspect

Open the saved TypeScript and inspect existing runs first. A request to repair authorizes editing and saving the workflow definition. Execute or deploy within the user's requested scope; ask before additional effects such as sending messages or changing external records.

Use the tools in this order:

1. `open_workflow` reads the code.
2. `list_workflow_runs` finds prior TEST or deployed RUN evidence.
3. `inspect_workflow_run` reads one selected run. Omit `nodeIds` first, then request only suspect nodes.
4. `compile_and_save_workflow` checks and saves the edited code with the same `workflowId`. Fix its code diagnostics and resubmit until the response confirms success.
5. `trigger_workflow_run` runs the already-saved automation. Prefer `workflow_test`; use `workflow` only when the user asks to run the deployed version.

## Prepare realistic input

Use real input shapes. Do not invent ids, dates, enum values, nullability, or nesting when tenant evidence exists.

1. For each Storage object read or written, use `describe_storage_object` and a small `fetch_storage_records` sample.
2. List both `workflow_test` and `workflow` history. Prefer recent runs matching the trigger.
3. Inspect without `nodeIds`, poll to a terminal status, then inspect the START node. Compare multiple payloads when the trigger varies.
4. Build test input from those shapes and check it against the current trigger contract. Historical payloads can be stale.

Minimize returned data and omit sensitive row or trigger values from the report. Choose test inputs whose execution effects are within the user's authorization.

Both run lanes execute connector actions. Use `workflow_test` for the saved definition; a request to run the deployed definition selects `workflow`. A timeout or trigger fault may still have started a run, so list and inspect recent runs before triggering again. This prevents duplicate sends and writes.

Use `inspect_workflow_run` in two passes:

1. Omit `nodeIds` to read the terminal status and the execution summary.
2. Request only the failing node and last unexpected node. Read input before output or error. Use one node per call for large payloads.

`COMPLETED` proves that execution ended. It does not prove the result is correct. Compare the final output and any external effect with the user's requested outcome.

## Classify the failure

- A thrown node failure is a workflow defect only when its recorded input, configuration, or mapping is wrong.
- Timeouts, rate limits, inactive connections, missing permissions, and unavailable tenant data are environment failures unless the workflow should handle them.
- A completed node can still fail silently. Check for `success: false`, empty results, zero loop iterations, an unused pagination cursor, a missing input key, or a null value dropped before the connector call.
- A retry after an ambiguous timeout can repeat a non-idempotent create or send. Check `retryCount` before treating duplicates as separate trigger events.
- For Call Automation, read the called automation id from `definition.input`, then inspect `childRunId` with that id and the same `runType`. Run listing omits concurrent children. The caller uses the child's deployed version.
- `assertions` is `null` for ordinary workflow runs. Test-case node details populate it with the recorded assertion verdicts, including successful and failed assertions.

Use the recorded input and full error object to identify the bad statement or value. A compiler diagnostic describes a code correction; a runtime failure needs the run evidence to distinguish code from access, data, or service availability.

## Repair and verify

Edit the TypeScript statement that owns the bad value or behavior. Do not patch workflow JSON or repair edges by hand.

Call `compile_and_save_workflow` with the edited code and the same `workflowId`. Correct the referenced lines until it returns `ok: true`; that confirms the repaired definition is saved. If the original automation no longer exists, the tool creates a new one. Use the returned `workflowId` for subsequent edits and runs. Then decide whether the repair needs a test or deployment under the main authoring procedure. For a test, use `trigger_workflow_run` on `workflow_test` and read the returned run and node details. If it returns only a `runId` after one minute, inspect that run later. After an ambiguous trigger response, use `list_workflow_runs` before triggering again.

Report the cause, the evidence that identified it, what changed, the new run result, and whether the automation is saved or deployed. A saved automation is not deployed.
