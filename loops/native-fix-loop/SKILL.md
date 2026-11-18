---
name: native-fix-loop
description: Fixes a UnifyApps MOBILE app - its pages against their design, the open issues an audit or a triage left, or one issue described in chat, reproduced first on a test device (or from its automation's runs when nothing shows on a screen) and traced layer by layer to its cause - block config or event, data source, page state (variables, page inputs, storage), automation, AI agent or object. Parallel jobs per page, shared module or card, automation, AI agent and object (plus a platform job), each a draft save through a UnifyApps Headless builder with a live read-back, then retested by queued test runners that replay a reported issue's steps, attempt after attempt. Deploys an automation fix once its test passes (a yes off UAT); AI agent publishes and object changes need a yes; never publishes the app. Use when the person types /ua:native-fix-loop, or asks to fix a page, match the design, fix what an audit or triage found, or fix one bug described in chat.
argument-hint: "<app | page[,page] | issue log | the issue in words> [design | focus]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native fix loop

`/ua:native-fix-loop <app | page[,page] | issue log | the issue in words> [design | focus]`

Fixes a MOBILE app or its pages against their approved design, the open
issues an audit or a triage left, or one issue the person
describes in chat, through parallel jobs, until every issue passes on a
device, is accepted, or is escalated.

## Two ways in

| The person | Way in | What runs first |
| --- | --- | --- |
| names nothing specific: "fix the Leave page", "make the app match the design", "fix what the audit found" | **Find issues** | the open issues of the scope's last run or the issue log named; with none, the quick audit |
| describes one issue: "when I tap the favourite button and reload, it is not saved" | **Reproduce the issue** | the [reproduce stage](../../skills/native-loops/loop-orchestrator/references/stages/reproduce.md): the words as steps, run on a reserved test device until the issue shows, the cause found layer by layer, one issue with its cause, an owner and the recorded steps as its test. An issue with no screen ("the manager gets no email") is read from its automation's runs instead, with no device |

Both ways end in the same issue log, the same jobs and the same retests.
Every issue says its `cause`, the layer it lives in (`config`, `event`,
`data source`, `state`, `automation`, `agent`, `object`, `access`,
`platform`, `environment`), and the job follows it.

A request for something new ("add analytics", "make the list live") is not
a fix: say so in one line and offer `/ua:native-build-loop` from a
description.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this loop (goal `fix`):
   the platform, health, resume, the run folder, the impact analysis, the jobs
   and limits, the device queue, the board and the run log come from there.
   On a WEB app (`loops platform` answers it), say
   "This is a WEB app. Use /ua:app-fix-loop." and stop.
2. Pick the way in (above), then the stage chain below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below.

## When

"Fix the Leave page", "make the app match the design", "fix what the audit
found", "take the client's issues through the builders", a yes to the fix approval
after `native-audit` or `native-triage`,
and one bug described in chat ("the favourite is not saved", "the list does
not sort"): reproduced first.

## Inputs

- The issues: the newest open `issues/merged.md` of the scope's last run, an
  issue log the person names, the person's words for one reported issue (with
  the page, steps or a screenshot when they give them), or none (then a quick
  audit finds them).
- A ticket (tickets, a board, a CSV, a sheet): each read whole, its
  comments and the screenshots and recordings in them included: open
  [ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)
  § Read a ticket and follow its steps, or read the ticket file a
  front door wrote. A list goes through `native-triage` first.
- The design store for UI issues
  ([design store](../../skills/native-loops/loop-orchestrator/references/design-store.md)).
- The app's PRD, read only when a ticket or a reported issue does not say what
  should happen or needs more context: the `R<n>` or `A<n>.<m>` line that does becomes
  the issue's expected result, cited by its id
  ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md)).
  The fix loop never changes the PRD.
- The rules from the run settings: for a reported issue whose
  steps write (a favourite, a form), may the steps and their replays write as
  the test user.

## Mode and limit

`look` until the plan approval, then `draft`: draft saves through builders on
the jobs' own pages, modules, cards, automations and AI agents, with test
runs and test messages. An automation is deployed as soon as its test run
after passes, with no question on a tenant that said it is UAT at sign-in (a
yes elsewhere); an AI
agent published only on the person's yes (the release yes, asked once at the
plan approval and only when a job fixes an AI agent, or else one approval
each); an object changed only on its object approval; no app publish and no publish question (the
Preview app runs the drafts; the person publishes for a client build);
deletes only through UnifyApps Headless's dialog.

