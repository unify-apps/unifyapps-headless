---
name: native-build-loop
description: Builds a new page, a feature or a set of pages of a UnifyApps MOBILE app, as drafts, in two ways. From a design (Figma frames, a prototype, screenshots) - design intake, a UnifyApps Headless plan of parallel app-agent builders, then visual and touch feedback checks per page on a simulator until each page matches or is accepted. From a description - plans every object, automation, page and AI agent the feature needs (recipes for usage tracking, analytics dashboards, near-realtime refresh, notifications), builds them in one UnifyApps Headless plan, and proves each acceptance line with acceptance checks (the steps, then the record or automation run, read-only) and realtime checks (two devices, the change shown in time). Never publishes the app; deploys an automation without a question only on a UAT tenant. Use when the person types /ua:native-build-loop, or asks to build a screen from a Figma, add a feature, "add analytics", "make it realtime" or "notify the manager when".
argument-hint: "<page name | feature in words> [design: figma link | prototype folder | screenshots] [app]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# Native build loop

`/ua:native-build-loop <page name | feature in words> [design: figma link | prototype folder | screenshots] [app]`

Builds a new page, a new feature on existing pages, or a set of new pages of a
MOBILE app, as drafts: from an approved design, proven on a device
against the design, or from the person's description, proven on a device by
acceptance and realtime checks.

## Two ways in

| The person | Way in | What runs first |
| --- | --- | --- |
| gives a design: "build the Leave screen from this Figma", "make this page match the prototype" | **From a design** | [design intake](../../skills/native-loops/loop-orchestrator/references/stages/design-intake.md), then the [build stage](../../skills/native-loops/loop-orchestrator/references/stages/build.md): pages proven by visual checks |
| describes a feature in words, with no design: "add analytics to the app", "update the approvals list in real time", "notify the manager when a request is submitted" | **From a description** | the [feature stage](../../skills/native-loops/loop-orchestrator/references/stages/feature.md): a recipe from `ua:loop-feature-recipes` when one fits, one UnifyApps Headless plan for every object, automation, page and AI agent the feature needs, each acceptance line proven by an `acceptance` or `realtime` check |

A feature with a design for some of its pages takes both: design intake for
those pages, the feature stage for the rest, in one plan.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this loop (goal
   `build`): the platform, health, resume, the run folder, the impact analysis,
   the device queue, the board and the run log come from there.
   On a WEB app (`loops platform` answers it), say
   "This is a WEB app. Use /ua:app-build-loop." and stop.
2. Pick the way in (above), then its stage chain below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below. Then
   keep the app's PRD current with what the run built: a minor change is
   saved and approved without a question, a major one waits for the PRD
   update approval
   ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md) § Keeping it current after a build).

## When

"Build the Leave screen from this Figma", "create page X", "add a renew
button to the property card", "make this page pixel perfect with the
prototype", any new page or a change that adds or reshapes a region. With no
design: "add analytics", "track usage", "show a dashboard of …", "make it
realtime", "update the list live", "notify the manager when …", "email me
when …".

## Inputs

- What to build, in the person's words.
- The design: Figma frame links, a prototype folder, screenshots or PDFs, or
  rows already approved in the design store. None for a feature from a
  description.
- From a description: the run settings answers (the recipe's questions,
  whether the checks may save as the test user, a test recipient for a
  message, a second test user for a check between two people).
- The app (from `profile.json` when the solution has one app the loops run on).
- The app's PRD, when it has one: the feature is planned against it, and its
  acceptance lines are the PRD's `A<n>.<m>` lines where the PRD has them
  ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md)).

## Mode and limit

`look` until the plan approval, then `draft` through the plan's builders. A deploy of
a new or changed automation the plan's preview named goes out once its test
runs pass, with no question on a tenant that said it is UAT at sign-in (a yes
on any other or unknown environment); an AI agent's
publish only as the preview named it and the person said yes (a new automation on its own is
ordinary UnifyApps Headless chat work, not this loop); never an app publish and never a
publish question (the Preview app runs the drafts); never platform code. The checks of a
feature save only as the test user, when the run settings allowed it.

## Scope rules

The pages the plan creates or touches, plus every page `loops impact` names as
showing a module or card the plan changes (retested, not edited). From a
description, also the objects, automations and AI agents the plan creates or
changes, and every caller `ua impact` names for them. A page locked by
another session stops the run and names the owner.

## Stage chain

From a design:

```
design intake ─► run settings ─► plan (app-page-planner, loading states, spec, tasks, task-lint) ─► plan approval
  ─► build stage: ua-change runs the plan; app-agent builders in parallel (≤ maxAgents)
  ─► device queue: visual-check, touch-feedback and loading per page ─► test-and-fix test runners
  ─► gaps → one fix task per pass (plan revise) ─► pass n+1 … up to maxPasses
  ─► data: read-back, data-layer-check ─► quality (page-audit)
  ─► shots of every page built (a capture per page, the design beside it)
  ─► plan finish ─► the sheets and the summary (everything a draft; no publish)
```

