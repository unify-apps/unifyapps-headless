# Stage: test-and-fix

## Contents

- The queue
- Orchestrator side
- Test runner side
- Data changes: undo first
- Kind `retest`
- Kind `replay`
- Kind `visual-check`
- Kind `touch-feedback`
- Kind `performance`
- Kind `acceptance`
- Kind `realtime`
- Kind `capture`
- Kind `loading`
- On a WEB app
- Done when

Every device check of every stage waits in one queue; test runners, one
per pool simulator (one per browser folder on a WEB app), drain it in order
and write their results into the run folder. (The reproduce stage holds a
device of its own instead: it is interactive.) A pass sends the issue to `done`; a fail sends it back to the
orchestrator, which gives it to its job for another attempt. No other agent
holds a simulator, and no agent waits for one. Replaces the old device verification
and test-and-fix loops.

## The queue

The queue is `native-device-pool`'s
[device queue](../../../native-device-pool/references/queue.md), one
request per file in `LOOPS_HOME`, served by kind:

| Kind | Queued by | The test runner writes | Pass means |
| --- | --- | --- | --- |
| `retest` | a fix job after its read-back; the logic check for statements the config cannot prove | `issues/retest-<job>-<n>.md` | every issue `verified` (or `platform-limit-confirmed`) |
| `replay` | a fix job after its read-back (an automation job after its deploy), for every issue with recorded steps | `issues/retest-<job>-<n>.md` and `repro/<issue id>/replay-<n>/` | every issue's expected result seen (and its record matching), on every run of an intermittent one; no new issue on the page |
| `visual-check` | the UI check; the build stage per pass | `pixel/<pageId>/pass-<n>/` (`measured.json`, `gaps.json`, the report) and the issues of its open gaps; on WEB `visual/<pageId>/pass-<n>/<width>/`, per width with a spec | zero `off` or `missing` rows (on WEB at every width with a spec) |
| `touch-feedback` (MOBILE) | the touch feedback check; the build stage | `touch-feedback/<pageId>/` shots and the issues of every `unchanged` pair | every tappable `changed` |
| `interaction` (WEB) | the interaction check; the build and feature stages | `web/<pageId>/interaction-<n>/` issues (`PR`) | no W1–W6 issue open |
| `a11y` (WEB) | the a11y check; the UI check when a11y is not in focus; the build stage | `web/<pageId>/a11y-<n>/` issues (`AY`) | no W7–W11 issue open |
| `responsive` (WEB) | the responsive check; the UI check when responsive is not in focus; the build stage | `web/<pageId>/responsive-<n>/` issues (`RS`) | no W12–W15 issue open at either width |
| `performance` | the performance and data checks; a performance fix | `findings/probe-<pageId>-<n>.json` and the issues over threshold; on WEB `perf/<pageId>/` (`steps/`, `perf.json`, `findings.json`) | counts not worse than before, under the thresholds |
| `acceptance` | the feature stage, one per acceptance line of a feature built from a description | `accept/<feature>/<n>/run-<k>/result.md` | the `Expect:` line seen and every `Effects:` line read as written |
| `realtime` | the feature stage, for an acceptance line about a change another device must show | `accept/<feature>/<n>/run-<k>/result.md` | every `Watch:` line shown on device 2 within its seconds, and the acceptance pass |
| `capture` | the fix stage before a job's first write (`--side before`); the build and feature stages after the last write (`--side after`) | `shots/<shot id>/` (`before.png` or `after.png`, `shot.json`) | every shot taken, or named in the footer with why not; a capture judges nothing |
| `loading` (MOBILE) | the build and feature stages, per page with a data region, after its loading-states task; again after a loading fix | `loading/<pageId>/pass-<n>/` (`loading.json`, `composite.png`, `verdicts.json`) and the issues of every confirmed finding | no blank band and no shift, or the loading not seen on the device |

A request carries `--platform mobile` (the default) or `--platform web`, and
a test runner takes only its own platform's requests (§ On a WEB app). On
WEB there is no loading check; the skeleton plan is proven by the read-back.

