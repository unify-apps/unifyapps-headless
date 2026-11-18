# Stage: fix

## Contents

- Jobs
- Before shots
- Before the first write of a job
- Page, module and card jobs
- Performance issues: one fix at a time
- Automation job
- AI agent job
- Object job
- Main-session job and manual-step job
- Handoff note
- On a WEB app
- Done when

Turns open issues into draft fixes, many jobs at once, each proven by a
live read-back and then queued for a device retest. A job never waits for a
simulator or a browser; only its dispatch waits for its before shots (§ Before shots). The orchestrator writes no config itself: it splits, dispatches,
checks reports against their artifacts and keeps the board ([SKILL.md](../../SKILL.md) § Stages).
Every write goes through `ua:ua-change`'s brief and its builders.

Replaces the old fix-page, fix-bug and automation-change loops.

## Jobs

`loops issues merge` joins the open issues into `issues/merged.md` (a
reported issue comes from the [reproduce stage](reproduce.md)'s
`issues/reproduce-1.md`). `loops issues split --jobs <maxAgents>` packs them
into `jobs/jobs.json` and `jobs/issues-<job>.md`: page issues by page, and
the app shell (on WEB), each shared module or card (from `loops impact`),
each automation, each AI agent and each object in a job of its own; person
issues in one. A platform issue gets a handoff note (§ Handoff note), never a job. The job follows the issue's `owner`, which follows
its `cause` ([formats](../formats.md) § Cause): a `state` issue (a variable, a
page input, storage, a binding) is its page's job, like `config`, `event` and
`data source`:

| Job | Takes issues whose owner is | Agent | Releases |
| --- | --- | --- | --- |
| page | `page`, one page (or a tight family: a tab root and the pages it pushes) | `ua:app-agent` | none: drafts only |
| shared module (module or card) | `module:<id>` or `card:<pageId>`: a shared module or an in-chat card page | `ua:app-agent` | none; every dependent page from `scope.json` is re-queued for a retest when it passes |
| automation (`automation-<id>`) | `automation:<id>`, one automation | `ua:automation-agent` | its deploy, right after the test run after passes; no approval (§ Automation job) |
| AI agent (`agent-<id>`) | `agent:<id>`, one AI agent: its instructions, tools or knowledge | `ua:agent-builder` | the agent publish approval per publish, naming the apps and pages that chat with it (§ AI agent job) |
| object (`object-<id>`) | `object:<id>`, one object: a field, its type, a picklist value, a required flag | `ua:fde-agent` | the object approval before the change, naming every page and automation that uses it; a field removed or renamed also waits on its delete dialog (§ Object job) |
| person | `person` (`none` stays out) | none | the person's list in the closing summary |

Rules:

- Never two jobs on one page, one shared item, one automation, one AI agent
  or one object: a job holds a page lock on each page, and an automation, AI
  agent or object job the named lock `automation-<id>`, `agent-<id>` or
  `object-<id>`.
- **No proof, no draft.** A reported issue (check `triage`, `reproduce` or
  `test-author`) gets a draft job only when it was reproduced on a device
  (`device: device`, or its recorded `steps`), or its cause is proven in
  config by a read-back (`device: config`, the read-back line in `evidence`),
  or by automation test runs (`device: run`). `loops issues split` keeps any
  other one out of every job and writes it into the `person-unproven` job's
  file, each with the one question that would unblock it (which steps show
  it on the device, or which setting read back from the app shows the cause).
  The closing summary lists them on the person's list with those questions.
  Each job's report states the evidence kind per issue it fixed: `reproduced
  on <pool name>, draft v<N>` or `cause read back: <the cache or tool line>`.
  `--allow-unproven` is only for a log whose cells the orchestrator has just
  updated from finished device checks.
- A page job that needs a change in a shared module writes it under
  `## Notes for the orchestrator`; the shared-module job owns it.
- Jobs past `limits.maxAgents` wait on the board, worst severity first.
- On the Find issues way, the plan approval shows the jobs once before the
  first dispatch, each automation job with its callers (it deploys once its test passes, with no
  question). When they include an AI agent job, it also asks the release
  question ([approvals](../approvals.md) § The release yes of a fix run); a
  run with no AI agent job never sees it. On the Reproduce way, a reproduced
  issue whose cause was found starts its job at once, with no plan approval
  ([approvals](../approvals.md) § A reproduced issue starts at once).

## Before shots

The run ends with a BEFORE | AFTER sheet of every issue it fixed that shows
on a screen ([formats](../formats.md) § Shots), so the before side is taken
while the page still shows the issue:

