---
name: native-scope-loop
description: Stage one of a UnifyApps MOBILE app. Turns a rough idea, call notes, a draft PRD, Figma frames or screenshots, or an ask to extend an existing app into an approved PRD, a plan of the whole app and one ticket per buildable slice. Writes the PRD in rounds (a readiness check, a fresh reviewer, at most four questions a round) and saves every version on the solution, so the whole team reads the same PRD and an edit made outside UnifyApps Headless shows. Plans the data model, roles, navigation, the app's look and one job line per screen; slices it into a foundation ticket and one ticket per feature; after one yes, creates the empty app and files the tickets in build order. Never builds a page, object or automation - each ticket is started with /ua:native-build-loop in a new session. Use when the person types /ua:native-scope-loop, or asks to write or finish a PRD for a new app or a large extension, plan or scope an app, or break it into tickets; one feature of an existing app is /ua:feature-prd-loop.
argument-hint: "<idea in words | PRD doc or file> [design: figma link | screenshots] [app]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native scope loop

`/ua:native-scope-loop <idea in words | PRD doc or file> [design: figma link | screenshots] [app]`

Stage one of a MOBILE app: from what the person has to an approved PRD, a
plan of the whole app, and tickets that `/ua:native-build-loop` builds
one at a time. The PRD lives on the solution, versioned: every teammate reads
the same one (`prd get <app>`), and a version edited after its approval is
caught and restored.

## Ways in

| The person gives | Way in | Intake reads |
| --- | --- | --- |
| a few sentences, call notes, a transcript | **From an idea** | the words; round 1 starts from an empty PRD |
| a draft PRD: a Google Doc, a Claude doc, a Markdown file or a PDF | **From a draft** | the document, sorted into the PRD's sections; what it leaves open becomes round 1's questions |
| Figma frames or screenshots | **From a design** | each frame's name and size through `mcp__claude_ai_Figma__get_metadata`, never a capture; each frame or screenshot becomes a screen with its link |
| an existing MOBILE app and what to add | **To extend an app** | the app's pages, objects, automations and routes from the cache, into `## Current state`; the PRD covers the change |

Any mix works: a draft PRD with frames, an app to extend with call notes.
On an app that already has a PRD, the run writes the next version on top of
the current one, and the tickets stage compares its slices with the tickets
already filed.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this loop (goal
   `scope`): its planning path (no device), resume, the run folder, the board
   and the run log come from there. An existing app goes through
   `loops platform` first; on a WEB app, say
   "This is a WEB app. Use /ua:app-scope-loop." and stop.
   A new app is declared MOBILE.
2. The stage chain below, in order.
3. Finish as the [tickets stage](../../skills/native-loops/loop-orchestrator/references/stages/tickets.md) § Finish says.

## When

"Write a PRD for …", "here are my notes, turn them into a PRD", "finish this
PRD", "plan the app", "scope this app", "break the app into tickets", "we
need a mobile app that …", "scope adding approvals to the Leave app". Not for
one feature of an app that already exists, from a ticket or an ask: that is
`/ua:feature-prd-loop`, which writes that feature's PRD against the deployed
app. Not for one feature to build now: that is `/ua:native-build-loop`.

## Inputs

- The person's words, and any document, frames or screenshots.
- The app: a new app's name, or an existing MOBILE app of the solution.
- The run settings: the team and project the tickets are for, who the tickets are
  assigned to, and a new app's name. The tracker's test server only when the
  person names it.

## Mode and limit

`look`, with the PRD's draft saved on the solution from the first round.
After the plan approval: that PRD version approved, the empty MOBILE app
(a new app only) through one UnifyApps Headless plan, and the tickets.
Never a page, object, automation, AI agent or publish. Never a ticket
delete: a dropped slice gets a comment.

## Scope rules

One app per run. Its PRD is the solution's PRD for that app. An existing
app's pages, objects and automations are read, never changed. A draft of the
same PRD that someone else saved is continued only after the person says so.

## Stage chain

```
intake ─► run settings (≤ 4 questions)
  ─► prd stage, rounds (≤ 4): draft in the run folder ─► prd check ─► fresh reviewer
        ─► ≤ 4 questions ─► revise ─► prd save (a draft every teammate can read)
  ─► PRD approval
  ─► app-plan stage: data model (object-schema-designer), the app's look and a job line
        per screen (app-page-planner), roles, navigation, automations, AI agents ─► prd save
  ─► tickets stage: T0 foundation + one slice per user-facing feature ─► loops scope tickets-check
  ─► plan approval: the tickets, and the empty app for a new app
  ─► prd approve ─► the empty app (one-task plan, app-agent) ─► read back, solution refresh
  ─► tickets written in build order ─► prd tickets
  ─► the tickets in chat, in build order, with the command that starts each
```

The [prd stage](../../skills/native-loops/loop-orchestrator/references/stages/prd.md),
the [app-plan stage](../../skills/native-loops/loop-orchestrator/references/stages/app-plan.md)
and the [tickets stage](../../skills/native-loops/loop-orchestrator/references/stages/tickets.md).
The PRD's shape is the [PRD template](references/prd-template.md); the
reviewer works from the [PRD reviewer brief](references/prd-reviewer.md).

## Stop fact

The PRD version is approved, with every open question parked with an owner;
every must and should requirement is in exactly one filed ticket, read back
and named in the index; the tickets are recorded on that version; a new app exists and
`loops platform` says MOBILE. Or the run stopped at the escalation, with
what is open.

## Outputs

- The PRD version on the solution, also at `docs/prd/<app>.md`.
- The run folder: each round's draft and review, `tickets.json`, the
  rendered tickets and their keys.
- The closing summary: `scope · <app> · PRD v<n> · done | stopped: <why>`,
  `PRD:` requirements by priority, screens, open questions parked,
  `Plan:` objects, screens, automations, AI agents,
  `Tickets:` one line each in build order (`<key> · <title> · depends on <keys>` and its link),
  `Later:` the could requirements left out,
  `App:` the new app's id, or `existing`,
  `Next:` "Start each ticket in a new session, T0 first:" and one
  `/ua:native-build-loop <ticket link> <its goal>` line per ticket.

## Approvals

The run settings, the PRD approval, the plan approval and the escalation
([approvals](../../skills/native-loops/loop-orchestrator/references/approvals.md)).
Saving a draft asks nothing: it changes no approved version.

## Where the loop ends

At the filed tickets. The loop never builds: each ticket is one
`/ua:native-build-loop` run, started by the person in a new session, T0
first, and a ticket waits for the tickets it depends on. A later change to the
PRD is a new run of this loop: a new version, the tickets nobody started
updated, a comment on the rest. Between runs, each `/ua:native-build-loop`
run keeps the PRD current with what it built, so the next run starts from
the app as it is.