A request carries everything a stranger needs: the run folder, the page,
the kind, the issue log (a `retest` or `replay`) or the steps file (an
`acceptance` or `realtime` check, `--steps`), the version to open (`draft` unless the goal says
published), and from `profile.json` the endpoint, bundle id, test user and
sign-in flow. Before queuing, the orchestrator exports the page's
`ua cache outline` and `cache blocks` to `R/cache/<pageId>/` with
`loops cache-export <appId> <pageId> --run <R>`, and again after a job's write
and read-back, so a retest measures the config just saved (a test runner
never calls UnifyApps Headless's CLI; its one tenant read is the read-only record check of
a `replay`, an `acceptance` or a `realtime` check), and the design spec stays
in the design store.

## Orchestrator side

1. **Queue** with `loops queue add …` as each stage says. The board shows the
   issue's job as `queued for test` and the request id.
2. **Start test runners** the first time the queue has work: as many as
   `limits.runners`, at most one per pool simulator, each a background agent
   (`Agent(subagent_type: "general-purpose", run_in_background: true, description: "runner <n>", prompt: <runner brief>)`).
   The runner brief names this file, the run folder, its index `n`, the
   device profile, the `loops` command with the plugin's real path (for
   `loops shots`), and "drive argent from Bash with `argent run <tool> --args '<json>'`
   on your reserved device only" (a subagent has no argent MCP tools). A test runner
   that ends while the queue has work is replaced. On WEB the test runners
   are browsers, briefed as § On a WEB app says.
3. **Wait in the background, never in the foreground.** Per request:
   `device-pool queue await <id> --wait 3600` as one Bash call with
   `run_in_background: true`. Its return wakes the session. Meanwhile the
   orchestrator does every stage that needs no device, then ends its turn with
   the board's one-line summary.
4. **On a result**, read the footer, then verify the artifacts for each
   required check before judging. A missing check or unproven version keeps
   the request incomplete, never passed ([execution](../execution.md)).
   - **Pass**: the issues are `verified`; when every issue of the job passed, the
     job is `passed` and the page lock on each page is released. A module or card job
     passes when every dependent page's retest passed.
   - **Fail**: issues `still open`, `regressed` or `new` go back to the job as
     attempt n+1 ([fix](fix.md)), with the device value measured, not the design
     value alone; a failed replay reopens its issue with what the replay saw
     and the record read. The job's agent is resumed with `SendMessage` while it holds
     under 250k tokens, else a fresh one starts with the files. A failed
     `acceptance` or `realtime` check goes back to the plan as a fix task
     ([feature](feature.md) § A failed check comes back as a fix task).
   - **Not checked from the main session**: a `run` line the test runner
     could not read, or a `record` line with no object tool, is read by the
     orchestrator before it judges ([feature](feature.md) § Checks).
   - **Platform**: issues the test runner classed as renderer bugs (`bundle`,
     `needs platform`) go to `issues/platform-queue.md` and end as handoff
     notes ([fix](fix.md) § Handoff note).
   - **Failed request** (sign-in, endpoint, the run folder): fix the cause,
     then `device-pool queue requeue <id>`.
5. **Attempts.** An issue past `limits.maxAttempts` (4), or a job past
   `limits.jobMinutes` (50), goes to the escalation for that job only; the other
   jobs go on.

## Test runner side

One agent, one simulator (on WEB one browser folder, § On a WEB app), the
queue in order. Never writes to the tenant
through a tool, never fixes what it measures, never taps a control that
writes, except the recorded steps of a `replay` and the steps of an
`acceptance` or `realtime` check, which the run settings allowed, as the
test user.

1. `device-pool reserve --task "runner <n>" --wait 600` (Bash timeout 700 s).
   Still busy: end with "no simulator; the requests stay queued".
