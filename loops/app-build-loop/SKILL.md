---
name: app-build-loop
description: Builds a new page, a feature or a set of pages of a UnifyApps WEB app, as drafts, checked in a browser, in two ways. From a design (Figma frames, a prototype, screenshots) - design intake, a UnifyApps Headless plan of parallel app-agent builders, then per page a visual check at each width the design has (1440; 375 only with a frame there) and interaction, a11y and responsive checks at both widths, until each page matches or is accepted. From a description - plans every object, automation, page and AI agent the feature needs (recipes for usage tracking, dashboards, near-realtime refresh, notifications, an analytics tag), builds them in one UnifyApps Headless plan, and proves each acceptance line with acceptance checks and realtime checks (two browsers, the change shown in time). Never publishes the app. Use when the person types /ua:app-build-loop, or asks to build a page of a WEB app from a Figma, add a feature, "add analytics", "make it realtime" or "notify the manager when".
argument-hint: "<page name | feature in words> [design: figma link | prototype folder | screenshots] [app]"
allowed-tools: Bash(node:*), Bash(bash:*), Read, Write, Edit, Agent, Skill, AskUserQuestion
---

# App build loop

`/ua:app-build-loop <page name | feature in words> [design: figma link | prototype folder | screenshots] [app]`

Builds a new page, a new feature on existing pages, or a set of new pages of a
WEB app, as drafts, and proves them in a browser on the page's saved draft:
from an approved design, checked against it at each width it was drawn at, or
from the person's description, checked by acceptance and realtime checks.

## Two ways in

| The person | Way in | What runs first |
| --- | --- | --- |
| gives a design: "build the Orders page from this Figma", "make this page match the prototype" | **From a design** | [design intake](../../skills/native-loops/loop-orchestrator/references/stages/design-intake.md): one design spec per frame, at the frame's own width; then the [build stage](../../skills/native-loops/loop-orchestrator/references/stages/build.md): pages proven by visual checks |
| describes a feature in words, with no design: "add analytics to the app", "update the approvals list in real time", "notify the manager when a request is submitted", "add the vendor's tracking tag" | **From a description** | the [feature stage](../../skills/native-loops/loop-orchestrator/references/stages/feature.md): a recipe from `ua:loop-feature-recipes` when one fits, one UnifyApps Headless plan for every object, automation, page and AI agent the feature needs, each acceptance line proven by an `acceptance` or `realtime` check |

A feature with a design for some of its pages takes both: design intake for
those pages, the feature stage for the rest, in one plan.

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
- **Two widths.** Design intake reads each frame at its own width
  ([web-design-spec](../../skills/web-loops/web-design-spec/SKILL.md)): the
  design width (1440) is the match target, and the second width (375) is
  compared with a design only when the design has a frame at 375; otherwise
  the responsive check covers it. The run settings ask the widths only when
  the design has frames at more than one width.
- **The checks.** After the build, each page is queued with `--platform web`
  for one `interaction` check (hover look, focus ring, pointer cursor,
  keyboard reach and order, pressed look), one `a11y` and one `responsive`
  check, each at both widths. A page built from a design also gets one visual
  check per page and state, measured at every width with a design spec; a
  page with no spec gets no visual check. The feature way in also queues
  `acceptance` and `realtime`, the realtime check in two browser folders.
- **No loading check.** Every page that reads a source still gets its
  loading-states task, a skeleton its own size beside each data region, and
  its read-back is the proof: `get_blocks` shows a `CONTENT` Loader gate
  beside every data region.
- **Builders** load `app-design`, `app-craft` and `app-verify`.
- **The lint** is `task-lint.mjs <tasks.json> --platform WEB`; the fix brief of
  a visual check's gaps is `fix-brief.mjs --platform web`: a browser pass in
  CSS px at that width, the design's values 1:1.
- **The app shell.** A finding outside the page root (the menu, a header or
  footer several pages share) is an `app shell` finding and gets its own job.
  A new page's menu entry is a menu item (`apply_navigation_edits`), never
  buttons or links on a page.
- **Two people.** Both browsers of a check sign in as the person, so a
  `realtime` check between two users fails with that reason, and the person
  checks it by hand.

## Code apps

`loops platform` also answers the app's kind. A **no-code** app's pages are
block config the app-agent builders write. A **code app** is a Code Builder
app: a React app whose source lives in git. On a code app:

- Every page or feature job goes to the code app agent (`ua:code-app-agent`),
  briefed with the plan task, the branch and the acceptance lines; objects,
  automations and AI agents go to their builders as always.
