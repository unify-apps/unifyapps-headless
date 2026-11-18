# Files the stages hand to each other

## Contents

- The run folder's hand-off files
- Scope (`scope.json`)
- Issue: one shape for every check
- Cause: the layer an issue lives in
- Issue log (`issues/<check>-<group>.md`)
- Retest file (`issues/retest-<job>-<n>.md`)
- Fix report of a job (`jobs/<job>/fixes-<n>.md`)
- Check result (`accept/<feature>/<n>/run-<k>/result.md`)
- Test runner reply
- Platform queue
- Triage table (`issues/triage-<n>.md`)
- Board (`board.json`, `board.md`)
- Job state (`jobs/<job>/state.json`)
- Shots (`shots/`)
- Undo log (`data/undo-log.jsonl`)
- Scope tickets (`tickets.json`, `keys.json`)

Stages talk through files in the run folder `R`, never through chat prose.
Each file stands alone: a builder that never saw the audit fixes from an
issue; a test runner that never saw the fix retests it. Keep the column names
and the JSON keys: `loops issues lint|merge|split` and `loops board` read
them, and so does a resumed run. Paths inside a file are relative to `R`.
Every finding in these files is also an evidence row ([rules](rules.md)
§ Evidence).

## The run folder's hand-off files

| File | Written by | Read by |
| --- | --- | --- |
| `scope.json` | the orchestrator (`loops impact`) | every stage |
| `issues/<check>-<group>.md` | an audit check agent | the orchestrator (merge, split), fix jobs |
| `issues/reproduce-1.md`, `repro/<issue id>/` (`steps.md`, the argent flow, shots, calls) | the reproduce stage | the orchestrator, fix jobs, a `replay` test runner |
| `issues/merged.md` | `loops issues merge` (one log; the same issue in two logs kept once; one id on two different issues refused, `ISSUE_ID_COLLISION`) | the orchestrator |
| `jobs/jobs.json`, `jobs/issues-<job>.md` | `loops issues split` (jobs by page; the app shell, each shared module or card and each automation in a job of its own) | the orchestrator, fix jobs |
| `jobs/<job>/fixes-<n>.md` | a fix or build job | the orchestrator, the test runner |
| `issues/retest-<job>-<n>.md` | a test runner (a `retest` or a `replay`) | the orchestrator, the job's next attempt |
| `web/<pageId>/<kind>-<request id>/`, `visual/<pageId>/pass-<n>/<width>/`, `perf/<pageId>/` | a WEB test runner (an `interaction`, `a11y` or `responsive` check; a visual check per width; web-profile) | the orchestrator, the job's next attempt |
| `accept/<feature>/<n>/steps.md` | the feature stage, one per acceptance line, in the reproduce stage's steps format with its `Effects:` and `Watch:` blocks | an `acceptance` or `realtime` test runner |
| `accept/<feature>/<n>/run-<k>/` (`result.md`, `steps.json`, shots) | a test runner (an `acceptance` or a `realtime` check) | the orchestrator, the plan's fix task |
| `issues/platform-queue.md` | the orchestrator | the handoff notes of the fix stage |
| `issues/triage-<n>.md` | the triage stage | the orchestrator, the person |
| `board.json`, `board.md` | `loops run start` writes the first `board.json`; the orchestrator rewrites it; `loops board` renders the Markdown | the person; a resumed run |
| `jobs/<job>/state.json` | every job and test runner, at every step (`loops run job-state`) | `loops run resume`; a later session |
| `shots/<shot id>/` (`shot.json`, `before.png`, `after.png`, `design.png`) | `loops shots add`: the reproduce stage and a `capture` (before), a retest or replay (after, fix), a `capture` (after, build), the orchestrator (design) | `loops shots compose`, a retest that shoots the after side |
| `shots/sheets/` | `loops shots compose` | the person |
| `data/undo-log.jsonl` | `data-undo.mjs add`, before each data change | the restore step at the end of a run and on resume |
| `run-log.jsonl` | `loops log append` | `loops log report`, a resumed run |

## Scope (`scope.json`)

Written once per run from `loops impact` ([SKILL.md](../SKILL.md) § Scope) and
rewritten when the scope grows:

