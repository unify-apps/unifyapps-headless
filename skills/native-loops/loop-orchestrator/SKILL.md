---
name: loop-orchestrator
description: The orchestrator the native loops (the native-*-loop commands), the web loops (the app-*-loop commands) and the four skills the loops use (native-audit, native-setup, native-triage, native-report) load first. Reads the app's platform, MOBILE or WEB, from its cached manifest type; runs an impact analysis that reaches every page sharing a module or card; runs the stages (a new app's PRD, plan and tickets, design intake, audit checks, reproduce an issue the person reports, fix with page, shared-module, automation, AI agent and object jobs, build from a design, a feature from the person's words, test-and-fix, triage, test author, retake) with parallel agents inside the run's limits; feeds the device queue (simulators on MOBILE, browsers on WEB) so no agent waits; reuses recorded decisions and asks only for missing decisions or required approvals; keeps the board and appends every stage to a local run log under the nine run rules. Loaded by a loop or one of those skills, never typed.
user-invocable: false
---

Load `ua:ua-safety` before your first tenant read and follow its router part.

# Loop orchestrator

The core every UnifyApps Headless loop, and every skill the loops use, runs through. A
loop (`/ua:native-fix-loop`, `/ua:app-fix-loop`) or one of
those skills loads this skill first and follows it for its own run; its own
SKILL.md holds the inputs, the steps and the stop fact. This session is the
orchestrator: it reads the platform, runs the impact analysis,
splits the work into jobs, dispatches agents in parallel, keeps the device
queue fed, asks for approvals, and keeps the board and the run log. It writes no
page or automation config itself: builders do, through `ua:ua-change`,
as drafts.

## The loops and the skills they use

The loop commands scope, create, execute, fix or build within their own
completion rules, each for one platform (§ Platform):

| Command | Goal id | For | Stops when |
| --- | --- | --- | --- |
| `/ua:native-scope-loop` | `scope` | Stage one of an app: a PRD written in rounds and versioned on the solution, a plan of the whole app, and its tickets the build loop builds one at a time | the PRD version is approved, every must and should requirement is in a ticket written out and named in the index, and the tickets are recorded on the version |
| `/ua:native-fix-loop` | `fix` | Fix pages against their design, the issues an audit or a triage left, or one issue the person reports in chat, reproduced first | every issue is verified on a device, accepted, or escalated |
| `/ua:native-build-loop` | `build` | A new app page or feature from a design, or a feature from the person's words with every object, automation, page and AI agent it needs | every built page matched its design on a device, and every acceptance line passed its check, or was accepted; the plan is finished |
| `/ua:app-build-loop` | `build` | A new page or feature of a WEB app from a design, or a feature from the person's words, built as drafts and checked in a browser | every built page matched its design in a browser, and every acceptance line passed its check, or was accepted; the plan is finished |
| `/ua:app-fix-loop` | `fix` | Fix pages of a WEB app against their design, the issues its audit checks found, or one issue the person reports in chat, reproduced first in a browser | every issue is verified in a browser, accepted, or escalated |
| `/ua:app-scope-loop` | `scope` | Stage one of a WEB app: a PRD written in rounds and versioned on the solution, a plan of the whole app, and its tickets `/ua:app-build-loop` builds one at a time | the PRD version is approved, every must and should requirement is in a ticket written out and named in the index, and the tickets are recorded on the version |
| `/ua:app-discover-test-loop` | `test-author` | Design and review the manual cases of a WEB app from its PRD, in one HTML review page | every case is approved or rejected and the approved list is written |
| `/ua:app-build-test-loop` | `test-author` | Author the approved cases into Test Studio through the create loop | every approved case has a Test Studio case or a parked reason |
| `/ua:app-run-test-loop` | `test-author` | Hand a Test Studio suite or plan to the triage loop, then report the run with its verdicts and trend | every case has a result or is stuck, every red has a triage verdict, the report exists |

Four skills run once, on MOBILE apps. The native loops call them inside (the
fix loop's quick audit is native-audit's checks), and the person can type each
on its own:

| Command | Goal id | For | Stops when |
| --- | --- | --- | --- |
| `native-audit` | `audit` | Find everything wrong on a MOBILE app's pages: checks `ui · touch-feedback · perf · security · data · logic`, any subset as focus | every page has issues, ok or a reason, and the board is ranked; it fixes nothing |
| `native-setup` | `setup` | The first run on a laptop, a repair, a new Preview build, a folder with no loops profile | health reports every required row ok, the pool is up, the profile is valid |
| `native-triage` | `triage` | Client lists, tickets, a dry run's read-only check of a moved copy | every item has one triage issue; nothing changed anywhere |
| `native-report` | `report` | Run analytics, only when the person asks | `report.html` exists and the person has its link |

