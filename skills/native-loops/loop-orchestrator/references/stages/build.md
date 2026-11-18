# Stage: build

## Contents

- Scope it
- Plan it
- Build it
- After the build
- Plan shapes the stage writes
- On a WEB app
- Done when

Builds a new page, a new feature on existing pages, or a whole new set of
pages from an approved design, as drafts through one UnifyApps Headless plan whose
builders run in parallel, then hands every page to the device queue. The
orchestrator writes the spec and the tasks; UnifyApps Headless's run loop dispatches the
builders. Replaces the old create-page and add-feature loops.

Needs: the approved entries of the [design store](../design-store.md) for every
page it builds or reshapes ([design intake](design-intake.md)). A feature the
person describes with no design goes through the [feature stage](feature.md)
instead, which uses this stage's plan shapes.

## Scope it

1. `ua state resolve --request "<as typed>"`; `ua solution locate --link`
   for any link; `ua entity context page <id> --app-id <appId>` and
   `ua cache outline|ds|events` for each page the change touches;
   `ua impact page <id> --app-id <appId> --change logic`.
2. `loops impact <appId> --page <id>` (or `--module`, `--card`) for each touched
   page and shared item: every dependent page joins `scope.json` as a page to
   retest, not to build.
3. Count the entities: impact rows found plus new ones. Sonic (a quick plan)
   when at most 3 entities, no new page and no stored-data change; Zen
   otherwise.
4. The run settings, asked once, at most four questions with defaults filled:
   - **Design**: which frames or prototype screens, and their states (loading,
     empty, error frames found by name). A design with no loading frame still
     gets a loading state for every data region (Plan it, step 2).
   - **Connects**: a bottom-bar tab (recommended when the frame shows the bar)
     · pushed from `<page> · <button>` · a sheet from `<page>` · not linked yet;
     free text for page inputs (`name:type`).
   - **Data**: at most three candidate automations by name with their inputs
     (`ua cache wf <id> --contract`) · nothing yet, a static page ·
     something is missing (an `automation · create` line).
   - **Access**: private, pushed (recommended) · private, sheet · public.
   Memory lines about the app become business rules without asking.
5. `drift.mjs snapshot` on every existing page the change touches.

## Plan it

1. **Planner lines.** For a new page or a reshaped region,
   `ua:app-page-planner` gives the method for the `job` and `design` lines,
   derived from the design spec (design intake § 5). No `app look` line when the
   app exists.
2. **Loading states.** For every page the plan builds or reshapes,
   `ua:native-loading-states`' [plan](../../../native-loading-states/references/plan.md): the data regions, a
   `loading ·` Contract line per region with its skeleton and box, and the
   page's loading-states task. The design's loading frame wins when it has
   one; with none, the plan still writes them.
3. **Spec and tasks** under `.sessions/<sid>/drafts/`, in the shapes below,
   then `ua spec check --md-file <spec> --json`.
4. **Lint.** `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/task-lint.mjs" <tasks.json> --platform <MOBILE|WEB>`
   must pass. T24 refuses a page that reads a source with no task for its
   loading states, on both platforms.
5. **Propose.** Zen: `ua plan propose --file <spec> --tasks-file <tasks> --preview --mode zen --json`;
   Sonic: `ua plan propose --request "<as typed>" --task '<json>' --mode sonic --json`.
   Then the plan approval, then `--save --hash <hash>` and `ua plan start <planId> --json`.

## Build it

