# The PRD of an automation

The shape every `/ua:automation-scope-loop` run writes, for one automation or
a set that works together. Every section appears; one with nothing yet says
`Open` and names who answers it. Requirements are numbered `R<n>`, their
acceptance lines `A<n>.<m>`; the build loop proves each line with a test run,
and the fix loop re-runs them.

```markdown
# <Automation name> — PRD v<n>

## Job
One paragraph: what happens, when, for whom, and what must never happen
(a duplicate email, a record changed twice, a payment retried).

## Triggers
One line per automation: `<name> · <trigger: a record created or changed in
<object> · a schedule <cron, in which time zone> · a webhook from <system> ·
called by <page, agent or automation>> · <how often, how many at once>`.

## Inputs and outputs
Per automation: the input it takes (fields and types, which are required),
what it returns to a caller, what it writes (records, fields), what it sends
(emails, messages, calls to other systems).

## Steps
Per automation, the steps in order, in words: read this, decide that, write
this, notify them. Branches named. Where a step waits on a person.

## Systems and connections
Every external system touched, the connection it uses, what it is allowed
to do there, and the test account for it.

## Rules
Idempotency (what makes a run safe to repeat), ordering, limits and rates,
what is logged, who is told when it fails, how long a run may take.

## Requirements
`R<n> · must | should | could · <one sentence>`, each with acceptance lines
the test runs replay: `A<n>.<m> · Given <records and input> → <the run ends
with: records, fields, outputs, messages> · checked by: <a record read, an
output value, a message received>`.

## Failure handling
What a failed step does: retry how many times, roll back what, leave which
marker, notify whom. What a partial run leaves behind.

## Rollout
Where it is deployed first, with which test data, what "good enough to
deploy to production" means.

## Open questions
`Q<n> · <question> · <who answers> · <blocks R<n>?>`

## Current state
Only when automations exist: each one's trigger, inputs, steps, callers and
dependents (`cache wf --deps`), deployed version, recent run counts.
```