`audit` and `triage` end with the fix approval ("<n> issues open.
Fix them now?"), which starts `/ua:native-fix-loop`; there an issue an
automation owns becomes an automation job, deployed as soon as its test run
passes (asking nothing when the tenant said it is UAT at sign-in; on any other or unknown environment the deploy waits for a yes), one an
AI agent owns an AI agent job, published only on the person's yes, and one in
an object's fields an object job, changed only on the object approval. `fix`
and `build` never publish the app and never ask to: the Preview app runs the
drafts (on WEB, the builder preview route), and a client build (on WEB, the
app's published address) runs the published app, which the person publishes
when it should get the work ([approvals](references/approvals.md) § The app is
never published by a loop). A run never chains into a release on its own. The goal id names the run folder, `board.json` and the run log.

## Tools

The plugin folder is `${CLAUDE_PLUGIN_ROOT}`. Write its real path into every
brief: a subagent's prompt is not expanded. In this file, its references and
every loop and skill:

- `loops <cmd>` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" <cmd>`
  (`--help` on any command prints its lines; `--json` for machine output; every command takes `--session`).
- `UnifyApps Headless <area> <cmd>` is
  `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" <area> <cmd>`,
  with `--json` and `--session <this session's id>`.
- `device-pool <cmd>` is `bash "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts/device-pool.sh" <cmd>`:
  the simulator pool and the reservations (MOBILE), and the device queue (both platforms).
- `B` is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser folder>`, UnifyApps Headless's own browser (WEB).
- `W` is `${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-browser/scripts` (WEB).
- A block's script is `${CLAUDE_PLUGIN_ROOT}/skills/native-loops/<block>/scripts/<file>`
  (`loop-*`, `native-*`), or `${CLAUDE_PLUGIN_ROOT}/skills/web-loops/<block>/scripts/<file>` (`web-*`).
- `R` is the run folder, `<solution>/.nebula/loops/runs/<run-id>/`.

## Platform: MOBILE or WEB

`loops platform <appId> --json` reads the app's manifest type from the UnifyApps Headless
cache and answers `{ appId, name, type, platform }`, `platform` being `MOBILE`
or `WEB`. An app not in the cache, or any other type, stops the loop with its
one fix (`ua solution refresh`, or the app is made through UnifyApps Headless
first). The platform goes into `board.json` and the `run.start` event. A
command is for one platform: on the other one it says the line its SKILL.md
gives and stops.

| | MOBILE | WEB |
| --- | --- | --- |
| Device | a pool simulator (`native-device-pool`, iOS 18) with the UnifyApps Preview app, driven through argent | a browser folder ([web-browser](../../web-loops/web-browser/SKILL.md)): UnifyApps Headless's own browser through app-verify's `browser.mjs`, one folder per test runner at `R/runners/web-<n>/browser/`, signed in by `open-page`; no pool, no reservation |
| Draft on the device | the Preview app runs the saved draft | the builder preview route shows the saved draft: `https://<host>/p/0/interfaces/<appId>/preview/<path>`, the path from `ua cache paths <appId>` with real values in its params; nothing is published |
| Widths | the simulator's screen | the design width (1440) and the second width (375), the app frame inside the preview's phone frame: `open.mjs --width 375` picks it in the preview's variant menu, and the window is then 460 px wide |
| Health | `loops health --platform mobile`: Xcode, the runtime, argent, the pool | `loops health --platform web`: node, npx, Chrome for Testing; `loops setup --platform web --yes --only browser` installs it |
| Signed in | one simulator signed in by the person, cloned to the pool | every browser signs in through `open-page`; nothing to clone |
| Capacity | `capacity.pool` simulators | `capacity.browsers`, from free memory |
| Design | scaled to the phone (`native-design-spec`) | one spec per screen at the width it was drawn, in CSS px (`web-design-spec`); 375 has none, by design: the responsive check covers it |
| Checks | `visual-check`, `touch-feedback`, `performance`, `loading` | `visual-check` per width with a spec, `interaction` (the touch feedback check's twin), `performance` (`web-profile`), `a11y`, `responsive`; no loading check: the skeleton plan is proven by the read-back |
| Builders load | `app-design`, `app-native`, `app-craft`, `app-verify` | `app-design`, `app-craft`, `app-verify` |
| Blocks | `loop-*` and `native-*` | `loop-*` and `web-*` |

`registry.json` lists the blocks each loop, skill and stage uses per platform.

## Before every loop

The testing commands use the [test-author stage](references/stages/test-author.md)
instead of the generic preparation and issue-retry sequence below. On MOBILE it
records case review in the shared suite and execution in its attempt ledger; on
WEB the cases live in the app's tests folder and Test Studio runs them. Creation
needs no device health check, signed-in simulator or device queue; execution uses
one reserved device (MOBILE) or Test Studio's browsers (WEB). This exception applies only to the testing commands and also replaces the generic device queue, stage-agent dispatch and issue-retry instructions later in this skill.

The scope loop plans and reaches no device. It runs the [prd](references/stages/prd.md),
[app-plan](references/stages/app-plan.md) and [tickets](references/stages/tickets.md)
stages and skips Health, Signed in, the impact analysis, the device queue and
the sheets. Context, Resume first, The run and Settle the rules apply. A new
app has no manifest yet, so `loops platform` waits until the tickets stage
makes the app and the run starts with `--platform MOBILE`; an existing app
answers `loops platform` first, like every loop.

Follow [run execution](references/execution.md) for readiness, decisions,
ownership, priority, retries and completion. Carry it into each agent brief.

1. **Context.** `ua solution context` once, then `loops platform <appId>`
   (§ Platform). The app comes from the person's words, the last run's board
   or `profile.json`. When `prds` lists the app, its PRD goes into
   `R/prd.md`; each loop uses it as [PRD use](references/prd-use.md) says.
2. **Health.** `loops health --platform <mobile|web> --json`. A missing
   required item stops every run that reaches a device until it is fixed.
   MOBILE: offer the setup in one question, and on a yes load
   `ua:native-setup` and run it (the person never types it; it is hidden),
   then go on with the run. WEB: `loops setup --platform web` lists the one
   install and exits 3; ask once, and on a yes run
   `loops setup --platform web --yes --only browser`, then go on. Keep its
   `capacity` (agents, and the pool on MOBILE or the browsers on WEB) for the
   run, with the attempt and time limits of `LOOPS_HOME/config.json`
   ([limits](references/limits.md)). Tenant health (`loop-preflight`
   health) runs before the first builder attempt: a 5xx or a dead bridge
   backs off; it never spends a builder try.
3. **Signed in.** Checked before the first device step of a run that reaches
   a device. MOBILE: `loops signed-in --json` says which pool simulator is the
   signed-in one (profile `preferredDevice.udid`) and which are not. None is
   signed in: ask the person once to sign in on one simulator, record it,
   and clone it to the others
   ([signed in](../native-device-pool/references/signed-in.md)). WEB: one
   `B open-page` of a preview URL in `R/runners/web-1/browser/`, then
   `B close`. Exit 5 on the sign-in page (signed out): run the sign-in step of
   `/ua:setup` so the person signs in again, then open once more. Exit 7 (the
   tenant would not say its environment): say
   the line word for word and stop ([browser walk](../../app-verify/references/browser-walk.md)).
   Nothing types or stores a password.
4. **Resume first.** An unfinished run of the same goal and scope (its
   `board.json` not `finished`) is resumed, not restarted: read its
   `board.json`, `run-log.jsonl` and its queue requests
   (`device-pool queue list --run <R>`), say where it stopped, and
   continue from the last stage with a read-back. A write logged without a
   read-back is read live before anything is sent again: it may have half
   landed. `loops run resume` lists the unfinished runs, each job's
   `state.json` and any data change still pending in the undo log
   (`data-undo.mjs check`); the restore step runs before the first new
   dispatch ([undo log](../loop-test-data/references/undo-log.md)).
5. **The run.** `loops run start --goal <goal> --platform <MOBILE|WEB> --scope "<scope>" --request "<as typed>"`
   (the platform `loops platform` answered) makes `R` = `<solution>/.nebula/loops/runs/<goal>-<scope slug>-<yyyymmdd-hhmm>/`,
   writes `board.json` (goal, platform, scope, limits) and `board.md`, and
   appends the `run.start` event. A run folder with no `board.json` is a
   failure of this step: `loops board --check` warns on it and `loops run
   resume` lists it. Then `UnifyApps Headless task begin --request "<as typed>"` for any
   loop that writes.
6. **Say what closing the session does.** In one line at the start of a run
   that dispatches background agents: "Closing this session stops the
   background agents. Each job keeps its state in its folder, so a later
   session can resume the run." See § Background jobs.
7. **Settle the rules once** for loops that write or reach a device. Fill
   the run settings from the request, recorded answers and profile. Ask only
   unresolved questions (at most four), together where possible. The answers
   hold for the whole run within their recorded scope and conditions.

## Background jobs die with the session

A background agent, and a test runner, stops when the Claude Code session that
started it closes. Nothing it was doing is rolled back. So every job and
runner keeps its state on disk at every step, and a later session reads it:

- **State file.** Each job writes `R/jobs/<job>/state.json` at every step
  (before a write, after a read-back, after a queue add):
  `loops run job-state --run <R> --job <job> --step "<what it just did>" [--undo R/data/undo-log.jsonl] [--attempt <n>] [--request-id <id>]`.
  The file holds the job id, its agent, the last step, the undo log path and
  the time ([formats](references/formats.md) § Job state).
- **Resume.** A new session runs `loops run resume`: runs whose board is not
  `finished`, each job's last step and how old it is, and the pending undo
  entries. It restores pending data changes first, reads live any page a job
  was writing, and sends the job again from its last step with a fresh agent
  and a handoff. A job whose state file is older than `limits.jobMinutes` and
  not `passed` is treated as dead.
- **The person is told** at the start of the run (§ Before every loop, step 6).

## Modes: what a loop may change

Every loop starts in `look`. A loop moves up only through the approval that
opens the next mode, and never past its limit.

| Mode | May change | Opened by |
| --- | --- | --- |
| `look` | nothing on the tenant (test runs only of automations that write nothing); files in the solution folder and `LOOPS_HOME`; taps that only navigate or open sheets | the start of every loop |
| `draft` | draft saves through UnifyApps Headless builders on the run's own pages, modules, cards, the automations of its automation jobs (saved; deployed once the test run after passes, [approvals](references/approvals.md) § Automation deploys ask nothing) and the AI agents of its AI agent jobs (saved, never published); test runs and test messages; seeded rows in a manifest; the recorded steps of a reported issue as the test user, when the run settings allow | the plan approval (the jobs in `fix`, the UnifyApps Headless plan in `build`) |
| `release` | one AI agent publish, one object change, one write-back: each its own approval, every time (in `fix`, its jobs' agent publishes may ride on the release yes asked once at the plan approval); an automation deploy once its test runs pass, with no approval on a tenant that said it is UAT at sign-in (elsewhere on a yes) | the agent publish, object and write-back approvals; the release yes of a fix run; a passing test run for a deploy |

| Goal | Default | Limit |
| --- | --- | --- |
| `setup` | `look` | installs on this laptop after the install approval; the profile; one memory line |
| `audit`, `triage`, `report` | `look` | `look` |
| `test-author` | `look` | `look` on the tenant, and `draft` for the Test Studio cases the create loop saves; files under the app's tests folder and a report copy in Downloads; a ticket only on the write-back approval |
| `scope` | `look`, and the PRD's draft saved on the solution | after the plan approval: the PRD version approved, a new app's empty shell through one plan, and the tickets written out; never a page, object, automation, AI agent or publish |
| `fix` | `look` | `draft`; `release` only for an automation deploy once its test run passes, an AI agent publish on the release yes or its own approval, an object change on its object approval, and a write-back; never an app publish |
| `build` | `look` | `draft`; `release` only for a deploy the plan named once its test runs pass (no approval), an AI agent publish the plan named (the agent publish approval); never an app publish |

## Scope: impact analysis reaches every dependent page

Pages share modules and card pages, so a scope is never just the pages named.

1. `loops impact <appId> --page <id>` for each page named (or `--module <id>`,
   `--card <id>`): the pages, shared modules and card pages it touches.
   An app scope is every page the route map reaches.
2. Write `scope.json` ([formats](references/formats.md) § Scope): each page
   with why it is in (asked, uses a module, hosts a card, opens it).
3. **Audit:** each shared module or card is audited once, as its own group;
   its issues name the module as owner.
4. **Fix and build:** a change to a shared module or card is its own job.
   When it passes, every dependent page is re-queued for a retest of the issues
   that show on it. A page job never edits a shared item; it writes the need
   under its notes for the shared-module job.
5. **Automations:** an issue an automation owns is an automation job in
   `fix`: saved and test-run as a draft, then deployed as soon as its test
   run after passes, with no approval on a tenant that said it is UAT at sign-in (elsewhere on a yes);
   the plan approval and the closing summary name its callers from
   `ua impact automation <id> --change logic` (every page and AI agent
   that calls it gets the change at once). Its inputs and outputs stay as
   they are unless the issue needs them changed; then every caller that must
   change becomes a job too. An AI agent job names the apps and pages that
   chat with it (`ua impact ai-agent <id>`) in the release question or
   its agent publish approval;
   an object job names every page and automation that uses the object
   (`ua impact object <id>`) in its object approval.
6. Say the impact in one line before the first dispatch:
   "Home uses the header module, shared with 7 pages: they are retested too."

**On WEB** many pages share the app shell: the menu (side or top bar, its
items and the default page), the module that draws the bar, and the header,
footer and template modules several pages place. `loops impact` also reads
the menu (`cache nav`) and the paths (`cache paths`); `--nav`, `--nav-item <id>`
and `--template <id>` list every page a change to one reaches. An `app shell`
issue (a finding outside the page root, or a change to the menu, the bar or a
shared header or footer) gets its own job, as a shared module does, and every
page that shows it is retested at both widths.

## Stages

```
          ┌──────── orchestrator (this session: board, limits, approvals, run log) ──────┐
scope ──► audit stage ───────► issues ─► fix / build stage ────► device queue ──► test-and-fix stage
 (impact  agents in parallel,     ▲     agents in parallel,      (by kind)       1 test runner per device
 analysis) config checks;         │     drafts, read-backs,                      drains the queue:
          device checks queued    │     then queue a retest                      pass → done
                                  │     (a replay for steps)                     fail → issue back to the orchestrator
   one issue the person reports ──┴─ reproduce stage: steps → device → cause by layer → one issue with its steps
```

| Stage | Reference | Agents | Parallel by |
| --- | --- | --- | --- |
| prd (scope) | [references/stages/prd.md](references/stages/prd.md) | one general-purpose PRD reviewer per round | round |
| app-plan (scope) | [references/stages/app-plan.md](references/stages/app-plan.md) | none: the main session plans | — |
| tickets (scope) | [references/stages/tickets.md](references/stages/tickets.md) | `ua:app-agent` (`ua:code-app-agent` for a WEB code app) through a one-task plan, for a new app's empty shell | build layer |
| design intake | [references/stages/design-intake.md](references/stages/design-intake.md) | `ua:design-capture` per Figma frame | frame |
| audit checks (how every check runs) | [references/audit-checks.md](references/audit-checks.md) | see each check | page group × check |
| audit `ui` | [references/stages/audit-ui.md](references/stages/audit-ui.md) | general-purpose | page group |
| audit `touch-feedback` (`interaction` on WEB) | [references/stages/audit-touch-feedback.md](references/stages/audit-touch-feedback.md) | general-purpose | page group |
| audit `a11y` (WEB) | [references/stages/audit-a11y.md](references/stages/audit-a11y.md) | general-purpose | page group |
| audit `responsive` (WEB) | [references/stages/audit-responsive.md](references/stages/audit-responsive.md) | general-purpose | page group |
| audit `perf` | [references/stages/audit-perf.md](references/stages/audit-perf.md) | general-purpose; `ua:automation-agent` (reads) | page group, automation |
| audit `security` | [references/stages/audit-security.md](references/stages/audit-security.md) | general-purpose; `ua:automation-agent` (reads) | page group, automation |
| audit `data` | [references/stages/audit-data.md](references/stages/audit-data.md) | general-purpose; `ua:automation-agent` (reads, test runs) | page group, automation |
| audit `logic` | [references/stages/audit-logic.md](references/stages/audit-logic.md) | general-purpose | page group |
| reproduce (an issue the person reports) | [references/stages/reproduce.md](references/stages/reproduce.md) | general-purpose, holding a device; `ua:automation-agent` (reads) | reported issue |
| fix | [references/stages/fix.md](references/stages/fix.md) | `ua:app-agent`; `ua:automation-agent` (automation jobs); `ua:agent-builder` (AI agent jobs); `ua:fde-agent` (object jobs) | job |
| build | [references/stages/build.md](references/stages/build.md) | `ua:app-agent` through the plan | plan task |
| feature (build from a description) | [references/stages/feature.md](references/stages/feature.md) | `ua:fde-agent`, `ua:automation-agent`, `ua:app-agent`, `ua:agent-builder`, `ua:page-reviewer` through the plan | plan task |
| test-and-fix | [references/stages/test-and-fix.md](references/stages/test-and-fix.md) | general-purpose test runners | device |
| triage | [references/stages/triage.md](references/stages/triage.md) | general-purpose test runners (copy look) | list, device |
| test-author (WEB) | [references/stages/test-author.md](references/stages/test-author.md) | the Test Studio create and triage loops, no device | none |
| retake (on request) | [references/stages/retake.md](references/stages/retake.md) | general-purpose capture agents | device |

The stages hand off through files, never chat prose: the issue log, the
retest file, the fix report, the test runner reply, the platform queue, the
triage table and the board are in
[formats](references/formats.md).

## Jobs and limits

- **Limits** are read once per run ([limits](references/limits.md)):
  `maxAgents` (`capacity.agents` from `loops health --json`: 10 by default,
  up to 20, sized from the laptop) for the audit, fix and build stages;
  `runners` (`capacity.pool`, the pool size, on MOBILE; `capacity.browsers`
  on WEB) for the device stage;
  `maxAttempts` 4, `jobMinutes` 50 and `maxPasses` 4 from `config.json`.
  Inside a loop run, UnifyApps Headless's chat rule of six builders at once is lifted to
  `maxAgents`; outside a run it stands.
- **The audit splits by page group × check.** **The fix stage splits by
  page**, with each shared module or card, and each automation, its own job
  (`loops issues split --jobs <maxAgents>`). Two jobs never share a page or
  an automation: a job holds a page lock on each of its pages, an automation
  job the lock `automation-<id>`.
- **Dispatch** every job that can start in one message, in the background,
  up to `maxAgents`; the rest wait on the board, worst severity first, and
  start as agents report. Each brief is a full UnifyApps Headless brief plus the shared
  brief's path ([builder brief](references/builder-brief.md)).
- **Attempts.** An issue comes back at most `maxAttempts` times; after that, and
  for a job past `jobMinutes`, the escalation question for that job only.

## Device queue: no agent waits for a device

- Every device check is a request: `loops queue add --run <R> --kind <kind> --platform <mobile|web> …`.
  Both platforms: `retest`, `replay`, `visual-check`, `performance`,
  `acceptance`, `realtime`, `capture`; MOBILE only: `touch-feedback`,
  `loading`; WEB only: `interaction`, `a11y`, `responsive`
  (an `acceptance` or `realtime` check takes `--steps <steps file in R>` in place of `--issues`;
  a `capture` takes `--side before|after` and only takes screenshots, for the person's sheets;
  a `loading` check records the page opening and finds blank bands and layout shifts)
  ([test-and-fix](references/stages/test-and-fix.md)). An audit, fix or
  build agent queues and goes on; it never holds or waits for a device.
- Test runners, one per device, start when the queue first gets work and drain it
  in order. They measure; they never fix or write to the tenant. Each takes
  only its own platform's requests (the queue answers `WRONG_PLATFORM`).
- On MOBILE a device is one pool simulator (two for a `realtime` check). On
  both platforms the orchestrator waits in the background only:
  `device-pool queue await <id> --wait 3600` with
  `run_in_background: true`. Meanwhile it does every stage that needs no
  device, then ends its turn with the board's one-line summary.
- A result is a footer: pass → the issues are done; fail → the issues go back to
  their job for another attempt; renderer issues → the platform queue.
- The reproduce stage holds one device for an interactive run
  instead: they reserve a simulator directly and wait in the background when
  the pool is busy. On WEB the reproduce stage holds a browser folder of its
  own, `R/runners/web-repro-<n>/browser/`, with no reservation. A reproduced
  issue's fix is then retested by a `replay` request like any other check.

**On WEB** a device is a browser folder: no pool, no reservation.

- **Before queuing**, `loops cache-export <appId> <pageId> --run <R>` writes
  `R/cache/<pageId>/blocks.json` and `outline.json`, which the WEB checks read
  so a test runner never fetches them: for every page in `scope.json` before
  the first dispatch, and again after a job's write and read-back
  (`ua solution refresh` first when the cache is stale).
- **Queue** with `--platform web`, the widths, the page's preview path (from `paths`, real values in its params),
  the group and the request's own first issue number in the note ([audit checks](references/audit-checks.md) § The checks):
  `loops queue add --run <R> --kind visual-check --platform web --page <id> --page-name <Page> --note "widths 1440,375; path /orders/<id>; group 2; start 51"`.
- **Test runners**: `min(capacity.browsers, requests queued)` background
  `general-purpose` agents, each with its own index `n` and browser folder,
  briefed and run as web-browser's [runner](../../web-loops/web-browser/references/runner.md)
  says until the queue stays empty; one that ends while work is queued is
  replaced. A `realtime` check adds the writer's folder,
  `R/runners/web-<n>-writer/browser/`.

## Approvals

Each approval is one `AskUserQuestion` in chat, recommended option first; the
full list is in [approvals](references/approvals.md). The ones that release or
start writes:

| Approval | Before | Never |
| --- | --- | --- |
| plan approval (`plan`) | the first draft write of `fix`: the jobs, pages, issues and what each will not touch (in `build`: the plan; in `scope`: the tickets, the PRD version and a new app's empty shell) | started without it |
| release yes of a fix run (in `plan`) | asked once at the fix plan approval, only when a job fixes an AI agent: may it publish the AI agent fixes once their test messages pass; a yes lets each AI agent job publish right after its test, so the run reaches the device check without stopping | carried into another run, or stretched to an object change or the app publish |
| agent publish approval (`agent-publish`) | each publish of an AI agent the release yes does not cover: one a fix job changed, naming the apps and pages that chat with it, with the test messages | bundled or defaulted |
| object approval (`object`) | each change to an object's fields, naming every page and automation that uses it and the stored rows it changes | bundled or defaulted; a field removal without its own delete dialog |

A delete never needs a loops approval: it is UnifyApps Headless's own dialog
(`CONFIRM_REQUIRED (d_…)`), asked as `ua:ua-change` says.

## Run log

Every run appends to `R/run-log.jsonl` ([run log](references/run-log.md)):
`loops log append` at every stage start and end, before every dispatch with
the **full brief**, when every agent's reply arrives with the **full
report**, after every approval answer, and for every reservation, queue change and
release. The script strips passwords, cookies, tokens, signed URLs and
sign-ins before it writes; never put one into a brief anyway. Nothing is
summed or rendered during a run: `native-report` does that, and only
when asked.

## The board and the turn

- The orchestrator rewrites `board.json` after every event and runs
  `loops board`, which renders `board.md` from it
  ([formats](references/formats.md) § Board). A resumed run reads
  `board.json` first.
- A turn that waits on agents or test runners ends with the board's one-line
  summary: jobs by state, issues open, requests queued, what the run waits on.
- Agent notifications wake the session; never poll an agent or the queue in
  the foreground.

## How every run behaves

1. **Modes.** Every loop names its modes and starts in `look`, which only
   reads (§ Modes).
2. **What a mode may change.** A loop never does more than its mode and the
   rules settled in the run settings allow: drafts on its own pages and
   automations in `draft`, one approved release at a time in `release`.
3. **Always ask first.** An AI agent publish, an object change,
   a write-back to a ticket board, a message to another person or team, and
   every delete each need the person's yes in chat, every time. A production
   tenant is the server's call: the loops send what they are asked.
4. **One output block per step.** Each stage ends with one block in chat:
   `Stage: <name>` (`<job>` when it has one), then `done`, `stopped` or
   `skipped`, then what it found in one to five lines with numbers, then what
   it hands on. The files in `R` hold the detail; the last block is the
   loop's answer.
5. **Proof by read-back.** A write is done only when a live read-back shows
   it; a device result only with the version the device showed and how the
   refetch was proven ([rules](references/rules.md) § Evidence). A
   builder's words are not proof.
6. **Retries.** A read is retried at most twice; a fix is tried at most twice
   per attempt and an issue comes back at most `maxAttempts` times. Repeating
   a failed method needs new evidence or a changed method, not a fresh agent
   ([execution](references/execution.md)). After that the
   run stops that issue or job and says what it saw (the escalation question).
7. **Stopping early.** A stage that cannot finish (no sign-in, no access, a
   missing tool, a dead device after its recovery) stops and names the one
   thing that unblocks it. A missing fact is written `unknown` with the next
   check, never guessed.
8. **Running again.** Every stage reads the current state first (the board,
   the run log, the queue, the live page or automation), so a second run picks
   up where the first one stopped and never redoes a write that landed.
9. **Names and data.** No tenant, client or person's name, and no personal
   value, goes into a shipped file, a ticket comment, a shared summary or a
   commit. Test inputs are test ids. Throwaway items a run makes start with
   `ZZ_LOOP_<goal>_<what>` and are listed for cleanup.

Shared rules on values, measurement, safety, UnifyApps Headless ownership, the device
reservation and profiles, evidence and the run folder are in
[rules](references/rules.md); what the phone or the browser does that config
does not show is in [device traps](references/device-traps.md); the design store is in
[design store](references/design-store.md).

## Finish

The testing loops close as their own SKILL.md says, and the scope loop as
[tickets](references/stages/tickets.md) § Finish says; step 6 applies to every loop.

1. Every data change the run made is restored: `data-undo.mjs check --run <R>`
   exits 0 (the restore step, [undo log](../loop-test-data/references/undo-log.md)).
   A change still pending goes to the person's list in the closing summary.
2. Every reservation and page lock released, and every WEB browser closed
   (`B close`); simulators the run started named if they still run.
3. `ua plan finish` for a plan the run ran; `UnifyApps Headless task end` for chat
   work; `ua memory remember` only for what the files do not hold (a device
   trap found, a decision the person made).
4. **The sheets** (`fix` and `build`): `loops shots compose --run <R> --open`
   writes `R/shots/sheets/` and opens it for the person: a BEFORE | AFTER
   sheet of every fix verified on a screen, or a sheet of every page built
   ([formats](references/formats.md) § Shots). Never read a sheet into the
   context.
5. `loops log append --run <R> '{"type":"run.end","outcome":…}'` with the
   outcome and the counts;
   `board.json` gets `finished: true`, then `loops board`.
6. **Self-review** ([self-review](references/self-review.md)): `loops signals finish --run <R> --json`, then `R/self-review.md` (what in this loop's text,
   briefs, scripts or tools made the run slower or wrong, from `R`'s files, never a transcript), and the records it says are due named in the summary with an offer of `/ua:give-feedback`. Nothing is sent unless the person runs it.
7. The closing summary: the loop's own shape, every count from the files in
   `R`; the path of every sheet, and the shots it left out with why; what is
   left as drafts (seen in the Preview app, or on WEB on the builder preview
   route; a client build gets them only after the person publishes); the next
   step it offers, never a publish; last, the `Loop review: …` line from step 6. The report is not offered unless the
   person asks how the run went.

## References

| File | Read it when |
| --- | --- |
| the files under `references/stages/` | the stage starts (§ Stages) |
| [references/audit-checks.md](references/audit-checks.md) | an audit stage starts (`native-audit`, or the quick audit of the fix loop) |
| [references/formats.md](references/formats.md) | writing or reading any hand-off file: issue log, retest file, fix report, test runner reply, platform queue, triage table, board, shots |
| [references/builder-brief.md](references/builder-brief.md) | before the first dispatch of a loop that writes, and when a rule changes mid-run |
| [references/approvals.md](references/approvals.md) | before any question to the person |
| [references/execution.md](references/execution.md) | before dispatch, a priority change, a retry or judging a result |
| [references/limits.md](references/limits.md) | sizing the stages, or when a limit stops a job |
| [references/device-traps.md](references/device-traps.md) | writing a brief, a fix hint, or judging a device issue |
| [references/rules.md](references/rules.md) | values, measurement, safety, evidence, device profiles, the run folder |
| [references/design-store.md](references/design-store.md) | the design is taken in, read or changed |
| [references/run-log.md](references/run-log.md) | appending an event, or `native-report` |
| [references/ticket-sources.md](references/ticket-sources.md) | a ticket is read (its comments, screenshots and recordings), a board is read through the browser, or a write-back names the build QA tested |
| [references/prd-use.md](references/prd-use.md) | the app has a PRD: what each loop reads in it, and how the build loop keeps it current at its finish |
| [references/which-loop.md](references/which-loop.md) | a front door or `ua-change` reads an ask: the kind of thing it is about, passed to `loops target --kind` |

The loops, the skills, the stages and the blocks each one uses are listed in `registry.json`;
the workflows `setup-toolchain`, `design-board` and `data-layer-check` are in `workflows/`.