`ua:ua-change` § Run a plan, as written: copy every `Agent(...)` call
the run loop prints, answer `R.ask` with `AskUserQuestion`, `R.needsYes` with
`plan confirm`: a `deploy` task the plan preview named is confirmed at once,
with no question, once its automation's test runs passed, when the tenant
said it is UAT at sign-in; on any other or unknown environment it waits for
the person's yes ([approvals](../approvals.md) § Automation deploys ask nothing);
an AI agent publish, an app publish or a delete asks the person first. Inside a loops run the run loop may keep up to
`limits.maxAgents` builders at work, not six. Each `ua:app-agent`
builder loads `ua:app-native`, `ua:app-design`, `ua:app-craft` and
`ua:app-theme` itself on a MOBILE app, and `ua:app-design`, `ua:app-craft`,
`ua:app-theme` and `ua:app-verify` (never `app-native`) on a WEB app; the
orchestrator never loads them. Log every
dispatch with its full prompt. Builder refusals and builder-UI steps leave by
the [fix stage](fix.md)'s main-session and manual-step jobs. `drift.mjs check`
after every batch on every page the plan touches.

When the plan's run loop says "Run the page quality pass", run
`ua:app-page-quality` as it says. When it reaches `plan finish`, go on
below; the plan stays open for the fix tasks the device brings back.

## After the build

Before any `impact` or queue step, re-read the app into the cache, so the
pages just built have their names (`loops impact` names a page it has not
cached `null`): `ua cache app <appId> --refresh --json`, and on WEB also
`ua cache nav <appId> --refresh --json` and
`ua cache paths <appId> --refresh --json` (the new menu items and paths).

1. **Device.** Per built page and state with a design spec: a `visual-check`
   request (`loops queue add --kind visual-check --pass 1 …`); per page: a
   `touch-feedback` request with its tappables ([touch feedback check](audit-touch-feedback.md));
   per page with a data region, once its loading-states task is done: a
   `loading` request (`loops queue add --run <R> --kind loading --pass 1 --page <pageId> --page-name "<Page>" --version draft --app <appId>`,
   the [loading check](../../../native-loading-states/references/check.md)). The
   orchestrator moves to [test-and-fix](test-and-fix.md); it never waits here.
   On WEB the requests differ: § On a WEB app.