1. **A reproduced issue has one.** The reproduce stage kept its `fail.png` as
   the before shot (`shots/<issue id>/`); nothing more to take.
2. **Every other issue that shows on a screen** (its `page` names a page and
   its `device` cell is not `run`) gets one from a `capture` request, queued
   right after `loops issues split` and before the plan approval, so the
   shots are taken while the person reads the plan. One request per job and
   page its issues show on (every job but the platform and person jobs; a
   shared module or card on its first dependent page in `scope.json`):
   `loops queue add --run <R> --kind capture --side before --issues R/jobs/issues-<job>.md --page <pageId> --page-name "<Page>" --version draft --app <appId> --note "before shots, job <job>"`.
   On WEB a capture is `B page-shot <width>` of the preview: the request adds
   `--platform web` and the widths and preview path in its note.
3. **The dispatch waits for the job's own captures, no longer.** A job is dispatched once its
   capture requests are done or failed (`device-pool queue await <id> --wait 900`,
   in the background, as every wait is). A capture that failed or timed out
   holds nothing up: the job goes on, and the closing summary names the
   issues it has no sheet for. A job whose issues show on no screen waits for
   nothing.

## Before the first write of a job

1. Lock every page of the job:
   `device-pool page-lock acquire <tenant> <appId> <pageId>` (an automation,
   AI agent or object job: `device-pool lock acquire <automation|agent|object>-<id> --ttl 3600`). Another
   session's lock, or an unfinished UnifyApps Headless plan that touches the page or the
   automation (`ua solution context`, then `ua plan get <id>` →
   `touches`), stops the job and names the owner.
2. Snapshot each page:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/drift.mjs" snapshot <pageId> --app-id <appId> --out R/jobs/<job>/drift-<pageId>.json`
   (`drift.mjs` takes no `--session`).
