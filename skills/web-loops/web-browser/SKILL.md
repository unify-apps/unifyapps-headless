---
name: web-browser
description: "Only used by the ua loops, for WEB UnifyApps apps: the WEB device layer. Drives UnifyApps Headless's own browser (app-verify's browser.mjs: Chrome for Testing signed in through open-page, one browser folder per test runner) to open a page's saved draft on the builder preview route at the platform's widths, and runs the WEB checks as issues: the interaction check (hover look, focus ring, pointer cursor, keyboard reach and focus order, the WEB counterpart of the MOBILE touch feedback check), the a11y check (accessible names, form labels, WCAG AA contrast, heading order, ARIA) and the responsive check (overflow, cut or overlapping text, the navigation at each width). Holds the WEB test runner protocol for the orchestrator's device queue (take, open, check, report, next; no simulator reservation) and the browser capacity. Read by a WEB test runner, and by an audit check agent of a WEB app."
user-invocable: false
---

# Web browser

On a WEB app a device is a browser: UnifyApps Headless's own, driven through
app-verify's `browser.mjs`, one browser folder per test runner, so many
runners run side by side. This block opens a page's saved draft at a width and runs
the WEB checks; [web-visual-check](../web-visual-check/SKILL.md) measures a page
against its design and [web-profile](../web-profile/SKILL.md) measures its
runtime perf with the same browser. It never uses another browser tool: not
the person's Chrome, not a browser MCP.

## Commands

The plugin folder is `${CLAUDE_PLUGIN_ROOT}`; write its real path into every
brief. Below:

- `B` is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser>`, `<browser>` the test runner's browser folder.
- `W` is `${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-browser/scripts`.
- `R` is the run folder; a test runner's browser folder is `R/runners/web-<n>/browser/`.

Every script is Node 22 with no packages, answers `--help`, prints one JSON
line, and exits with open-page's own code when the page would not open (3 no
browser, 4 no load, 5 wrong page or signed out, 6 no block drawn, 7 the
tenant would not say its environment), 1 when a
browser command failed, 2 on bad flags. What each
open-page exit means and does next is app-verify's
[browser walk](../../app-verify/references/browser-walk.md) § Your browser.

## The browser

- **One folder per test runner.** The folder names the browser session and holds
  its profile, cookies and output, so runners never share one. Every call
  names it first.
- **Signed in as the person.** `B open-page <url>` loads the saved sign-in,
  loads the URL fresh, waits up to 20 s until the
  page draws its blocks, checks it landed on the page asked for, and starts
  recording data-source calls (`B calls`).
- **Read, never extract.** In a signed-in browser `run-code`, tracing, the
  cookie and storage reads and the request-header reads are refused: the
  checks read the page with `eval`, `snapshot` and `calls`.
- **Close it.** `B close` at the end deletes the private folder that holds the
  sign-in; a browser left open is closed after 12 hours.

## Opening a page's draft at a width

The preview route shows the saved draft, with data sources running for real:
`https://<host>/p/0/interfaces/<appId>/preview/<path>` — the page's path from
`get_page_paths` with real values in its params, or `…/preview/page/<pageId>`,
or `…/preview/module/<moduleId>`; never the page id in place of the path, and
never the published address, which has its own sign-in. A Code Builder app's
draft is the engine's preview route,
`https://<host>/agent-api/preview/b/<appId>/main<path>`: it draws no block,
so `open-page` waits for the app's own first element instead, and lands on
it like a no-code draft.

```bash
node "$W/open.mjs" --browser <browser> --url "<preview url>" --width 1440
```

| Class | Width | How the preview gets there |
| --- | --- | --- |
| XL | 1440 (also 1680, 1920, 2560) | `B page-shot <width>`: the "Switch variant" menu's laptop or desktop size, the window as tall as the page, `page-<width>.png` saved |
| LG | 1366 | `page-shot 1366`. The preview offers no 1280; 1366 is the LG check |
| SM | 375 | the menu's phone tab (labelled Mobile, or the tab whose list holds Iphone X), item "Iphone X (375 x 812)", then `resize 460 900`; `open.mjs --width 375` does all of it |

The device sizes are `DEVICE_SIZES` in `${CLAUDE_PLUGIN_ROOT}/scripts/lib/page-jobs.mjs`,
the list page-shot takes. A width the preview does not offer is reported as
unavailable and never guessed.

**375.** The preview refuses `page-shot 375`, and `resize 375 812` alone keeps
the 1440 px laptop frame. `open.mjs --width 375` takes a `B snapshot` and a
`B click` three times, on the "Switch variant" button, the phone tab and
"Iphone X (375 x 812)", then `B resize 460 900`. The phone tab is the tab
labelled Mobile or, when the tabs are icons with no name, the first tab
whose list holds Iphone X: each tab is clicked in turn, with a fresh
snapshot after each. The app frame is then 375 px wide inside a phone frame
and shows its mobile navigation; the window must be at least 428 px wide, or
the frame's right edge is cut. It exits 1 and says why when no tab lists
Iphone X (it names what each tab listed), or the frame does not take 375. It saves no shot: take one with `B fit-page` then
`B screenshot --filename=page-375.png`. The pick stays across `open-page`
loads in a browser folder, so every open states its width; `page-shot` at a
laptop width switches the menu back to Desktop.

After the width, `open.mjs` waits until the DOM is still (500 ms quiet, 8 s at
most). A check that needs data on screen waits for it with
`B wait-for "<text>" <ms>`. A page whose data hangs on an input gets it in the
URL's query (`?requestId=…`), or `B page-shot <width> --input <name>=<value>`.

## The checks

Each takes `--browser`, `--out-dir` (`R/web/<pageId>/<kind>-<request id>/`), and optionally
`--url` (open-page it first; without it the page the browser shows is read),
`--width`, `--run R` (evidence paths relative to it), `--page-name`,
`--page-id`, `--blocks` (a `ua cache blocks --json` export, for display
names), `--check`, `--code`, `--group`, `--start` (issue ids
`<code><group>-<nn>`), `--issues-json <file>` and `--issues <file>`.

| Script | What it checks | Rules | Issues |
| --- | --- | --- | --- |
| `interaction.mjs` | every button, link, field and clickable row or card: hovers each and reads its look, presses Tab through the page and reads where focus lands and how it shows | W1 hover look · W2 focus indicator · W3 pointer cursor · W4 keyboard reach and traps · W5 focus order · W6 pressed look (`--active`) | check `interaction`, `PR` |
| `a11y.mjs` | the accessibility snapshot and the DOM | W7 accessible names · W8 form labels · W9 contrast · W10 heading order · W11 ARIA | check `a11y`, `AY` |
| `responsive.mjs` | each `--widths` (default `1440,375`; `all` adds 1366) from one open | W12 overflow · W13 cut text · W14 text over text · W15 navigation per width | check `responsive`, `RS` |

Issues are the orchestrator's issue shape ([formats](../../native-loops/loop-orchestrator/references/formats.md)
§ Issue log) with `device` = `device` and `status` = `open`; a finding
inside the app but outside the page root (the app's navigation or header) is
`app shell`, and the builder preview's own toolbar, outside the app, is left
out. Each prints one JSON line with its counts and `loadedAt`, when the page
was opened. What
each rule measures, its severity and what it cannot see are in
[checks](references/checks.md). `capacity.mjs` says how many browsers this
laptop runs at once.

The checks only read: they hover, press Tab and Escape, and resize; they
never click, type or submit. A WEB run clicks only in
[web-profile](../web-profile/SKILL.md)'s `step`, on seeded test data, in
the recorded steps of a reported issue (its reproduction and its `replay`),
and in the steps of an `acceptance` or `realtime` check
([runner](references/runner.md)), as the test user.

## The WEB test runner

A test runner of the orchestrator's device queue on a WEB app holds a browser
folder, not a simulator: there is no reservation and no pool. It takes a request,
opens the page, runs the check the request's kind names, writes the result
files into `R`, marks the request done or failed, and takes the next; when the
queue stays empty it closes its browser, removes its browser folder and ends. The protocol, the kinds,
the result files and the failure lines are in [runner](references/runner.md).

## References

| File | Read it when |
| --- | --- |
| [references/runner.md](references/runner.md) | you are a WEB test runner, or the orchestrator starts WEB test runners |
| [references/checks.md](references/checks.md) | you judge or explain a W issue, or a check answered something odd |
| [app-verify's browser walk](../../app-verify/references/browser-walk.md) | a browser.mjs command or an open-page exit |