2. **Data.** For each new or changed source: `ua cache ds <pageId> --app-id <appId> --refresh --json`
   (every source, its parameters, no identity parameter: rule H1), then the
   `data-layer-check` workflow for each new or changed callable that writes
   nothing. The Preview app runs the draft, so a new source is checked on the
   device with no publish. If a device check still answers `forbidden
   datasource` (`native-lint` trap T19), that check's line is `not proven on a
   device` with the reason and its read-back proof; the loop never asks to
   publish ([approvals](../approvals.md) § The app is never published by a loop).
3. **Gaps come back as tasks.** A visual check pass with gaps comes back from the test runner
   as `gaps.json`; `native-visual-check`'s `fix-brief.mjs` turns its open rows
   into one page-layout fix task, linted, then
   `ua plan revise <planId> --tasks-file <fix-task.json> --impact absorbed --reason "visual check pass <n>: <k> gaps on <regions>" --json`
   (refused because a publish is pending: `--impact major`). Pass n+1 is
   queued when the task reports done. At `limits.maxPasses`: the escalation; the
   gaps left become `Not proven:` lines of the spec. A loading check with
   confirmed findings comes back the same way, as one loading fix task per
   page ([loading check](../../../native-loading-states/references/check.md) § The fix task), and pass n+1 of the
   loading check is queued when it is done.
4. **Shots of what was built.** Once every page passed or was accepted and
   the last fix and quality task is done, and every loading check passed, one `capture` request per page the
   plan built or changed, so the person sees the final draft
   ([formats](../formats.md) § Shots):
   `loops queue add --run <R> --kind capture --side after --page <pageId> --page-name "<Page>" --version draft --app <appId> [--regions <the regions a feature on an existing page added>] --note "built"`.
   For a page built from a design, put the design beside it first:
   `loops shots add --run <R> --id <pageId> --side design --file <solution>/design/<app-id>/screens/<page>.png --page <pageId> --page-name "<Page>"`.
   When the requests are done or failed, the orchestrator's § Finish writes
   and opens the sheets (one per page, and an overview of every page when
   there are two or more); the closing summary lists their paths.
5. **Finish.** `ua plan finish <planId> --json` once every page passed or
   was accepted, then `plan get` and its entity table. `feature upsert` for a
   new page. No app publish and no publish question: everything stays a draft,
   and the closing summary says a client build sees it only after the person
   publishes.

## Plan shapes the stage writes

**Zen spec for a new page.** UnifyApps Headless's spec headings. `Requested outcome`;
`Scope`; the requirements checklist (`rules` = the scale rule, `ui_states` =
the state frames plus `loading (a skeleton per data region), empty, error`,
`acceptance` = "every design spec row within tolerance on the
device, and no blank band or shift while it loads", `rollout` = "save; publish only on a yes"); `Touches` (the app, the
page `new`, an automation `new` per missing source, the page that pushes it);
`Current state (READ)`; `Contract` (`page · create`, the `job` and `design`
lines, one line per data source: `<dsName> calls <automation> with {params},
runQueryOnPageLoad true, no user details as parameters`, one `loading ·` line
per data region, the design-to-app
tables generated from `specs/<page>.json`); `Business rules` (the scale
rule; constants folder and one validator; one chain per button; the user from
the server; touch feedback by surface; static chrome first and a skeleton its
own size beside every data region); `Proof` (`get_page_outlines` and
`get_blocks` for regions, values and bindings; `get_data_sources` for sources;
`<Page> config | page-audit.mjs | 0 blocking on X1, X3 and X4`;
`<Page> device | Preview app on the pool, visual check | every design spec row
within tolerance`; `<Page> device | test runner, loading check | no blank band,
no shift`); `Ready when`; `Not proven when done`; `Open questions:
None`.

**Task graph for a new page.**

| id | kind | entity | dependsOn | note |
| --- | --- | --- | --- | --- |
| t1 | page-layout | page (new) | [] | every region with the design spec's values; a tab entry when "tab"; a dense page chains t1 → t1b by section group |
| t2 | page-bind | page | [t1, shells] | sources, variables, constants, validator, actions; touch feedback on every tappable |
| t3 | page-bind | page | [t2] | loading states: a `CONTENT` Loader gate the region's size beside every data region, empty and error states ([plan](../../../native-loading-states/references/plan.md) § The task); only when the page reads a source |
| t4 | page-review | page | [t3] | judges the shots against the job |
| t5–t7 | automation-shell / automation / deploy | each new automation | shell [objects]; logic [shell]; deploy [logic] | only when Data said "missing"; the deploy is confirmed once its test runs pass, with no question |
| t8 | page-bind | the source page | [t4] | the `navigateToPage` action for "pushed from" |

Every task body: `Read:` (a cache command, live on a miss or stale) →
`Done when:` → write once → `Read back:` → `Report`, at least five lines, no
placeholders. A `page-layout` body cites `Design: design/<app-id>/screens/<page>.png`
and the region crops.

**A feature on an existing page (Sonic).** One task per entity: `page-layout`
(UI only), `page-bind` (binding, action, source, and the loading states of
every data region it adds), `automation` + `deploy`
(confirmed once its test runs pass). `visual: true` only when the change also shows in the web
preview. Body: `Read:` → `Done when:` → write once → `Read back:`. It never
reshapes a region the feature does not name without saying so in the spec.

**Quality fix task.** One `page-bind` per page: title
`"<Page>: quality fixes (U1, P2)"`, one line per finding
`rule · block id and name · what to write`, proof
`page-audit reports 0 blocking on <rules>`, `--impact absorbed`.

## On a WEB app

The plan, the builders and the checks are the same; the device is UnifyApps
Headless's browser and the design is one design spec per width that has one:
the design width (1440), and 375 only when the design has a frame at 375.

- **Scope.** The Connects question offers a menu item in place of a
  bottom-bar tab. A menu entry for a new page is `apply_navigation_edits` (a
  PAGE item), never buttons or links on a page.
- **Device.** After `loops cache-export <appId> <pageId> --run <R>` per built
  page: one `visual-check` request per page and state naming every width that
  has a design spec (none for a page with no spec), one `interaction` request
  (`interaction.mjs`, W1–W6) in place of `touch-feedback`, and one `a11y` and
  one `responsive` request, each at 1440 and 375 and each with
  `--platform web` and its own first issue number
  (`--note "widths 1440,375; path <preview path>; group <g>; start <s>"`,
  [audit checks](../audit-checks.md) § The checks)
  ([test-and-fix](test-and-fix.md) § On a WEB app). On WEB there is no loading
  check; the skeleton plan is proven by the read-back: the loading-states
  task still runs, and its `get_blocks` read-back of each data region's
  `CONTENT` Loader gate is the proof.
- **Data.** The preview route runs the saved draft, so a new or changed
  source runs for real there and its calls are proven in the browser's
  data-source calls (`B calls`).
- **Gaps.** `fix-brief.mjs --platform web` per width with open gaps: a
  "Browser pass" in CSS px at that width, the design's values 1:1, no grid.
  One fix task may carry the gaps of several widths when they name the same
  blocks; the next pass measures every width again.
- **Quality.** `page-audit.mjs` audits MOBILE pages only: a WEB page's
  quality is app-verify's [config review](../../../../app-verify/references/config-review.md)
  without its Mobile only part, which the `ua:app-agent` builder that wrote
  the page runs as its self-check before it reports (app-verify is one of its
  skills on WEB), judged a second time by the plan's `page-review` task
  (`ua:page-reviewer`), plus the interaction, a11y and responsive
  issues; a quality fix task cites those rules
  (`"<Page>: quality fixes (W2, W9, config review navigation)"`).
- **Shots.** The design beside the page is `screens/<page>@1440.png`; a
  `capture` on WEB is `B page-shot <width>` of the preview at the design
  width.
- **Plan shapes.** The spec's `rules` say "the design spec per width, CSS px,
  1:1" instead of the scale rule; `acceptance` is "every design spec row
  within tolerance at every width with a spec in the browser, and the loading
  states read back"; the proof lines are
  `<Page> device | UnifyApps Headless's browser on the preview route, visual check at every width with a spec | every design spec row within tolerance`
  and `<Page> config | get_blocks | a CONTENT Loader gate beside every data region`
  in place of the page-audit and loading check lines (page-audit refuses a
  WEB page, and WEB has no loading check); a `page-layout` body cites
  `Design: design/<app-id>/screens/<page>@<width>.png`; t1 adds no tab entry.

