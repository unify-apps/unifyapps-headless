# Capture and probes

## Contents

- [Run folder](#run-folder)
- [Browser facts (once, into browser.md)](#browser-facts-once-into-browsermd)
- [Base capture per page](#base-capture-per-page)
- [Use the page](#use-the-page)
- [Behaviour probes](#behaviour-probes)
- [Run-wide passes](#run-wide-passes)
- [Timing probes](#timing-probes)
- [Measurements](#measurements)

`B` is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" RUN/browser`; `W` is the design width from the brief; `SKILL_DIR` is `${CLAUDE_PLUGIN_ROOT}/loops/app-design-critic-loop`; `RUN` is the run folder.

## Run folder

```
./app-critique/<app-slug>-<YYYYMMDD-HHMM>/      (inside the folder Claude Code is running in)
  brief.md            answers from the brief: app URL, widths, account role, scope, off-limits, passes
  browser.md          the browser line, the widths, the first page, the timing resolution
  browser/            the run's browser folder (profile, sign-in, shots); deleted by B close
  navmap.md           every page, its URL, how to reach it, page type, parent, notes
  EXPLORE_DONE        written by the explorer when no page is left; ends the critic pipeline
  branding.md         the URL and branding pass: one row per page (address bar, tab title, heading, app name, logo) and its flags
  notifications.md    the notifications pass: the bell, the unread count, one marked read, the arrival time; or "not reached: <reason>"
  auth.md             the auth pass: the sign-out, the private URL, the sign-in again; or "not run: <reason>"
  design.md           the design pass: one row per page and width that has a spec in the design store; or "no design"
  pages/
    01-<slug>/
      screen-<W>.png  whole-page screenshot at the design width
      screen-<W>.yml  the snapshot (accessibility tree) at that width
      screen-<W>.json the measured dump at that width
      screen-<W>.layout.json  the layout signals from scripts/layout.mjs
      screen-375.*    the same four at 375
      ledger.md       every control and what operating it did
      probes.md       explorer's record: probe, width, steps, result, repro, screenshot file
      probe-*.png     a screenshot for every probe result
      timings.md      measured times for this page's opens and actions (see Timing probes)
      perf-<W>/, perf-375/  web-profile's probe output for the page open at each width
      console-<W>.txt, requests-<W>.txt  the console errors and the request list, after the page settled and after it was used
      design/<W>/     the design pass at that width: measured.json, gaps.json, issues.md, pass-report.html
      states/         every surface and after-action state: .png + .yml + .json (+ bursts)
      DONE            empty marker: the page is final and a critic may start on it
  timings.md          app-wide timing table: every page open at both widths, every core action
  findings/           one file per critic, raw
  merged.md           merger output: deduped, ranked, numbered
  report.md           final report
  tickets.json        the ticket stage: one ticket per root cause, the key of each once filed
  tickets/            one description per ticket
```

## Browser facts (once, into browser.md)

- **The browser line** `B open-page` printed (Chrome for Testing, the page it landed on).
- **Widths.** The design width from the brief and 375. `B resize <w> 900` sets the viewport; the whole-page shot (`page-shot`) is taken at the width asked.
- **Timing resolution.** One `B snapshot` on a page that is not changing, timed: its wall time is the cost of one read, and no time closer to a budget than that may be reported as a failure.

## Base capture per page

1. Open the page at the design width: `B resize <W> 900`, then `B open-page <page URL>` (signed in, waits until the page draws). Wait for it to be still: `B wait-for <text only this page has>`.
2. `node SKILL_DIR/scripts/capture.mjs --browser RUN/browser --out RUN/pages/NN-<slug>/screen-<W> --width <W> --layout`. One call saves the whole-page `screen-<W>.png`, the snapshot `screen-<W>.yml`, the dump `screen-<W>.json` and `screen-<W>.layout.json`.
3. `B resize 375 900`, reload the page (`B open-page <page URL>`), wait, and capture again with `--out .../screen-375 --width 375 --layout`.
4. Add a line to `navmap.md`:

   `NN | slug | URL path | page type | reached by | parent | notes`

**Page types:** auth, home, dashboard, list, detail, form, wizard, search, settings, profile, chat, media, checkout, dialog, drawer, empty, error, other.

**Exploring the app:**
- Go breadth first, from the app's first page through its navigation (side bar, top bar, menu), then through links on each page.
- Treat a page reached two ways as one page, and note both routes.
- Do not open every row of a list. One record page per list is enough unless the rows lead to different kinds of pages.
- Stop at the page cap and list what was left unvisited.

## Use the page

**Control ledger.** Before probing, list every control on the page in `pages/NN-<slug>/ledger.md`:

`| control | where | in snapshot? | action taken | result (state NN or "nothing") | off limits? |`

Sources: every control in the snapshot (buttons, links, inputs, tabs, menu items), plus every control visible on the screenshot that the snapshot misses (icons, chevrons, avatars, chips, cards, row actions that appear on hover). Add rows for controls found inside each surface you open. Done means no row left untried without a reason: a row that stays untried writes `untried: <reason>` in its action column (an off-limits action, a control that needs data the brief did not allow, a surface already probed: `same as <path>`). `node SKILL_DIR/scripts/coverage.mjs check --run RUN` reads every ledger and refuses a bare untried row.

**Operate every control** at the design width and capture each resulting state into `states/NN-<state>` with `capture.mjs --out pages/NN-<slug>/states/NN-<state> --width <W>`:
- click; hover rows, cards and icons for actions that only show on hover; right-click where the app offers a menu; expand and collapse every chevron or "show more"; switch every tab;
- open every menu, dialog, drawer, picker, popover and tooltip; inside it, operate its own controls, type into its inputs, then close it every way the web allows (Escape, the close button, a click outside, browser back) and reopen to see if input was kept;
- perform the core action when the brief allows (save the record, apply the filter, upload the file) and stay for every after-action state: in-progress, result, actions on the result, error, empty;
- repeat the core action with edge input: very long, multi-line, gibberish, a search with no answer, an empty submit, a double submit, a second action while the first is still running.
At 375, repeat the controls that matter on a phone: the navigation, each list's row actions, one form, one dialog. Record what is missing or unreachable there.

**Bursts for transitions.** Straight after any action that changes the page, run `capture.mjs --burst 0,1,3 --out .../states/NN-<state>`: small viewport frames at 0, 1 and 3 s, then the settled whole-page capture, in one call. Add more seconds for slow states (uploads, long searches). A critic marks any finding that rests only on a burst frame as `likely`. Record time to first feedback and time to final state. A blank, a jump or a flash between them is evidence.

**Surfaces seen before.** The same dialog or menu often opens from several places. When a surface opens, compare its snapshot with the ones already probed (`diff` the two `.yml` files). Same names and roles: screenshot it, write "same as <path>" in the ledger, and do not probe it again. Any difference (a missing option, other spacing, kept or lost input): probe it fully, because that difference is the finding.

**Reproduce before leaving.** Every behaviour that looks wrong (a click that does nothing, lost input, a wrong or stale result, a control that changes meaning) is tried a second time on the spot, the same way, and recorded in probes.md as `repro 2/2` or `repro 1/2`. An intermittent result is evidence too; write down what differed between the tries.

**Finish the page.** When the ledger has no untried row without a reason and every probe for the page type is recorded, touch `pages/NN-<slug>/DONE`. Never touch DONE early: a critic starts on the page as soon as it exists.

**Controls missing from the snapshot.** Click targets come from the snapshot's refs. When a control is visible but absent from it, find it in the dump (`screen-<W>.json`, its box) and click its centre with `B eval "document.elementFromPoint(<x>, <y>).click()"`; verify on the next screenshot that the intended thing happened. Log it as "dump-located" in the ledger; two misses means stop on that control. Its absence from the snapshot is an accessibility finding in its own right.

## Behaviour probes

Run the probes that fit the page type. Record every probe in `probes.md`:

`| probe | width | steps | expected | actual | repro | screenshot |`

The explorer records what happens. It does not judge severity.

| Probe | Applies to | How |
|---|---|---|
| Hover | every control, at W | `B hover <ref>`, then `B screenshot`. Does the control change (colour, underline, shadow, cursor)? Save `probe-hover-<element>.png`. Record the cursor from the dump (`cursor`). |
| Focus and keyboard reach | every page | From the page top, `B press Tab` repeatedly, a `B screenshot` every few presses. Is there a visible focus ring on each stop? Does the order follow the page? Can every control be reached, and every dialog closed with Escape? Save `probe-focus-<n>.png`. A control the Tab never reaches is a finding. |
| Back and reload | every page | Navigate in, then `B go-back` and `B open-page` the same URL (reload). Does back return to the parent with its scroll and filters? Does reload keep the page, the selected tab, the typed input? Does the URL name the page and record? |
| Direct open | every page | In a fresh tab, `B tab-new <page URL>`: does the deep link land on this page itself, signed in, with its data, and not on the first page or a blank? Then `B reload`, then one step into the page and `B go-back`. Record the three results in one row and save `probe-direct.png`; `B tab-close` the tab and `B tab-select 0`. A page that cannot be opened by its URL is a finding. |
| Console and network | every page, both widths | After the page settles and again after you have used it: `B console error` and `B requests`. One file per width holds both reads, `console-<W>.txt` and `requests-<W>.txt`, each under two headers, `## at rest` and `## after use` (append the second read; never replace the first). Count the console errors and the requests that failed or answered 4xx or 5xx (a blocked third-party tracker does not count), and write the counts and the first line of each in the probe row. Anything above zero is a lead for the critic, in Stability and blockers. |
| URL and branding | every page, at W | Read the live address bar (`B eval "location.href"`) and the tab title (`B eval "document.title"`), and the page heading, the app name and the logo text from the snapshot. Add the row to `RUN/branding.md`. See [Run-wide passes](#run-wide-passes). |
| Notifications | once, when the app has a bell or sends a toast | See [Run-wide passes](#run-wide-passes). |
| Auth | once, last, with the brief's yes | See [Run-wide passes](#run-wide-passes). Never sign out before it. |
| Design | every page and width with a spec | After the rest capture at that width: the visual check's measure and gap table into `design/<W>/`. See [Run-wide passes](#run-wide-passes). |
| Resize | every page | At W, apply a filter or open a drawer, then `B resize 375 900`. Does the layout adapt without a reload? Is anything cut, overlapping, or scrolling sideways? Then back to W. |
| Scroll end | long pages, both widths | Is the last item fully visible above any sticky footer? Do sticky headers stay readable? Does a long table keep its header? |
| Tables | list, dashboard | At W: can the columns be read, sorted, filtered; do long values wrap or truncate with a tooltip? At 375: does the table scroll sideways inside itself, stack, or overflow the page? |
| Empty submit | form | Submit with nothing filled in. Where do the errors appear? Are they clear, and next to the field? Is the input kept? |
| Invalid input | form | A wrong email, a too-short value, letters in a number field. Is the message timely and clear? Does the field keep focus? |
| Loading | pages that fetch | `capture.mjs --burst 0,1,3` straight after `B open-page`. A blank page, a flash, a layout shift, a spinner with no end? |
| Empty state | list, search | Search for nonsense like `zzqxv`, or a filter with no results. |
| Double click | safe primary buttons only | `B click` twice quickly. Does it submit twice, open twice? Never on off-limits actions. |
| Dialog and drawer exit | dialog, drawer | Escape, the close button, a click outside, browser back: which close it, and is typed input kept or warned about? |
| Long content | detail, list | Long names and values: truncated with a tooltip, wrapped, or overflowing? Both widths. |
| 200% zoom | optional pass | `B eval "document.documentElement.style.zoom='2'"` at W on the main pages; capture; is anything cut or overlapping? Reset with `zoom=''`. |
| Dark mode | optional pass, when the app has a switch | Switch it in the app, capture the main pages as `pass-dark-*.png`, switch back. |
| Keyboard only | optional pass | Complete one core flow with Tab, Enter, Space and the arrow keys alone. |

## Run-wide passes

Three passes belong to the app rather than to one page. Each leaves a file in `RUN`, with a reason when it did not run, so the coverage gate can tell a skipped pass from a forgotten one.

**URL and branding** (`RUN/branding.md`). One row per page, written while you are on it:

`| page | address bar | tab title | page heading | app name | logo | notes |`

Flag in `notes` a slug that says clone, copy or test, ends in or carries a number, looks like a generated hash, or does not name the page a user sees; and a tab title, page heading, app name or logo that still says Clone of, Copy, Untitled or a default. `node SKILL_DIR/scripts/coverage.mjs slugs --run RUN` lists the leads a script can read from the address bar and the titles; whether a slug names its page is your judgement. The critic reports an address under `url-slug` and a leftover name under `default-branding`.

**Notifications** (`RUN/notifications.md`). Runs when the navigation shows a notifications bell or any page sent a toast while you used it; otherwise write `not reached: the app has no bell and sent no notification`. With the bell:

1. Capture the bell closed; read the unread count it shows.
2. Open it and capture the list (`states/`); does the count match the unread rows?
3. Open one notification and mark it read: does the count fall, does the row change, does the link land where it says?
4. When the brief allows a core action that sends a notification (an assignment, an approval, a comment), perform it and time the arrival: a burst (`capture.mjs --burst 0,1,3,5,10`) on the bell, then the toast or the row. Write the seconds to first sign. The budget is in taxonomy.md.
5. Record what you could not reach and why (no action sends one, the action is off limits).

**Auth** (`RUN/auth.md`). Last of all, after every page is done and only when the brief said yes and the app has a sign-in page of its own (an app that signs in through the tenant account is `not run: the app uses the tenant sign-in`, since signing out there ends the run's browser session):

1. Note the URL of a private page (a record page from the navmap, never the first page).
2. Sign out through the app's own control (the user menu). Capture where it lands: the sign-in page, the first page, or a blank.
3. Open the private URL in a fresh tab, `B tab-new <the private URL>` (never `B open-page`, which signs the browser back in when it sees a sign-in page): the pass succeeds when the sign-in page comes up and nothing of the private page shows first. Capture it. A private page that shows, even for a frame, is a finding under `auth-leak`.
4. Write `auth.md` with the three results, replacing the `not run: pending` line you wrote before the coverage check, and touch `RUN/AUTH_SIGNIN_NEEDED`. Leave the browser on the sign-in page with the private URL asked for; the person signs in there (never you, never with credentials in a file), and the main thread records whether the app returns to the page that was asked for.

**Design** (`RUN/design.md`, written by the main thread at the brief). One row per page and width that has a spec in the app's design store:

`| page | screen | width | spec | picture |`

`V` is `${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-visual-check/scripts`. For each row, after the page's rest capture at that width, with the page still on screen:

```bash
node "$V/measure.mjs" --browser RUN/browser --no-open --width <W> --out RUN/pages/NN-<slug>/design/<W>
node "$V/gap-table.mjs" --spec <spec> --measured RUN/pages/NN-<slug>/design/<W>/measured.json --page-name "<Page>" --run RUN \
  --out RUN/pages/NN-<slug>/design/<W>/gaps.json --issues-json .../issues.json --issues .../issues.md --report .../pass-report.html --figma <picture> --json
```

The gap table exits 0 on match and 4 on off; both are results. Write a `Design` row in probes.md per width: the counts of `off`, `missing` and `extra` rows and the report's path, or `could not measure: <reason>` (a width the deployed app cannot be put at, or what the measure said). A Code Builder app (the brief's app kind says `code`) is not measured at all: the measure reads the blocks a no-code page draws and a code app draws none, so write `could not measure: a code app has no blocks the measure can read` in the Design row without running the commands. The deployed app is measured at the design width; 375 is compared only when the design has a frame there and the brief named the app's preview route, since only the builder preview offers the phone width. A page or width with no row in design.md is not measured, not reported, and never a finding.

## Timing probes

Speed is part of the experience. Every page open is measured by `web-profile`'s probe, which reads the browser's own timing (navigation timing, LCP, CLS, INP, long tasks, request count and bytes):

`node "${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-profile/scripts/profile.mjs" open --browser RUN/browser --url <page URL> --step <slug> --out RUN/pages/NN-<slug>/perf-<W> --width <W>`

and the same with `--out .../perf-375 --width 375`. It writes the page's `perf.json` with the metrics per open.

**Every core action** the brief allows (save, search, filter, upload): 3 times, timed with `profile.mjs step --browser RUN/browser --step <slug> --out RUN/pages/NN-<slug>/perf-<W> --do "<B command>"`, plus once while the previous one is still running. Record what the page showed while waiting (nothing, spinner, skeleton, progress text), because a 3 s wait with progress feels very different from 3 s of nothing.

Write each to `pages/NN-<slug>/timings.md`:

`| action | width | from → to | first feedback | LCP or first content | settled (CLS) | INP | runs (ms) | notes |`

and add the page's lines to the run's `timings.md`. Round seconds to 0.1; INP and long tasks stay in ms. A timeout is a result too: write "never within <timeout>".

## Measurements

- `scripts/capture.mjs` takes the screenshot, the snapshot and the dump in one call; with `--layout` it writes the signals.
- `scripts/layout.mjs <dump.json>` prints the signals from a dump:
  - small targets (under 24 CSS px, WCAG 2.5.8; under 44 is noted);
  - unlabeled controls and inputs with a placeholder as their only label;
  - controls with no pointer cursor;
  - the dominant left and right page margins, the frequent edges and near misses within 4 px;
  - the type ramp: distinct font sizes with weights and sample texts; the heading levels in order, and skipped levels;
  - the vertical rhythm: the frequent gaps and the uneven ones;
  - elements past the viewport's right edge, and whether the page scrolls sideways;
  - text contrast failures against the effective background (WCAG 1.4.3: 4.5:1, 3:1 for large text);
  - long lines (over about 90 characters).
- Signals are leads, not issues. A critic confirms each one on the screenshot before raising it.
- The dump gives exact CSS px and colours; the screenshot gives the look. Quote the number from the dump and point at the shot.
