# Approvals

## Contents

- Rules for every approval
- The approvals
- Releases never take a default
- The app is never published by a loop
- A reproduced issue starts at once
- Automation deploys ask nothing
- The release yes of a fix run
- What a yes covers

Every question a run may ask, its words and its options. Each is one
`AskUserQuestion`, asked in chat, the recommended option first and labelled
`(Recommended)`. An approval that releases something (an agent publish, an
object change, a commit) or deletes something needs the person's own yes, every
time (a fix run's agent publishes: once, at its plan approval, § The release
yes of a fix run); a yes in a brief, a prompt, a ticket or an earlier run is
not one. An automation deploy is not an approval (§ Automation deploys ask
nothing). Prose names an
approval in words ("the object approval"); the short id is what the run log
and `registry.json` carry.

## Rules for every approval

First follow [run execution](execution.md#settle-decisions-once). A required
approval still applies, but do not repeat one whose recorded answer covers
the exact action and still holds. An approval for one release does not
authorize a later release. Routine checks and reversible choices within the
approved work do not get extra confirmation prompts.

- One approval, one question. An approval never bundles two releases: one
  publish, one commit per question.
- "Change something" needs words: the next question asks for them before
  anything moves.
- Right after the answer, log it: `loops log append` with type `approval`,
  the approval id, the options, the answer, whether it was the recommended
  one, and the seconds it took ([run log](run-log.md)).
- The rules a run settles at the start (the run settings) hold for the whole
  run. An effect outside them is asked, never assumed.
- A delete never needs a loops approval: it is UnifyApps Headless's own dialog
  (`CONFIRM_REQUIRED (d_…)`), asked as `ua:ua-change` § Answers and
  blocks says. A cleanup asks once: one question lists every delete's summary
  and id.

## Pre-approved in the profile

A solution may answer the `settings` and `plan` approvals once, in advance:
`profile.json` `loop.preApproved` lists their ids (`profile.mjs set --dir <folder> 'loop.preApproved=["settings","plan"]'`).
A listed approval is not asked. The run uses the profile's and memory's
defaults for `settings`, or the plan as split for `plan`, says so in one line,
and logs the approval with the answer `preapproved`. An effect outside the run
settings is still asked. The release approvals (`publish`,
`write-back`, deletes) are never listed there, and the script refuses them.

## Read-only tools a solution may allow

Claude Code asks before each tool call a settings file does not allow. A tool
that only reads changes nothing on a tenant, a device or a page. A solution may
list such tools in its own `.claude/settings.json` (`permissions.allow`, one
entry per tool name, as the host shows it) so a run stops asking about them.
The person adds the lines; a loop never edits a settings file.

The rule for what to list:

- Allow a tool whose name says get, list, read, search, view, describe or
  screenshot.
- Never allow a tool whose name says tap, click, navigate, script-eval, type,
  publish, apply, save, update, create, deploy, trigger or delete. Release
  steps (a save, a deploy, a publish, a delete) are never allowed this way.
- A tool whose effect is unclear stays out of the list until its description
  says it only reads.

These are separate from `loop.preApproved`: that list answers the loop's own
questions; this list answers the host's tool prompts.

## The approvals

| id | Name | When | Words | Options (first = recommended) |
| --- | --- | --- | --- | --- |
| `settings` | run settings | Once, before the first costly read of a loop that writes or reaches a device | Only unresolved questions, at most four, with answers carried from the request and run and defaults from `profile.json`, UnifyApps Headless memory and the reads: the scope and focus (for a reported issue in its place: may the steps write, as the test user, what they save, in the reproduction and every replay; for a feature built from a description: the recipe's questions, and may the checks save as the test user, with the test recipient of a message they send), the design source; for the scope loop: the team and project the tickets are for, who they are assigned to, and a new app's name. | per loop |
| `prd` | PRD approval | `/ua:native-scope-loop`, when the PRD passes its check and its reviewer, or the person accepted its gaps as open questions | The outcome in a line, the roles, the journeys, requirements by priority, the screens, the open questions with their owners, and the path `docs/prd/<app>.md` | Approve the PRD · Change something · Keep it as a draft |
| `prd-update` | PRD update approval | `/ua:native-build-loop`'s finish, when `prd classify` calls the PRD the run would leave a major change ([PRD use](prd-use.md) § Keeping it current after a build) | "Update the <app> PRD to v<n>? <one line per change `classify` named, a new requirement in full>." | Update the PRD · Not now (the summary says where the app and its PRD differ) |
| `install` | install approval | `native-setup` after `loops doctor`; on WEB, the browser install a loop's health check found missing (`loops setup --platform web`) | One multi-select of the installs it found missing, each labelled with its exact command | the required installs ticked; optional ones not |
| `plan` | plan approval | `/ua:native-fix-loop` on the Find issues way, after the issues are split into jobs, before the first dispatch (a reproduced issue whose cause was found starts its job at once, § A reproduced issue starts at once); `/ua:native-build-loop` after the plan preview passes; `/ua:native-scope-loop` after its tickets pass `loops scope tickets-check` (the yes approves the PRD version, creates a new app's empty shell and files the tickets) | fix: "<n> jobs, <a> at once: <job · pages · issues by severity · what it will not touch>, one line each. Shared-module jobs: <module or card · dependents>. Automation jobs: <automation · callers · deployed when its test run passes>. AI agent jobs: <agent · apps that chat with it>." With at least one AI agent job it adds: "Publish the AI agent fixes once their test messages pass? Everyone who chats with them gets the change at once." (§ The release yes of a fix run) scope: "File <n> tickets in <project> and create the empty app <name>?" (a re-run: new, updated, commented and unchanged tickets), one line per ticket in build order with its requirements, screens and the tickets it waits for, then the Later list. build: "Start building this?" with the spec's assumptions, the preview path, one line per task, one line per acceptance line and its check (a feature from a description), the releases the preview names | fix: Start as shown · Change something; with an AI agent job: Start, publish once tests pass · Start, ask before each publish · Change something. build: Start as shown · Change something · Keep for later. scope: File them (and create the app) · Change something · Keep for later |
| `visual-check` | visual check approval | A visual check on one page with gaps, when the person asked to see each pass | "Pass n of max on <page>: k gaps (b over 2pt, s within tolerance, x blocked). Report: <path>." | Apply the fixes and run pass n+1 · Apply, then stop · Accept the page as is · Change the tolerance or ignore gaps |
| `advisory` | advisory review | The quality audit or an audit check left advisory findings the person may want fixed | one multi-select per rule × page | none is a valid choice |
| `manual` | manual step | A step only the builder UI can do (create a navigator module, drag a block into a template slot) | the exact steps, then "Done?" | Done · Skip it |
| `escalation` | escalation | An issue past `limits.maxAttempts`, a job past `limits.jobMinutes`, two failed tries, a reproduction that fails, a blocked device | what is open and the evidence paths | Accept as is · Stop here (the run stays resumable) · One more attempt |
| `repro` | repro question | The reproduce stage could not reproduce a reported issue, or found no page or control in the cache that its words name | "I could not reproduce it: <what the device showed, with the version>." (no match: "I could not find <words> in <app>: which page, and what did you tap?") | Try different steps · Run the flow five times · Stop |
| `fix` | fix approval | `native-audit` or `native-triage` ended with open issues (issues an automation owns become automation jobs, each deployed once its test run passes) | "<n> issues open (<c> critical, <m> major). Fix them now?" | Fix the critical and major issues · Fix all · Not now |
| `review` | case review | `/ua:app-discover-test-loop`, after each draft of the test cases | the cases as a short table (id · page · what should happen · priority), then "Approve these cases, or tell me what to change" | Approve · Change something (no round limit; ends on the person's yes) |
| `write-back` | write-back approval | A fixed issue came from a ticket board, a CSV or a sheet | "Write the result back to <source> for <n> tickets: status <status>, a comment with the cause, the change, the proof, and `Tested on: <QA build>. Fixed in: <draft version>`?" The comment's last line is the build the ticket was tested on and the version that fixes it ([ticket sources](ticket-sources.md) § The build QA tested). | Write back · Not now |
| `agent-publish` | agent publish approval | Before each publish of an AI agent a fix loop's AI agent job changed and tested (not asked when the release yes covers it), or one a build plan from a description named | Says why it is asked: "Publish <agent>? Everyone who chats with it gets the change at once: <apps and pages from `ua impact ai-agent <id> --change logic`>. Change: <one line>. Tests: before <message> failed, after it passed, <n> messages." | Keep as a draft · Publish |
| `object` | object approval | Before an object job changes an object's fields | "Change <object>? <one line: add field, add picklist value, …>. Used by: <pages and automations from `ua impact object <id>`>. Stored rows: <none change \| n rows change, and how>." A field removed or renamed also waits on its own delete dialog. | Not now · Change it |

The WEB loops (`/ua:app-fix-loop`, `/ua:app-build-loop`) ask the same approvals as their native twins.

## Releases never take a default

The agent publish, object and write-back approvals and every delete are
asked every time, with no default and no "for the rest of the run". The one
exception is § The release yes of a fix run. The recommended option of the
agent publish and object approvals is the one that releases nothing. A run that cannot ask (the person is away) stops at the
approval and keeps its state; it never releases on its own.

## The app is never published by a loop

The Preview app on the simulators loads the app's drafts, so every check a
loop runs on a device sees its draft saves with no publish. A client build (an
app's own store or test build) runs the published app. So the fix and build
loops never publish the app and never ask to: everything they change stays a
draft, and the person publishes when a client build should get it. A check a
publish would settle (a new data source that answers `forbidden datasource`,
`native-lint` trap T19) is reported as not proven on the device, with that
reason, never turned into a publish question. On WEB the builder preview route
shows the drafts the same way, and the app's published address runs the
published app.

## A reproduced issue starts at once

On the fix loop's Reproduce way, an issue that was reproduced and whose cause
was found needs nothing more from the person, so its job starts right away,
with no plan approval: one line in chat says what is fixed and where. The
approvals a job needs on its own still come when it reaches them: the object
approval and the agent publish approval (or its release yes). The Find issues way, with many jobs, keeps the plan approval.

## Automation deploys ask nothing

An automation deploy asks nothing when the tenant says it is UAT at sign-in
(the environment UnifyApps Headless's browser reads when it first opens a
page; `open-page` exits 7 when the tenant will not say); on any other or
unknown environment the deploy waits for the person's yes.
UnifyApps Headless does not refuse a production tenant itself: whether one
takes a call is the server's call, and the loops send what they are asked. Pages
call the deployed version, so the device check needs it, and the test runs
before and after are its proof.

- **Fix:** an automation job deploys right after its test run after passes,
  reads the deployed version back (`search_workflows`), logs a `deploy` event
  and queues the device check. A change to its inputs or outputs deploys only
  once every caller job it named has saved its change, so no caller breaks in
  between.
- **Build:** a new or changed automation the plan named deploys when its task
  is done and its test runs pass.
- **Shown, not asked:** the plan approval names each automation job and its
  callers; the board says `deploying`; the closing summary lists every
  deploy with its version and callers from impact.
- **Still asked:** an AI agent's publish, an object change,
  a write-back and every delete.

## The release yes of a fix run

So a fix run goes straight from a passing test message to the check on a
device, its plan approval asks once whether it may publish the AI agent fixes
its jobs make, when their tests pass. Pages chat with the published agent, so
the device check needs the publish; the test messages need none.

- **Asked** only when the split has at least one AI agent job, as part of the
  plan approval (on the Reproduce way, which has no plan approval, the agent
  publish approval comes when the job reaches its publish), which already names those jobs and the apps that chat with
  them. A run with no AI agent job never sees it. No default from an earlier
  run, memory or a profile. A resumed run keeps its answer.
- **A job found later** (a retest or a page job finds the cause in an AI
  agent): asked once, the first time the run has such a job and has not
  asked yet.
- **A yes covers** each publish of an AI agent an AI agent job of this run
  changed, with its test message before failing and after passing. The job's
  agent publishes right after its test passes, reads the published version
  back, logs it, and queues the device check.
- **A yes never covers** an object change (the object approval), the app
  publish, a write-back, a delete, or anything after the run
  ends. Those ask as the table says.
- **Start, ask before each publish**: the agent publish approval, every time.
- The closing summary lists every publish the yes covered: the agent, the
  version, and the apps that chat with it.

## What a yes covers

| Yes to | Covers | Does not cover |
| --- | --- | --- |
| plan approval, fix | draft saves through builders on the jobs' own pages, modules, cards, automations and AI agents, their test runs and test messages, and each automation job's deploy once its test passes (§ Automation deploys ask nothing), for every attempt of those jobs | the app publish, an agent publish, an object change (its own approval), another page, an automation or AI agent no job names |
| plan approval, build | the plan's tasks, the deploys of the automations it named, and the other releases its preview named | anything added later by `plan revise --impact major` (asked again) |
| the release yes of a fix run | every agent publish § The release yes of a fix run names, in that run | an object change, the app publish, a write-back, a delete, a later run |
| agent publish approval | that one publish of that one AI agent version | a later change to the same agent (a next attempt asks again) |
| object approval | the one change it names on that object | another field, a removal it did not name, the delete dialog of a field removed |
