# Parallel walk — one helper per page

## Contents
- The run file
- The scan
- The map
- The page queue
- Dispatch and the watch
- When the walk ends
- The merge
- Recovery
- Resume

The main session's steps for the walk. How a helper walks its page, and
the fragment it writes, are in [traversal.md](traversal.md).

Every command below is
`node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" <command> --run <firing>/run.json …`.
From the map to the merge, change `run.json` only through `pages.mjs`.
`pages.mjs note` sets `stage` and the helper cap, marks a user dropped,
and appends to `stalls`, `sessions`, `sessionsRefreshed`, `wouldHaveAsked`
and `reportLines`.

## The run file

`<firing>/run.json`, rewritten whole, never edited in place:

```json
{
  "loop": "survey-loop",
  "firingId": "<id>",
  "stage": "traverse | propose | check | report | done",
  "contract": "<absolute path of tests/<app slug>/survey-contract.md>",
  "kickoffEndedAt": "<ISO time of the first write of this file>",
  "sessions": [ { "id": "<Claude session id>", "transcript": "<absolute path of its .jsonl>" } ],
  "platformScreenUrl": "<url>",
  "appUrl": "<the app under test>",
  "interfaceId": "<id, or \"__UA__PLATFORM__\">",
  "subject": "builder app | code app | platform",
  "viewport": { "width": 1133, "height": 744 },
  "device": { "type": "tablet", "variant": "ipadMiniH", "userAgent": "<as the tool answered>", "isMobile": true, "hasTouch": true },
  "browserConfig": "<firing>/device.config.json",
  "users": [ { "id": "<user id>", "username": "<username>", "role": "<role name>", "signInFile": "<absolute path>", "dropped": "<why, once a user is left out>" } ],
  "privateFolder": "<the folder private-folder.mjs prepare printed>",
  "pluginRoot": "<the plugin's folder, written by pages.mjs init>",
  "base": "<the app's root URL every page address hangs from>",
  "within": [ "<a named area's path, on a survey of the platform>" ],
  "globalNav": [ { "label": "<label>", "hook": "<hook>" } ],
  "chrome": [ { "label": "<label>", "hook": "<hook>" } ],
  "pages": [ "<one entry per page: The page queue>" ],
  "helperCap": 8, "contractHelperCap": 8, "helperCapFloor": 4, "helperDeadlineMinutes": 45,
  "traverseStartedAt": "<ISO time of the map>",
  "walkClock": { "since": "<ISO time the walk's clock last started>", "before": 0 },
  "budget": { "surfaces": 120, "minutes": 120, "surfacesUsed": 0, "minutesUsed": 0 },
  "journeyLength": 8,
  "depth": "core",
  "stalls": [ { "at": "<ISO>", "kind": "<5xx | session | profile locked | browser quit>", "recovered": true } ],
  "sessionsRefreshed": [ { "at": "<ISO>", "userId": "<id>" } ],
  "wouldHaveAsked": [ { "question": "<the question>", "proposedField": "<field>", "proposedDefault": "<default>" } ],
  "reportLines": [ "<a line for the report's Run facts>" ],
  "reviewSheet": { "fileId": "<the Google Sheet's Drive file id>", "url": "<its link>" },
  "throwaways": [ { "record": "<what the walk created>", "deleted": true, "page": "<key>" } ]
}
```

Find the transcript path with `ls` (`stalls.md`, _The run file_).
`viewport`, `device` and `browserConfig` are `null` for the platform.
From `pluginRoot` to `budget`, and `pages`, `throwaways` and helpers'
`wouldHaveAsked`, only `pages.mjs` writes.

## The scan

At kickoff, before the hand-off (`SKILL.md`, step 6). Three rules bind:

- **The scan is done only when `scan status` answers `ready: true`.**
  Never judge yourself that nothing new turns up: the script does.
  `init` refuses until then. You MUST NOT pass `--allow-incomplete-scan`
  to get past it; its one use is a record you tried to make and could not
  (the app refused, or the AI generation wait ran out with no record),
  and that reason goes in `reportLines`.