## Scope rules

The issues decide the pages. `loops impact` adds every page that shows a module or
card a job will change; those pages are retested, not edited. A page whose
page lock another session holds is left out and named. An automation job reads its callers with
`ua impact automation <id> --change logic` and names them at the plan
approval and in the closing summary; a change to its inputs or outputs makes every caller that must
change a job too. An AI agent job names the apps and pages that chat with it
(`ua impact ai-agent <id>`), an object job every page and automation that
uses the object (`ua impact object <id>`).

## Stage chain

```
Find issues (nothing specific named)        Reproduce the issue (one issue named in chat)
  open issues? ── none ─► quick audit         words ─► steps (route map, cache) ─► reserved device
        │                                     ─► reproduced? ── no ─► repro question ─► steps again
        │                                     ─► cause by layer ─► one issue: cause + owner + recorded steps
        │                                     (no screen: the automation's runs, no device)
        └───────────────────┬───────────────────────┘
                            ▼
  loops issues split ─► before shots (a capture per job and page; a reproduced issue has its fail shot)
  ─► plan approval (Find issues only; a reproduced issue starts at once)
  ─► fix stage: jobs in parallel (≤ maxAgents)
    page · shared module (module or card) ─► brief ─► draft ─► read-back ─► queue retest
    automation ─► test run before ─► smallest change, saved ─► test run after
               ─► deploy (no question on UAT; a yes elsewhere) ─► queue retest
    AI agent ─► test message before ─► smallest change ─► test message after
               ─► publish (the release yes, or its approval) ─► queue retest
    object ─► object approval (users named) ─► the change ─► read-back ─► queue retest
    platform (a handoff note) · person issues ─► the person's list
  ─► test-and-fix: retest, or replay of the recorded steps (each keeps the after shot) ─► pass → done · fail → back to its job
  ─► attempts until every job passes, is accepted, or is escalated
  ─► write-back approval for issues from tickets ─► BEFORE | AFTER sheets ─► the summary (everything a draft; no publish)
```

- **Quick audit** = the checks of `native-audit` on the scope, with
  the checks the focus names (ui, touch-feedback and logic when none), as
  [audit checks](../../skills/native-loops/loop-orchestrator/references/audit-checks.md) says, then
  on.
- **Reproduce the issue** is a loop of its own
  ([reproduce](../../skills/native-loops/loop-orchestrator/references/stages/reproduce.md)): the
  steps from the person's words, the page from the cache and
  [loop-route-map](../../skills/native-loops/loop-route-map/SKILL.md); run on a reserved device
  (recorded as an argent flow through `native-device-pool`), with the screen,
  the data-source calls and the version seen; not reproduced, the repro
  question (try different steps · run the flow five times · stop);
  then the cause, cheapest read first: the block's config, its event and
  action, page state (variables, page inputs, storage, bindings), the data
  source, the automation's runs (read-only, `ua:automation-run-debugging`),
  the AI agent behind a chat (its instructions and tools, and the tool it
  called), the object and its record (read-only), access, platform code. It
  writes ONE issue with its cause, its owner and its recorded steps (`steps`
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
  [test-and-fix](../../skills/native-loops/loop-orchestrator/references/stages/test-and-fix.md) say.
- **Automation issues are fixed here**, one automation job per automation
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Automation job): a
  `ua:ua-change` brief to `ua:automation-agent`, which loads
  `automation-testing`, `automation-run-debugging`, `automation-runtime`,
  `resiliency`, `data-fetching` and `node-inputs-and-pills` as the issue
  needs, reads the live automation, test-runs the failing case before and
  after the smallest change and saves it. Then it deploys right away: with no
  question on a tenant that said it is UAT at sign-in, where the test runs are
  the proof, and on a yes on any other or unknown environment. Pages call the
  deployed version, so the device check needs it. Then the
  page's retest (a replay when the issue has steps). Inputs and outputs stay as they
  are unless the issue needs them changed.
