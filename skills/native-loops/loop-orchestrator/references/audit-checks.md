# Audit checks

How the audit stage runs, for `native-audit` and for the
quick audit `/ua:native-fix-loop` and `/ua:app-fix-loop` run when they have
no open issues: the checks, the check agent and its brief, and the merge into a ranked board.

## Contents

- The checks (and the cause each writes)
- The check agent
- Merge and the board

## The checks

Six checks on every app, two more on a WEB app:

| Check | Reference | Device kind it queues (MOBILE) | Device check on WEB |
| --- | --- | --- | --- |
| ui (UI check) | [audit-ui](stages/audit-ui.md) | `visual-check` | one `visual-check` (web-visual-check) per page and state, measured at every width with a design spec; `a11y` and `responsive` too when those checks are not in focus |
| touch-feedback (touch feedback check; `interaction` on WEB) | [audit-touch-feedback](stages/audit-touch-feedback.md) | `touch-feedback` | `interaction`: web-browser's `interaction.mjs`, W1–W6 (hover, focus, pointer, keyboard reach and order, pressed look) |
| perf (performance check) | [audit-perf](stages/audit-perf.md) | `performance` | `performance`: web-profile (the open and the main interactions) |
| security (security check) | [audit-security](stages/audit-security.md) | none | none |
| data (data check) | [audit-data](stages/audit-data.md) | `performance` (when perf is not in focus) | `performance` (web-profile's data-source calls), when perf is not in focus |
| logic (logic check) | [audit-logic](stages/audit-logic.md) | `retest` (statements to prove) | `retest` in a test runner's browser |
| a11y (a11y check, WEB only) | [audit-a11y](stages/audit-a11y.md) | does not run | `a11y`: `a11y.mjs`, W7–W11 |
| responsive (responsive check, WEB only) | [audit-responsive](stages/audit-responsive.md) | does not run | `responsive`: `responsive.mjs`, W12–W15 |

**WEB:** every device check runs in a test runner's browser
([web-browser](../../../web-loops/web-browser/SKILL.md)) on the page's saved
draft on the builder preview route, at the design width (1440) and the second
width (375). The orchestrator has run `loops cache-export <appId> <pageId> --run <R>`
for every page in scope before it dispatches the check agents, and every
request is queued with `--platform web` and a note naming the widths, the
preview path, the group and the first issue number
(`--note "widths 1440,375; path /orders/<id>; group 2; start 51"`). Each
request to a test runner gets its own start range, so no two runners, and no
runner and the check agent, write one id: the check agent's own issues are
`<P><g>-01` up, and its k-th request starts at 50 × k + 1 (51, 101, 151, …).
`loops issues merge` refuses two different issues with one id
(`ISSUE_ID_COLLISION`). What differs per check:

- **ui**: the visual check compares each width that has a design spec with
  its own spec (`<screen>@<width>.json`, CSS px); 375 has none unless the
  design has a frame at 375, and the a11y and responsive checks cover it. The config half judges the
  page against app-verify's [config review](../../../app-verify/references/config-review.md)
  without its Mobile only part, because `page-audit.mjs` and `page-lint.mjs`
  audit MOBILE pages only.
- **interaction** (the touch feedback check on WEB): W1–W6 in place of the
  press-and-hold shots; X2 (a loading state and a notification on every chain
  that calls a source or writes) is judged by hand from `cache events`.
- **perf** and **data**: the rulebook rules that hold on WEB (the
  [performance check](stages/audit-perf.md) § On a WEB app names them) judged
  by hand from the cache, and the performance check through web-profile.
- **security** and **logic**: unchanged; logic's statements are proven in a
  browser instead of on a simulator.
- **a11y** and **responsive**: WEB only. On a MOBILE app a focus that names
  them says "a11y and responsive run on WEB apps only" and runs the rest.

**Cause.** Every issue a check writes says which layer it lives in
([formats](formats.md) § Cause), from the evidence the check read, so the
person sees why before what changes:

| Check | Its usual causes |
| --- | --- |
| ui, touch-feedback, interaction, a11y, responsive | `config` (a block's look or settings); `state` when a value shown is the wrong variable |
| perf | `config` (a list, an image, a layout), `data source` (a call repeated or too large), `automation` (a slow callable) |
| security | `automation` (identity trusted from the caller), `data source` (a user id sent from the page), `access` (a role) |
| data | `data source`, `automation`, `object` (a field type or picklist the app cannot save) |
| logic | `event` (a chain with no refresh, a dead action), `state` (a variable or page input), `data source`, `agent` (a chat that calls no tool or the wrong one) |

The owner follows the cause: `agent` and `object` issues get `agent:<id>` and
`object:<id>`, so they reach their own jobs in the fix loop.

On WEB, an issue of a check outside the page root (the menu, a shared header
or footer) is an `app shell` issue: the merge folds it across groups and it
gets its own app-shell job in the fix loop.

## The check agent

Every check runs as background agents, one per page group × check. Groups: at
most `limits.maxAgents` agents at once in total; a group is one page, or a
tab root with the pages it pushes (on WEB, a menu group with its pages), or a
module, or a family of card pages; on WEB the app shell (the menu, the module
that draws the bar, a header or footer several pages share) is a group of
its own.

- **Type.** `general-purpose` for checks that read the cache and run scripts
  (ui, touch-feedback or interaction, a11y, responsive, perf config, logic);
  the automation half of perf,
  security and data goes to a read-only `ua:automation-agent` brief the
  check agent writes and the orchestrator dispatches (a subagent never
  dispatches agents).
- **The brief.** Tenant and environment, the solution, the UnifyApps Headless CLI with
  `--session <sid>`, the run folder `R`, the pages (name, id) and the app id,
  the app's platform (on WEB also the widths, and that every request is
  queued with `--platform web` once the orchestrator exported the page's
  cache), the version to judge, the check's reference file path
  (read it fully first), [formats](formats.md) § Issue log, the issue log
  `R/issues/<check>-<group>.md`, the design store path, and these rules:
  "Reads only: no tenant write, no publish, no deploy, no test run of an
  automation that writes. Write the header first and issues as you go. Never
  hold a device: queue device checks with `loops queue add` and write the
  request ids in the footer. Final reply: the file path and the footer counts
  only, under 30 lines."
- **Run log.** The orchestrator appends `dispatch` with the full brief and
  `report` with the full reply ([run log](run-log.md)).
- **Waiting.** While agents run, the orchestrator does device-free work only
  (exports for the queue, the next brief, the board) and does not poll them.

## Merge and the board

1. When the check agents report: `loops issues lint` on each file (an issue
   that fails lint goes back to its agent once), then `loops issues merge` into
   `issues/merged.md` (a duplicate id kept once). The orchestrator then folds
   the same app-shell issue found by several groups into one (the lowest id
   kept, the others listed) and sets `bundle` issues apart for the platform side.
2. When the test runners report their device issues, merge again.
3. The board (`board.json`, then `loops board`): one job per group × check with
   its open issues, and in the closing block the issues ranked: `critical`
   first, then `major`, then `minor`; within a severity identity and crashes
   first, then the pages most issues touch.
