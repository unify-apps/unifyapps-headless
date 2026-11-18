# Check: performance

## Contents

- Config (the check agent, no device)
- Device (queued, never waited for)
- On a WEB app
- Done when

What makes the page slow to open, slow to react or heavy, from its config,
from the automations it calls, and from one light probe on a device: a
simulator on a MOBILE app, a test runner's browser on a WEB app (§ On a WEB
app). Runs as [audit checks](../audit-checks.md) § The check agent says. Issues:
`PF<g>-<nn>`, `check: perf`, `kind: performance`. This check finds what
config and a light probe can prove.

## Config (the check agent, no device)

On a WEB app, steps 1 and 2 differ: § On a WEB app.

1. **The rulebook's performance parts.** `node "${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/scripts/page-audit.mjs" <pageId> --app-id <appId> --json`;
   keep P1–P14 (real performance: a list owns its scroll, plain block inputs,
   the data source budget, image size and format, cruft, paging, function
   sources, fixed list rows and no visibility condition on a virtualized list, one
   refresh per interaction, fetch once, endless lists, paging controls, a
   block's own state) and X1, X3–X8 (perceived performance: chrome first,
   fixed boxes, empty and error states, a split first screen, optimistic
   small writes, instant navigation, parseable custom styles). Thresholds are
   the [rulebook](../../../../app-page-quality/references/rulebook.md)'s.
2. **House rules that cost time.** `page-lint.mjs` H2 (a list inside a
   Scrollable) and H3 (adaptation inside a binding over 200 characters).
3. **The automations the page calls.** `ua cache ds <pageId> --app-id <appId>`
   for the sources, `ua cache wf <id> --deps` for each callable. Then one
   read-only brief per automation to `ua:automation-agent` (it loads
   `ua:performance` itself): loops that call a node per item, a fetch
   with no source-side filter or sort, no pagination on a large result,
   repeated lookups of the same record, and the slowest node of its last runs
   (`list_workflow_runs`, `inspect_workflow_run`, limit 5). The brief says:
   "Reads only: no save, no deploy, no test run." Its issues have
   `owner: automation:<id>`.

## Device (queued, never waited for)

One `performance` request per page:

```
loops queue add --run <R> --kind performance --page <pageId> --page-name "<Page>" --version draft --app <appId>
```

The test runner measures the open of the page twice (`first-after-change`, then
`repeat`), counts first: time to first paint (`restart-app`, then four
screenshots at about 0, 250, 500 and 1000 ms; the first frame with the page's
chrome), the requests on open and their status and time
(`native-network-logs` before and after), and native hangs
(`native-profiler-start` → open → `native-profiler-stop` →
`native-profiler-analyze`).

It writes `R/findings/probe-<pageId>-<n>.json` and an issue only where a number
crosses the rulebook's thresholds or a request answers other than 200 (a
`DA` issue for the data check when the source fails). Numbers below the
threshold are kept in the probe file.

## On a WEB app

**Config.** `page-audit.mjs` audits MOBILE pages only: on a WEB page it
refuses with `app-page-quality audits MOBILE apps only` (exit 2), and
`page-lint.mjs` H2 and H3 are mobile renderer house rules. The check agent
judges the rules that hold on WEB itself, from `ua cache page`,
`outline`, `blocks`, `ds`, `events`, `deps` and `keys`, with the
[rulebook](../../../../app-page-quality/references/rulebook.md)'s thresholds:

| Rules | On WEB |
| --- | --- |
| P2, P3, P6, P7, P10, P11, P14 | hold: the binding engine, the data sources and the page store are the same on both platforms. P3's late-mount exemptions (a BottomSheet's or a Tabs pane's blocks) are mobile renderer facts: on WEB count every source that runs on page load |
| P4 | holds, measured by the probe (`largestAssetKB`, `oversizedImages`: the box in CSS px × the device pixel ratio), not by page-audit's image probe |
| P5 | holds for wrapper Stacks, padding-only Cards, a Card used as a list row and spacer Dividers or empty Typography; its Pressable parts are MOBILE only (WEB has no Pressable block) |
| X1, X3, X4, X5, X6, X7 | hold; the probe measures what they cost (`fcpMs` and `lcpMs` for X1 and X5, `cls` for X3). X5's BottomSheet and Tabs mount facts are the mobile renderer's; X7 reads the interaction check's W issues in place of U1 |
| X2 | holds for a Button's or IconButton's `appearance.loading` and the notification on a write; the Pressable part is MOBILE only |
| P1, P8, P9, P12, P13, X8 | MOBILE only: the mobile renderer's list virtualisation (P1, P8, P9), endless paging that needs a scrolling list (P12), no page controls on the phone (P13), custom styles as JSON text (X8; on WEB a block's custom CSS is CSS) |

A WEB issue cites the rule and says `judged by hand on WEB`. The automations
the page calls are read as step 3 says, on both platforms.

**Device.** One `performance` request per page, marked for the browser
test runners, which run [web-profile](../../../../web-loops/web-profile/SKILL.md):

```
loops queue add --run <R> --kind performance --platform web --page <pageId> --page-name "<Page>" --version draft --app <appId> \
  --note "widths 1440; path <preview path>; group <g>; start <s>; steps: <name>=<browser.mjs command>[ → <command>] ; …"
```

`<s>` is this request's own first issue number ([audit checks](../audit-checks.md) § The checks: the check agent's issues are `<P><g>-01` up, its k-th request starts at 50 × k + 1).

The test runner ([runner](../../../../web-loops/web-browser/references/runner.md))
opens the page's saved draft on the preview route
(`https://<host>/p/0/interfaces/<appId>/preview/<path>`) twice at the design
width (`profile.mjs open --width 1440 --runs 2`, the first on a cold cache),
runs the main interactions the note names (`profile.mjs step --do …`: a
filter, a search, a tab, opening a sheet; never a save, a submit or a delete
on a real record), then `build` and, after it, `findings --check perf`, into
`R/perf/<pageId>/`: the step files in `steps/`, `perf.json`
(`platform: web`) and `findings.json`, whose issues are `PF` issues of this
check. A metric past its threshold is an issue (warn minor, fail major); a
data-source call that failed comes back to the data check as a `DA` issue.
No simulator on WEB; CPU profiles are not taken
(tracing is refused in a signed-in browser) and long tasks stand in. The
numbers are the builder preview's, the saved draft with the builder's code
loaded beside it: compare a page with itself before and after a fix, never
with a published app.

## Done when

Every page has issues or `ok`, every automation the pages call has been read
(or is `unverified` with the reason), and each page's performance check is queued.
