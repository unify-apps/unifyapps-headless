---
name: app-design-critic-loop
description: Critique a finished UnifyApps WEB app page by page as a demanding user and a senior designer, through whole-page screenshots, the accessibility tree and measured layout at the design width and at 375 CSS px, in the loops' own browser, with four go-live passes (sign-out and sign-in again, the address bar and branding, the notifications bell, and a coverage gate a script proves) and console and request counts per page, and report UI and UX issues ranked critical, high, minor and nitpick in a fixed category order, then write one ticket per root cause after one yes. Use when asked to review, critique, audit or QA the design or UX of a deployed web app before a go-live or a demo, "review my web app like a user", or "find UI/UX issues in the app"; a MOBILE app is /ua:native-design-critic-loop.
argument-hint: "<app URL> [--width 1440] [--pages N] [--flows 'checkout,signup'] [--page orders] [--no-tickets] [--nitpicks]"
---

# App design critic

You are an app critic. You judge the finished WEB app the way a picky,
experienced user and a senior product designer would. You do not care what
the app is built with, how its pages are configured, or whose fault a problem
is. Only what a person at the keyboard sees and feels counts, at a laptop
width and on a phone.

Never explain an issue in terms of blocks, components or code. Say what the
user sees, why it hurts them, and what good looks like.

## What you can see

The deployed app, in UnifyApps Headless's own browser (app-verify's
`browser.mjs`, one browser folder for the run), through three lenses:

- **Screenshot (PNG)**: `page-shot <width>`, the whole page at that width.
  The truth for colour, visual hierarchy, density and polish.
- **Snapshot (text)**: the accessibility tree, one line per element with its
  role, name, state and a ref. The truth for names, roles, reading order and
  what is reachable.
- **The measured dump (JSON)**: every visible element's box in CSS px, font
  size, weight and family, colour and effective background, corner radius,
  shadow, border and cursor, read from the page itself. The truth for
  positions, spacing, sizes and contrast.

`scripts/capture.mjs` takes all three in one call and, with `--layout`,
turns the dump into signals (`scripts/layout.mjs`): small targets, unlabeled
controls, near-miss edges, the dominant margins, the type ramp, uneven gaps,
overflow, contrast failures, long lines, controls with no pointer cursor.
Every number in the report is measured; never claim a px or a colour you did
not read.

Two widths on every page: the design width (1440 unless `--width` says
otherwise) and 375, the phone width. Both are first-class: an issue at 375
counts as much as one at 1440.

`B` below is `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" RUN/browser`.
If `B open-page <url>` exits 3, the browser is not installed: run
`node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" --install`
after the person's yes, then start again.

## Phases

One browser, one explorer. Critique (phase 2) runs from saved evidence and
starts while the explorer is still working: each page goes to its critic the
moment it is finished, not after the whole app.

### 0. Brief (main thread, one round of questions)

Anything typed after `/ua:app-design-critic-loop` (the URL, `--width`,
`--pages`, `--flows`, `--page`, `--no-tickets`, `--nitpicks`) already answers
its question. Ask the rest at once, then do not ask again until the report,
with one exception: the sign-in-again question of the auth pass (phase 3,
step 0b):

1. **The app**: its deployed URL. Not the builder, not a preview of a draft:
   the review is of what users get.
2. **The account.** `B open-page <url>` loads the app signed in as the
   person on the tenant. An app with its own sign-in page shows it in the
   browser window: ask the person to sign in there once, with the test
   account they name, before the explorer starts. Credentials never go in
   chat, a file or a brief.
3. **Scope**: whole app (default cap 25 pages), named flows, or **single
   page** (`--page`). A single page is explored and used completely, every
   dialog, menu and after-action state included, and nothing else is walked.
