---
name: app-discover-test-loop
description: Discovers and reviews the manual test cases of a UnifyApps WEB app from its PRD, and with --walk from a walk of the live app as well. Each case cites the requirement and acceptance ids it proves, or the behaviour the walk saw; the cases are saved in the app's tests folder as the case source /ua:app-build-test-loop hands to Test Studio, and the person reviews them in one HTML page whose decisions the loop applies until every case is approved or rejected. Writes nothing to Test Studio and never changes the app. Use when the person asks to discover, write or review the test cases of a web app, or types /ua:app-discover-test-loop.
argument-hint: "<app> [flows, a ticket or a document that narrows the scope] [--walk]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion, ToolSearch
---

# App test discovery

Load `ua:loop-orchestrator` and follow it for this loop (goal
`test-author`). Its test-author stage keeps creation apart from execution:
without a walk the loop reaches no browser, so Health, Signed in and the
device queue are skipped; the walk is `/ua:app-test-discover-loop`'s own
run and does its own sign-in. Confirm the app through `loops platform <appId>` first; on a
MOBILE app, say "This is a MOBILE app. The test loops run on WEB apps
only." and stop.

The cases are the input of `/ua:app-build-test-loop`, which authors the
approved ones into Test Studio, and of `/ua:app-run-test-loop`, which runs
them. This loop only writes and reviews cases. It never writes to Test Studio,
never runs a case, and never changes the app, its data or its config to make
a case pass.

`C` below is `node "${CLAUDE_PLUGIN_ROOT}/loops/app-discover-test-loop/scripts/cases.mjs"`;
`L` is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs"`.

## The contract

`tests/<app slug>/design-contract.md` is the one place the person decides
how this loop runs on an app: the scope, whether to add to the cases or
start again, the case id prefix, and whether to walk the live app first
([design contract](references/design-contract.md)). It is filled at kickoff
and read again by every later run, so the second run asks nothing.

## Where the files live

`tests/<app slug>/` in the working folder, `<app slug>` the app's name in
lowercase with hyphens, the same folder the Test Studio loops use for that
app. The contract, the cases and the ledger outlive a run, under the
`design` names `/ua:app-build-test-loop` reads; `loops/<firing id>/`
belongs to one firing:

| File | What it is |
| --- | --- |
| `design-contract.md` | the contract, filled at kickoff |
| `design/cases.json` | every case with its decision and review history; the source of truth |
| `design/cases.md` | the approved cases in the scenario-list shape `/ua:app-build-test-loop` hands to Test Studio; written from `cases.json` at the end |
| `loops/<firing id>/review.html` | the review page of this firing, built from `cases.json` |
| `loops/<firing id>/review-decisions.json` | what the reviewer downloaded from that page |
| `loops/<firing id>/pages/<group>.json` | what each helper wrote before the merge |
| `loop-ledger.json` | shared with the Test Studio loops; this loop adds one `discover-loop` row per firing with its counts |

`L firing-id` makes the firing id. The orchestrator's own run folder keeps
the board, the log and the self-review.

## The input: the PRD

Before any case, read the app's PRD from the solution with the orchestrator's
`prd get <app> --part prd --json`. Its `text` holds the requirements `R<n>`
with their acceptance lines `A<n>.<m>`, the journeys, screens, data and rules;
`version` is the version the cases are written from. An app with no PRD stops
here with one line: "<app> has no PRD. Write it with `/ua:app-scope-loop`,
then run this again." Flows, stories, a ticket or a document the person adds
narrow the scope to part of the PRD or add a case it does not name; read a
linked document itself, a link alone is not its contents. The loop never
changes the PRD.

## Run it

1. **The contract.** Read `tests/<app slug>/design-contract.md`. Fill every
   field from its source (the command first, then the folder, then the
   file), and ask only the fields still empty that have no default, in one
   AskUserQuestion of at most four questions. Write the filled contract
   back, whole. Make the firing id and its folder.
2. **Read.** The PRD and the added input; `cases.json` when it exists and the
   contract says `add` (keep every id; mark each case new, changed or
   unchanged against it; `restart` moves the old file into the firing folder
   first); the app's pages, paths and menu from the cache
   (`cache app <appId>`), the route map (`loop-route-map`) and the test data
   (`loop-test-data`), so steps name real pages and records; and the app's
   Test Studio cases by name (`mcp__plugin_ua_app-testing__fetch_test_cases`
   on the app), so a scenario already automated is reused, not written
   again.
