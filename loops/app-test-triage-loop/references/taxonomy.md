# Taxonomy — classes, routes, verdicts, history tags

## Contents
- Classes and their signatures
- Routes
- Verdicts and the residue rules
- Root causes
- History tags
- Shared cause
- The evidence a red carries

Applied by `app-test-author/scripts/loop.mjs` (`classify`, `history`,
`annotate`) and, for the residue, by the analysing agent. Both loops use
this one table, so a red the heal loop refuses and a red the analysis
routes to it mean the same thing.

## Classes and their signatures

The first signature that matches the red's error text decides, in this
order. The error text is the failing step's own `error` followed by the
first test's `error` in `OUTPUT` (else `ERROR_SUMMARY`), both read from the
browser that failed (`browser`, below). The step's error
comes first because a click on a missing element fails at the test
timeout, and only the step's call log names the locator it waited on.
Quoted text in it (an accessible name, a test id, a typed value) never
decides a class: `waiting for getByRole('button', { name: 'Duplicate' })`
is a locator red, not a data red.

Only reds are classified. A row that passed, or is still `QUEUED` or
`RUNNING`, is left out.

| Class | Signature in the error text | Decided by rule |
|---|---|---|
| `infra` | `DEADLINE_EXCEEDED`, `fail-fast`, `No platform_automation record`, service unavailable, HTTP 502/503/504, connection refused or reset (`ECONNREFUSED`, `ECONNRESET`, `net::ERR_CONNECTION_REFUSED`/`RESET`), the browser closed; or a whole-execution `TIMED_OUT` with no failing step, whatever its text | yes |
| `auth` | session-mint failure, HTTP 401/403, unauthorized, a login wall, session expired | yes |
| `navigation` | `page.goto`, `net::ERR_*`, name not resolved, a navigation timeout, `waitForURL` | no — shared across cases it is environment, alone it may be an app bug |
| `data` | duplicate, already exists, unique constraint, a record not found | yes |
| `step_shape` | detached from the DOM, not enabled, disabled, `beforeunload`, leave page, unsaved changes (the fix-round failure table's readiness-pair and dirty-surface rows) | yes |
| `locator` | strict mode violation, resolved to N elements, waiting for `locator(...)` / `getBy...`, not found, not attached, waiting for visible/enabled/stable; and an `expect()` that timed out waiting for a locator | yes |
| `assertion` | `expect(...)`, `toHaveText`, `toBeVisible` with a received value, `Expected:` / `Received:`, an assertion error | no |
| `unknown` | none of the above | no |

`wrong_element` is never set by rule: it is what the heal loop's live
check finds when a locator resolves to a node that is not the one the step
means (`app-test-author/references/heal.md`, _Classification gate_). The
analysis routes an `assertion` red that follows an action step on a changed
page to the heal loop as a suspected wrong element only when the agent's
screenshot read says the action landed on the wrong control.

## Routes

A route says who acts next; the report groups by **outcome** (Healed, App
bugs, Test defects, Runner issues, Environment, Flaky, Needs a person),
which a red reaches from its heal-loop row, else its verdict, else its
class (`loop.mjs report`). An `infra` red is a Runner issue in the report
although its verdict reads `Environment`: the tenant's run service failed,
not the tenant.

| Route | Classes | What happens next |
|---|---|---|
| `heal` | `locator`, `wrong_element` | `app-test-heal-loop`, in the same firing with `--heal` |
| `update` | `step_shape`, `data` | the heal loop's update job re-authors the case from its description, in the same firing with `--heal`; else an update run of `app-test-author` |
| `agent` | `assertion`, `navigation`, `unknown` | the residue: the agent reads the evidence and sets a verdict; the heal loop then replays each one live for its root cause |
| `ai` | a red whose outcome a model decided (the heal loop's `ai dependency`) | the report's **AI dependency** section: counted and set aside, nothing is changed |
| `environment` | `auth`, any class on the deployed app under a shared cause | reported; nothing is changed |
| `infra` | `infra` | reported with the signature; no heal, no re-run |
| `flaky` | any red whose single re-run passed | reported with both execution ids; counted, not fixed |
| `bug` | a residue red the agent judged an app bug | the report's **App bugs** section: case and step, what the step expected and what the page showed (the assertion's own Expected and Received when it has them), the screenshot file, video offset and re-run; nothing is changed |

## Verdicts and the residue rules

The verdicts a person sees: `App bug`, `Test defect (locator)`, `Test defect
(step shape)`, `Test defect (data)`, `Test defect (assertion)`,
`Environment`, `Flaky`, `AI dependency`, `Product question`, `Unknown`.
`Product question` comes only from the heal loop's live replay: the app no
longer does what the case's description says, and only the area's owner
can say whether that was meant. Rule-decided classes map directly:
`locator` and `wrong_element` → `Test defect (locator)`; `step_shape` and
`data` → their test defect; `auth` → `Environment`; `infra` → `Environment`
(infrastructure named in the evidence). `classify` writes these verdicts
itself, with `rule: <class> signature in the error text` as the evidence.

For the residue the agent answers one question per red, from the failing
step's screenshot, the same step from the last green run when there is one,
the step list and the history tag:

1. Does the page at the failing step show the feature doing something
   other than what the assertion expects, with the test's own records
   present? → `App bug`, route `bug`.
2. Does the page show the expected outcome under a different label, value
   or position, so the step's expectation is stale? → `Test defect
   (assertion)`, route `update`.
3. Does the page show a loader, an empty shell, a login wall or an error
   page? → `Environment`, route `environment`.
4. Did the action land on the wrong control (the screenshot shows another
   element changed)? → `Test defect (locator)`, route `heal`.
5. None of these with confidence → `Unknown`, with what was seen.

A re-run that passes overrides any of these with `Flaky`. The verdict row
always names its evidence: the screenshot file, the history tag, the re-run
id, or "error text only" in fallback mode.

Two facts the classification reads off every red, whatever its class:

- **`checksPassedBefore`**: every verification step of the case passed and
  the failing step is not one, so the red is in the case's cleanup. The
  report tags the red `[checks passed; teardown red]`, and the verdict
  stays what the evidence says; the feature the case verifies worked.
- An **AI-dependent** case says so in its description (`AI-dependent: …`,
  written by the author); the heal loop's replay reads it, and a red whose
  outcome a model decided gets the verdict `AI dependency`, route `ai`.

## Root causes

The heal loop ends every case it did not make green with one root cause
from this vocabulary (`app-test-heal-loop/references/policy.md`, _A
diagnosis and its root cause_); `loop.mjs check-heal` refuses any other
word, and `loop.mjs heal-report` groups the still-failing cases by it. The
verdict column is what `loop.mjs heal-tags` hands back to the analyse
firing, so its report and the ticket loop see the live finding.

Every report heads a group `<family> — <cause>`. The family is the root
cause in a person's words (`test design` → Test design, `data isolation`
→ Test isolation / data, `ui changed` → UI changed, `stale expectation`
→ Stale expectation, `ai dependency` → AI dependency, `transient` →
Transient, `app bug` → App bug, `backend` → Backend, `contradicts
description` → Description no longer holds, `feature missing` → Feature
removed, `needs choice` → Needs a choice, `no stable hook` → Fix found,
but only a positional locator, `extension panel` → Extension panel,
`browser specific` → Browser-specific, `environment` → Environment,
`not replayed` → Not replayed, `branch preview` → Ran on a branch preview; a
red on a preview an environment event stopped is Environment, on a preview; a
rule-decided red not yet replayed is Locator, an `infra` red Runner
issue, an undecided red Needs a person). The cause is the defect in
plain words: for `app bug`, `backend`, `ui changed`, `feature missing`
and `contradicts description` the heal loop's main session names it on
every row (`app-test-heal-loop/references/policy.md`, _Naming a cause_)
and the analyse residue read names it on every `App bug`; a group no
cause was named for takes the title of the ticket that holds it, else
the family's fixed summary (`Test design — timing, waits or step shape`,
`Locator — an element the step waits for was not found`). Never the
error text or the step: those stay on each case's line.

| Root cause | Means | Route | Next step | Verdict handed back |
|---|---|---|---|---|
| `test design` | a wait, a step shape or an action the walk shows is wrong (a missing readiness pair, a reveal on the wrong marker, a `clear` that does nothing) | `update` | the update job re-authors the steps | `Test defect (step shape)` |
| `data isolation` | a premise in shared or leftover data: another user's record, a count over a shared list, a first-card assumption | `update` | the update job makes the case create, find and count its own records | `Test defect (data)` |
| `ui changed` | the behaviour exists, its elements moved or were redesigned | `update` | the update job re-authors against the new UI, every stated check kept | `Test defect (locator)` |
| `stale expectation` | the app changed on purpose; the check expects the old behaviour; the description still holds | `update` | the update job changes the expected value | `Test defect (assertion)` |
| `ai dependency` | the outcome was a model's reply arriving, its timing or its wording | `ai` | set aside; updated only when an app-controlled fact carries the same outcome | `AI dependency` |
| `transient` | the whole case replayed green unchanged, nothing waits on a model | `rerun` | one platform re-run; green → `flaky` | `Flaky`, or `Unknown` when the re-run was red too |
| `app bug` | the intended node found, the action landed, the app answered other than the description says, twice | `bug` | a bug ticket (`app-test-ticket-loop`) | `App bug` |
| `backend` | the app shows a service's error: a workflow failed, a connection missing, a sync that never finished | `bug` | a ticket for that service | `App bug` |
| `contradicts description` | the description itself no longer holds | `person` | a product-question ticket to the area's owner (`app-test-ticket-loop`): a regression to fix, or the case rewritten or retired | `Product question` |
| `feature missing` | the surface or control is gone | `person` | a product-question ticket: removed on purpose, then the cases are retired; else a regression | `Product question` |
| `needs choice` | two or more candidates for one element | `person` | a person picks | `Test defect (locator)` |
| `no stable hook` | a fix exists but only a positional or class locator reaches the node | `hook` | ask the app for a static hook, then heal | `Test defect (locator)` |
| `extension panel` | the failing step acts in an extension's side panel | `person` | an update run by a person | `Unknown` |
| `browser specific` | red on Firefox or Safari, and green on Chromium in the same run or not run on Chromium; set aside by `loop.mjs intake`, since every helper walks in Chromium | `person` | a person replays the case on the browser it failed on | `Unknown` |
| `environment` | a sign-in, a cost or rate limit, the tenant down | `retry` | `--retry <firing>` once the event is over; on a branch preview, Environment, on a preview: run the cases again on the preview once the environment lets them through, never `--retry` | `Environment` |
| `not replayed` | the budget, a shared cause, a missing sign-in, an `infra` red | `retry` | `--retry <firing>`; never for a red on a branch preview | none |
| `branch preview` | the red came from a run on a pull request's preview (`platform-tools.md`, _Running on another domain_); set aside by `loop.mjs intake`, since the helpers replay on the deployed app; a diagnosis never names it | `person` | fix it in the pull request, then run the cases again | `Unknown` |

**An AI dependency comes first.** A case with even one step that waits on
a model (a chat reply, a generated artifact or diagram, suggestions, a
title or a cost the reply decides) and whose red is that output arriving
late, not arriving, or saying something else is `ai dependency`, whatever
a first look calls it: a wait sized for a fast reply is not `test design`,
a red that does not reproduce on the replay is not `transient`, and a model
cost or rate limit met in the replay is not `environment`. The same holds
for an update whose green gate stays red only because the model did not
produce what the case needs. A red at a step before the first model step,
or an error the app shows from a service (a missing connection, a failed
workflow), keeps its own root cause. AI dependencies are counted, not
fixed: the ticket loop adds the count and the cases to the tickets
contract's AI dependency ticket.

## History tags

From a case's executions newest first (the current red first), settled
runs only (`PASSED`, `FAILED`, `ERROR`, `TIMED_OUT`), a window of 10:

The first rule that holds decides, in this order:

| Tag | Rule |
|---|---|
| `first_run` | no earlier settled run |
| `always_failing` | the 4 runs before this one all failed, with the same error key when one is given |
| `intermittent` | at least 3 pass/fail flips in the window |
| `new_failure` | the run before this one passed |
| `repeat_failure` | the run before failed, but too few runs or a different error to say always |

A history row carries only its `ERROR_SUMMARY`, so the key compared is the
red's `summaryKey`, never its `errorKey`, which starts from the step's call
log.

The tag sharpens a verdict but never sets one: an `always_failing` locator
red is still healed; an `intermittent` assertion red is still re-run once.

## Shared cause

The circuit breaker, checked before any screenshot read, re-run or heal:

- `same_error`: the largest group holds at least 3 reds and at least a
  quarter of the run's reds;
- `early_failure`: at least 3 reds failed within the first 3 steps and they
  are at least half of the run's cases (`--total`, the run's `TOTAL_COUNT`).

It is read from the reds on the deployed app only: a pull request's
breakage on its preview is the pull request's, however many cases share it,
and a run with no deployed red has no shared cause. When it fires, `classify`
sets every deployed red's route to `environment` and its verdict to
`Environment`, with the shared-cause line as evidence. It keeps
the rule's class as `ruleClass`. The firing makes no other call. The
thresholds are the script's defaults. `--minimum` changes the first only:
`early_failure` always needs 3.

## The evidence a red carries

| Field | Where it comes from |
|---|---|
| `browser`, `browsers` | `OUTPUT` and `ARTIFACTS` hold one result per browser the case ran on, keyed `CHROMIUM`, `FIREFOX`, `WEBKIT`; `browser` is the first that failed (else the first), and every field below is read from its result; `browsers` is each browser's status |
| `error`, `errorKey` | the failing step's `error`, then the first test's `error` in `OUTPUT`; the key normalised: ids, timings and numbers collapsed, the call-log locator line kept |
| `summaryKey` | the execution's `ERROR_SUMMARY`, normalised the same way: what a history row can be compared with |
| `failingStep.position`, `.title` | the first failed step in `OUTPUT.tests[0].steps`, else in `ARTIFACTS[...].stepDetails`; position is 1-based, by order, matching the numbered `/* N. label */` comments in the run's `INPUT.script` |
| `failingStep.screenshot` | `stepDetails[position].screenshot`, the file reference `get_artifact_content` takes verbatim; `null` for a step that timed out, which takes no screenshot |
| `failingStep.videoOffsetMs` | where the step starts in the recording |
| `checksPassedBefore` | the step titles of `OUTPUT.tests[0].steps`: the last step whose title starts `Verify` or `Execute JavaScript and verify` comes before the failing step, which is not one |
| `historyTag` | `fetch_test_case_executions`, or the ledger in fallback mode |
| `rerun` | the second execution id from `run_test_cases` and its result |
| `rootCause` | the heal loop's diagnosis, handed back through `loop.mjs heal-tags` |