4. **Actions that are off limits.** Default: never pay, purchase, delete,
   send, post, invite, publish, or submit a real form without a yes for that
   specific action. Also ask whether the app's **core actions** may be
   performed with harmless test input ("May I create records, fill and submit
   forms, search, filter, upload a small file, with test data, and delete
   those records afterwards?"). Many
   surfaces only exist after acting: results, loading, success and error
   states, row actions, dialogs. Without a yes, those go under "not reached".
5. **Optional passes**: the app's own dark mode when it has a switch, 200%
   zoom, keyboard only.
6. **The auth pass.** Only for an app with a sign-in page of its own: "At
   the very end, may the explorer sign out through the app and open a
   private page, so we see that it asks to sign in? You then sign in again
   in the browser window, as the same account." An app signed in through
   the tenant account skips it: signing out there would end the run's
   browser, and the report says so.
7. **Roles.** The role of the account the walk runs as, and whether the walk
   should repeat as a second test account (its role; the person signs in as
   it in the window when its turn comes). The second run is a run of its
   own, phases 1 to 4 again into `./app-critique/<app-slug>-<stamp>-<role>/`,
   after the first report; an issue only one role sees names the role.
8. **Notifications.** When the brief allows core actions, name the one that
   sends a notification (an assignment, an approval, a comment), so the
   notifications pass can time its arrival. Asked only when the app has a
   bell or a toast is likely; otherwise the pass records "not reached".
9. **The design.** "Is there a design to compare with?" First read the
   app's design store in this folder,
   `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts/store.mjs" status --app <app id> --json`:
   when it lists screens with a spec, say which pages have one and offer to
   use them. Otherwise the options are a Figma link, an HTML file (a saved
   artifact counts), screenshots, or none. On none, or for a page with no
   spec, the pass is skipped for that page and the report says "no design":
   never a finding. On a new source, run the web design intake once before
   the explorer starts (a Figma frame through the `ua:design-capture` agent;
   its result never comes into chat) so the store holds the specs and the
   next run asks nothing. Then write `RUN/design.md`: one row per page and
   width with a spec (page, screen, width, spec file, design picture). The
   deployed app is compared at the design width; a 375 spec is compared only
   when the brief also names the app's preview route, the one place the
   browser can be put at 375.

Create the run folder (`RUN` below): `./app-critique/<app-slug>-<YYYYMMDD-HHMM>/`,
inside the folder Claude Code is running in, with `RUN/browser/` as the
browser folder, and write the answers above to `RUN/brief.md`, naming the
account's role, never its credentials. Layout is in
[references/capture.md](references/capture.md). Open the app once with
`B open-page <url>` in the main thread, so the sign-in is settled before any
agent runs; `B close` at the end, on every exit path.

### 1. Explore: map, use and probe in one pass (one explorer agent)

Dispatch one `general-purpose` agent in the background with the explorer
prompt in [references/agents.md](references/agents.md). It walks the app
breadth first from its first page and finishes each page while it is on it,
so no page is walked twice:

1. **Capture** the page at rest at both widths with `scripts/capture.mjs`
   (screenshot, snapshot, dump and layout in one call) and add its row to
   `navmap.md`.
2. **Use the page.** A screenshot at rest shows a third of it; the rest hides
   behind controls: menus, dialogs, drawers, popovers, row actions, tabs,
   expandable sections, pickers, tooltips, and the states that only appear
   after acting (loading, results, success, error, empty). Build a control
   ledger of every control and operate each one (within the off-limits
   list); a control left alone carries its reason in the ledger. Every
   surface that opens is captured as a state and probed like a page of its
   own. See "Use the page" in capture.md.
3. **Run the behaviour probes** that fit the page type and each surface:
   hover, focus and keyboard reach, pointer cursor, back and reload, resize,
   validation, loading, empty, long content, tables, dialogs, zoom. On every
   page also: the **direct open** (the page's own URL in a fresh tab, a
   reload, a back), the **console and network** counts (errors and failed
   or 4xx/5xx requests, before and after using the page, both widths) and
   the **URL and branding** row (the live address bar, the tab title, the
   heading, the app name and the logo, into `RUN/branding.md`). On a page
   and width that `RUN/design.md` lists, the **design pass**: the visual
   check's measure of the live page and its gap table against the spec, into
   `design/<W>/`, the way the build loops compare a page with its design.
4. **Time it.** Measure each page's open (navigation timing, LCP, CLS, INP,
   long tasks) with `web-profile`'s probe at both widths, and every allowed
   core action (3 runs each), as in "Timing probes" in capture.md.
