---
name: app-fix-loop
description: Fixes a UnifyApps WEB app in a browser - its pages against their design, the open issues an audit left (ui, interaction, performance, security, data, logic, a11y, responsive), or one issue described in chat, reproduced first by steps run in a browser (or from its automation's runs when nothing shows on a page) and traced layer by layer to its cause - block config or event, data source, page state (variables, page inputs, storage), automation, AI agent or object. Parallel jobs per page, shared module or card, automation, AI agent and object, each a draft save through a UnifyApps Headless builder with a live read-back, then retested by queued browser test runners that replay a reported issue's steps. Deploys an automation fix once its test passes (a yes off UAT); AI agent publishes and object changes need a yes; never publishes the app. Use when the person types /ua:app-fix-loop, or asks to fix a page of a WEB app, match the design, fix what an audit found, or fix one bug described in chat.
argument-hint: "<app | page[,page] | issue log | the issue in words> [design | focus]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# App fix loop

`/ua:app-fix-loop <app | page[,page] | issue log | the issue in words> [design | focus]`

Fixes a WEB app or its pages against their approved design, the open issues
its audit checks found, or one issue the person describes in chat, through
parallel jobs, until every issue passes in a browser, is accepted, or is
escalated.

## Two ways in

| The person | Way in | What runs first |
| --- | --- | --- |
| names nothing specific: "fix the Orders page", "make the app match the design", "fix what the audit found", or gives a list: a board, a CSV, a sheet, tickets | **Find issues** | the open issues of the scope's last run or the issue log named; a list goes through the [triage stage](../../skills/native-loops/loop-orchestrator/references/stages/triage.md) first, read-only, with its look on a WEB app; with none, the quick audit |
| describes one issue: "when I click the favourite button and reload, it is not saved" | **Reproduce the issue** | the [reproduce stage](../../skills/native-loops/loop-orchestrator/references/stages/reproduce.md): the words as steps, run in a browser on the page's draft until the issue shows, the cause found layer by layer, one issue with its cause, an owner and its steps file as its test. An issue with no screen ("the manager gets no email") is read from its automation's runs instead, with no browser |

Both ways end in the same issue log, the same jobs and the same retests.
Every issue says its `cause`, the layer it lives in (`config`, `event`,
`data source`, `state`, `automation`, `agent`, `object`, `access`,
`platform`, `environment`), and the job follows it.

A request for something new ("add analytics", "make the list live") is not
a fix: say so in one line and offer `/ua:app-build-loop` from a
description.

## What differs on WEB

The stages are the orchestrator's; on a WEB app:

- **The device is a browser folder** of the run
  ([web-browser](../../skills/web-loops/web-browser/SKILL.md)): UnifyApps
  Headless's own browser on the builder preview route, which shows the saved
  draft, one folder per test runner. Each browser signs in as the person on
  its own, and nothing is reserved. Health is `loops health --platform web`;
  a missing browser is installed by
  `loops setup --platform web --yes --only browser` after one question. A
  sign-in that ran out stops the checks until the person signs in again
  through the sign-in step of `/ua:setup`.
- **Two widths.** Issues are found and retested at the design width (1440)
  and the second width (375). A fix of an issue seen at 375 only keeps the
  design width's match: its retest covers both widths.
- **Eight audit checks:** `ui · interaction · perf · security · data · logic · a11y · responsive`.
  `interaction` looks at the hover look, the focus ring, the pointer cursor,
  keyboard reach and order and the pressed look; `a11y` at accessible names,
  form labels, contrast, heading order and ARIA; `responsive` at overflow,
  cut or overlapping text and the menu at each width. The perf check is the
  page quality rules that hold on WEB, judged from the cache, plus
  `web-profile`'s probe of the page's draft (results in the run's `perf/<pageId>/`);
  a performance fix is measured by the same probe before and after.
- **Reproduce in a browser.** The steps run in a browser folder of their own
  at the width the person saw (1440 when they did not say; 375 for the phone
  view) and are kept as a steps file, replayed in a browser after every fix
  (`steps:<file>` in the issue log). The data-source calls come from the
  browser (`calls.json`).
- **The app shell.** An issue outside the page root (the menu, the bar, a
  header or footer several pages share) is an `app shell` issue and gets its
  own job: menu items, groups, order and the default page through
  `apply_navigation_edits`, what draws the bar through `set_navigation_style`;
  moving the bar has no tool and is a manual step. `loops impact` reads the
  menu and the paths (`--nav`, `--nav-item <id>`, `--module <id>`), and
  every page the menu shows on is retested at both widths.
- **No platform job.** This loop never changes platform code: a renderer bug
  becomes a handoff note (the browser, the width, `draft (preview route)`)
  and goes to the person's list.
- **The lint** is `task-lint.mjs <tasks.json> --platform WEB`; a visual check
  issue's fix brief is `fix-brief.mjs --platform web`: a browser pass in CSS
  px at the issue's width, the design's values 1:1.
- **Builders** load `app-design`, `app-craft` and `app-verify`.

## Code apps

`loops platform` also answers the app's kind. A **no-code** app's pages are
block config; a **code app** is a Code Builder app whose source lives in git.
On a code app:

- A page or app-shell job goes to the code app agent (`ua:code-app-agent`);
  an automation, AI agent or object job goes to its builder as always.
- The cause is found in the app's source, not in block config: the reproduce
  stage names a file and a line, and the agent reads the checkout for the
  component the steps reach. There is no drift snapshot and no block
  read-back; the agent's report (the files changed, a clean `tsc -b`, the
  engine's green push) is the job's read-back.
- The reproduction, the retest and every check run on the engine's preview
  route (`https://<host>/agent-api/preview/b/<appId>/main<path>`).
- The audit's config half (the page quality rules) does not apply; its
  browser half (`interaction`, `a11y`, `responsive`, the perf probe) does.
- Publish only on a yes, through `publish_code_app`.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this loop (goal `fix`):
   the platform, health, resume, the run folder, the impact analysis, the jobs
   and limits, the device queue, the board and the run log come from there.
   On a MOBILE app (`loops platform` answers it), say
   "This is a MOBILE app. Use /ua:native-fix-loop." and stop.
2. Pick the way in (above), then the stage chain below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below.

## When

"Fix the Orders page", "make the app match the design", "fix what the audit
found", "the page breaks on a phone", "the menu is wrong on every page",
"take the client's issues through the builders", and one bug described in
chat ("the favourite is not saved", "the list does not sort"): reproduced
first.

## Inputs

- The issues: the newest open `issues/merged.md` of the scope's last run, an
  issue log the person names, the person's words for one reported issue (with
  the page, steps or a screenshot when they give them), or none (then a quick
  audit finds them).
- A ticket list (a board, a CSV, a sheet, tickets): the triage stage
  turns each item into one issue with a layer and an owner, from its text,
  its comments and the screenshots and recordings in them (open
  [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
  § Read a ticket and follow its steps, or read the ticket file a
  front door wrote), and, for a moved copy whose tenant has a sign-in saved by
  `/ua:setup`, a read-only look in a browser at both widths.
- The design store for UI issues, one design spec per width the design has
  ([design store](../../skills/native-loops/loop-orchestrator/references/design-store.md)).
- The app's PRD, read only when a ticket or a reported issue does not say what
  should happen or needs more context: the `R<n>` or `A<n>.<m>` line that does becomes
  the issue's expected result, cited by its id
  ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md)).
  The fix loop never changes the PRD.