3. Sort the issues: `crash` and `critical` first, then by region top to bottom.
   `data` issues (the data check's) are fixed only in their empty or error
   state's styling; `bundle` and `platform-limit` issues go straight to the
   platform queue.

## Page, module and card jobs

1. **The brief.** One `ua:ua-change` brief per job
   (§ The brief: tenant, CLI with `--session`, work folder from
   `UnifyApps Headless task update --sent`, the person's words, task, current state, built
   so far, yes from the person), plus: the shared brief's path
   (`R/brief/BRIEF-COMMON.md`, read fully first), the issues with their
   expected values and fix hints, `Done when:` per issue id, "write once in one
   checked batch", `Read back:` the touched blocks by id, and the report path
   `R/jobs/<job>/fixes-<n>.md` ([formats](../formats.md) § Fix report of
   a job). The body cites the brief and the
   [device traps](../device-traps.md) by path, never by copy.
2. **Lint.** `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/task-lint.mjs" <brief file> --platform <MOBILE|WEB>`:
   no blocking finding is sent.
3. **Dispatch** in the background:
   `Agent(subagent_type: "ua:app-agent", run_in_background: true, description: "app-agent: <job>", prompt: <brief>)`.
   The builder loads `ua:app-native` and `ua:app-verify` itself for a
   MOBILE app; on a WEB app it loads `ua:app-design`, `ua:app-craft` and
   `ua:app-verify`, never `app-native`, and the brief says which
   ([builder brief](../builder-brief.md) § 1). Log the dispatch with the full brief. Keep its agent id: attempt
   n+1 goes back to it with `SendMessage` while it holds under 250k tokens,
   else to a fresh agent with a handoff (`ua:ua-change` step 3).
4. **Check the report.** Only the live read-back lines it quotes count. Then
   per page, against the snapshot of step 2:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/drift.mjs" check <pageId> --app-id <appId> --since R/jobs/<job>/drift-<pageId>.json --targets <the job's block ids>`
   ([page version guard](../builder-brief.md) § 6): `foreign-edit` on a target
   block, or `reverted`, stops the job and goes to the person before anything
   is trusted. `elsewhere` (the page version moved, no target block did) is
   not a stop: the report names the version seen.
5. **Queue the retest.** The job's fixed issues next to its report lines go to
   `R/issues/fixed-<job>-<n>.md`, then
   `loops queue add --run <R> --kind retest --issues R/issues/fixed-<job>-<n>.md --page <first pageId> --page-name "<job>" --version draft --app <appId> --note "job <job> attempt <n>"`.
   An issue with recorded steps (its `steps` column, from the reproduce stage)
   is retested by replaying them: the same line with `--kind replay`, the
   issues with steps in their own file. A job with both queues both. The
   board says `queued for test`. A shared-module job also queues one retest
   per dependent page, with the issues that show on it.
6. **Refusals and builder-UI steps** leave by the jobs below; a cause in
   renderer code becomes a platform-queue line, never a page workaround.

## Performance issues: one fix at a time

A `performance` issue (from the performance check) is judged by its numbers,
so it goes through [native-measured-fix](../../../native-measured-fix/SKILL.md)
alone: backup, draft save through the job's builder, live read-back, then a
`performance` retest of the same step. Counts better and behaviour the same:
keep. Either fails: undo from the backup and record "tried, undone" with the
reason. Never two fixes in one measurement; a fix undone is not tried again.

## Automation job

An issue whose cause is in an automation (`owner: automation:<id>`, from an
audit check, a triage or the reproduce stage) is fixed by the loop, one job
per automation. Pages call the deployed version, so the job deploys as soon
as its test run after passes, and the device check follows. No approval on
a tenant that said it is UAT at sign-in, where the test runs are the proof;
on any other or unknown environment the deploy waits for the person's yes
([approvals](../approvals.md) § Automation deploys ask nothing).

1. **Callers first.** `ua impact automation <id> --change logic --json`:
   the pages, AI agents and automations that call it. The fix keeps the
   inputs and outputs as they are. When the issue needs an input or output
   to change, `ua impact automation <id> --change input` (or `output`)
   names every caller that must change too; each becomes a job of its own
   (a page job for a page, its own builder for an AI agent or an automation),
   shown at the plan approval.
2. **The brief.** One `ua:ua-change` brief (§ The brief, as above)
   to `ua:automation-agent`, plus: the issues with their evidence (the
   failing run id, the failing case as test ids, the repro files), the
   callers, `Done when:` per issue id, the [device traps](../device-traps.md)
   A rows, and the skills it loads as the issue needs:
   `ua:automation-run-debugging` (a failed or wrong run),
   `ua:automation-testing` (the test runs), `ua:automation-runtime`,
   `ua:resiliency` (a missing record, an empty input),
   `ua:data-fetching` (a lookup or a page of records),
   `ua:node-inputs-and-pills` (a maybe-absent value). The task:
   1. Read the live automation (`open_workflow`) and the failing run
      (`list_workflow_runs`, its last five runs; `inspect_workflow_run`).
   2. **Test run before**: `trigger_workflow_run {workflowId, runType: "workflow_test", triggerInput: <the failing case>}`;
      it must fail as the issue says. A run that passes stops the job: the
      cause is elsewhere, and the issue goes back to the orchestrator.
   3. The smallest change that fixes it; inputs and outputs unchanged unless
      step 1 named the callers that change with them.
      `compile_and_save_workflow`, then `open_workflow` to read the saved
      code back.
   4. **Test run after** with the same payload, plus one ordinary case a
      caller relies on: the failing case now passes, the ordinary one still
      does.
   5. **Deploy**: `deploy_workflow {workflowId, deploymentNotes}` once the
      test run after passed, then `search_workflows` for the deployed
      version. The task body says so, so the builder deploys on the task's
      word. With an input or output change, only once the brief says every
      caller job has saved its change; never on a failing test run.
   A test run that writes, writes only the test user's record or a
   `ZZ_LOOP_fix_<what>` row in the run's manifest, and each value it
   changes has its undo entry first (`data-undo.mjs add`, [undo
   log](../../../loop-test-data/references/undo-log.md)); the run restores
   from the log at its end even when this job died (trap A01: a test run has
   no timezone; settle a time step with an app run).
3. **Check the report.** Only quoted read-backs count: the saved code read
   back, the before and after run ids with their status and the node that
   changed, and the deployed version. The fix report carries them ([formats](../formats.md) § Fix
   report of a job).
4. **The deploy** ([approvals](../approvals.md) § Automation deploys ask
   nothing, on a tenant that said it is UAT at sign-in). The job's agent deployed
   right after the test run after passed; its report quotes the deployed
   version (`search_workflows`), and the board logs a `deploy` event with
   the version and the callers. Refused under auto mode, the main session
   makes the call (§ Main-session job). A change to the inputs or outputs
   deploys only once every caller job it named has saved its change.
5. **Retest on the device.** After the deploy: each issue with recorded
   steps is replayed (`loops queue add --kind replay`, the caller page that
   showed it, its steps), every other issue the job fixed and every page
   issue that waited on it is retested (`--kind retest`). An issue with no
   screen (`device: run`) has no device retest: the after test run is its
   proof, and the board names the deployed version. The job passes
   when they do; a fail is attempt n+1, back to the same agent.
6. **Release the lock** `automation-<id>` when the job passes, is accepted or
   is escalated.

## AI agent job

An issue whose cause is an AI agent's instructions, tools or knowledge
(`owner: agent:<id>`, from the reproduce stage, a triage or the logic check of
a chat page) is fixed by the loop, one job per AI agent. A publish changes the
agent for everyone who chats with it, so the job ends in a release the
person said yes to: the run's release yes, or the agent publish
approval.

1. **Who uses it.** `ua impact ai-agent <id> --change logic --json`: the
   apps and pages that chat with it. A tool the fix needs that calls an
   automation that does not exist yet is an automation job first, shown at
   the plan approval.
2. **The brief.** One `ua:ua-change` brief (§ The brief) to
   `ua:agent-builder`, plus the issues with their evidence (the chat call
   and its answer, the trace), `Done when:` per issue id, and the task:
   1. Read the live agent (`get_agent`) and the failing chat: the person's
      words as one `send_test_message`, then `read_trace` on it. It must fail
      as the issue says; a reply that passes stops the job, and the issue goes
      back to the orchestrator.
   2. The smallest change: the instructions (`update_agent`), a tool
      (`add_tools`, `update_tools`), its knowledge (`add_knowledge`). Never a
      new model or a guardrail change unless the issue names it.
   3. **Test after**: the same message, plus one ordinary message the pages
      rely on, each with `read_trace`: the failing one now passes, the
      ordinary one still does.
   4. `publish_agent` only when the brief's `Yes from the person` quotes the
      run's release yes and the test message after passed; otherwise never:
      the publish waits for the person.
3. **Check the report.** Only quoted read-backs count: the saved agent read
   back, the before and after messages with their trace lines.
4. **The release.** When the plan approval's release yes covers it
   ([approvals](../approvals.md) § The release yes of a fix run), the job's
   agent runs `publish_agent` with `confirmed: true` right after the test
   message after passes, reads the published version back, and the board
   logs it; go to step 5. Otherwise the agent publish approval: "Publish
   <agent>? Everyone who chats with it gets the change at once: <apps and
   pages from impact>. Change: <one line>. Tests: before <message> failed,
   after it passed, <n> messages." The board says `publish approval`.
   - **Publish**: the job's agent (`SendMessage`, the person's yes quoted)
     runs `publish_agent` with `confirmed: true` and reads the published
     version back.
   - **Keep as a draft**: the issues stay `fixed (saved, not published)`, the
     job ends `accepted`, and the closing summary names the publish that waits.
