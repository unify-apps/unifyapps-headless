# Self-review: every loop run ends by saying what in the loop should improve

A loop is text, briefs, scripts and tools. When a run is slower or wrong
because of them, that is the loop's defect, not the app's, and the loop says
so at the end of the run: in one short file, and, when the same thing keeps
happening, as an offer to report it with `/ua:give-feedback`. It reads the
run's own files, never a transcript, and sends nothing: a report leaves the
laptop only when the person runs `/ua:give-feedback`.

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`;
`R` is the run folder (under `.nebula/loops/runs/` for a loop on the
orchestrator; the loop's own run folder otherwise).

## During the run: record locally

The moment the loop knows, one line in the run folder:

```bash
S add --run <R> --key <key> --stage <stage> [--tool <tool>] --reason "<one line>"
```

| Key | Add it when | Offered as |
| --- | --- | --- |
| `tool-error` | a tool answered an error, a wrong shape or a timeout twice for the same call, or a script of the loop crashed | a Self Bug Report after 2 runs |
| `lint-trap-false` | the lint or a check refused something the person then allowed as right | a Self Bug Report after 2 runs |
| `stage-retry` | a stage went to attempt 3 for the same reason, or a fix task was needed for a cause the stage's text should have prevented | a Self Bug Report after 3 runs |
| `prose-gap` | a builder answered `needs_confirmation` for something the brief or the stage should have said, or the loop had to read a reference twice to find a rule | a Self Feature Request after 2 runs |
| `person-correction` | changes requested at a review, a plan rejected or revised by hand, an escalation the person resolved with a rule the loop did not have | a Self Feature Request after 3 runs |
| `parked-unsupported` | a case, a job or a request parked because the loop cannot do it (no loop, a manual step, a tool the platform does not offer) | a Self Feature Request after 3 runs |
| `router-miss` | the generic command had to ask what the ask was about, or a ticket named nothing | a Self Feature Request after 3 runs |
| `budget-miss` | a stage or a job passed its time budget without a platform outage to blame | a Self Feature Request after 3 runs |

The reason names the loop, the stage, the tool or script and the error
class in plain words. Never a stored value, a page's content, a client's name or a credential:
the person may paste it into a report.

## At the end of the run

Before the closing summary, after every other finish step:

1. `S finish --run <R> --json`. It appends the run's signals to the
   solution's ledger (`.nebula/loops/signals/ledger.jsonl`), counts each
   signal over the runs on this plugin version, and answers `due` (the
   records worth reporting now: kind, family, title, the runs behind it), `open`
   (already reported, a count added) and `skipped` (under the threshold, or
   over today's cap of 3). A run folder from an earlier run that never
   finished is swept in the same call, so a killed run loses nothing.
2. Write `R/self-review.md`: "What could be better about this loop", one
   line per signal and per thing this run's files show that a signal did not
   catch (a brief read twice, a check that ran and found nothing, a question
   answered the same way twice in this run): the stage, what
   happened, what the loop's text, brief, script or tool should do
   differently. At most eight lines. From `R`'s files only.
3. Name each `due` record in the closing summary, one line each (its
   kind, family and title), and offer `/ua:give-feedback` to report them.
   Send nothing yourself. When the person runs it and a record is saved,
   `S filed --run <R> --key <signal key> --record <record id>` marks it, so
   the next run adds a count instead of offering it again.
4. The closing summary ends with one line:
   `Loop review: <n> signals · due <m> (<kinds>) · R/self-review.md`.
   With no signal and nothing in `R/self-review.md`:
   `Loop review: nothing to improve from this run.`

## Two exceptions to "at the end"

- **A hard stop.** A tool that fails the same way twice and stops the run
  is counted at once: `S add`, then
  `S finish --run <R> --now --json` (`--now` makes this run's signals due
  whatever their count), then steps 2 and 3 above, because there will be no
  finish.
- **A rule the person gives.** When the person resolves a correction with a
  rule for this app ("always X here"), `ua memory remember` keeps it on
  the solution now; the next run reads it. It stays on this solution; nothing is filed.

## Counting

Nothing is sent and no question is asked: the summary line says what is
due, and the person decides whether to report it. A signal is
counted per run, never per retry inside a run. The count resets when the
plugin version changes, since the fix may have shipped.
