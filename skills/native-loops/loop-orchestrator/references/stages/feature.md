# Stage: feature

## Contents

- When it runs
- 1. Scope it
- 2. Pick a recipe
- 3. Run settings
- 4. Plan it
- 5. Build it
- 6. New regions without a design
- 7. Steps files
- 8. Checks
- 9. A failed check comes back as a fix task
- 10. Releases
- 11. Finish
- On a WEB app
- Done when

The build loop's way in from a description: the person describes a feature
in words, with no design ("add analytics to the app", "update the approvals
list in real time", "notify the manager when a request is submitted"). The
stage plans every entity the feature needs (objects, automations, pages, AI
agents) as one UnifyApps Headless plan, builds it through UnifyApps Headless's builders as drafts,
and proves each acceptance line of the plan on a device with an
`acceptance` or a `realtime` check ([test-and-fix](test-and-fix.md)). A
failed check comes back to the plan as a fix task, attempt after attempt.

## When it runs

- The person names a feature and gives no design. A feature that has a
  design for its new pages runs [design intake](design-intake.md) for those
  pages first; this stage plans the rest in the same plan, and those pages
  get the build stage's visual checks.
- Not for one wrong behaviour of a feature that exists: that is the fix
  loop's Reproduce the issue way in.

## 1. Scope it

1. `ua state resolve --request "<as typed>"`: the entities the words
   name. When they name none, `ua entity context solution`.
2. The cache for each entity the feature may touch: `ua cache obj <id>`,
   `ua cache wf <id> --contract` and `--deps`, `ua cache agent <id>`,
   and `ua cache page|outline|ds|events` for each page.
3. `ua impact <kind> <id|name> --change <output|input|field-rename|field-delete|logic>`
   for every existing entity the feature changes. What must change with it
   joins the plan. An `unknown` row: `ua solution refresh` once, then
   read that entity live before any write.
4. `loops impact <appId> --page <id>` (or `--module`, `--card`) for each page
   touched: dependent pages join `scope.json` as pages to retest.
5. `ua solution locate --link` for each entity the plan will change, as
   UnifyApps Headless's guide says (where work belongs).
6. `drift.mjs snapshot` on every existing page the plan touches.
7. The app's PRD in `R/prd.md`, when it has one: the requirement the feature
   serves, its acceptance lines, screens, data and rules. A feature the PRD
   has no requirement for is new to it; say so in the plan approval, since
   the finish adds it to the PRD ([PRD use](../prd-use.md)).

The plan is always Zen: a feature crosses entity kinds and has acceptance
lines.

## 2. Pick a recipe

Load `ua:loop-feature-recipes` and match the person's words with its table. Read
the recipe it names (two when two fit, such as usage tracking and the
analytics dashboard). No recipe fits: plan from the words alone, with the
same shapes and checks. Log the recipes in the `stage.start` event. A
feature that needs app code (a third-party tag or SDK) on MOBILE gets a
handoff note ([fix stage](fix.md) § Handoff note), never a plan task. On WEB
a third-party analytics tag is the analytics tag recipe's plan task: the
snippet in the app's header code through `update_app_settings`.

## 3. Run settings

The run settings approval ([approvals](../approvals.md)): at most four
questions in all, each with its default from the cache, UnifyApps Headless memory and
`profile.json`, the recommended option first.

- **The recipe's questions**, merged. A question the cache settles is not
  asked; its default is named in the plan preview as an assumption.
- **Checks that write.** "The checks do the feature's steps on a device. May
  they save, as the test user, <what the steps save>?" · Yes, as the test
  user, on `ZZ_LOOP_` test records (Recommended) · No: prove it by read-back
  and test runs only. A check that sends a message also needs the test
  recipient the person names; a `realtime` check between two people needs a
  second test user.

The answers hold for the whole run.

## 4. Plan it

1. **Objects.** A new object or new fields: `ua:object-schema-designer`
   for the entity, its fields, its indexes and the owner field the
   automation sets from `USER.id`.
2. **Pages.** A new page or region: `ua:app-page-planner` writes its
   `job` and `design` lines from the person's words and the app's look,
   with no design spec. No `app look` line when the app exists. Then
   `ua:native-loading-states`' [plan](../../../native-loading-states/references/plan.md) for every page that
   reads a source: a `loading ·` Contract line per data region and the
   page's loading-states task.
3. **Spec** under `.sessions/<sid>/drafts/`, in UnifyApps Headless's spec headings as
   the [build stage](build.md) § Plan shapes writes them, with:
   - `Requested outcome`: the person's words.
   - the requirements `acceptance` row: one acceptance line per thing the
     person will see or rely on, numbered `A1`, `A2` …, each naming its
     check. When the app has a PRD, the feature's lines are its requirement's
     `A<n>.<m>` lines, word for word, each citing its id (`A1 · acceptance · A3.2 · …`),
     and the requirement row cites the `R<n>` id as `READ`: `A1 · acceptance · a tap on Approve writes one usage event as the
     signed-in user`; `A2 · realtime · a new request shows on the manager's
     list within 20 s`.
   - `Business rules`: identity from the server (`USER.id`, never an id a
     page sends); a tap never waits on a side effect; the recipe's security
     and performance lines.
   - `Proof`: each task's builder read-back, one line per acceptance
     line: `A<n> device | test runner, <kind> check | <its Expect, Effects or Watch lines>`,
     and per page that reads a source the loading proof lines of
     `native-loading-states`' plan § 4.
   - `Not proven when done`: the recipe's limits. `Open questions`: the
     platform team's questions of the realtime push recipe, else `None`.

   Then `ua spec check --md-file <spec> --json`.
4. **Tasks**, one per recipe entity row, by the kinds and dependency rules of
   `ua:ua-change`'s task kinds:

   | Entity | Tasks | Builder |
   | --- | --- | --- |
   | object, new or changed | `object` | `ua:fde-agent` |
   | automation a page or AI agent calls | `automation-shell` → `automation` → `deploy` | `ua:automation-agent` |
   | automation nothing calls (a record trigger, a schedule) | `automation` → `deploy` | `ua:automation-agent` |
   | page or region | `page-layout` → `page-bind` → `page-bind` (loading states, when it reads a source) → `page-review` | `ua:app-agent`; `ua:page-reviewer` |
   | AI agent | `ai-agent` → `publish` (entity kind `ai-agent`) | `ua:agent-builder` |
   | app look, app header code | `app` | `ua:app-agent` |
   | a connection, or a step only a person can do | `manual` | the person |

   Every task body: `Read:` (a cache command; live on a miss or stale) →
   `Done when:` → write once → `Read back:` → `Report`, at least five lines,
   no placeholders. A body names the knowledge skills the recipe lists for
   its builder.
5. **Lint.** `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/task-lint.mjs" <tasks.json> --platform <MOBILE|WEB>`
   must pass.
6. **Propose.** `ua plan propose --file <spec> --tasks-file <tasks> --preview --mode zen --json`,
   then the plan approval: "Start building this?" with the assumptions, one
   line per task, one line per acceptance line and its check, the load a
   refresh adds (near-realtime), and every release the preview names (each
   deploy, each AI agent publish, a publish). Then `--save --hash <hash>` and
   `ua plan start <planId> --json`.

## 5. Build it

`ua:ua-change` § Run a plan, as the [build stage](build.md) § Build
it says: copy every `Agent(...)` call the run loop prints, up to
`limits.maxAgents` builders at once. Each builder loads its own knowledge
(`ua:fde-agent` its object skills, `ua:automation-agent` the skills
its brief names, `ua:app-agent` `app-design`, `app-craft`,
`app-page-build` and `app-native` on MOBILE or `app-verify` on WEB,
`ua:agent-builder` its own); the orchestrator never loads a builder's
skill. Log every dispatch with its full prompt. `drift.mjs check` after every
batch. A refusal or a step only the builder UI can do leaves by the
[fix stage](fix.md)'s main-session and manual-step jobs.

## 6. New regions without a design

A page or region built from words has no design spec, so it gets no visual
check. Before anything below, re-read the app into the cache, so the new
pages have their names (`loops impact` names a page it has not cached
`null`): `ua cache app <appId> --refresh --json`, and on WEB also
`ua cache nav <appId> --refresh --json` and
`ua cache paths <appId> --refresh --json` (the new menu items and paths).
Then:

- its `page-review` task: `ua:page-reviewer` judges the shots against
  the page's `job` and `design` lines;
- the plan's page quality pass (`ua:app-page-quality`) on a MOBILE page,
  when the run loop says to run it; on WEB, app-verify's config review, which
  the `ua:app-agent` builder that wrote the page runs as its self-check before
  it reports (app-verify is one of its skills on WEB), with the `page-review`
  task above as the second opinion
  ([build stage](build.md) § On a WEB app);
- a `touch-feedback` check (MOBILE) for its new tappables, queued as the build
  stage § After the build says; on WEB an `interaction`, an `a11y` and a
  `responsive` check per page, each at both widths (§ On a WEB app);
- on MOBILE, a `loading` check for every page with a new data region, queued
  the same way once its loading-states task is done
  ([loading check](../../../native-loading-states/references/check.md)). A
  failed one comes back as a loading fix task, as the build stage says. On
  WEB there is no loading check; the skeleton plan is proven by the
  read-back.

## 7. Steps files

One steps file per acceptance line, written once the builders have reported
their ids (`ua plan get <planId>` and its `Built so far`):
`R/accept/<feature-slug>/<n>/steps.md`, `<n>` the acceptance line's number.
The format is the [reproduce stage](reproduce.md)'s § What it hands on, with:

- the route from [loop-route-map](../../../loop-route-map/SKILL.md) and each
  control from `ua cache blocks` (display name, `b_…` id, label);
- `Writes:` naming what the steps save, and "allowed in the run settings"
  only when they were;
- values to type that start with `ZZ_LOOP_build_`;
- `Expect:` for what the screen shows, an `Effects:` block for the records
  and automation runs the steps must leave, and for `realtime` a `Watcher:`
  line and a `Watch:` block.

`loops queue add` refuses a steps file outside `R`, an `Effects:` or
`Watch:` line in neither shape, a `realtime` file with no `Watch:` line and
an `acceptance` file with nothing to check.

## 8. Checks

Queue a check only when what it calls is live:

- every automation its steps reach is deployed (a caller reaches the
  deployed copy, never the draft), deployed once its test runs passed;
- an AI agent its steps reach is published, after its yes;
- a new or changed data source needs no publish: the Preview app runs the
  draft (on WEB, the preview route does). If the check still answers `forbidden datasource` (`native-lint`
  trap T19), its line stays `not proven on a device`, with the reason and its
  read-back and test-run proof; the loop never asks to publish.

Then, per acceptance line: `loops queue add --run <R> --kind acceptance|realtime --steps <R>/accept/<feature-slug>/<n>/steps.md --page <pageId> --page-name <Page>`
(`--page` is the page device 2 watches for a `realtime` check). The board
shows it as the job `accept <feature-slug> · A<n>`, `queued for test`. The
test runners serve it as [test-and-fix](test-and-fix.md) § Kind `acceptance`
and § Kind `realtime` say; the orchestrator waits in the background and does
the reads a test runner cannot:

- a `run` line `not checked (main session)`: one read-only
  `ua:automation-agent` brief, loading `ua:automation-run-debugging`:
  `list_workflow_runs` for that automation, the first run after the end time
  the result gives, and `inspect_workflow_run` on it. No save, no test run,
  no deploy.
- a `record` line `not checked (no object tool)`:
  `mcp__plugin_ua_object__get_records` from the main session, with the
  line's object id and record id or filter, `limit` at most 5.

## 9. A failed check comes back as a fix task

1. **The layer.** For each failed line, the cheapest read first, as the
   reproduce stage's layers go: the control's event and action
   (`ua cache events`), the data source and its call, the automation's
   run (the read-only brief above), the record, and for an AI agent its
   settings (`get_agent`, through a read-only `ua:agent-builder` brief).
2. **The task.** One fix task per entity at fault, for the builder that owns
   its kind. Its body names the failed line, what the device showed and the
   read that found the layer. Then
   `ua plan revise <planId> --tasks-file <fix-task.json> --impact absorbed --reason "acceptance A<n> attempt <k>: <failed lines>" --json`
   (refused because a publish is pending: `--impact major`, which asks the
   plan approval again).
3. **The next attempt.** When the task reports done, and a changed
   automation is deployed once its test runs pass, the same steps file is
   queued again: attempt `k + 1`.
4. **Limits.** A check failed `limits.maxAttempts` times (4) goes to the
   escalation, for that check only: Accept as is · Stop here · One more
   attempt. An accepted line moves to the spec's `Not proven when done`.
   A request that failed for the environment (sign-in, a device, no second
   device in time) is requeued and is not an attempt.

## 10. Releases

Only as the plan preview named them ([approvals](../approvals.md)):

- **A new or changed automation's deploy**: no approval on a tenant that
  said it is UAT at sign-in; on any other or unknown environment it waits for
  the person's yes (§ Automation deploys ask nothing). It deploys once its
  task is done and its test runs pass; the plan preview names it and its
  callers from `ua impact automation <id> --change logic`, and the
  closing summary lists the version.
- **An AI agent's publish**: the agent publish approval, every time, naming
  the apps and pages that chat with it from `ua impact ai-agent <id>
  --change logic`, with the test messages: its users get the change at once.
- **The app publish**: never, and never asked
  ([approvals](../approvals.md) § The app is never published by a loop).
  Everything stays a draft; the person publishes when a client build should
  get the feature.

## 11. Finish

Every acceptance line passed its check or was accepted. Then the shots of
every page the plan created or changed, as the [build stage](build.md) § After
the build step 4 says (`capture --side after`, with the regions the feature
added in `--regions`); a feature that changed no page has no sheet, and the
closing summary says so. Then `ua plan finish <planId> --json`,
then `ua plan get` and its entity table, `ua feature upsert` for the
feature, and `ua memory remember` only for what the files do not hold (a
decision the person made, a platform answer about push).

## On a WEB app

The plan and the checks are the same; the device is UnifyApps Headless's
browser on the preview route, which runs the draft's data sources, so no
publish is needed before a check.

- **Queue** with `--platform web` and, in the note, the widths and the
  preview path: `--note "widths 1440; path /approvals"` for an `acceptance`
  or `realtime` check. Run `loops cache-export <appId> <pageId> --run <R>`
  for each page a check opens first. Per new or reshaped page, one
  `interaction`, one `a11y` and one `responsive` check, each at both widths
  (`--note "widths 1440,375; path <preview path>; group <g>; start <s>"`,
  `<s>` the request's own first issue number as
  [audit checks](../audit-checks.md) § The checks says), plus the
  `acceptance` and `realtime` checks of § 8 and the `capture` of § 11; never
  `touch-feedback` or `loading`, and no visual check: a page built from words
  has no design spec.
- **Loading proof.** The loading `Proof` line of a page that reads a source
  is its read-back (`get_blocks` shows a `CONTENT` Loader gate beside every
  data region), in place of the page-audit and loading check lines.
- **Sign-in.** A WEB test runner's browsers sign in as the person. A check
  whose `Watcher:` or `Signed in as:` line names another user fails with that
  reason; the person checks it by hand, or on the published app.
- **App code.** A third-party analytics tag is WEB only (§ 2); on MOBILE the
  loop writes a handoff note ([fix stage](fix.md) § Handoff note).

### A code app

On a Code Builder app (`loops platform` answered `kind: code`) the page and
region tasks go to `ua:code-app-agent` and the objects, automations and AI
agents to their builders as on a no-code app. The code app agent's report
(the source changed, a clean `tsc -b`, the engine's green push) replaces the
page read-backs; the acceptance and realtime checks run on the engine's
preview route. A third-party tag goes into the app's own source, not
`update_app_settings`.

## Done when

Every task of the plan is done or answered; every acceptance line has a
check that passed, an escalation answer, or a `not proven on a device` line
with its read-back proof; every page the plan created or changed has its
sheet or a line saying why not; every reservation is released and every
browser closed; the plan is finished or left resumable with its state on the board.