- **No proof, no draft.** A reported issue is drafted only when it was
  reproduced on a device or its cause was read back from config; any other
  goes to the person's list with the one question that would unblock it
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Jobs).
- **Data changes are undone.** A check that saves works on a record of its
  own, writes an undo entry before each change, and the run restores from the
  log at its end and on resume
  ([undo log](../../skills/native-loops/loop-test-data/references/undo-log.md)).
- **Replay retest.** Every fix of an issue with recorded steps, by any job,
  is retested by a `replay`: a test runner runs the steps again, checks the
  expected result, confirms the record read-only when the issue is about
  saved data, and takes a quick look at the page for regressions. A fail
  reopens the issue.
- **Before and after shots.** Every issue that shows on a screen gets a
  BEFORE | AFTER sheet at the end, so the person sees what was fixed
  ([formats](../../skills/native-loops/loop-orchestrator/references/formats.md) § Shots).
  The before side is taken before its job writes: a reproduced issue's
  `fail.png`, else a `capture` request per job and page queued right after
  the split, which the job's dispatch waits for
  ([fix](../../skills/native-loops/loop-orchestrator/references/stages/fix.md) § Before shots).
  The retest or replay that verifies the fix shoots the after side in the
  same state. An issue with no screen (an automation's runs) has no sheet.
- **Escalated** is only for an issue past `limits.maxAttempts` (or a job past
  `limits.jobMinutes`), a reproduction that failed or was stopped, and a
  blocked device: the escalation question, with what was seen.
- **Issues from tickets.** When a job passes and its issues came from a board, a
  CSV or a sheet: the write-back approval, then the status the person chose and a comment
  with four short parts: the cause, what changed, how it was proven, any
  limits, and a last line `Tested on: <the build QA tested> · Fixed in:
  <draft version>` ([ticket sources](../../skills/native-loops/loop-orchestrator/references/ticket-sources.md)).
  A ticket tested on a build older than the fix is `stale-build`, not
  fixed again. A CSV is copied before it is filled. Pasted text gets a table to paste
  back. A ticket not fixed keeps its status.

## Stop fact

Every issue is `verified` on a device, `accepted` by the person, or
`escalated` (attempts past the limit, a reproduction that failed, a blocked
device, platform, person); every automation change whose test run
passed was deployed, or kept as a draft when the person said no off UAT,
every AI agent change published on the person's yes or
kept as a draft, every object
change made on its object approval; every job released the page lock it held
on each page and its automation, AI agent or object lock; every request of the
run left the queue.

## Outputs

The board, every job's fix reports and retest files, for a reported issue
`repro/<issue id>/` (the steps file, the argent flow, the shots and calls),
the BEFORE | AFTER sheets (`shots/sheets/before-after-<issue id>.png`, one per
fix verified on a screen: the page and state on top, the screen before on the
left and after on the right, each with its draft version), opened for the
person when the run ends,
the handoff notes of platform issues, the draft
version of each page, the deployed version of each automation, and the
closing summary: jobs passed, accepted, escalated; issues by result and by
cause; attempts; `Before/after:` the path of every sheet, and each fixed
issue with no sheet and why; automations deployed, with their versions and callers;
AI agents published or kept as drafts; objects changed; the
person's list (person issues and escalations); what is left.

## Approvals

The run settings (the rules), the plan approval on the Find issues way (with
the release question when a job fixes an AI agent: may it publish once its
test messages pass; a reproduced issue whose cause was found starts its job at
once, with no plan approval), the repro question, the agent publish approval (per publish, only when the
release yes was no), an automation deploy's yes only on a tenant that did
not say it is UAT at sign-in,
the object approval (per object change), manual steps, the escalation (per job), the write-back
approval.

## Where the loop ends

Everything passed stays a draft, except an automation deployed once its test
run passed, an AI agent published on the person's yes and an object changed on
its object approval. The loop never publishes the app and never asks to: the
Preview app on the simulators runs the drafts, so every fix was proven on the
draft. A client build (the app's own store or test build) runs the published
app; the person publishes when it should get the fixes. The closing summary
says what is a draft and what a client build will see only after a publish.
Moving the app to another environment is a changeset, mostly done by hand;
`ua:changeset-manager` helps when the person asks.