5. **Retest on the device** after the publish: each issue with steps is
   replayed on the page that chats with the agent (`--kind replay`), the
   others retested. A fail is attempt n+1, back to the same agent.
6. **Release the lock** `agent-<id>`.

## Object job

An issue whose cause is an object's fields (`owner: object:<id>`: a field
missing, a type that cannot hold the value, a picklist without the code the
app saves, a required flag that refuses the save) is fixed by the loop, one
job per object. Stored data is shared by every page and automation that
reads it, so the change waits on the object approval first.

1. **Who uses it.** `ua impact object <id> --change logic --json` for an
   added field or picklist value; `--change field-rename` or `field-delete`
   when a field changes name or goes. Every page or automation that must
   change with it becomes a job of its own, shown at the plan approval.
2. **The object approval** ([approvals](../approvals.md)) before the brief:
   "Change <object>? <one line: add field <name> (<type>) | add <code> to
   <picklist> | …>. Used by: <pages and automations from impact>. Stored
   rows: <none change | n rows change, and how>." Not now: the issues stay
   `open` with that answer, the job ends `accepted`.
3. **The brief.** One `ua:ua-change` brief (§ The brief) to
   `ua:fde-agent`: the change exactly as approved, `Done when:` per issue
   id, and "the smallest change: add, never remove, unless the approval named
   a removal". A field removed or renamed answers `CONFIRM_REQUIRED (d_…)`:
   the person's yes in its own dialog, as `ua:ua-change` § Answers and
   blocks says. A change to many stored rows is a script the approval named,
   run once without `--apply` to show the count.
4. **Check the report.** The object read back live (`get_objects`): the field,
   its type, the picklist codes.
5. **Retest.** Every issue of the job, on the page that showed it (a `replay`
   when it has steps); then the jobs that waited on the object start.
6. **Release the lock** `object-<id>`.

## Main-session job and manual-step job