2. Loop:
   1. `device-pool queue take --udid <udid> --json` (any kind this file
      serves). Exit 3 (`QUEUE_EMPTY`): check again every 15 s for 5 minutes,
      then go to step 3.
   2. Open the app as `native-device-pool`'s
      [protocol](../../../native-device-pool/references/protocol.md) steps 2–6 say:
      boot, launch, the endpoint, the version the request names, sign-in by
      the recorded flow, the fresh-config proof. Write the version seen and
      how it was proven at the top of the result file, as `Version proof:
      <refetch call | version sheet | unproven>`. A retest file without that line fails
      `loops issues lint`. A sign-in stuck after
      Continue: `restart-app` at most twice (D15).
   3. Serve the request as its kind says below. Screenshots to disk with
      `includeImageInContext: false`; look at no more than two images per
      screen or one composite per page.
   4. Append evidence rows to `R/evidence.md` with the version shown and
      `runner <n>` in the `by` column ([rules](../rules.md) § Evidence).
   5. `device-pool queue done <id> --result <file or folder> --summary "<footer line>" --shown "draft v<N>"`;
      a precondition that cannot be met: `device-pool queue fail <id> --reason "<what>"`,
      then the next request.
3. `device-pool release` on every exit path; the reply in the
   [runner reply](../formats.md) § Test runner reply shape.

## Kind `retest`

Every issue of the request's issue log (skip `data` and `ok` issues): reach the
state, measure again (`describe` frames in points, pixel samples for colour,
`native-network-logs` for calls; on WEB the check that wrote the issue, at
its width), compare with `expected` at ±2 pt (±2 px on WEB) and the
token's hex, set `status` with the new evidence. Then look for new problems
on the same pages (off the design, red toasts, crashes): issues
`<P><g>-R<nn>`, status `new`. Then the after shots (§ After shots). Footer:
`verified a · still open b · regressed c · new d · not retested e`.

### After shots

The person gets a BEFORE | AFTER sheet of every fix at the end of the run, so
a retest or a replay shoots the after side while the device is already in the
state. `loops shots list --run <R>` names every shot and the issues it shows.
For each shot with a `before` side that shows an issue of this request: reach
the shot's `state` again (the same scroll, tab and sheet), screenshot at scale
1.0 with `includeImageInContext: false` to `R/shots/<shot id>/after.png`,
then

```
loops shots add --run <R> --id <shot id> --side after --file R/shots/<shot id>/after.png \
  --status <verified | still open | regressed> --issues <its issues this request verified> \
  --version "draft v<N>" --by "runner <n>"
```

`--status verified` only when every issue of this request that the shot shows
is `verified`; else the worst result. A later attempt shoots it again, so the
sheet shows the last retest's draft, and only when that retest passed.

On WEB the after shot is `B page-shot <width>` at the design width, which
takes no output path and saves `<browser>/page-<width>.png` (at 375, the
variant pick through `open.mjs --width 375`, then `B fit-page` and
`B screenshot --filename=page-375.png`, saved in the browser folder too),
copied to the same `R/shots/<shot id>/after.png`, and
`loops shots add` takes `--version "draft (preview route)"` and
`--by "web runner <n>"`.

## Data changes: undo first

A `replay`, `acceptance` or `realtime` request whose steps save changes
stored data. The test runner holds no object tool, so the orchestrator
prepares it, before `loops queue add`:

1. **A record of the run's own.** The steps run on a seeded record
   (`ZZ_LOOP_<goal>_<what>`, [loop-test-data](../../../loop-test-data/SKILL.md))
   or on the profile's fixture (`fixtures.recordFreshData`), never on a shared
   record. None can be made: the request is not queued and the check
   is `not checked (no record of its own)`.
2. **Undo entries first.** Each field the steps change (the steps file's
   `Data:` and `Effects:` lines name them) is read live and written with
   `data-undo.mjs add` ([undo log](../../../loop-test-data/references/undo-log.md)).
   The request's `--note` carries the entry ids.