5. **Reproduce before leaving.** Every behaviour that looks wrong is tried a
   second time on the spot and recorded as `repro 2/2` or `repro 1/2`.
6. Writes `ledger.md`, `probes.md`, `timings.md` and `states/`, then touches
   `pages/NN-<slug>/DONE`. A page is not done while its ledger has an
   untried row without a reason.

Across the app it also runs the **notifications pass** once, when the
navigation has a bell or a page sent a toast: the unread count, the list,
one marked read, and the arrival time of the notification an allowed action
sends, into `RUN/notifications.md` ("not reached" otherwise). When the cap
is reached or the app is exhausted, it runs the coverage script on its own
work, then, with the brief's yes, the **auth pass** last: it signs out
through the app, opens a private URL, records whether the sign-in page comes
first with nothing of the page shown, writes `RUN/auth.md`, touches
`RUN/AUTH_SIGNIN_NEEDED` and leaves the browser on that sign-in page. Then
it writes `RUN/EXPLORE_DONE`. Sign-out happens only there, only then.

Behaviour is half of this review, and speed is part of behaviour. A page
that looks perfect but loses the form on back, or hides the submit button
below the fold at 375, has a worse issue than any spacing problem.

### 2. Critique (pipelined, evidence only)

While the explorer runs, the main thread runs
`bash "${CLAUDE_PLUGIN_ROOT}/loops/app-design-critic-loop/scripts/wait-pages.sh" RUN <pages-dispatched>`
in the background. Each time it exits, dispatch critics for the newly finished
pages and start it again with the new count, until it reports `EXPLORE_DONE`.

- **Page critics**, as pages finish: 2–3 small pages per agent, both widths
  of each. A page with a design folder also gets its gap rows: each open
  row is a `design-drift` issue, placed in the category of what drifted,
  never critical. A page with more than about 20 states gets one critic per surface
  group instead. Each gets its page folder, its page type,
  [references/checklist.md](references/checklist.md) and
  [references/taxonomy.md](references/taxonomy.md).
- After `EXPLORE_DONE`, in one message: **one consistency critic** for all
  pages (the same thing should look and behave the same everywhere, theme
  included: colour per role, corner radius, shadow, borders, fonts, hover
  and focus styles, at both widths) and **one flow critic** for the
  navigation map and probes (dead ends, lost state, confusing back
  behaviour, dialogs without a way out, flows that take too many steps, and
  what the phone width loses).

None of them touch the browser. Each returns issues in the issue shape from
taxonomy.md, each tagged with a root-cause key.

### 3. Verify and merge

0. **Coverage gate** (main thread). Run
   `node "${CLAUDE_PLUGIN_ROOT}/loops/app-design-critic-loop/scripts/coverage.mjs" check --run RUN --width <W>`.
   It reads the navigation map and every ledger and probe record, and
   answers complete, or lists what is missing: a page the navigation
   reaches with no folder and no "not walked" reason, a control untried
   without a reason, a surface opened but not probed, a page without its
   375 capture, a page never opened directly by its URL, a page with no
   console and network count, or a pass with no record. Everything it lists
   goes back to the explorer before critique results are trusted; nothing
   is trusted on a reading of the files by eye. At most three rounds: what
   is still missing after the third goes into the report's coverage section
   as "not covered", and the summary says `coverage incomplete: <n> items`.
0b. **Sign in again** (main thread, only when `RUN/AUTH_SIGNIN_NEEDED`
   exists). The browser window shows the app's sign-in page, asked for with
   a private URL. One AskUserQuestion: "Sign in again in the browser window
   as the same account, then answer done." Credentials never pass through
   chat or a file. After the answer, read the address bar
   (`B eval "location.href"`) and capture the page: did the app return to
   the private page that was asked for, or to its first page? Write the
   result into `RUN/auth.md` and remove the marker. The flow critic reads
   it.
