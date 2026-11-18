# The run report

`tests/<app slug>/loops/<firing id>/report.md`, written once, after every
case is terminal and the evaluator has given its last answer, and holding
that answer. Every fact comes from `run.json`, the evaluator's answer and
Test Studio reads; nothing is written from memory. The final message
only names its path (`SKILL.md`, _The last message is short_).

It opens with four lines that say how the run went:

```text
# Create loop <firing id> — <app name>

<n> saved · <n> authored · <n> parked, of <n> planned. Evaluator: <met | not met: checks …>, <n> rounds. Budget: <not reached | reached: <which>, <n> cases parked>.
Coverage: <n> of <m> behaviours the survey saw have a saved or authored case; <n> are only in parked entries, each with a reason.
```

The Coverage line counts the inventory ids of the run file's `surveyFiles`
against the `covers` of its entries.

Then six sections, in this order, and no others:

## Saved

Grouped by module, then by feature, then by priority (P0 first). One line per case:
`<name> — <priority> — <link to the case in Test Studio>`, the link built
from the platform screen URL and the case's `testCaseId`. Head the section
with the count: `## Saved (<n>)`. When the contract's submit mode does not
submit, the section is `## Authored (<n>)` and each line gives the case's
payload file in place of the link.

## Parked

Head it with the count. Grouped by reason, in the fixed order of
`policies.md`, _The parked reasons_: `policy exclusion`, `observed
behaviour differs`, `real file required`, `capability missing`, `gate
budget spent`, `platform failure`, `unanswered question`. One row per
case, every parked entry of `run.json` included, those parked at Plan:

| Case | Reason | Evidence |
|---|---|---|
| `<key> — <name>` | the reason, with its detail | the error, the read, the file or the question that shows it |

## Would have asked

Every question first met after kickoff that no contract field decided,
those a policy answered by parking included (`run-contract.md`, _A
question first met mid-run_), as a contract field the person can add
before the next run:

| Proposed field | Default the loop would pick | Cases it parked |
|---|---|---|

When there were none, one line saying so.

## Hook requests

Every `needs hook:` line the helpers reported (`durability.md`, _A hook
the app does not have_), one row per element, so the app's team can add a
static hook and the heal loop can then re-point the element:

| Surface | Element | Hook that would do | Cases |
|---|---|---|---|

When there were none, one line saying so.

## Run facts

- Wall-clock: `kickoffEndedAt` to the evaluator's last answer, and the
  run budget: cases dispatched and minutes used of the contract's, and
  whether it stopped the run.
- Helper-hours: the sum of each helper's time from `dispatchedAt` to its
  report.
- Stalls and recoveries: one line per entry of `stalls`, with whether it
  recovered.
- Sessions refreshed: per user, how many times.
- Cap changes: each, with its time and why.
- Each line of `reportLines`: a helper not started, a folder not removed,
  a planted instruction with the page it was found on.
- The evaluator: its answer per check, one line each with the result and
  its reason, and how many rounds it took.

## Suite and plan changes

Each suite made or changed (name, the cases added) and the plan each was
added to, with links. When the contract's grouping field named no plan,
one line saying no plan was changed.