- The rules from the run settings: the scope and focus; for a reported issue
  whose steps write (a favourite, a form), may the steps and their replays
  save. The browser is signed in as the person, not a test user, so a step
  that saves runs only on seeded `ZZ_LOOP_` test data, each change in the undo
  log first.

## Mode and limit

`look` until the plan approval, then `draft`: draft saves through builders on
the jobs' own pages, modules, cards, app shell, automations and AI agents,
with test runs and test messages. An automation is deployed as soon as its
test run after passes, with no question on a tenant that said it is UAT at
sign-in (a yes elsewhere);
an AI agent published only on the person's yes (the release yes, asked once
at the plan approval and only when a job fixes an AI agent, or else one
approval each); an object changed only on its object approval; never platform
code; no app publish and no publish question (the builder preview route runs
the drafts; the person publishes when the published app should get the
fixes); deletes only through UnifyApps Headless's dialog.

## Scope rules

The issues decide the pages. `loops impact` adds every page that shows a
module or card a job will change, and for an `app shell` job every page the
menu shows on; those pages are retested at both widths, not edited. A page
whose page lock another session holds is left out and named. An automation
job reads its callers with `ua impact automation <id> --change logic` and
names them at the plan approval and in the closing summary; a change to its
inputs or outputs makes every caller that must change a job too. An AI agent
job names the apps and pages that chat with it (`ua impact ai-agent <id>`),
an object job every page and automation that uses the object
(`ua impact object <id>`).