- **Every route in `needsSeed` MUST get a throwaway record made at this
  scan**, named `qzx<digits> survey throwaway <page>`. The script refuses
  any other name and the folder's own solution (the one `/ua:setup`
  opened, whose id is in the folder's `.nebula/sync.json`): a seed is
  renamed, edited and deleted by its helper. NEVER seed a route with a
  record the person, another run or a fixture made.
- **A record type the app builds with an AI is seeded built.** When the
  record's pages show their controls only once an AI has generated
  something (a solution's overview, plan, versions, insights and settings
  exist in full only on a built solution), every seed of that type MUST
  be made through the AI path with the contract's AI generation prompt
  (`survey-contract.md`; the Solution Builder's default is a hello world
  app). Never skip a surface because it needs a built record: build the
  record.

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" scan add    --run <firing>/run.json --at <URL the links were read on> --links <file> [--base <root URL>] [--within <path>]... [--page-paths <file>]
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" scan seed   --run <firing>/run.json --route <route> --url <the record's URL> --record "<qzx… survey throwaway …>" --record-id <id> --delete-by "<how>" [--built]
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" scan status --run <firing>/run.json
```

`scan add` reads the links file as `walk.mjs links` printed it (the JSON
under its last `### Result`), marks the page at `--at` scanned, and
records every same-origin link inside the area as a route. Its answer, and
`scan status`, list what is still owed: `unscanned`, routes never opened
for their links, and `needsSeed`, routes that name a record
(`/p/0/solutions/:id/plan`, a page-list address with parameters) and have
no seed. The scan keeps `<firing>/scan.json` and writes
`seed-records.json` from the seeds.

The procedure, repeated until `ready` is `true`:

1. **An application, builder or code, has a page list.** Save the reply of
   `mcp__plugin_ua_application-builder__get_page_paths` (tenant `host`,
   `interfaceId`) to `<firing>/page-paths.json` and pass it to the first
   `scan add` as `--page-paths`. It is the completeness oracle: every page
   in it is walked by URL or ends as a `notWalked` node, and a listed page
   needs no links read. When a code app's reply is empty, read its routes
   from the router in the source `get_branch_codebase` writes, and `scan
   add` each as a link of the landing. Only its record pages (addresses
   with parameters) need seeds: step 3.