### A code app

`loops platform` answered `kind: code`: the app is a Code Builder app, a
React app whose source lives in git. Every page job goes to
`ua:code-app-agent` (its brief as `agents/code-app-agent.md` takes it: the
plan task, the branch, the acceptance lines), never to `ua:app-agent`. The
config-side proofs of a no-code page do not exist for it: no `page-audit`,
no drift snapshot, no `cache blocks` read-back and no `task-lint` config
trap; the agent's report carries the source it changed, a clean `tsc -b` and
the engine's green push, and that report is the read-back. The browser-side
checks run unchanged on the engine's preview route
(`https://<host>/agent-api/preview/b/<appId>/main`, the `previewUrl` the
push answers): `open.mjs --url <that route> --width <w>` lands on it like a
no-code draft. `loops impact` reads no routes from a checkout, so every page
of the app is in scope. Publish only on a yes, through `publish_code_app`.

## Done when

Every task of the plan is done or answered, every built page has a visual check pass that
matched or an escalation answer, every built page with a data region has a
loading check that passed (or was not seen on the device) or an escalation
answer (on WEB, its loading states read back), every new source is proven by
read-back and on the device in the Preview app, on its draft (on WEB, the
preview route), or reported not proven with the reason, every built page has its sheet or a line saying why not, and the plan is
finished or left resumable with its state on the board.