- There is no block config to prove: no page quality audit, no drift
  snapshot, no block read-back, no lint trap. The agent's report carries the
  source it changed, a clean `tsc -b` and the engine's green push, and that
  report is the read-back.
- The browser checks run unchanged, on the engine's preview route
  (`https://<host>/agent-api/preview/b/<appId>/main`, the preview address
  the push answers): visual (with a spec), interaction, a11y, responsive,
  acceptance and realtime.
- The impact analysis reads no routes from a checkout: every page of the app
  is in scope.
- A third-party tag goes into the app's own source.
- Publish only on a yes, through `publish_code_app`.

## Run it

1. Load `ua:loop-orchestrator` and follow it for this loop (goal
   `build`): the platform, health, resume, the run folder, the impact analysis,
   the device queue, the board and the run log come from there.
   On a MOBILE app (`loops platform` answers it), say
   "This is a MOBILE app. Use /ua:native-build-loop." and stop.
2. Pick the way in (above), then its stage chain below, in order.
3. Finish as the orchestrator's § Finish says, with the outputs below. Then
   keep the app's PRD current with what the run built: a minor change is
   saved and approved without a question, a major one waits for the PRD
   update approval
   ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md) § Keeping it current after a build).

## When

"Build the Orders page from this Figma", "create page X", "add an export
button to the orders table", "make this page pixel perfect with the
prototype", any new page or a change that adds or reshapes a region. With no
design: "add analytics", "track usage", "add the vendor's tracking tag",
"show a dashboard of …", "make it realtime", "update the list live",
"notify the manager when …", "email me when …".

## Inputs

- What to build, in the person's words.
- The design: Figma frame links (one per width it was drawn at), a prototype
  folder, screenshots or PDFs (each at the width it was shot at), or rows
  already approved in the design store. None for a feature from a
  description.
- From a description: the run settings answers (the recipe's questions,
  whether the checks may save on `ZZ_LOOP_` test records, a test recipient
  for a message).
- The app (from `profile.json` when the solution has one app the loops run on).
- The app's PRD, when it has one: the feature is planned against it, and its
  acceptance lines are the PRD's `A<n>.<m>` lines where the PRD has them
  ([PRD use](../../skills/native-loops/loop-orchestrator/references/prd-use.md)).

## Mode and limit

`look` until the plan approval, then `draft` through the plan's builders. A
deploy of a new or changed automation the plan's preview named goes out once
its test runs pass, with no question on a tenant that said it is UAT at
sign-in (a yes on any other or unknown environment); an
AI agent's publish only as the preview named it and the person said yes (a
new automation on its own is ordinary UnifyApps Headless chat work, not this
loop); never an app publish and never a publish question (the builder preview
route runs the drafts); never platform code. The checks of a feature save
only on test records, and only when the run settings allowed it.

## Scope rules

The pages the plan creates or touches, plus every page `loops impact` names as
showing a module or card the plan changes (retested, not edited). A change to
the menu, the bar or a shared header or footer reaches every page that
`loops impact --nav`, `--nav-item <id>` or `--template <id>` lists. From a
description, also the objects, automations and AI agents the plan creates or
changes, and every caller `ua impact` names for them. A page locked by
another session stops the run and names the owner.

## Stage chain

From a design:

```
design intake (a design spec per width) ─► run settings ─► plan (app-page-planner, loading states, spec, tasks, task-lint) ─► plan approval
  ─► build stage: ua-change runs the plan; app-agent builders in parallel (≤ maxAgents)
  ─► device queue: one visual check per page and state, measured at every width with a spec; interaction, a11y and responsive per page at both widths ─► test-and-fix test runners
  ─► gaps → one fix task per pass (plan revise) ─► pass n+1 … up to maxPasses
  ─► data: read-back, data-layer-check, the calls seen in the browser ─► quality (config review)
  ─► shots of every page built (a capture per page at 1440, the design beside it)
  ─► plan finish ─► the sheets and the summary (everything a draft; no publish)
```

From a description:

```
scope (state resolve, cache, impact) ─► recipe (loop-feature-recipes) ─► run settings
  ─► plan (object-schema-designer, app-page-planner, loading states, spec with acceptance lines, tasks, task-lint) ─► plan approval
  ─► ua-change runs the plan: fde-agent, automation-agent, app-agent, agent-builder in parallel (≤ maxAgents)
  ─► new regions: page review, the config review, and interaction, a11y and responsive checks at both widths (no visual check without a spec)
  ─► releases the preview named (a deploy once its tests pass; an AI agent publish on its yes) ─► one steps file per acceptance line
  ─► device queue: acceptance and realtime checks in browsers ─► test-and-fix test runners
  ─► a failed line → one fix task per entity at fault (plan revise) ─► attempt n+1 … up to maxAttempts
  ─► shots of every page created or changed (a capture per page)
  ─► plan finish ─► the sheets and the summary (everything a draft; no publish)
```

[Design intake](../../skills/native-loops/loop-orchestrator/references/stages/design-intake.md), then
the [build stage](../../skills/native-loops/loop-orchestrator/references/stages/build.md), then
[test-and-fix](../../skills/native-loops/loop-orchestrator/references/stages/test-and-fix.md); or the
[feature stage](../../skills/native-loops/loop-orchestrator/references/stages/feature.md), then
test-and-fix § Kind `acceptance` and § Kind `realtime`. Each stage's
§ On a WEB app says how it runs in a browser.

A third-party analytics tag is a plan task of its own: the vendor's snippet
in the app's header code through `update_app_settings`, as the analytics tag
recipe says.

Loading states: every page the plan builds or reshapes that reads a source
gets a skeleton its own size beside each data region, whether or not the
design has a loading frame, through its own loading-states task, proven by its
read-back (§ What differs on WEB).

Quality: app-verify's
[config review](../../skills/app-verify/references/config-review.md),
without its Mobile only part, on every built page (the `ua:app-agent`
builder that wrote the page runs it as its self-check, and the plan's
`page-review` task, `ua:page-reviewer`, judges the page a second time),
plus the interaction, a11y and responsive issues; one quality fix task per
page with blocking findings, two attempts at most, advisories through the
advisory review.

Shots: once the last write is done, a `capture` request per page the plan
built or changed shoots the final draft in a browser at the design width,
top to bottom, and the run ends with one sheet per page (the design first
when it was built from one) and an overview of every page
([build](../../skills/native-loops/loop-orchestrator/references/stages/build.md) § After the build,
[formats](../../skills/native-loops/loop-orchestrator/references/formats.md) § Shots).

## Stop fact

Every page the plan built from a design has a visual check pass that matched
at every width with a design spec, or the person's `accept` at the
escalation; every acceptance line of a feature from a description passed its
`acceptance` or `realtime` check, was accepted at the escalation, or is a
`not proven on a device` line with its read-back proof; every new source is
proven by read-back and in the browser on its draft; the interaction, a11y
and responsive checks passed or their issues were accepted; every page built
that reads a source has its loading states read back; every page built has
its sheet, or a line saying why not; every browser is closed; the plan is
finished.

## Outputs

The plan's entity table, the pass-by-pass gap tables (per width) and reports,
the check results (`accept/<feature>/<n>/run-<k>/result.md`), the data
evidence, the quality table, and the closing summary:
`build · <what> · plan <id> · done | stopped: n open`, `Exists now:`,
`Evidence:` (counts by kind from `evidence.md`), `Passes:` n of max per page
and width, `Checks:` acceptance lines passed of all, with attempts (a
feature), `Loading:` pages whose loading states read back, of all pages that
read a source, `Built:` the path of every sheet
(`shots/sheets/built-<pageId>.png`, and `built-overview.png` for two or more
pages), opened for the person, `Published:` no (the loop never publishes),
`PRD:` unchanged, `v<n>, minor: <what changed>`, `v<n>, approved by you: <what changed>`,
`not updated: <where the app and its PRD differ>`, or `none for this app`, `Open:`,
`Memory:` lines saved.

## Approvals

The run settings, the plan approval, the visual check approval (only when the
person asked to see each pass), the advisory review, manual steps (a new
connection is one; so is moving the menu bar to the top or into a drawer),
the escalation, the agent publish approval for each AI agent publish the plan
names, and the PRD update approval for a major change to the app's PRD. A
deploy the plan names asks nothing on a tenant that said it is UAT at sign-in
(a yes elsewhere); a minor PRD update asks nothing.

## Where the loop ends

The built pages stay drafts. The loop never publishes the app and never asks
to: the builder preview route runs the drafts, so every page was proven on
its draft. The app's published address runs the published app; the person
publishes when it should get the new pages, through UnifyApps Headless's own
release step (`ua:ua-change` § Releases). Moving the app to another
environment is a changeset, mostly done by hand; `ua:changeset-manager` helps
when the person asks.