3. **Restore.** When the request is done, failed, cancelled, or its runner
   or job died, and again at the end of the run and on resume: `data-undo.mjs
   plan`, put each value back through the fde-agent, read it back,
   `mark-restored`. The footer's pass or fail does not wait for it; the run
   does not finish before it.
4. **A discarded added item is deleted**, not left empty: a step that adds
   one and then discards it ends with the part gone, and the log's `create`
   entry for it is closed on that read.

## Kind `replay`

For each issue of the request's issue log with a `steps` cell (the others
are `not retested (no steps)`), from the steps file it names, which holds the
start, the steps, `Expect:`, `Data:` and `Repeat:` ([reproduce](reproduce.md)
§ What it hands on):

1. **Replay.** MOBILE: run the issue's argent flow on the reserved device,
   `flow-execute {name: "<flow>", project_root: "<R>/repro/<issue id>", device: <udid>}`
   (it starts with `restart-app`), then any step `steps.md` lists after the
   flow (a memory warning, [device traps](../device-traps.md) D17); with no flow, the steps by hand, tap points
   from `describe`. WEB: `open.mjs` on the steps' preview path at their width,
   then each step as a browser.mjs command with a ref from a fresh
   `B snapshot`. `Repeat: 5` runs it five times.
2. **The expected result.** At the end, read the screen (`describe`, or
   `B snapshot` and `B wait-for "<text>"`) and compare with `Expect:`; keep
   `fail.png` or `pass.png`, and the calls (`native-network-logs`, or
   `B calls`) in `R/repro/<issue id>/replay-<n>/`.
3. **The record**, when the steps file has a `Data:` line: read it
   read-only, `mcp__plugin_ua_object__get_records` with that object id,
   the record ids or the filter it names and `limit` at most 5; never
   `apply_record_edits`. A test runner without that tool writes `record: not
   checked (no object tool)`, and the orchestrator makes the same read from
   the main session before it judges the result. When the steps file has an
   `Effects:` block, every line of it is read the same way, as § Kind
   `acceptance` step 4 says.
4. **A quick look for regressions.** The page against the reproduction's
   `start.png` (MOBILE `screenshot-diff {udid, baselinePath, captureCurrent: true, outputDir}`;
   WEB one side-by-side of `B page-shot <width>`): a change outside the
   issue's block, a red toast or a crash is a `new` issue (`<P><g>-R<nn>`).
5. **The after shot.** The reproduction kept `fail.png` as the issue's before
   shot (`shots/<issue id>/`); `pass.png` or `fail.png` of the last run goes
   in as its after side, as § After shots says, with `--file
   R/repro/<issue id>/replay-<n>/<pass or fail>.png`.

`verified` when the expected result shows on every run, the record holds
the `Data:` value and every `Effects:` line holds; `still open` when one fails (the issue is reopened);
`regressed` when it fails in a new way. The footer is the retest file's:
`verified a · still open b · regressed c · new d · not retested e`.

## Kind `visual-check`

`native-visual-check`'s [check](../../../native-visual-check/references/check.md):
`measure.mjs` on the reserved device into `R/visual/<pageId>/pass-<n>/`, then
`gap-table.mjs` against `design/<app-id>/specs/<page>.json` with the
exported outline and blocks, tolerance 2. Judge the `visual` rows from at most
two crops and run it again with `--verdicts`. Every `off` or `missing` row
becomes an issue (`UI`, `device: device`). A `visual only` request
(no design spec): one side-by-side composite with `screens/<page>.png`, issues by
eye marked `GUESS`. On WEB: [web-visual-check](../../../../web-loops/web-visual-check/SKILL.md)
per width with a spec, into `R/visual/<pageId>/pass-<n>/<width>/`
(§ On a WEB app).

## Kind `touch-feedback`

Per tappable in the request's `tappables.json`, as the
[touch feedback check](audit-touch-feedback.md) § Device says: frame from `describe`, Down, hold,
shot, slide off, Up, shot; one composite per page; each pair `changed` or
`unchanged`; an `unchanged` pair is an issue. A tappable not on screen is
`not reached` with the reason. On WEB the kind is `interaction`
(§ On a WEB app).