1. **Merge** (one merger agent, prompt in agents.md). Group issues by
   root-cause key first: the same root problem on five pages is one issue
   listing five pages. Then judge the `other:` leftovers by hand, calibrate
   severity against the rubric, not against how sure the critic sounded, and
   give IDs in final order: `C1…`, `H1…`, `M1…`, `N1…`.
2. **Prove the top issues** (main thread). For every critical and high,
   re-read the evidence yourself. A behaviour already recorded `repro 2/2`
   stands on its record; re-probe in the browser only the ones at `1/2`,
   `likely`, or never repeated. Downgrade or drop anything you cannot show in
   a screenshot, a measurement or a recorded probe.

### 4. Report

**When output appears.** The ranked list is given once, after phase 3,
never while issues are still being found. During the run, post one short
progress line at the end of each phase and when a batch of critics is
dispatched (pages done, states captured, critics finished with their counts),
clearly marked as unverified.

Write `report.md` with [references/report.md](references/report.md). Order is
fixed and must not change:

1. Severity: **Critical → High → Minor → Nitpick**.
2. Within a severity, the category order in taxonomy.md.
3. Within a category, the page order of the navigation map.

Reply in chat with the counts table, the critical and high titles, and the
report path. Offer to publish it as a shareable page. The fixes are
`/ua:app-fix-loop`'s: the report is its input, never changed here.

### 5. Tickets

After the report, unless the command said `--no-tickets`. One ticket per
root cause, never one per issue, as [references/tickets.md](references/tickets.md)
says, on the rules it shares with the Test Studio ticket loop
([ticket.md](../app-test-ticket-loop/references/ticket.md)). `T` is
`node "${CLAUDE_PLUGIN_ROOT}/loops/app-design-critic-loop/scripts/tickets.mjs"`.

1. **Nothing is sent anywhere.** This plugin ships no issue-tracker tools:
   the stage writes `RUN/tickets/*.md` and ends with that folder's path, for
   the person to file where their team keeps its work.
2. **The contract.** Read `tests/<app slug>/tickets-contract.md` (the
   fields in ticket.md, _The tickets contract_). The fields still empty
   that have no default are the one settings question, asked in one
   AskUserQuestion; write the filled contract back, so the test loops and
   the next run ask nothing.
3. **Group and check.** `T draft --merged RUN/merged.md --out RUN/tickets.json`,
   then edit the file as tickets.md says, then `T check … --earlier ./app-critique`
   until it answers complete. Every fingerprint it names as already filed
   moves to `notTicketed` with `already filed <key>`; a nitpick stays listed
   and unfiled unless the person asked (`--nitpicks`).
4. **Dedupe and render.** The guards are the ones ticket.md _Dedupe_ names:
   this app's earlier runs (`--earlier`), the `Fingerprint:` line every
   description ends with, and a key the person gives at the approval for a
   ticket a teammate filed. Then `T render`, which writes one description
   per ticket and `RUN/tickets-proposed.md`, the page the person reads:
   the proposed tickets as a table (number, title, priority, assignee,
   page, the issue IDs it groups, one line of root cause, a link to its
   description), the tickets that get a comment instead, and the nitpicks
   left unfiled.
5. **Approve.** Print the proposed tickets' table from
   `RUN/tickets-proposed.md` in chat, as a Markdown table, with the file's
   path under it; with the Artifact tool (load it with ToolSearch when it
   is deferred), publish the file as a private page and give its link.
   Then the one question of the stage, one AskUserQuestion with only the
   counts and the choice: "Write all <n>", "Write none", "Pick" (a free-text
   row: the numbers to write, `3: <new title>` to rename one, or
   `3: filed <key>` for one that exists) and, only when there are any,
   "Also write the <k> nitpicks". No ticket text goes in the question.
   Nothing is written without one of those answers; a dropped ticket goes to
   `notTicketed` as `person declined`, `T check` runs again and `T list`
   writes the page again.
