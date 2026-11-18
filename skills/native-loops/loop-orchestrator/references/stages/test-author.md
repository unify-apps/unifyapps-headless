# Stage: test-author

Keep test creation and execution separate. The test loops are WEB only: on a
MOBILE app they stop and say so. Each command's own file says where its cases
live and how they run.

## WEB

- `/ua:app-discover-test-loop` reads the PRD, writes PRD-cited cases into
  `tests/<app slug>/design/cases.json`, reviews them in one HTML page in
  `tests/<app slug>/loops/<firing id>/` and writes the approved list,
  `cases.md`. With `--walk` it first starts `/ua:app-test-discover-loop`,
  which drives its own browsers and brings what it finds in as cases; the
  orchestrator's queue and runners stay idle either way, and nothing is
  written to Test Studio.
- `/ua:app-build-test-loop` hands `cases.md` to `/ua:app-test-create-loop`
  as its case source and records each case's Test Studio id or parked reason
  from the create loop's run file. The create loop drives its own browsers;
  the orchestrator's device queue and runners stay idle.
- `/ua:app-run-test-loop` picks a Test Studio suite or plan and starts
  `/ua:app-test-triage-loop run <name>` on it, which runs it, polls it and
  classifies the reds; then it writes one HTML report under
  `tests/<app slug>/loops/<firing id>/` with the verdicts and the trend from
  `tests/<app slug>/loop-ledger.json`, the ledger the Test Studio loops share.

App configuration remains read-only, and a ticket write
still needs the person's write-back approval.