## Stage chain

```
Find issues (nothing specific named)        Reproduce the issue (one issue named in chat)
  open issues? ── none ─► quick audit         words ─► steps (route map, cache) ─► a browser on the draft
  a list ─► triage (read-only)                ─► reproduced? ── no ─► repro question ─► steps again
        │                                     ─► cause by layer ─► one issue: cause + owner + steps file
        │                                     (no screen: the automation's runs, no browser)
        └───────────────────┬───────────────────────┘
                            ▼
  loops issues split ─► before shots (a capture per job and page; a reproduced issue has its fail shot)
  ─► plan approval (Find issues only; a reproduced issue starts at once)
  ─► fix stage: jobs in parallel (≤ maxAgents)
    page · shared module (module or card) · app shell ─► brief ─► draft ─► read-back ─► queue retest
    automation ─► test run before ─► smallest change, saved ─► test run after
               ─► deploy (no question on UAT; a yes elsewhere) ─► queue retest
    AI agent ─► test message before ─► smallest change ─► test message after
               ─► publish (the release yes, or its approval) ─► queue retest
    object ─► object approval (users named) ─► the change ─► read-back ─► queue retest
    renderer bug ─► handoff note · person issues ─► the person's list
  ─► test-and-fix: retest, or replay of the steps file (each keeps the after shot) ─► pass → done · fail → back to its job
  ─► attempts until every job passes, is accepted, or is escalated
  ─► write-back approval for issues from tickets ─► BEFORE | AFTER sheets ─► the summary (everything a draft; no publish)
```

- **Quick audit** = the audit checks on the scope, with the checks the focus
  names (ui, interaction and logic when none; the UI check then queues the
  a11y and responsive checks too), as
  [audit checks](../../skills/native-loops/loop-orchestrator/references/audit-checks.md) says, then
  on.
- **Reproduce the issue** is a loop of its own
  ([reproduce](../../skills/native-loops/loop-orchestrator/references/stages/reproduce.md)): the
  steps from the person's words, the page from the cache and
  [loop-route-map](../../skills/native-loops/loop-route-map/SKILL.md); run in a
  browser of its own on the page's draft, with the page, the data-source
  calls and the draft seen; not reproduced, the repro question (try
  different steps · run them five times · stop); then the cause, cheapest
  read first: the block's config, its event and action, page state
  (variables, page inputs, storage, bindings), the data source, the
  automation's runs (read-only, `ua:automation-run-debugging`), the AI agent
  behind a chat (its instructions and tools, and the tool it called), the
  object and its record (read-only), access, platform code (a handoff note).
  It writes ONE issue with its cause, its owner and its steps file (`steps`
  in the issue log), and the issue goes on like any other. An issue with no
  screen is read from its automation's runs (§ No screen of the stage).
- **AI agent and object issues are fixed here too**
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § AI agent job, § Object job):
  an AI agent job briefs `ua:agent-builder` (a test message before and
  after the smallest change to its instructions, tools or knowledge, then the
  agent publish approval); an object job briefs `ua:fde-agent` after the
  object approval (add, never remove unless the approval named it; a field
  removed or renamed also waits on its delete dialog).
- **Jobs, attempts and the queue** as the
  [fix stage](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) and
  [test-and-fix](../../skills/native-loops/loop-orchestrator/references/stages/test-and-fix.md) say,
  each in its § On a WEB app.
- **Automation issues are fixed here**, one automation job per automation
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Automation job): a
  `ua:ua-change` brief to `ua:automation-agent`, which loads
  `automation-testing`, `automation-run-debugging`, `automation-runtime`,
  `resiliency`, `data-fetching` and `node-inputs-and-pills` as the issue
  needs, reads the live automation, test-runs the failing case before and
  after the smallest change and saves it. Then it deploys right away: with no
  question on a tenant that said it is UAT at sign-in, where the test runs are
  the proof, and on a yes on any other or unknown environment. Pages call the
  deployed version, so the check in the browser needs it.
  Then the page's retest (a replay when the issue has steps). Inputs and
  outputs stay as they are unless the issue needs them changed.