From a description:

```
scope (state resolve, cache, impact) ─► recipe (loop-feature-recipes) ─► run settings
  ─► plan (object-schema-designer, app-page-planner, loading states, spec with acceptance lines, tasks, task-lint) ─► plan approval
  ─► ua-change runs the plan: fde-agent, automation-agent, app-agent, agent-builder in parallel (≤ maxAgents)
  ─► new regions: page review, the page quality pass and a loading check (no visual check)
  ─► releases the preview named, each on its yes ─► one steps file per acceptance line
  ─► device queue: acceptance and realtime checks ─► test-and-fix test runners
  ─► a failed line → one fix task per entity at fault (plan revise) ─► attempt n+1 … up to maxAttempts
  ─► shots of every page created or changed (a capture per page)
  ─► plan finish ─► the sheets and the summary (everything a draft; no publish)
```

[Design intake](../../skills/native-loops/loop-orchestrator/references/stages/design-intake.md), then
the [build stage](../../skills/native-loops/loop-orchestrator/references/stages/build.md), then
[test-and-fix](../../skills/native-loops/loop-orchestrator/references/stages/test-and-fix.md); or the
[feature stage](../../skills/native-loops/loop-orchestrator/references/stages/feature.md), then
test-and-fix § Kind `acceptance` and § Kind `realtime`.
Loading states: every page the plan builds or reshapes that reads a source
gets a skeleton its own size beside each data region, whether or not the
design has a loading frame, through its own loading-states task
(`ua:native-loading-states`), and a `loading` check on the device that
records the page opening and finds bands left blank and content that moves
when the data arrives. A failed check comes back as one loading fix task per
page, like a visual check's gaps.

Quality: the plan's own page quality pass (`ua:app-page-quality`) when it
runs; else `page-audit.mjs` on every built page and one quality fix task per
page with blocking findings, two attempts at most, advisories through
the advisory review.

Shots: once the last write is done, a `capture` request per page the plan
built or changed shoots the final draft on a simulator, top to bottom, and
the run ends with one sheet per page (the design first when it was built
from one) and an overview of every page
([build](../../skills/native-loops/loop-orchestrator/references/stages/build.md) § After the build,
[formats](../../skills/native-loops/loop-orchestrator/references/formats.md) § Shots).

## Stop fact

Every page the plan built from a design has a visual check pass that matched,
or the person's `accept` at the escalation; every acceptance line of a feature from a description passed its
`acceptance` or `realtime` check, was accepted at the escalation, or is a
`not proven on a device` line with its read-back proof; every new source is
proven by read-back and on the device in the Preview app, on its draft;
the touch feedback check passed; every page built that reads a source passed
its loading check (no blank band, no shift), had its loading not seen on the
device, or was accepted at the escalation; every page built has its sheet, or a line
saying why not; the plan is finished.

## Outputs

The plan's entity table, the pass-by-pass gap tables and reports, the check
results (`accept/<feature>/<n>/run-<k>/result.md`), the data evidence, the
quality table, and the closing summary:
`build · <what> · plan <id> · done | stopped: n open`, `Exists now:`,
`Evidence:` (counts by kind from `evidence.md`), `Passes:` n of max per page,
`Checks:` acceptance lines passed of all, with attempts (a feature),
`Loading:` pages with no blank band or shift, of all pages that read a source, with passes,
`Built:` the path of every sheet (`shots/sheets/built-<pageId>.png`, and
`built-overview.png` for two or more pages), opened for the person,
`Published:` no (the loop never publishes),
`PRD:` unchanged, `v<n>, minor: <what changed>`, `v<n>, approved by you: <what changed>`,
`not updated: <where the app and its PRD differ>`, or `none for this app`, `Open:`,
`Memory:` lines saved.

## Approvals

The run settings, the plan approval, the visual check approval (only when the
person asked to see each pass), the advisory review, manual
steps (a new connection is one), the escalation, the agent publish
approval for each AI agent publish the plan names, and the PRD update approval
for a major change to the app's PRD. A deploy the plan names asks nothing on
a tenant that said it is UAT at sign-in (a yes elsewhere); a minor PRD update
asks nothing.

## Where the loop ends

The built pages stay drafts. The loop never publishes the app and never asks
to: the Preview app on the simulators runs the drafts, so every page was proven
on its draft. A client build (the app's own store or test build) runs the
published app; the person publishes when it should get the new pages, through
UnifyApps Headless's own release step (`ua:ua-change` § Releases, with its page
quality hold). Moving the app to another environment is a changeset, mostly
done by hand; `ua:changeset-manager` helps when the person asks.