## Kind `performance`

As the [performance check](audit-perf.md) § Device says: the open twice, counts
first: first paint, requests and native hangs. For a performance fix, follow
[controlled comparisons](../comparisons.md):
the same step, proven variants and matched conditions, with every required
correctness check completed. The footer names both:
`requests 9 → 4 · first paint 1.4 s → 0.9 s (repeat)`.
On WEB: web-profile into `R/perf/<pageId>/` (§ On a WEB app).

## Kind `acceptance`

One acceptance line of a feature built from a description
([feature](feature.md)), from the steps file the request names
(`R/accept/<feature>/<n>/steps.md`). The steps file is
the [reproduce stage](reproduce.md)'s format with its `Effects:` block.

1. **Writes.** The `Writes:` line must say the run settings allowed what the
   steps save; when it does not, `queue fail` with "the steps write and the
   run settings did not allow it". Every step runs as the test user of
   `Signed in as:`, on that user's own records or `ZZ_LOOP_` test records.
2. **The steps.** MOBILE: on the reserved simulator, after the
   [protocol](../../../native-device-pool/references/protocol.md) steps 2–6, the
   argent flow when `Flow:` names one, else each step by hand with tap
   points from `describe`. WEB: `open.mjs` on the steps' preview path at
   their width, then each step as a browser.mjs command with a ref from a
   fresh `B snapshot`. Write the time each numbered step ended into
   `run-<k>/steps.json`; a `run` line is looked up by it.
3. **The expected result.** Read the screen (`describe`, or `B snapshot` and
   `B wait-for "<text>"`) and compare with `Expect:`; keep `pass.png` or
   `fail.png` in `R/accept/<feature>/<n>/run-<k>/`.
4. **Effects, read-only.**
   - `- record <object> (<object id>) · <record id or filter> · <field> = <value>`:
     `mcp__plugin_ua_object__get_records` with that object id, the record
     id or filter and `limit` at most 5; the line holds when a row read has
     the field at that value. Never `apply_record_edits`. Without the tool:
     `not checked (no object tool)`.
   - `- run <automation> (<id>) · success|failed · after step <n>`: a test
     runner cannot brief a builder, so it writes `not checked (main
     session)` with the end time of step `<n>`. The orchestrator reads the
     first run of that automation after it, read-only, before it judges.
5. **The result**, `R/accept/<feature>/<n>/run-<k>/result.md`
   ([formats](../formats.md) § Check result): one row per `Expect:` and
   `Effects:` line. Footer: `passed a · failed b · not checked c`.

Pass: every line `passed`, once the orchestrator has read the lines marked
`not checked`. A test runner never changes the steps to make one pass.

## Kind `realtime`

Two devices: two simulators, or on WEB two browser folders. Device 1, the
writer, does the steps; device 2, the watcher,
must show each `Watch:` line within its seconds (10 when the line gives
none), with nothing touching it.

