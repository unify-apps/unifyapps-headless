# Check: UI

## Contents

- Config (the check agent, no device)
- Device (queued, never waited for)
- What to look for beyond the numbers
- WEB
- Done when

Is each screen what the approved design says, and does it hold together on
the phone? Config checks run in the check agent; every measurement on a device
is queued. Runs as [audit checks](../audit-checks.md) § The check agent says.
Issues: `UI<g>-<nn>`, `check: ui`.

Replaces the old audit loop's verifier and its design compare step. On a
WEB app the page is measured in UnifyApps Headless's browser at each width
instead of on the phone: § WEB below.

## Config (the check agent, no device)

1. **Rulebook, UI part.** `node "${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/scripts/page-audit.mjs" <pageId> --app-id <appId> --json`.
   Keep the findings of U2–U6 and U8–U11 (U1 and U7 belong to the
   [touch feedback check](audit-touch-feedback.md)); judge the rules the script leaves to the
   session from its `candidates`, as the
   [rulebook](../../../../app-page-quality/references/rulebook.md) says. A rule
   the script could not run is judged by hand and says so in `evidence`.
2. **House rules on layout.** `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/page-lint.mjs" <pageId> --app-id <appId> --json`:
   keep H5 (skeleton shape), H6 (status bar), H7 (cross opens a sheet, back
   pushes), H13 (no spacer for the tab bar), H14 (no fixed widths ≥ 380).
3. **Config against the design spec.** When `design/<app-id>/specs/<page>.json`
   exists, compare each region's stored values with the spec's (radius,
   padding, gap, font size and weight, colour token) from
   `ua cache blocks <pageId> --app-id <appId> --name <block> --field component.appearance`.
   A stored value off the spec is an issue with `device: config`; the device
   decides the rest (D03: the web preview is not the phone).
4. **Device-proven traps in config.** Grep the page's custom styles for D01
   (`{{` inside native custom style JSON), D05 (`customStyles` without
   `customCSS`), D06 (`px` strings) and D04 (padding on a ScrollView), with
   `ua cache grep`. Each hit is an issue naming the trap.

## Device (queued, never waited for)

Per page and per state in `design.md`, one request:

```
loops queue add --run <R> --kind visual-check --page <pageId> --page-name "<Page>" --pass 1 \
  --version draft --app <appId> [--regions a,b] [--note "state <state>"]
```

The request carries what a stranger needs: `profile.json` gives the endpoint,
bundle id, test user and sign-in flow; the orchestrator exports
`cache/<pageId>/outline.json` and `blocks.json` into `R` before it queues
([test-and-fix](test-and-fix.md) § Orchestrator side). A state with no
design spec is queued with the note `visual only`: the test runner compares its shot
with `screens/<page>--<state>.png` by eye from one composite and writes its
issues as `GUESS`.

The test runner turns every `off` or `missing` row of the visual check's `gaps.json` into
an issue in `issues/ui-<group>-device.md`, with the design spec row as
`expected`, the measurement as `actual`, and `device: device`.

## What to look for beyond the numbers

Clipped or truncated text, overlap, content under the status bar or the tab
bar (U3), a keyboard that covers its input (U4), two scroll owners (U2), a
sheet that opens under another block (U9), statuses shown as codes, record ids
or field names on screen, an empty list with no empty state, a LogBox banner
(a `bundle` issue, not a page issue: D14).

## WEB

On a WEB app the same question is asked of the page at the design width
(1440) and the second width (375), in a test runner's browser on the saved
draft's preview route.

- **Config.** `page-audit.mjs` and `page-lint.mjs` audit MOBILE pages only
  (they refuse a WEB app), so the config half is app-verify's
  [config review](../../../../app-verify/references/config-review.md) without
  its Mobile only part: layout, typography, colour tokens, a hand-built menu
  on a page (the app menu belongs in `properties.navigation`), page sockets.
  Step 3 compares stored values with the spec of each width that has one
  (`specs/<screen>@<width>.json`, CSS px). Step 4's device traps are MOBILE
  traps and do not apply.
- **Device.** One `visual-check` request per page and state, naming the widths
  that have a design spec (375 has none unless the design has a frame at 375;
  the responsive check covers it). A page with no spec at any width gets no
  `visual-check` request: there is nothing to measure against, and the
  responsive check covers the page. The test runner runs
  [web-visual-check](../../../../web-loops/web-visual-check/SKILL.md) per
  width (measure, then the gap table against that width's spec, ±2 px,
  typography, colour and radius from the computed style), into
  `R/visual/<pageId>/pass-<n>/<width>/`:

  ```
  loops queue add --run <R> --kind visual-check --platform web --page <pageId> --page-name "<Page>" --pass 1 \
    --version draft --app <appId> --note "widths 1440; path <preview path>; state <state>; group <g>; start <s>"
  ```

  `<s>` is this request's own first issue number ([audit checks](../audit-checks.md) § The checks: the check agent's issues are `<P><g>-01` up, its k-th request starts at 50 × k + 1).

  When the audit's focus has no `a11y` or `responsive` check, the UI check also
  queues one `a11y` and one `responsive` request per page at both widths
  ([a11y](audit-a11y.md), [responsive](audit-responsive.md)); their issues keep
  their own checks (`AY`, `RS`).
- **Beyond the numbers.** Text cut or drawn over other text at the second
  width, a block wider than the window, a menu that does not fit, statuses
  shown as codes, record ids on screen, an empty list with no empty state. A
  finding outside the page root is an `app shell` issue.

## Done when

Every page in the group has issues, an explicit `ok`, or a `Not reached` line
(on WEB at each width in scope), and every device request is queued with its
id in the issue log's footer.