- **A call a builder cannot make** (`Blocked by auto mode: <tool>`, a deploy
  after the person's yes included, or a tool only the main session holds):
  never resend the builder. Record it on the
  board, make the call once from the main session with the same input when it
  has the tool, read it back, and record the read-back as the issue's evidence.
  Otherwise ask the person for the permission change once, as
  `ua:ua-change` § Answers and blocks words it, then send the piece to
  a new agent.
- **A step only the builder UI can do** (create a navigator module, drag a
  block into a template slot): a manual step with the exact steps; verify by a
  live read before the job goes on; a manual step with no read-back is
  `unverified`.

## Handoff note

Written to `R/jobs/platform/<item>/handoff.md` whenever a cause is in
platform code, one per bug, no secrets, no signed-in URLs:

```
# Platform bug — <one line>
Where: app <appId> · page <pageId> · block <b_… displayName> (<componentType>)
Expected: <from the block sheet or the design spec, with the sheet route or the spec row>
Actual: <what the device shows>; config read-back: <cache blocks lines that are correct>
Repro: <argent flow name, or the steps as prose>
Evidence: <files in R>
Device: <model>, <profile>, Preview <bundleId> <app version shown>; tenant environment <env>
Classification: platform — because <config matches its sheet | the runtime error names the mobile renderer | the web preview renders it right>
Not changed: nothing on the tenant
```

Tell the person the fix reaches them in a platform release or a new Preview
app build, and offer `/ua:give-feedback` to report it to the UnifyApps
Headless team; send nothing unless they run it.

## On a WEB app

The jobs, briefs, page lock per page, drift checks, attempts and approvals
are the same. What changes:

- **Evidence kind.** A job's report states `reproduced in
  R/runners/web-repro-<n>/browser/, draft (preview route)` in place of the
  pool name and draft version.
- **Automation jobs** are the same on both platforms; the replay after the
  deploy runs in a test runner's browser (`--platform web`).
- **The app-shell job.** Issues marked `app shell` (the menu, the module that
  draws the bar, a header or footer several pages share) and every change
  `loops impact --nav`, `--nav-item` or `--module` names form one job of their
  own. Menu items, groups, order and the default page are
  `apply_navigation_edits`; what draws the bar is `set_navigation_style`;
  moving the bar (a top bar, a drawer at SM) has no tool and is a manual step
  (*App settings → Navigation → Appearance*). When it passes, every page the
  menu shows on is retested at both widths.
- **The retest.** After the read-back: `loops cache-export <appId> <pageId> --run <R>`
  for each page the job wrote, then the retest with `--platform web` and the
  widths of its issues:
  `loops queue add --run <R> --kind retest --platform web --issues R/issues/fixed-<job>-<n>.md --page <pageId> --page-name "<job>" --version draft --app <appId> --note "job <job> attempt <n>; widths 1440,375; path <preview path>"`.
  The test runner reruns the check that wrote each issue at the width it
  names; a `replay` the same way, with `--kind replay`.
- **The fix hint's units.** CSS px at the width the issue names; a visual
  check issue's fix brief is `fix-brief.mjs --platform web` (a "Browser
  pass", no grid). An issue at 375 only is fixed so the design width keeps
  its match: the retest covers both widths.
- **Performance issues** are fixed one at a time, as § Performance issues
  says, without native-measured-fix's simulator steps: a backup, the draft
  save, the read-back, then a web-profile `performance` retest of the same
  step before and after, its results in `R/perf/<pageId>/`.
- **A WEB renderer bug** is a handoff note (`Device:` Chrome for Testing,
  the width, `draft (preview route)`).
- `native-lint`'s `task-lint` (with `--platform WEB`) and `drift.mjs`, and
  `native-device-pool`'s `device-pool page-lock`, take no simulator: they run
  for WEB jobs as written.

### A code app

On a Code Builder app (`loops platform` answered `kind: code`) a page or
app-shell job goes to `ua:code-app-agent`; an automation, AI agent or object
job goes to its builder as on a no-code app. The cause is found in the
app's source (the agent reads the checkout) instead of block config, and the
agent's report (the files changed, a clean `tsc -b`, the engine's green
push) is the job's read-back; there is no drift snapshot and no `cache
blocks`. The retest replays the steps on the engine's preview route. Publish
only on a yes, through `publish_code_app`.

## Done when

Every issue of every job has a `result` with a read-back, or sits in the
platform queue or the person's list; every automation change whose test run
passed was deployed and read back, and every AI agent change published on the
release yes or its agent publish approval, or kept as a draft; every
object change was made on its object approval; every fixed issue is
queued for a retest (a `replay` when it has recorded steps), with its before
shot taken or named as missing; the job keeps
its page locks (an automation, AI agent or object job its lock) until it passes in
[test-and-fix](test-and-fix.md), then releases them.