2. **The platform has none: read links until `unscanned` is empty.** In
   the first user's keeper, one call per route:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/walk.mjs" "<keeper>" goto <URL> -- wait-for "<text the page shows>" -- links > <firing>/scan/<n>.txt
   ```

   then `scan add --at <URL> --links <firing>/scan/<n>.txt`; the first
   call also carries `--base <origin>` and the area as `--within`. Walk
   nothing. Chrome links lead outside the area; `scan add` lists them as
   `outside` and they are never followed.
3. **Seed every route in `needsSeed`, in one batch.** One throwaway per
   record route, except the deeper routes `scan status` lists under
   `shareable`: the routes two or more levels under a record route (the
   Settings sub-pages, `/:id/settings/users`, `/:id/settings/teams`,
   `/:id/settings/roles/create`) share one seed among themselves. Seed the
   first of them as its own record; each other one takes it with `scan
   seed --route <it> --share-with <that route>`, which places that record
   at the deeper route's own address. The record route and its first-level
   tabs each keep a seed of their own, because their pages rename, delete,
   publish or restore the record. A shared seed is marked `shared` in
   `seed-records.json`: its helpers never rename, delete, publish or
   restore it (`traversal.md`, _A record made for your page_), and the
   main session deletes it at cleanup.
   - **An AI-built type:** from the creation surface in the keeper, send
     the prompt once per route, one after another, without waiting for
     any build: `goto` the composer, `fill` the prompt (the contract's,
     with the throwaway name in it), `click` send, `wait-for` the new
     record's page, then `eval "() => location.href"`: that URL names the
     record and its id, and is the seed's `--url`. Go back and send the
     next. The Solution Builder's composer lands in about 20 seconds and
     builds on in the background. Record each with `scan seed`, then wait
     for all of them at once: poll the list or each record's status
     (the Status column, the overview's build steps) with `loop.mjs
     pause --seconds 60` between reads, never `sleep`, up to the
     contract's AI generation wait. Re-record each built one with
     `--built`. A seed still building when the wait runs out stays the
     route's seed without `--built`, and the actions behind the build on
     that page become rows, `could not reach: AI generation took over
     <minutes> minutes`.
   - **Any other type:** the cheapest path the app offers, a platform tool
     that makes that record type, else the app's own creation UI in the
     keeper; the record's URL is the seed's `--url`.
   - A missing prompt: draft one from what the surface asks for; when you
     cannot tell what a minimal output needs, ask the person before the
     hand-off, in one AskUserQuestion for every such path, with your
     draft as the recommended option (`SKILL.md`, step 6). After kickoff, a path with no prompt makes the
     actions behind it rows, `could not reach: AI generation has no
     prompt in the contract`.
4. **Open every seed for its links.** A seeded route is `unscanned` again:
   `goto` its URL, `links`, `scan add`. The tabs of a record page are
   routes of their own (`/overview`, `/plan`, `/memory`, `/skills`,
   `/insights`, `/versions`, `/settings/users`), each a new record route
   in `needsSeed`: back to step 3. A sub-page of a tab (`/settings/teams`)
   is `shareable` with the tab's seed: share it, then open it for its
   links too. For the Solution Builder that is about
   eight built seeds; the sends take a few minutes, the builds run side by
   side, and the scan ends within the AI generation wait.
5. **The catch-all is opened at the address the scan minted.** A router's
   `*` (or a page list's) is recorded as the route `/*`, and `scan add`
   and `scan status` answer `fallbackUrl`, the one address no page has
   (`/qzx<digits>-no-such-page`) that the scan, `init` and the helper all
   open it at. To scan it: `goto` that address, `links`, `scan add --at
   <that address>`; any other address stays a route of its own and leaves
   `/*` in `unscanned`. A route read from a router (step 1) goes in as a
   file holding `{"links":[{"path":"/*"}]}`, one entry per route, passed
   to `scan add --at <the landing's URL> --links <that file>`.
6. **Pages that only show an AI output are never pages of the walk.** A
   generated app's preview, an artifact viewer that holds only the
   generated content: their content is Eval's to judge
   (`traversal.md`, _AI-generated output_). Pass each to `init` as
   `--skip`.

When `ready` is `true`, say one line to the person (routes, seeds, built
seeds, minutes) and go to the hand-off. `init` then takes the base, the
area, every scanned route and every seed's URL from `scan.json`: pass it
no `--route` and no `--within` for these. A page the walk still meets as
an exit is marked `lateFound`, `stats` counts the `waves`, and the report
names both, so the next run's scan reaches them.

Why the gate: a page the scan missed starts only when a helper meets it
as an exit, in a later wave, and the slowest page of each wave sets the
pace of the whole walk.

## The map

Once, right after kickoff, in the first user's keeper:

1. Open `appUrl`, apply the readiness pair, take one full snapshot. The
   URL the app lands on is the entry.
2. On a survey of the platform, read the shell and the links in one call
   (the scan already made this call: use its output), after the shell has
   rendered whole: its last controls (the AI FDE button, the branch
   switcher) land after the page's first text, so `wait-for` one of them
   first, and read again when the list lacks either:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/walk.mjs" "<browser folder>" wait-for "AI FDE" -- shell -- links
   ```

   Write the shell's controls to `<firing>/chrome.json`: the platform's
   own frame (the side navigation, the AI FDE button, the tenant and
   branch switchers) is chrome, which no helper numbers. **In a builder
   or code app nothing is chrome**: `chrome.json` is `[]`, `init` refuses
   a list for an app, and the app's frame is walked whole by the frame
   helper (step 4). Write `journeys.json` with `appUrl`, the chrome, the
   kickoff's PRD `requirements`, and empty `entry`, `nodes` and `edges`.
   Drop every link to an untouched control (`traversal.md`, _What is never
   touched_, and the contract's): a helper opens its URL first thing.
3. The page list is the scan's (_The scan_): `init` reads `scan.json`,
   with `page-paths.json` for an application, the scanned routes for the
   platform, and the real address of every record page from its seeds.
   The helpers' exits catch anything the scan missed, as `lateFound`.
4. Find the frame's controls by exploring: beside the entry, open two or
   three other pages from the page list or the links, and compare the
   frame around the page body on each (the navigation, a header, a side or
   bottom bar, a footer, a floating launcher such as an assistant). Write
   each control that repeats on them to `<firing>/global-nav.json` as a
   `{ "label", "hook" }` entry. Judge by what repeats, never by a fixed
   list. `init` queues one entry for the frame, `"frame": true`, whose
   helper walks it once: in an app the whole frame, every control and
   state of it, listed or not (`traversal.md`, _The app frame_), so an app
   gets this helper even when `global-nav.json` is empty; on the platform
   only the module's shared controls the file lists. Every page helper
   skips the listed hooks. A control missed here is caught after the merge
   (_A frame control the map missed_).
5. Queue the pages:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" init --run <firing>/run.json --base <the app's root URL> --entry <the URL the app landed on> --page-paths <firing>/page-paths.json --global-nav <firing>/global-nav.json --chrome <firing>/chrome.json --helpers <contract> --deadline <contract> --surfaces <budget> --minutes <budget> --max-edges <the contract's journey length> --depth <the contract's depth>
   ```

   `--base` is the deployed URL `derive_matrix_url` answered (the
   platform: its origin); with a `scan.json`, `init` takes it, the area
   and every route from there, and `--route`, `--within` and `--base` are
   only for a run with no scan. Each seed's `startUrl` gives a page-list
   address with parameters its real URL, and a platform record route its
   own, so no page waits in `needs-url` for an exit and the first tick
   dispatches every page. A page whose address names a test or scratch page
   (`test123`, `tmp`, `untitled-2`, `copy-of-…`) is skipped, as are the
   pages the contract's Pages to skip field names (`--skip <path>` each);
   a Pages to skip value of `none` is `--walk-test-pages`, which keeps the
   test pages in. On a survey of the platform only, pass each named
   area's path as `--within <path>`: the walk takes those screens and the
   screens they open; an app's areas narrow the scenarios, never the walk.

## The page queue

`run.json`'s `pages` holds one entry per route, written only by
`pages.mjs`. Its `state`:

| State | Means |
|---|---|
| `queued` | waiting for a helper |
| `needs-url` | a page-list address with parameters (`/orders/:orderId`), waiting for the first exit that reaches it with a real URL |
| `unplaced` | the page list gives it no address |
| `walking` | a helper has it |
| `walked` | its helper walked every state of it as every role |
| `redirected` | its URL opened another page (`landedOn`), as a sign-in page does for a signed-in user |
| `unreachable` | it does not open for any test user of the run (`reason`) |
| `failed` | its helper did not finish (`reason`) |
| `stopped` | the walk stopped before a helper took it (`reason`, from `pages.mjs stop`) |
| `skipped` | a test or scratch page, one the contract skips, or a screen one hop outside the named areas (`outsideArea`, kept so the exit has a node): never walked, its row `outside the cap or the named areas` |

One entry, `"frame": true`, is the app frame: no `route`, so no URL is
ever matched to it, and its `startUrl` is the entry's. The tick dispatches
it first.

A router's catch-all (`*`, `/:path*`, `/(.*)`) is the page `fallback`,
route `/*`: the app's not-found state is a surface of the app, opened at
the scan's `fallbackUrl` (_The scan_, step 5); `pages.mjs route` reads
that address back as `/*`. When it renders another route's page, its
helper records one node and `sameAs` (`traversal.md`, _A page that
renders another page_).

A page whose helper reported `walked` but whose fragment fails the depth
check (`traversal.md`, _The depth check_) is `queued` again, with the
problems in `walkProblems`, only when it has been dispatched just once. A
page already redispatched after its deadline has had its second dispatch
and is not sent back; its next helper continues
from the fragment, and the second report stands.

Two URLs with one route are one page (`/orders/42` and `/orders/43`);
`pages.mjs route --url <URL>` says which. `report` queues each exit whose
route is new, and gives a `needs-url` page its first real URL.

## Dispatch and the watch

Right after `init`, run one tick (step 3) and dispatch what it names
(step 4). Then the watch, as the create loop's watch runs
(`app-test-create-loop/references/stalls.md`, _The watch_): one
foreground `loop.mjs pause --seconds 120`, the reports that arrived
meanwhile, one tick, the next pause, until the walk is done. Never end the
turn to wait and never wait with a background `sleep`. Each tick:

1. **Reports.** Every helper that reported since the last tick, in one
   call: `pages.mjs report --run <run.json> --key <key> --key <key> …`. It
   reads each page's fragment, sets the page's state, reason and
   surfaces, copies its throwaways and `wouldHaveAsked` into `run.json`,
   and queues its exits. A page it answers `sentAgain: true` for failed
   the depth check: it is `queued` again with its `problems`, and the
   next tick names it for dispatch; nothing to do now. A helper that
   ended without a report, or reported `failed`, gets a call of its own:
   `report --key <key> --status failed --reason "<its error>"`. A report
   whose `notes` carry a planted-instruction line goes into `reportLines`
   (`ua-safety`).
2. **Sessions.** The heartbeat of `sign-in.md`, _Keeping sessions alive_,
   in every keeper.
3. **The tick:**
   `pages.mjs tick --run <run.json> --load <the 1-minute load from uptime> --cores <the CPU count> --failed-5xx <tenant 5xx answers in a row>`.
   It answers `pastDeadline` (`redispatch` the first time, `fail` the
   second), the helper `cap` and any `capChange` (record it with
   `pages.mjs note --cap <n>` and a `reportLines` entry), the 5xx
   `backoffMinutes`, the page keys to `dispatch` now, the `budget`, and
   `done`. Act on it; never decide a number again.
4. **Dispatch.** Every key it names, in one call:
   `pages.mjs dispatch --run <run.json> --key <key> --key <key> …`, which
   answers each one's `helper` name (`discover-<key>`, or
   `discover-<key>-<attempt>` for a page sent again) and `job`, and for a
   page the depth check sent back its `problem`. Then one message with an
   `Agent(subagent_type: "ua:test-discover-agent", name: "<helper>",
   prompt: "Run file: <absolute path of run.json>\nJob: <job>",
   run_in_background: true)` per key, with a third line `Problem:
   <problem>` when the answer has one. A page sent again after the merge
   (_The merge_) goes in the same `dispatch` call as any other key.
5. **Progress.** The line `SKILL.md` gives, after every tenth surface
   walked.

## When the walk ends

The walk is over when the tick answers `done: true`: no helper is
walking, and no page is queued, or the budget is reached. The budget is
the contract's traversal budget, counted over the whole run: surfaces
walked by every helper, with the pages still walking counted at the
average size of the pages reported (`projected` in the tick's answer), and
minutes of walking since the map (a resumed run's clock starts again where
it stopped). Once it is reached nothing new is dispatched; the helpers already walking finish their pages, and every
page still queued becomes a node `could not reach: traversal budget`. The
report's first lines say the budget stopped the walk and how many pages were left. A tenant 5xx
is a pause, not an end: the tick's back-off.

## The merge

When the watch ends:

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-discover-loop/scripts/pages.mjs" merge --run <firing>/run.json
```

It checks the joined graph at the contract's journey length (`run.json`'s
`journeyLength`, set by `init --max-edges`; `--max-edges` here overrides
it), the same length `loop.mjs journeys` and `survey-check` take, so a
graph the check accepts is never a merge problem. It joins the fragments
into `journeys.json` (keeping `appUrl`, `chrome`
and `requirements`), copies the survey files to `survey/` with the run's
ids, and gives every page with no walked node one node marked
`notWalked` with its row's reason. The graph's `entry` holds the entry
page's first node and the frame's first node.

It answers `notWalked`, `orphans` (pages opened only by their URL; their
scenarios start there), `problems` and `stats`. A problem names the page
whose fragment the coverage check would refuse: `dispatch` that
page again on its own (it names the helper `discover-<key>-<attempt>`),
and add the problem as a third line of its message, `Problem: <the
problem>`; it fixes its fragment from its own walk. When it reports,
`report` that page again (it is `walking` until you do), then merge
again. When the merge still names it, rename the fragment to
`fragment.rejected.json`, `report --key <key> --status failed --reason
"<the problem>"` (the page's throwaways stay in `run.json`), and merge
again. Never edit a fragment or `journeys.json` by hand to make the merge
pass.

**Chrome by repetition, on the platform.** On a platform survey whose
screens carry no shell markers, chrome is found once the merge has run: a
control with the same hook on the entry node and on two more nodes of
different routes, whose action leaves the contract's area or opens a
panel the area does not own, is chrome. Move its ids from those nodes'
`inventory` and `inventoryKinds` to the graph's `chrome`, the one
correction of `journeys.json` the coverage check allows (`journeys.md`,
_When the check is not complete_). The module's shared controls stay what
they were, one set of `nav` edges from the app frame node.

**A frame control the map missed, in an app.** Nothing of an app is ever
moved to `chrome`. The same control on the entry node and on two more
nodes of different routes is a frame control a page helper recorded by
mistake. When the frame node's inventory already holds that hook, take
the ids out of the page nodes' `inventory` and `inventoryKinds` now; only
when it does not, `dispatch` the frame page again with `Problem: frame
controls missed: <label (hook)>, …`, `report` and merge again, then take
the ids out. That removal is the one correction allowed for an app.

Once the merge answers no problem, `run.json` is the main session's
again. `pages.mjs stats` gives the report's walk numbers: `wallMinutes`,
`helperMinutes` (what one walker would have taken), `sideBySide`, the
longest page, the `waves` (one for the pages the scan knew, plus one per
distinct first dispatch of a page the walk found late: a second pass, or a
page the helper cap held back, is not a wave), the `secondPasses` the depth
check asked for, `depthHistory` (every pass's problems word for word, with
`resolved`, and `why` when a page could not be sent back because its seed
was gone), the `depthProblems` a page's last report still left, and
`sameAs` (the pages that render another route's page).

## Recovery

| Stall | Recovery |
|---|---|
| A helper past its deadline | Stop it, then act on the tick's `pastDeadline` answer: `redispatch` is a `dispatch` of the page again (the script names the helper), `fail` is `report --key <key> --status failed --reason "past its deadline"`. The new helper continues from the fragment. |
| A page the depth check sent back | Nothing to decide: `report` queued it again with its problems, the tick names it, `dispatch` carries them as its `Problem:` line. The second report stands, and the report's Run facts list what it left. |
| A helper reports `failed` with `signInFailed` | Refresh that user from its keeper (`sign-in.md`), then `dispatch` the page again. A keeper whose own session has expired cannot refresh it: `note --drop-user <id> --reason "<user>'s session expired"`, and `dispatch` the page again. |
| Every user's session has expired | `pages.mjs stop --reason "session expired"`: every page not yet taken becomes a surface `could not reach: session expired`; wait for the helpers still walking, then merge. |
| A helper that could not be started | Send it once more as `discover-<key>-2`; a second failure is `report --status failed`. |
| Tenant 5xx | The tick's back-off: nothing is dispatched while it lasts. |
| Machine load | The tick lowers the cap by 2, never below the floor; record it with `note --cap`. |

Each recovery is one `stalls` entry, appended with `pages.mjs note`.

## Resume

A resumed run reads `pages` from `run.json`. First
`pages.mjs folders --run <run.json> --private-folder <the new folder>`:
every page's browser folders move to the new private folder, and the
walk's clock starts again where it stopped. A user whose saved sign-in no longer loads
is `note --drop-user`. A page still `walking` lost its helper with the
session: dispatch it again (it continues from its fragment and its
`rolesDone`); `queued` pages are dispatched as usual. A page `walked`
before the stop is never walked again.
