# Run execution

Read this before dispatching work, changing priority, or judging a result.
Use the existing board, shared brief, job state and evidence files. These
rules do not grant new permissions or replace [approvals](approvals.md),
resource reservations, per-request data restoration, or run limits.

## Settle decisions once

Before asking, read the person's request, the run's recorded answers and
`BRIEF-COMMON.md` when present. Reuse an answer only while its scope and conditions still
hold. A retry, agent handoff or resumed run does not cancel that answer.

Ask only for a missing fact that blocks correct work, a material choice with
no reasonable default, or an action the approval rules still require.
For routine reversible choices within the approved scope, choose a sensible
default, record it in the shared brief, and continue. Do not ask whether to
continue work already requested. An unanswered question grants no permission.

Collect related missing facts in one request when they are known together.
Keep releases separate where the approval rules require separate questions.
An agent reports a blocker to the orchestrator; the orchestrator checks the
recorded decisions before asking the person. Progress updates say what was
proved, what remains and what happens next. They do not end with a routine
confirmation question. Independent approved work continues while an answer
is pending.

## Prepare the job before dispatch

Each job brief names:

- The requested outcome, scope, owner and remaining time or attempt budget.
- Existing permissions and their conditions, plus actions that still need approval.
- Access, tools, resource reservations, build and configuration to use.
- The test user and fixture, required permissions or editability, and the
  saved navigation flow. Use test identities, never credentials.
- The hypothesis, smallest representative check, required correctness checks,
  and measurable acceptance criteria. For an exploratory audit, name its
  coverage and output criteria instead of inventing a performance target.
- The evidence paths, current checkpoint and next action.

Check the prerequisites needed by the job before starting its costly work.
If access, editability or navigation cannot be established, record the
failed prerequisite and its next check. Do not dispatch the measurement as
though it were ready, and do not spend a fix attempt on an environment failure.

## Keep ownership and priority stable

Batch related checks that use the same device and setup under one runner,
within its reservation and time limits. Parallel agents may inspect config,
review code or test on separately reserved devices. They never drive the same
device or edit the same target together. Keep fixture restoration at the
existing request boundaries; batching is not permission to retain changed data.

Resume the current owner when it can continue. A replacement first reads the
job state, navigation flow, failed attempts and evidence. It does not repeat
finished work unless the state changed or the evidence is invalid.

The job's `R/jobs/<job>/state.json` names its one owner (`agent`). The
orchestrator sets it at dispatch (`--agent <the name the brief gives the
agent>`), and before it takes a stage over from an agent that has gone quiet
(it finishes the work itself, or hands it to a replacement) it records the
new owner there first:
`loops run job-state --run <R> --job <job> --step "taken over from <old agent>" --agent <new owner>`.
An agent that outlives the takeover must not write over the new owner's
files, so every stage agent re-reads that file before each write into `R`;
when `agent` is no longer the name its brief gave it, it writes nothing, logs
one `error` event (`"taken over; wrote nothing"`) and ends. The shared brief
carries this rule ([builder brief](builder-brief.md) § Hard rules 10).

Keep pending work on the board in priority order. Finish the active experiment
before starting another on the same resource. When the person changes priority,
checkpoint the current work and state what pauses. An unrelated finding goes
on the queue; it does not silently enlarge the active job or its permissions.

## Bound retries and close each result

After two failed tries at the same step, stop that method. Record the failure
and diagnose it. Another attempt needs new evidence or a changed method and
must fit the original job budget. A new agent, a requeue or a renamed job does
not reset that budget. A resource-lock denial is final for that resource;
it is never retried under this rule. Follow the stricter limit when one exists.

Before expanding an optimization, measure one representative case against its
acceptance criteria. A theory or a local render-count improvement alone does
not establish a user-visible gain.

Judge every required check from its artifact, not just the agent's footer.
Missing checks, stale state and uncontrolled comparisons leave the result
incomplete. Preserve valid partial evidence and name the remaining check.
Use the existing board states; do not mark such a job `passed`.

For each experiment, record the versions, raw measurements, correctness
results and a decision: keep, revert, or blocked with the next check. A keep
needs all required checks to pass and the target improvement to be supported
by comparable evidence. Inconclusive data is not proof of a regression and
is not permission to discard a working change. Follow the measured-fix undo
procedure for an unproven trial change. The closing update reports verified
outcomes, unresolved checks and blockers, rather than agent or tool activity.
