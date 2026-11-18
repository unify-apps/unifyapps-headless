# Verify — statuses, the ticket's cases, the comparison, the comment, the hand-over

## Contents
- The statuses
- A ticket's cases
- Same failure or not
- The verdict
- The comment
- The hand-over
- The report

## The statuses

A verdict names one of three statuses of the team the bug-tickets contract
names, and the person moves the ticket to it. They are contract fields, in
`tests/<app slug>/tickets-contract.md`:

| Field | Default (matched by name, ignoring case) | Meaning |
|---|---|---|
| Testing status | the team's status whose name contains `QA` or `Testing`, the first by position when several | a developer has fixed and deployed; the ticket is ready to verify |
| Rejected status | `QA Rejected` | the re-run still fails the ticket's own way |
| Done status | the team's status in the done category, `Done` when several | verified, or the ticket's bug is gone |

A contract whose status fields are empty and whose defaults the person
cannot confirm is a kickoff finding, told to them once, and the run stops:
a verdict that names no status says nothing. The person names the three
statuses their team uses in the contract.

## A ticket's cases

The ticket loop wrote one ledger row per ticket,
`executionId: "ticket:<fingerprint>"`, from `loop.mjs tickets-rows`: each
case with its `testCaseId`, `name`, `class`, `errorKey`, `summaryKey` and
`failingStep` as the triage loop classified it. Those are the cases this
loop runs and the failures it compares against. A ticket filed by hand, or
by an older run without the row, has its cases only as the `Failing test
cases` list in its description; they are matched by name with
`fetch_test_cases`, one call per name passed as `name`, keeping the row
whose name equals it exactly, and such a ticket can be `fixed` or `rejected` only
when every name matched. The `verify` command takes the row as a JSON
file, so the session writes the ledger row it read to `<firing>/rows/`.

## Same failure or not

`loop.mjs verify` classifies each re-run red with the triage loop's
rules (the same `classify` the triage loop runs) and calls it the same
failure as the ticket's when any of these holds:

- the normalised error key is the same (ids, timings and numbers
  collapsed, the call-log locator line kept);
- the platform's `ERROR_SUMMARY`, normalised, is the same;
- the class is the same and it fails at the same step position.

Anything else is a different failure. The comparison is on the text and
the step the platform recorded, never on a screenshot, so two runs decide
the same way.

## The verdict

| Verdict | When | What the loop writes |
|---|---|---|
| `fixed` | every case of the ticket passed | comment file, status asked for → done |
| `rejected` | at least one case fails the same way | comment file with the evidence, status asked for → QA Rejected |
| `changed` | no case fails the same way, at least one fails another way | comment file saying the ticket's bug is gone and what replaced it, status asked for → done; the new red goes to the triage loop |
| `incomplete` | a case is still queued or running after the polls, or the app no longer has it, or the ticket names no case the loop can find | no comment file and no status; named in the report; the next firing tries again |

A `rejected` verdict wins over everything: one case still failing the
ticket's way is enough. `changed` is a verdict on this ticket only; it
says nothing about whether the new failure is a bug.

## The comment

`loop.mjs verify --comment-out` renders it, in markdown a tracker takes,
and the person pastes it verbatim:
the verdict in bold with the run id, then one line per case, passed, same
failure with its step and first error line, different failure with its
step and error, or unsettled. Nothing is added by hand, so a developer
reading two tickets reads the same shape.

## The hand-over

A `changed` verdict, or a red in the re-run on a case no in-scope ticket
names, is a failure nobody has judged. The loop starts
`/ua:app-test-triage-loop <runId> for <app URL>` on the re-run, then,
once that firing's judge has passed, `/ua:app-test-ticket-loop --from
<its firing id> for <app URL>`, which groups the reds by root cause and
asks the person before it files. The hand-over is the same two commands a
person would type, so this loop never files a ticket itself. The analyse
firing's id goes in this firing's report and firing row.

## The report

`<firing>/verify-report.md`:

```text
# Verify tickets <firing id> — <app name>

<n> fixed · <n> rejected · <n> changed · <n> incomplete, of <n> tickets; re-run <runId>, <n> cases.
```

Then **Fixed**, **Rejected**, **Changed** and **Incomplete**, each a list
of `<key> — <title> — <counts> — <status before> → <status after>` with
the comment file; **Hand-over**, the analyse command started or "none";
**Run facts**: the run id, polls, unsettled executions, each line of
`reportLines`. The final message only names the path (`SKILL.md`, _The
last message is short_).