1. **Device 2 is the test runner's own**: on MOBILE its reserved simulator,
   on WEB its browser folder `R/runners/web-<n>/browser/`. It opens the page
   of the `Watcher:` line (else the request's page), signed in as the
   `Watcher:` line's user (else the test user of `Signed in as:`), and keeps
   `watch-start.png`.
2. **Device 1.** A second reservation,
   `device-pool reserve --session "$LOOPS_SESSION_ID.writer-<n>" --task "runner <n> realtime writer" --wait 300`
   (Bash timeout 400 s). It needs its own session id, since `reserve` gives
   a session back the simulator it already holds; the guard hooks read
   `<session>.<role>` as this session's own
   ([reservation](../../../native-device-pool/references/reservation.md)). No
   simulator frees in time: `device-pool queue requeue <id>` and take the
   next request; the realtime check waits for a time two simulators are
   free. WEB: a second browser folder, `R/runners/web-<n>-writer/browser/`,
   opened with `open.mjs`; no reservation.
3. **The steps on device 1**, as § Kind `acceptance` steps 1 and 2. `t0` is
   the end of the last numbered step.
4. **Watch device 2.** MOBILE: `describe` every 2 s; WEB: a fresh
   `B snapshot` every 2 s, or `B wait-for "<text>" <ms>`. Never a tap, a
   reload or a restart on device 2: the change must show on its own. For
   each `Watch:` line, write the seconds from `t0` to when it showed, or
   `not within <n> s`; keep `watch-end.png`.
5. **Effects** as § Kind `acceptance` step 4.
6. **Release device 1** on every exit path: MOBILE
   `device-pool release --session "$LOOPS_SESSION_ID.writer-<n>"`; WEB
   `B close` in the writer's folder.
7. **The result** as § Kind `acceptance` step 5, with one `watch` row per
   `Watch:` line.

Pass: every `Watch:` line shown within its seconds and every other line
`passed`. A line shown late is `failed (shown after <s> s)`: its time is the
evidence the fix task needs.

## Kind `capture`

Screenshots only, kept to show the person what the run changed
([formats](../formats.md) § Shots). A capture judges nothing, writes no issue
and taps only to navigate, scroll or open a sheet. Each shot: data loaded (no
spinner or skeleton, at most 20 s, else take it and say so in `--state`),
`screenshot` at scale 1.0 with
`includeImageInContext: false` straight to `R/shots/<shot id>/<side>.png`,
then `loops shots add` with that file. On WEB a capture is
`B page-shot <width>` of the preview at the design width (the window as tall
as the page, so the after side of a build is one shot per width), or at 375
`B fit-page` then `B screenshot --filename=page-375.png` after
`open.mjs --width 375`. Both save into the browser folder
(`<browser>/page-<width>.png`; page-shot takes no output path), and the file
is copied to the same `R/shots/<shot id>/<side>.png`, with
`--version "draft (preview route)"`.

- **`--side before`** (a fix run, before the job writes). For each issue of
  the request's issue log on this page (skip `data` and `ok` issues, and an
  issue whose `device` cell is `run`): reach its state as a retest would (the
  page, scrolled so the issue's region is in view, the tab or sheet it names
  open) and check with `describe` that the region shows. Issues that show on
  one screen share one shot, named by the first of them:
  ```
  loops shots add --run <R> --id <first issue id> --side before --file R/shots/<id>/before.png \
    --page <pageId> --page-name "<Page>" --issues <every issue it shows> \
    --state "<top of page | scrolled to <region> | <sheet> open>" \
    --title "<what the fix makes true, from the first issue's expected, in a few words>" \
    --version "draft v<N>" --by "runner <n>"
  ```
- **`--side after`** (a build run, after its last write). The page as built:
  the top of the page, then one viewport down at a time with the visual
  check's swipe (`0.5,0.62 → 0.5,0.22`, 450 ms, no momentum) until the screen
  stops changing, four shots at most; then each region of the request's
  `regions` scrolled into view, when no shot shows it yet. The top shot is
  named by the page id, the next ones `<pageId>-v<k>`:
  ```
  loops shots add --run <R> --id <pageId>[-v<k>] --side after --file R/shots/<id>/after.png \
    --page <pageId> --page-name "<Page>" --state "<top of page | viewport <k> | <region> in view>" \
    --order <k> --version "draft v<N>" --by "runner <n>"
  ```

Footer: `shots <n> · not reached <m>`, each state not reached named with why.
`queue done <id> --result R/shots`.

## Kind `loading`