6. **Write.** One file per approved ticket in `RUN/tickets/`: the title with
   the contract's prefix, the priority word, the assignee, the rendered
   description and its `Fingerprint: nebula-review-bug/<fingerprint>` line.
   A bug a ticket already holds gets a comment file instead, with this run's
   folder name and issue IDs, for the person to paste on that ticket.
7. **Record.** Write each key, id, link and status the person gives back
   onto its ticket in `RUN/tickets.json` and fill the report's `## Tickets`
   section. End with one line: `<n> written · <n> comments · <n> declined`,
   every ticket's file, the keys for the ones already filed, and the
   report's path.

## Rules

- **Thoroughness over speed.** Use every control, open every surface, wait
  for every after-action state: every control at the design width, and at
  375 the ones that matter on a phone (capture.md). Capture transitions as a
  burst (straight after the action, mid-way, settled), not only the final
  screen. A control missing from the snapshot is still operated and is
  itself an accessibility finding.
- **House rules always apply.** Hover and focus feedback on every control, a
  pointer cursor on everything clickable, consistent padding across pages,
  alignment (always high severity), a consistent theme, a clear text
  hierarchy, readable line lengths, and no horizontal scroll at either
  width. They are defined in [references/taxonomy.md](references/taxonomy.md#house-rules)
  and checked on every page.
- **Evidence or it did not happen.** Every issue names its page, its width,
  its screenshot file and, for layout findings, the measured numbers.
- **The user's view only.** No blocks, no data sources, no config. "The
  Save button is below the fold at 375 and nothing says so", not "the form
  block lacks a sticky footer".
- **Judge by the platform the user has.** A desktop browser at 1440: hover,
  keyboard, a pointer, tables, side navigation. A phone at 375: touch, one
  column, a collapsed navigation, thumbs. Each width by its own
  expectations; WCAG 2.2 for both.
- **Do not invent states.** If you could not reach an error or empty state,
  say "not reached" in the coverage section.
- **Every file stays in the run folder.** The report, screenshots,
  snapshots, dumps, findings, verification shots, helper scripts and
  temporary files all go under `./app-critique/<run>/`. Nothing goes to the
  home folder, `/tmp` or a scratchpad.
- **Leave the app as you found it.** Reset dark mode and zoom after optional
  passes. Delete the test records you created only when the brief allowed deleting
  them, each one by name; never bulk-delete.
- **Stop and ask** before any action on the off-limits list, before entering
  personal data, and if the app shows real customer data you were not
  expecting.
- **One browser.** Only the explorer drives it; the main thread uses it only
  for the sign-in before dispatch, the sign-in again after the auth pass,
  and the re-probes of phase 3, after the explorer wrote `EXPLORE_DONE`.
  `B close` at the end.
- **Sign out only in the auth pass, last.** Never before every page is
  done, never without the brief's yes, never for an app that signs in
  through the tenant account. The person signs in again in the browser
  window; no credential is typed by an agent, written to a file or sent in
  chat.
- **The design pass changes nothing.** Not the app, not the design store,
  not the design. A page or width with no spec is skipped and reported as
  "no design"; a measure that fails is "could not measure", with the reason.
- **A ticket needs the person's yes.** The proposed list is shown once;
  nothing is filed before "File all" or a named subset, nothing is filed
  twice, and a nitpick is listed, not filed, unless the person says so.

## Self-review

`S` is `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-orchestrator/scripts/loops.mjs" signals`.

Before the closing summary, the shared [self-review](../../skills/native-loops/loop-orchestrator/references/self-review.md) rules:

1. `S finish --run RUN --json`.
2. Write `RUN/self-review.md`: what in this loop's text, briefs, scripts or
   tools made the run slower or wrong, one line each, from the run's files,
   never a transcript.
3. Name each record it says is due in the summary, one line each, and
   offer `/ua:give-feedback`. Send nothing unless the person runs it.
4. End the summary with `Loop review: …`.

During the run, `S add` records a signal the moment the loop knows. A tool
that fails the same way twice and stops the run is counted at once with
`S finish --now` (the hard stop).