```json
{ "app": {"id": "<appId>", "name": "<App>"},
  "pages":   [{"id": "<pageId>", "name": "<Page>", "why": "asked | uses module <id> | hosts card <id> | opens <pageId>"}],
  "modules": [{"id": "<id>", "name": "<Module>", "dependents": ["<pageId>"]}],
  "cards":   [{"id": "<pageId>", "name": "<Card>", "hosts": ["<pageId>"]}],
  "focus": ["ui", "touch-feedback", "perf", "security", "data", "logic"] }
```

On WEB `focus` names `interaction` in place of `touch-feedback`, and may add
`a11y` and `responsive`.

## Issue: one shape for every check

Every check (`ui`, `touch-feedback`, `perf`, `security`, `data`, `logic`, and
on WEB `interaction` in place of `touch-feedback`, `a11y` and `responsive`),
the triage, the reproduce stage and every retest
write the same issue. An
issue feeds any job: its `owner` says which. The Markdown columns below are
what `loops issues lint|merge|split` parse, in this order; the JSON keys are
the same issue in `findings.json`.

| Column | JSON key | Holds |
| --- | --- | --- |
| `id` | `id` | `<P><g>-<nn>`: the check code and the group number, then a two-digit number (`PR2-03`); `P` is `UI`, `PR` (touch feedback, or interaction on WEB), `PF` (perf), `SC` (security), `DA` (data), `LG` (logic), `AY` (a11y, WEB), `RS` (responsive, WEB), `TR` (triage), `RP` (an issue the person reported, from the reproduce stage), `TA` (test-author failure tickets). Never reused, never renumbered. A problem a retest finds is `<P><g>-R<nn>`. |
| `page (name · id)` | `page` | `<Page> · <pageId>`, or `app shell` for an issue that holds on every page |
| `region / element` | `region` | the region or element: block display name and `b_…` id when known; a data source, variable, function or automation by name and id |
| `check` | `check` | the check that found it (`reproduce` for a reported issue) |
| `rule` | `rule` | the rule it breaks: a rulebook id (`U1`, `X2`, `P3`), a house rule (`H1`), a security rule (`S2`), a trap (`D04`, `A04`), a prune check, a design spec value; `—` for a design gap with no rule |
| `severity` | `severity` | `critical` (the person cannot finish the task: a crash, a dead main action, another user's data) · `major` (clearly wrong: off the design, a rulebook `blocking` finding, a slow step over its threshold) · `minor` (within 4 pt, a rulebook `advisory` finding) |
| `kind` | `kind` | `layout · spacing · typography · colour · component · state · navigation · touch-feedback · interaction · crash · data · identity · performance · logic · bundle · platform-limit`. `bundle`: the JS bundle on the device errs app-wide (a LogBox text, a renderer crash), not a page issue. `platform-limit`: no setting can do it; say why. |
| `expected` | `expected` | the design reference and value, or the rule's words |
| `actual` | `actual` | the device value in points (on WEB in CSS px at the width named), a hex from a pixel sample or the computed style, the text seen, or the config line read |
| `evidence` | `evidence` | file names in `R` and the numbers (`describe y657 h109`, `cache blocks <pageId> --name composer`); an issue without evidence is not written |
| `fix hint` | `fix` | what to change in block and style terms when the check can tell (`card radius 8 → 16`), else `—` |
| `cause` (optional) | `cause` | the layer the issue lives in (§ Cause): `config` · `event` · `data source` · `state` · `automation` · `object` · `agent` · `access` · `platform` · `environment` |
| `owner` | `owner` | `page` · `module:<id>` · `card:<pageId>` · `automation:<id>` · `agent:<id>` · `object:<id>` · `platform` · `person` · `none` |
| `device` | `device` | `config` (proven from config alone) · `queued:<kind>` (a device check waits in the queue) · `device` (measured on a simulator, or on WEB in a test runner's browser) · `run` (an issue with no screen, proven by automation test runs alone) |
| `status` | `status` | `open` at audit; then `fixed` (job) · `verified` · `still open` · `regressed` · `new` · `platform-limit-confirmed` · `not retested (<why>)` · `accepted` · `escalated` · `stale-build (QA <build> < fix <version>)`: the ticket was tested on a build older than the fix, so it waits for a retest on the current build |
| `attempt` | `attempt` | 0 at audit, one more per reopen; past `limits.maxAttempts` the issue goes to the person (the escalation question) |
| `steps` (optional) | `steps` | the recorded test of a reproduced issue, which every fix of it is retested with (a `replay`): `flow:<argent flow name> · steps:<steps file in R>` on MOBILE, `steps:<steps file in R>` on WEB or when no flow was saved; empty or `—` for every other issue. `loops issues lint` refuses any other shape, a flow without its steps file and a path outside `R`, and warns when a `reproduce` issue that is not escalated has none |

An issue on a shared module or card names the module in `owner`, and the
pages it shows on in `page` (`Home, Leave · module <id>`): it is fixed once,
in its own shared-module job, and every dependent page is retested. An issue
an automation owns names it in `owner` (`automation:<id>`) and the page that
showed it in `page`: it is fixed in the automation's own job, deployed once
its test run passes, and retested on that page. An issue in an AI agent's
instructions, tools or knowledge names it in `owner` (`agent:<id>`): its own
job, published on the release yes or the agent publish approval, retested on the page that chats
with it. An issue in an object's fields (a missing field, a wrong type, a
picklist value) names it (`object:<id>`): its own job, changed on the object
approval, the pages and automations that use it retested.

## Cause: the layer an issue lives in

Every issue may say which layer it lives in, so the person reads why it broke
before what changes. The reproduce stage finds it layer by layer; an audit
check and the triage set it from their rule or layer. `loops issues lint`
warns on a value outside the list and on an owner that disagrees with it.

| Cause | The issue lives in | Owner |
| --- | --- | --- |
| `config` | a block's or page's look, content or settings | `page`, `module:<id>`, `card:<pageId>` |
| `event` | a block's or the page's event chain: no action, the wrong one, the wrong order, a save with no refresh | `page` (or the shared module) |
| `data source` | a data source's inputs, outputs or bindings, or a read not run again after a write | `page` (or the shared module) |
| `state` | a page or app variable, a page input, session or local storage, a binding that reads the wrong key | `page` (or the shared module) |
| `automation` | an automation's logic: a failed node, a wrong value saved, a write that never ran | `automation:<id>` |
| `object` | an object's fields: one missing, a wrong type, a picklist value missing, a required flag | `object:<id>` |
| `agent` | an AI agent's instructions, tools or knowledge | `agent:<id>` |
| `access` | a role or permission no tool sets | `person` |
| `platform` | renderer code: config right, screen still wrong | `platform` |
| `environment` | the tenant's own setup: a connection, storage, a missing record the client keeps | `person` |

## Issue log (`issues/<check>-<group>.md`)

The header goes in before any issue, so a crash loses nothing measured:

```
# Issues — <check> · group <G> (<pages, short>)
- Run: <run-id> · stage audit-<check> · agent <name>
- App version seen: draft v<N> | published v<M> — proven by <version sheet | refetch call | cache read only>
- Version proof: <refetch call | version sheet | unproven (expected draft v<N>)>   (required in a retest or replay file that ran on a simulator; `loops issues lint` fails a retest-*.md without it)
- Simulator: <pool name> (<model>, <w>×<h> pt, safe top <n>), <Preview build kind and version> | none (config only)
- Signed in as: <test user name, never a password> | —
- Design source: <design/<app-id>/design.md row> (<frame width> wide; scale rule) | none
- Time: <start>–<end> UTC
```

On WEB the header has `- Browser: R/runners/web-<n>/browser/ · widths 1440, 375`
in place of `- Simulator:`, the version seen is `draft (preview route)`, proven
by open-page's `loadedAt`, and `- Design source:` names the spec of each width
that has one (`specs/home@1440.json`; `none` at 375 unless the design has a
frame there).

Then one table per page, with a `Cross-page (app shell)` table first for
issues that hold on every page:

```
| id | page (name · id) | region / element | check | rule | severity | kind | expected | actual | evidence | fix hint | cause | owner | device | status | attempt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PR1-03 | Home · e_… | upcomingCard b_… (Pressable) | touch-feedback | U1 | major | touch-feedback | white card highlights #EFF0F2 on press | no appearance.interactions | cache blocks <pageId> --name upcomingCard | interactions.highlightColor {custom:"#EFF0F2FF"}, opacity 1, scale 1 | config | page | queued:touch-feedback | open | 0 |
```

Footer: counts per page by severity, `Queued:` the device request ids, and
`Not reached:` one line per page with the reason. An older log with `pass`
and `round` header cells still parses. A reproduced issue adds the `steps`
column at the end:

```
| … | status | attempt | steps |
| RP1-01 | Products · e_… | favouriteButton b_… | reproduce | — | critical | logic | ♡ stays filled after a reload | ♡ empty after reload; the save answered 200 | repro/RP1-01/fail.png; network.json | write the favourite before the early return | automation:<id> | device | open | 0 | flow:repro-rp1-01 · steps:repro/RP1-01/steps.md |
```

The steps file itself is in the [reproduce stage](stages/reproduce.md)
§ What it hands on.

## Retest file (`issues/retest-<job>-<n>.md`)

Written by a `retest` and by a `replay` alike. The issue log's header with the
newest version seen, and the same table with `status` filled for every issue
of the request (a replay also names, per issue, the run count and the record
read in `evidence`). New problems on the same pages
get `<P><g>-R<nn>` and status `new`. `expected` and `actual` hold the new
measurement, `evidence` the new files. Footer, which is also the test
runner's `queue done --summary` line:

```
verified a · still open b · regressed c · new d · not retested e
```

## Fix report of a job (`jobs/<job>/fixes-<n>.md`)

```
# Fixes — <job> attempt <n> (<agent name>)
- Draft writes only. Nothing published or deployed. App <name>.
- Inputs: <issue logs and retest files, issue ids>.
- Every page was read live just before its write; only block, function and source edits; page inputs, events and messages unchanged (or: what changed and why).
- Payload files: <paths>.
- Device: queued <request ids> | checked on <pool name>, draft v<N>, proven by … | not checked on a device (every line below is a config read-back).

| id | page | result | change (block ids) | read-back |
|---|---|---|---|---|
| UI-b-06 | <Page> e_… | fixed | Card b_…: bg → bg-primary, padding 16 → 13/14 | b_… padding t13 r14 b13 l14, bg `var(--bg-primary)` |
```

`result`: `fixed · partly fixed (<what is left>) · platform-limit ·
needs platform (<queue line>) · needs automation (<what, which>: the
automation's job owns it) · blocked by data · skipped (<why>)`. The read-back
column quotes the live read, never the builder's intent. Then `## Not done`
and `## Notes for the orchestrator` (cross-page findings, anything another job
owns).

An automation job's report has the same table, its `change` the node or
lines changed and its `read-back` the saved code read back, plus one line per
issue under `## Test runs`: `<issue id> · before <run id> <status> · after
<run id> <status> · ordinary case <run id> <status>`, and the deploy that
followed the passing test: `Deployed: v<n> on <time>, read back by
search_workflows` (or `Deployed: no (<why>: the test after failed, a caller
job has not saved yet)`).

## Check result (`accept/<feature>/<n>/run-<k>/result.md`)

Written by an `acceptance` or a `realtime` check, attempt `<k>`. The header
first, then one row per line of the steps file it checked:

```
# Check — accept <feature> · A<n> · attempt <k> (<acceptance | realtime>)
- Run: <run-id> · runner <n> · request <id>
- Version seen: draft v<N> | draft (preview route) — proven by <refetch call | open-page loadedAt>
- Device 1: <pool name | browser folder>, signed in as <test user> · Device 2 (realtime): <pool name | browser folder>, signed in as <user>
- Time: <start>–<end> UTC; t0 <the end of the last step>

| line | kind | expected | seen | evidence | verdict |
|---|---|---|---|---|---|
| Expect | expect | the first card shows "Approved" | "Approved" | pass.png | passed |
| Effects 1 | record | Usage event · newest row of the test user · event = approve_tap | event = approve_tap (row e_…) | get_records limit 5 | passed |
| Effects 2 | run | Track usage event · success · after step 2 | — | ended step 2 at 10:42:07Z | not checked (main session) |
| Watch 1 | watch | device 2 shows "ZZ_LOOP_build_request" within 20 s | shown after 14 s | watch-end.png | passed |
```

`kind` is `expect`, `record`, `run` or `watch`; `verdict` is `passed`,
`failed` (with what was seen, and `shown after <s> s` for a late watch
line) or `not checked (<why>)`. The orchestrator fills a `not checked` row
from the main session before it judges. Footer, which is also the test
runner's `queue done --summary` line:

```
passed a · failed b · not checked c
```

## Test runner reply

A test runner writes the result files its request names (a retest file, a
visual check's `gaps.json` and report, touch feedback shots and their issues,
a performance check's step files), marks the request done, and ends with one
reply under 20 lines:

```
Runner <name> on <pool name> · served <n> · failed <f> · still queued <q> · reservation released
- <request id> <kind> <job or page>: <the summary line> → <result file>
- <request id> failed: <reason>
```

A WEB test runner's first line names its browser instead
(`Runner web-<n> (browser) · served <n> · failed <f> · still queued <q> · browser closed`),
as web-browser's [test runner](../../../web-loops/web-browser/references/runner.md) says.

## Platform queue

`issues/platform-queue.md`, one line per renderer item no page setting can fix:

```
- <issue id> <what is wrong> — <component or area> (<evidence path>) — config key wanted: <key, optional, default keeps today's look> | none
```

Each item ends as a handoff note ([fix stage](stages/fix.md) § Handoff note).

## Triage table (`issues/triage-<n>.md`)

The issue plus two columns at the front: `source` (the list's own
number or the ticket key, `D4`, `PROJ-123`) and `layer`. `expected` holds the
client's words verbatim; `actual` what the source or the copy shows.

```
| source | layer | id | page | target | check | rule | severity | kind | expected | actual | evidence | fix hint | cause | owner | device | status | attempt |
```

- `layer`: `page config · page state · module or card · automation · AI agent ·
  object · data or identity · migration gap · platform · environment ·
  known or decided · needs repro · out of scope`.
- `cause` and `owner` follow the layer ([triage stage](stages/triage.md) § Layers).

Sections after the table: `Needs a person on the client side`,
`Migration gaps` (what the move must include), `Decided, not changed`. No
personal data: "a real name", "a balance of N", never the value.

## Board (`board.json`, `board.md`)

The orchestrator's state. `loops run start` writes `board.json` first, with
the goal, the platform, the scope and the limits, before anything else in the
run folder; a run folder without one is a run that skipped its start, and
`loops board --check` warns on it. The orchestrator rewrites `board.json` after
every event; `loops board` renders `board.md` from it (`--html` also writes a
self-contained `board.html`). A resumed run reads `board.json` first.

```json
{ "goal": "fix", "platform": "MOBILE", "scope": "Home, Leave (+7 dependents)", "publish": "draft v52",
  "platformQueue": 1, "limits": {"agents": 10, "pool": 3, "maxAttempts": 4, "jobMinutes": 50},
  "finished": false,
  "jobs": [
    {"job": "Home & chat", "pages": ["Home", "Chat history"], "issuesOpen": 7, "state": "testing",
     "agent": "app-agent-home", "attempt": 2, "since": "10:42", "lastFile": "jobs/home/fixes-2.md", "requestIds": ["v_…"]},
    {"job": "module header", "pages": ["(8 dependents)"], "issuesOpen": 1, "state": "queued for test",
     "agent": "app-agent-header", "attempt": 1, "since": "10:40", "lastFile": "jobs/header/fixes-1.md", "requestIds": []}
  ] }
```

`board.md` shows one row per job:
`| job | pages | issues open | state | agent | attempt | since | last file |`.
An audit group is a job named for its check and group (`audit touch-feedback · 2`).

`state`: `waiting · auditing · reproducing · building · queued for test ·
testing · reopened · platform · deploying · publish approval · object
approval · passed · accepted · escalated`. `publish` is
`draft v<N>`, `published v<M>` or `asked <time>`. The turn ends with the
board's one-line summary whenever the run waits on agents or test runners.

## Job state (`jobs/<job>/state.json`)

A background agent stops when its session closes, so each job keeps this file
current: `loops run job-state --run <R> --job <job> --step "<what it just did>"`
at every step (before a write, after a read-back, after a queue add). A later
session reads it with `loops run resume`.

```json
{ "job": "home", "agent": "app-agent-home", "step": "saved draft, read back b_card", "attempt": 2,
  "undoLog": "data/undo-log.jsonl", "requests": ["v_1a2b"], "updatedAt": "2026-10-16T10:42:07.000Z" }
```

`step` is the last thing that finished, never what is about to start. `undoLog`
is a path inside `R`; `requests` are the queue request ids the job holds.
A job older than `limits.jobMinutes` that is not `passed` is treated as dead.

## Shots (`shots/`)

What the person sees at the end of a fix or build run: the screens before
and after each fix, or each page as built. One folder per screen of one page,
written only through `loops shots add`, which copies the PNG in and merges
`shot.json`:

```json
{ "id": "UI1-03", "page": {"id": "<pageId>", "name": "<Page>"}, "state": "top of page",
  "title": "An approved order still shows Submit, not Reorder", "issues": ["UI1-03", "UI1-04"], "order": null,
  "before": {"file": "before.png", "width": 1206, "height": 2622, "version": "draft v12", "by": "runner 1", "at": "…"},
  "after":  {"file": "after.png", "width": 1206, "height": 2622, "version": "draft v14", "status": "verified", "issues": ["UI1-03", "UI1-04"], "by": "runner 2", "at": "…"} }
```

| Run | Shot id | Before | After | Design |
| --- | --- | --- | --- | --- |
| `fix` | the first issue the screen shows | `fail.png` of a reproduced issue; a `capture --side before` for every other issue on a screen, before its job writes | the retest or replay of the fix, in the before shot's `state`, with `status` (`verified` · `still open` · `regressed`) and the issues it proved | — |
| `build` | the page id, then `<pageId>-v<k>` down the page | — | a `capture --side after` once the last write is done | `design/<app-id>/screens/<page>.png`, for a page built from a design |

`loops shots compose --run <R> --open` writes `shots/sheets/` afresh and
opens it: in a fix run one `before-after-<shot id>.png` per shot whose after
side says `verified` (BEFORE left, AFTER right, the title, the page, the state
and the issues fixed above them); in a build run one `built-<pageId>.png` per
page (the design first when there is one, then up to four shots down the
page) and `built-overview.png` with every page's top shot when there are two
or more. It names every shot it left out and why (no before shot, no after
shot, the after side still open). Screenshots stay out of the context: the
sheets are for the person, never read back by the session.

## Undo log (`data/undo-log.jsonl`)

One line per data change, written before the change; format and restore step
are in [loop-test-data § Undo log](../../loop-test-data/references/undo-log.md).

## Scope tickets (`tickets.json`, `keys.json`)

The scope loop's slicing of one PRD version, written by the
[tickets stage](stages/tickets.md) and read by `loops scope tickets-check`
and `loops scope tickets-render`:

```json
{
  "tickets": [
    { "slice": "T0", "title": "Foundation: data model, roles, app shell",
      "goal": "The app exists with its objects, roles, navigation and look.",
      "checks": ["The Leave request object holds the fields the plan names."],
      "data": ["Leave request (new)", "Balance (new)"] },
    { "slice": "T1", "title": "Leave request: apply and my requests",
      "goal": "An employee applies for leave and follows its status.",
      "requirements": ["R1"], "screens": ["S1", "S2"], "depends": ["T0"],
      "data": ["Leave request (made in T0): writes dates, type, status"],
      "automations": [], "outOfScope": ["Approvals (T2)."] }
  ],
  "later": ["R7"]
}
```

`requirements`, `screens` and `later` name the PRD's ids; a ticket's
acceptance lines are its requirements' `A` lines, word for word, then its
own `checks`. `keys.json` holds each ticket the person filed: `{ "T0": { "key":
"ABC-101", "url": "<link>" } }`. `rendered.json` is what
`tickets-render --out` wrote: per ticket its `title`, `description`, `links`,
`idempotencyKey`, `layer` and whether it is `ready` to file. `--files` writes
the same bodies as one Markdown file per ticket, with an `index.md` in build
order.