3. **The walk**, when the command says `--walk` or the contract's Walk field
   says `walk`. Start `/ua:app-test-discover-loop for <app URL>` in this
   session and follow it to its last message: its own contract, its sign-in
   of the test users, its traversal and its coverage check. Then
   `C import --cases tests/<app slug>/design/cases.json --scenarios tests/<app slug>/loops/<its firing id>/scenarios.json`:
   every scenario the walk proposed becomes a case with `source: walk:` and
   the inventory ids it checks, beside the PRD cases: the line the walk
   checks is the expected result, the lines after it the cleanup. A re-walk
   updates the case that checks the same ids as the same roles, a changed
   one goes back to pending, a case the new walk no longer proposes is marked
   gone and goes back to pending, and the walk's not-covered rows are kept
   in `cases.json` under `walks`. Say the counts, the gone cases and the
   not-covered reasons. A walk needs a published app; when `/ua:app-test-discover-loop` stops for that, say so and go on from the PRD.
4. **Author.** Split the pages into groups and dispatch one helper per group
   with the [helper brief](references/helper-brief.md), its fields filled
   (the rules file's full path, the contract's id prefix, the pages), each
   writing one JSON file under `loops/<firing id>/pages/`. A helper sees the
   walked cases as existing cases and does not write them again. Merge the files into
   `cases.json`, keeping existing ids, and run
   `C check --cases tests/<app slug>/design/cases.json`; up to two rounds of
   fixes, then a case still failing is dropped and listed with its reason.
   The rules are in [cases](references/cases.md): required flows first, exact
   expected results, a separate negative or edge case only for a named rule, a
   material risk or a known bug.
5. **Review.** `C review build --cases <cases.json> --out <firing>/review.html --open`
   opens the page in the person's browser. Tell the person in one message:
   the counts by page and flow, how many cases came from the walk, why each
   extra negative or edge case exists, where coverage looks thin, and that the
   page's "Download decisions" button saves `review-decisions.json`, to be put
   in the firing folder. End the message there and go on when the person
   says the file is in place. Then
   `C review apply --cases <cases.json> --decisions <firing>/review-decisions.json`
   writes the decisions and notes back; a case whose content changed since the
   page was built stays pending and is listed. Apply the notes and the coverage
   feedback to the cases, rebuild the page and ask again. A changed or new case
   needs a fresh decision; an unchanged approval carries forward. Never decide
   for the reviewer, and never delete a rejected case or its history.
6. **Finish** when every case is approved or rejected, or the person stops:
   `C render --cases <cases.json> --out <cases.md> --app "<app name>" --url <app URL>`
   writes the approved cases as the scenario list. Record the firing in the
   ledger, through a file:
   `L ledger upsert --file tests/<app slug>/loop-ledger.json --row @<firing>/row.json`,
   the row `{ "loop": "discover-loop", "firingId": "<firing id>", "executionId": "firing:<firing id>", "prdVersion": <n>, "approved": <n>, "rejected": <n>, "pending": <n>, "walked": <n> }`.
   Close with the counts (approved, rejected, pending), the files, and the
   next command, `/ua:app-build-test-loop <app>`.

## Rules

- **Test what the app should do.** The expected result comes from the PRD,
  the ticket or the design, never from what the config does today. When the
  config does something else, the case still says what should happen, and its
  run fails until the app does.
- **A walked case says what the app does.** Its expected result is what the
  walk saw. When it contradicts a PRD case, name both in the review message;
  the reviewer decides which stands.
- **Flows, not controls.** One end-to-end case per required flow, with the
  navigation and field entry as its steps. A separate negative or edge case
  only for a named acceptance rule, a material risk (permissions, money, data
  loss, duplicate submission) or a known bug, named in `source`.
- **Every case cites its source.** `source` names the `R<n>` and `A<n>.<m>`
  ids it proves, or the flow, ticket, live read or walk it came from.
- **Desktop first.** Steps describe the app at its design width; a case about
  the layout at 375 CSS px says so in its title.
- **Counts, not caps.** Show the counts by page and flow; never trim required
  coverage to a number.
- **Reads only.** Nothing is written to the app, its data or Test Studio. The
  walk, when asked for, is `/ua:app-test-discover-loop`'s own run and keeps
  its own rules.

## Stop fact

Every case in `cases.json` is approved or rejected, `cases.md` holds the
approved ones, the firing has its ledger row, and the person has the counts
and the next command. Or the person stopped the review, with what is still
pending.

## Outputs

- `tests/<app slug>/design-contract.md`, `design/cases.json`, `design/cases.md`,
  `loops/<firing id>/review.html`, `review-decisions.json` and `pages/`, and
  the firing's `discover-loop` row in `loop-ledger.json`.
- The closing summary: `discover-loop · <app> · PRD v<n> · <approved> approved · <rejected> rejected · <pending> pending`, the counts by page and flow, the cases that came from the walk and what it could not cover, the requirements with no case and why, and `Next: /ua:app-build-test-loop <app>`.

## Approvals

The contract's questions at kickoff (`settings` in
[approvals](../../skills/native-loops/loop-orchestrator/references/approvals.md)),
and each review round, which is the review page plus the message that asks
for its decisions file, not a chat table. Building the review page asks
nothing. The walk asks only what `/ua:app-test-discover-loop`'s own contract
asks.
