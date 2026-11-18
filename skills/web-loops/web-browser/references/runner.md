# The WEB test runner

## Contents

- How many test runners
- The test runner brief
- The loop
- What each kind runs
- The result
- When it fails

A WEB app's device checks wait in the same queue as a MOBILE app's: the
orchestrator queues, a test runner serves, nobody waits. What differs is the
device: a WEB test runner holds a browser folder, not a simulator, so it
reserves nothing, needs no pool and starts in seconds. Below, `B` is
`node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser>`,
`W` is `${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-browser/scripts`, and `device-pool` is
`bash "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts/device-pool.sh"`,
whose `queue` commands need no simulator.

## How many test runners

`node "$W/capacity.mjs" --json` answers `{ freeGb, browsers, cap, capFrom }`:
about one browser per GB of free memory (on macOS free, inactive, speculative
and purgeable pages from `vm_stat`), at least one, at most the cap. The cap
is `--cap`, else `capacity.browsers` in `LOOPS_HOME/config.json`, else 6. The
orchestrator starts `min(browsers, requests queued)` test runners when the
queue first has WEB work, and replaces one that ends while work is queued.
Each test runner is a background agent with its own index `n`.

## The test runner brief

Everything a stranger needs, with real paths (a subagent's prompt is not
expanded): this file's path, the run folder `R`, the index `n` and so the
browser folder `R/runners/web-<n>/browser/`, the plugin folder, the tenant
host for the preview URLs, the `loops` command with the plugin's real path
(for `loops shots add`), and these rules: "Reads only: never click, type or
submit, except a web-profile step the request names on seeded test data, the
recorded steps of a `replay`, the steps of an `acceptance` or `realtime`
check (the steps file, as the test user, when its `Writes:` line says the
run settings allowed them), and a `capture`'s clicks that only navigate or
open a sheet. One browser, yours (and for a `realtime` check
one more, the writer's); close them before your reply. No browser tool other
than browser.mjs."

## The loop

1. **Take a request of this run.** `device-pool queue list --status queued --platform web --run <R> --json`,
   the oldest request of a kind below, then `device-pool queue take <id> --platform web --json`
   (no `--udid`: there is no simulator). The orchestrator queues every request
   of a WEB run with `--platform web`; the queue refuses to give out another
   platform's request (`WRONG_PLATFORM`), so a simulator runner never takes this
   one and you never take a mobile one. A test runner takes a request by id from
   its own run, never the next request of the machine's queue. Nothing queued: look
   again every 15 s for 5 minutes, then go to step 6.
2. **Open the page.** The request names the page and, in its note, the widths
   (default 1440 and 375) and any page inputs:
   `node "$W/open.mjs" --browser <browser> --url "https://<host>/p/0/interfaces/<appId>/preview/<path>" --width <first width>`.
   The preview shows the saved draft: write `draft (preview route)` as the
   version shown, with the `loadedAt` open.mjs printed. Always pass `--width`:
   a browser folder keeps the phone pick of `--width 375` across loads, and
   `open.mjs` is what puts the preview back on a laptop width.
3. **Run the check** the kind names (below), into the folder its row names:
   for `interaction`, `a11y` and `responsive`,
   `R/web/<pageId>/<kind>-<request id>/`, `<request id>` the id `queue take`
   printed; a `replay` writes to `R/repro/<issue id>/replay-<n>/`, and the
   other kinds to the folders their rows name.
4. **Write evidence rows** into `R/evidence.md`, as a MOBILE test runner
   does: one row per finding, with the version shown and `web runner <n>` in
   its `by` column ([rules](../../../native-loops/loop-orchestrator/references/rules.md) § Evidence).
   Append each row in one write (`>>`), which needs no lock.
5. **Report.** `device-pool queue done <id> --result <file or folder> --summary "<footer line>" --shown "draft (preview route)"`,
   the result its row names;
   a precondition that cannot be met: `device-pool queue fail <id> --reason "<what>"`.
   Then step 1 again.
6. **End.** `B close` (it deletes the sign-in's private folder), then remove
   the browser folder, `R/runners/web-<n>/browser/` (and the writer's of a
   `realtime` check): `B close` leaves `.ua-open-page.json`,
   `.playwright-cli/` and the page shots there, and every result was already
   copied out. Then the reply below.

## What each kind runs

| Kind | Runs | Result |
| --- | --- | --- |
| `interaction` | `interaction.mjs` at each width, `--check interaction --group <g> --start <s>` | `issues-<width>.json`, `issues.md`; the footer counts by severity |
| `visual-check` | [web-visual-check](../../web-visual-check/SKILL.md): `measure.mjs` then `gap-table.mjs --group <g> --start <s>` against `design/<app-id>/specs/<screen>@<width>.json`, per width with a spec | `R/visual/<pageId>/pass-<n>/<width>/`: `measured.json`, `gaps.json`, issues; the check passes with zero `off` or `missing` at every width |
| `performance` | [web-profile](../../web-profile/SKILL.md): `profile.mjs open` (2 runs), the steps the request names, `build`, `findings --group <g> --start <s>` | `R/perf/<pageId>/`: `steps/` (the step files), `perf.json`, `findings.json` |
| `retest` | for each issue of the request's issue log, the check that wrote it, at the width it names: W1–W6 interaction, W7–W11 a11y, W12–W15 responsive, a design spec issue the visual check, a perf metric issue web-profile; then the after side of every shot (`loops shots list --run <R>`) whose `before` shows an issue of the request: `B page-shot <width>` at the design width, which saves `<browser>/page-<width>.png` (at 375 the variant pick through `open.mjs --width 375`, then `B fit-page` and `B screenshot --filename=page-375.png`, saved in the browser folder too), copied to `R/shots/<shot id>/after.png`, then `loops shots add --side after` with its `--status`, `--version "draft (preview route)"` and `--by "web runner <n>"` ([test-and-fix](../../../native-loops/loop-orchestrator/references/stages/test-and-fix.md) § After shots) | `issues/retest-<job>-<n>.md`, every issue's `status` set; `R/shots/<shot id>/after.png` |
| `replay` | for each issue with a `steps` cell, its steps file (`R/repro/<issue id>/steps.md`): `open.mjs` on its preview path at its width, each step as a browser.mjs command (`click`, `fill`, `reload`, `wait-for`) with a ref from a fresh `B snapshot`, the `Expect:` line read from the snapshot, `Repeat: 5` five times; the `Data:` record read-only with `mcp__plugin_ua_object__get_records` (`limit` at most 5) or `record: not checked (no object tool)`; then `B page-shot <width>` beside the reproduction's `start.png` for regressions | `issues/retest-<job>-<n>.md` and `R/repro/<issue id>/replay-<n>/` (shots, `calls.json`) |
| `a11y` | `a11y.mjs` at each width, `--group <g> --start <s>` (issues of the `a11y` check, `AY<g>-<nn>`) | `issues-<width>.json`, `issues.md` |
| `acceptance` | the steps file the request names (`R/accept/<feature>/<n>/steps.md`): `open.mjs` on its preview path at its width, each step as a browser.mjs command with a ref from a fresh `B snapshot`, the `Expect:` line read from the snapshot, then each `Effects:` line read-only: a `record` line with `mcp__plugin_ua_object__get_records` (`limit` at most 5) or `not checked (no object tool)`, a `run` line `not checked (main session)` with the end time of its step | `R/accept/<feature>/<n>/run-<k>/`: `result.md`, `steps.json`, shots; the footer `passed a · failed b · not checked c` |
| `realtime` | device 2 is this browser, opened on the `Watcher:` page (else the request's page); device 1 is a second folder, `R/runners/web-<n>-writer/browser/`, which does the steps as an `acceptance` does; then a fresh `B snapshot` of device 2 every 2 s, or `B wait-for`, until each `Watch:` line shows or its seconds pass, never touching device 2; `B close` in the writer's folder after | the same folder, with one `watch` row per `Watch:` line |
| `responsive` | `responsive.mjs --widths <widths> --group <g> --start <s>` from one open (issues of the `responsive` check, `RS<g>-<nn>`) | `issues.json`, `issues.md`, the navigation per width |
| `capture` | screenshots only, judging nothing ([test-and-fix](../../../native-loops/loop-orchestrator/references/stages/test-and-fix.md) § Kind `capture`): for `--side before`, the state of each issue of the request's issue log; for `--side after`, the page as built. Each shot waits for the data (at most 20 s), then `B page-shot <width>` of the preview at the design width, which saves `<browser>/page-<width>.png`, or at 375 `B fit-page` then `B screenshot --filename=<file>` after `open.mjs --width 375`, which saves `<browser>/<file>`; the file is copied to `R/shots/<shot id>/<side>.png`, then `loops shots add` with that file, `--version "draft (preview route)"` and `--by "web runner <n>"` | `R/shots/<shot id>/`; the footer `shots <n> · not reached <m>` |

An `Expect:` line the snapshot cannot show (a colour, a style, the value in
a field) is read with one `B eval` on its element instead.

The group `<g>` and the first issue number `<s>` come from the request's
note (`group 2; start 51`). Each request to a different runner has its own
range, so two test runners never write the same id. A check run at two
widths starts the second width one past the last id the first wrote. The
check of an issue is the kind's, whichever audit check queued it.

A replayed issue is `verified` when its expected result shows on every run,
its record holds the `Data:` value and every `Effects:` line holds, `still
open` when one fails. Both browsers of a `realtime` check sign in as the
person, so a `Watcher:` or `Signed in as:` line naming another user is a
`queue fail` with that reason. A
retested issue is `verified` when the same rule finds nothing on the same
block at that width, `still open` when it finds it again, `regressed` when it
is worse (a larger overflow, a lower contrast, a bigger gap), and a problem on
the same page that no issue named is `new` (`<P><g>-R<nn>`). The footer, which
is also the `--summary`: `verified a · still open b · regressed c · new d · not retested e`.

## The result

A test runner ends with one reply under 20 lines, the test runner reply of the
orchestrator's [formats](../../../native-loops/loop-orchestrator/references/formats.md):

```
Runner web-<n> (browser) · served <n> · failed <f> · still queued <q> · browser closed
- <request id> <kind> <page>: <the summary line> → <result folder>
- <request id> failed: <reason>
```

## When it fails

| What happened | The request | What the test runner says |
| --- | --- | --- |
| open-page exit 3: the browser would not start | `queue fail` | the script's line; the next request will not open either, so stop and reply |
| exit 4: the tenant did not answer, or the page would not load | `queue fail` | the line; take the next request |
| exit 5 on the sign-in page: the saved sign-in ran out | `queue fail` with "sign-in ran out" | stop: the orchestrator asks the person to sign in again, then requeues |
| exit 5 on another page or app: the URL is wrong | `queue fail` with the line | the orchestrator fixes the URL in the request |
| exit 6: no block drawn in 20 s | open once more; the same again is `queue fail` | the line |
| exit 7: the tenant would not say its environment | `queue fail`, then stop | the line word for word |
| a width the preview does not offer, or the phone tab has no "Iphone X (375 x 812)" | `queue done` with the other widths | "not checked at <width>: <the reason open.mjs printed>" in the summary |

A failed open is a failed request, never an issue.