- **No proof, no draft.** A reported issue is drafted only when it was
  reproduced in a browser or its cause was read back from config; any other
  goes to the person's list with the one question that would unblock it
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Jobs).
- **Data changes are undone.** A check that saves works on a record of its
  own, writes an undo entry before each change, and the run restores from the
  log at its end and on resume
  ([undo log](../../skills/native-loops/loop-test-data/references/undo-log.md)).
- **Replay retest.** Every fix of an issue with a steps file, by any job, is
  retested by a `replay`: a test runner runs the steps again in its browser,
  checks the expected result, confirms the record read-only when the issue is
  about saved data, and takes a quick look at the page for regressions. A
  fail reopens the issue.
- **Before and after shots.** Every issue that shows on a page gets a
  BEFORE | AFTER sheet at the end, at the width it was seen at, so the person
  sees what was fixed
  ([formats](../../skills/native-loops/loop-orchestrator/references/formats.md) § Shots).
  The before side is taken before its job writes: a reproduced issue's
  `fail.png`, else a `capture` request per job and page queued right after
  the split, which the job's dispatch waits for
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Before shots).
  The retest or replay that verifies the fix shoots the after side in the
  same state. An issue with no screen (an automation's runs) has no sheet.
- **Escalated** is only for an issue past `limits.maxAttempts` (or a job past
  `limits.jobMinutes`), a reproduction that failed or was stopped, and a
  browser that will not open the page: the escalation question, with what
  was seen.
- **Issues from tickets.** When a job passes and its issues came from a board, a
  CSV or a sheet: the write-back approval, then the status the person chose and a comment
  with four short parts: the cause, what changed, how it was proven, any
  limits, and a last line `Tested on: <the build QA tested> · Fixed in:
  <draft version>` ([ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)).
  A ticket tested on a build older than the fix is `stale-build`, not
  fixed again. A CSV is copied before it is filled. Pasted text gets a table to paste
  back. A ticket not fixed keeps its status.

## Stop fact

Every issue is `verified` in a browser, `accepted` by the person, or
`escalated` (attempts past the limit, a reproduction that failed, a browser
that would not open the page, a renderer bug left as a handoff note, a
person issue); every automation change whose test run passed was deployed,
or kept as a draft when the person said no off UAT; every AI agent change
published on the person's yes or kept as a draft; every object change made
on its object approval; every job released the page lock it held on each
page and its automation, AI agent or object lock; every request of the run
left the queue; every browser is closed.

## Outputs

The board, every job's fix reports and retest files, for a reported issue
`repro/<issue id>/` (the steps file, `snapshot.txt`, `calls.json` and the
shots), the BEFORE | AFTER sheets (`shots/sheets/before-after-<issue id>.png`,
one per fix verified on a page: the page and state on top, the page before
on the left and after on the right, each with its draft version), opened for
the person when the run ends, a handoff note per renderer bug, the draft
version of each page, the deployed version of each automation, and the
closing summary: jobs passed, accepted, escalated; issues by result, by cause
and by width; attempts; `Before/after:` the path of every sheet, and each
fixed issue with no sheet and why; automations deployed, with their versions
and callers; AI agents published or kept as drafts; objects changed; the
person's list (person issues, handoff notes and escalations); what is left.

## Approvals

The run settings (the rules), the plan approval on the Find issues way (with
the release question when a job fixes an AI agent: may it publish once its
test messages pass; a reproduced issue whose cause was found starts its job at
once, with no plan approval), the repro question, the agent publish approval
(per publish, only when the release yes was no), an automation deploy's yes
only on a tenant that did not say it is UAT at sign-in, the object approval
(per object change), manual steps (moving the menu bar is one), the
escalation (per job), the write-back approval.

## Where the loop ends

Everything passed stays a draft, except an automation deployed once its test
run passed, an AI agent published on the person's yes and an object changed on
its object approval. The loop never publishes the app and never asks to: the
builder preview route runs the drafts, so every fix was proven on the draft.
The app's published address runs the published app; the person publishes
when it should get the fixes. The closing summary says what is a draft and
what the published app shows only after a publish. Moving the app to another
environment is a changeset, mostly done by hand; `ua:changeset-manager` helps
when the person asks.
