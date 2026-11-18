---
name: native-loading-states
description: "Gives every data region of a MOBILE UnifyApps page a loading state its own size, so the page never shows a blank region or jumps when its data arrives. Plans one skeleton line per data region into the spec, whether or not the design has a loading frame; writes the page's loading-states task; and proves it on a simulator with the loading check, a recording of the page opening that finds bands left blank and content that moves. A hidden block of the UnifyApps Headless loops, read by the build and feature stages when a plan creates or reshapes a page that reads a data source, and by a test runner serving a loading request. Read when asked to 'add loading states', 'add skeleton loaders', 'stop the layout shift' or 'check the page while it loads'."
user-invocable: false
---

# Native loading states

A design shows a page with its data in place. It rarely has a frame for the
second or two before the data arrives, so a plan built from it names no
loading state, no builder adds one, and the person sees blank regions and a
jump when the content lands. This block closes that gap at the three places
a page is made: the plan, the task and the device.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A plan creates or reshapes a page that reads a data source (the build stage's Plan it, the feature stage's Plan it) | [Plan](references/plan.md) | every data region has a `loading ·` line in the spec's Contract; the page has its loading-states task; `task-lint` reports no T24 |
| A test runner serves a `loading` request | [Check](references/check.md) | `loading/<pageId>/pass-<n>/loading.json` and `composite.png` written; every finding confirmed or dismissed from the composite; a confirmed one is an issue |
| A loading check found a blank band or a shift | [Check](references/check.md) § The fix task | one `page-bind` fix task per page, linted, sent with `plan revise`; pass n+1 queued when it is done |

The config rules a skeleton must keep are the page quality rulebook's X1, X3
and X4 (`${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/references/rulebook.md`).
The builder reads the Loader sheet and `app-design`'s UX layer itself; this
block never copies a property path from them.

Script (Node 22, no packages; ffmpeg for a recording):
`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-loading-states/scripts/loading-check.mjs" --help`.
It answers `--json` and exits 1 on a blank band or a shift.

Next: the build stage queues a `loading` request per page beside its visual
check ([build](../loop-orchestrator/references/stages/build.md) § After the build).