`native-loading-states`' [check](../../../native-loading-states/references/check.md):
reach the screen one hop before the page, record while the last hop opens
it fresh, then `loading-check.mjs` on the recording into
`R/loading/<pageId>/pass-<n>/`. Judge each `blank` and `shift` finding from
the one composite; every confirmed one is an issue (`UI`, kind `state`,
`device: device`). `not-seen` (the data was there before the page stood on
screen) passes on the config's X1. A page that never settles is a `queue
fail` with what moves. Footer:
`loading <Page> pass <n> · <verdict> · blank a · shift b · dismissed c · loading <ms> ms`.

On WEB there is no loading check; the skeleton plan is proven by the
read-back. A `loading` request is never queued with `--platform web`.

## On a WEB app

The same queue, the same kinds and the same footers; the device is a browser
folder. Everything above holds except where it names a simulator, argent
or the Preview app. The protocol is web-browser's
[runner](../../../../web-loops/web-browser/references/runner.md):

- **Orchestrator.** Before the first request and after each job's write and
  read-back, `loops cache-export <appId> <pageId> --run <R>` (the WEB blocks
  read `R/cache/<pageId>/blocks.json` and `outline.json`). Queue with
  `--platform web` and the widths, the preview path, the group and the
  request's own first issue number in the note
  (`--note "widths 1440,375; path /orders/<id>; group 2; start 51"`,
  [audit checks](../audit-checks.md) § The checks). Start
  `min(capacity.browsers, requests queued)` test runners, each a background
  `general-purpose` agent whose brief is the runner's, with the run folder,
  its index `n`, the plugin folder and the tenant host. Wait with
  `device-pool queue await` in the background as above.
- **Test runner.** No reservation: it lists, then takes a request by id with
  `--platform web` (`device-pool queue take <id> --platform web --json`),
  opens the page with `open.mjs` on the preview route, runs the kind's check,
  writes evidence with `draft (preview route)` as the version shown, reports,
  and closes its browser (`B close`) when the queue stays empty. The preview
  route shows the saved draft once `open-page` reloads it; no restart, and
  open-page's `loadedAt` is the version proof.
- **Kinds.** `visual-check` → web-visual-check per width with a design spec
  (`R/visual/<pageId>/pass-<n>/<width>/`); `interaction` → `interaction.mjs`
  W1–W6 (a `touch-feedback` request with `--platform web` is refused, naming
  `interaction`); `performance` → web-profile (`open`, the steps the request
  names, `build`, then `findings`) into `R/perf/<pageId>/`, compared like with
  like as above (`lcp 3.1 s → 2.2 s · data-source calls 9 → 4 · TBT 420 →
  150 ms`); `a11y`, `responsive` → their scripts at 1440 and 375; `retest` →
  for each issue the check that wrote it, at the width it names; `replay` →
  the steps file in the test runner's browser, as § Kind `replay` says; a
  retest shoots the after side as § After shots says for WEB, a replay as
  § Kind `replay` step 5 says; both end with the same footer
  (`verified a · still open b · regressed c · new d · not retested e`);
  `acceptance` and `realtime` → as their sections say, in the test runner's
  browser (and for `realtime` a second browser folder for device 1), with
  the footer `passed a · failed b · not checked c`. Both browsers sign in as
  the person: a `Watcher:` or `Signed in as:` line naming another user fails
  the request with that reason. `capture` → as § Kind `capture` says.
- **Failures.** open-page's exit codes decide: a sign-in that ran out stops
  every WEB test runner until the person signs in again (the sign-in step of
  `/ua:setup`), then the orchestrator requeues; a wrong path is fixed in the
  request; exit 7 (the tenant would not say its environment) stops the run
  with its line word for word. A width the preview
  does not offer is `done` with "not checked at <width>".

### A code app

A WEB test runner serves a Code Builder app's requests the same way: the
request's URL is the engine's preview route
(`https://<host>/agent-api/preview/b/<appId>/main<path>`), which draws no
block, so `open-page` waits for the app's own first element instead. The
request's note says `kind code`, and a `retest` reads no `cache blocks`: the
job's read-back is the code app agent's report.

## Done when

The queue holds no request of this run, every job is `passed`, `accepted`
(the person accepted its open issues) or `escalated`, and every test runner
released its simulator or closed its browser.
