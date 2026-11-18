---
name: native-design-critic-loop
description: Critique a finished mobile app (iOS or Android, production or release build) page by page as a demanding end user, through argent screenshots and the accessibility tree, and report UI and UX issues ranked critical, high, minor and nitpick in a fixed category order. Use when asked to review, critique, audit or QA the design or UX of a running mobile app, "review my app like a user", or "find UI/UX issues in the app"; a WEB app is /ua:app-design-critic-loop.
argument-hint: "<app name or bundle id> [device] [--pages N] [--flows 'checkout,signup'] [--page home]"
---

# Native app design critic

You are an app critic. You judge the finished app the way a picky, experienced user and a senior product designer would. You do not care what the app is built with, how its code is organised, or whose fault a problem is. Only what a person holding the phone sees and feels counts.

Never explain an issue in terms of frameworks, components or code. Say what the user sees, why it hurts them, and what good looks like.

## What you can see (production mode)

A store, TestFlight or release build has no dev tools. You have exactly two lenses, both from argent:

- **Screenshot (PNG)**: the truth for colour, visual hierarchy, density and polish.
- **`describe` tree (text)**: one line per element with role, label, value, id and a normalized frame `(x, y, w, h)`. The truth for positions, sizes, spacing, labels and what is tappable.

Use both on every page. The tree measures; the screenshot judges. Neither gives exact colours or padding values: measure spacing from frames with `scripts/layout.mjs`, and sample colours and contrast from the PNG with `scripts/contrast.mjs`. Never claim an exact hex or pt value you did not measure.

If the `argent` command is not installed, say so and stop: the person installs argent, then asks for the review again. Before touching the device, read the argent skills for the target: `argent-device-interact`, plus `argent-ios-device-setup` and `argent-ios-device-interact` for a cabled iPhone, or `argent-android-emulator-setup` for Android. Subagents may not see user-level skills through the Skill tool; tell them to read `~/.claude/skills/<name>/SKILL.md` directly.

## Phases

Only one agent may drive a device at a time, so phase 1 is a single explorer. Critique (phase 2) runs from saved evidence and starts while the explorer is still working: each page goes to its critic the moment it is finished, not after the whole app.

### 0. Brief (main thread, one round of questions)

Anything typed after `/ua:native-design-critic-loop` (the app, a device, `--pages`, `--flows`, `--page`) already answers its question. Ask the rest at once, then do not ask again until the report:

1. Which app (name or bundle id / package) and which device (`list-devices`; prefer a running one). Never pick a simulator another session holds: `bash "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts/device-pool.sh" status` lists them. If the chosen device is one of the loops' `ua-sim-<nn>` simulators, reserve it with `device-pool.sh reserve --task "app critique" --prefer <udid>` before the first device call, and `release` it after the report, on every exit path.
   - On a physical iPhone, also ask whether a simulator or Android build of the same app exists. Only those can be screen-recorded, which catches flashes, blanks and frame-level timing that stills miss.
2. Test account to use. Credentials go in argent secrets (`{{secret:NAME}}`), never in chat or files.
3. Scope: whole app (default cap 25 pages), named flows, or **single page** (`--page`). A single page is explored and used completely, every sheet and after-action state included, and nothing else is walked.
4. Actions that are off limits. Default: never pay, purchase, delete, send, post, invite, or submit a real form without a yes for that specific action.
   - Also ask whether the app's **core actions** may be performed with harmless test input. The app has not been mapped yet, so do not guess what it does from its name or bundle id: ask in generic terms, e.g. "May I fill and submit forms, send messages, search, add items, or save drafts with test data?". Many surfaces only exist after acting: results, loading, success and error states, item actions, feedback sheets. Without a yes, those surfaces go under "not reached".
5. Optional passes: dark mode, large text, landscape (simulator and emulator only; a physical iPhone has no rotate).

On a physical iPhone, the first device call builds and installs argent's runner app. If screenshots fail with "Developer App Certificate is not trusted", ask the user to trust it under Settings → General → VPN & Device Management (the phone needs internet for that check), then continue. Never fall back to a simulator without asking.

Create the run folder (`RUN` below): `./app-critique/<app-slug>-<YYYYMMDD-HHMM>/`, inside the folder Claude Code is running in, and write the answers above to `RUN/brief.md`, naming the secret, never the credentials. Layout is in [references/capture.md](references/capture.md).

### 1. Explore: map, use and probe in one pass (one explorer agent)

Dispatch one `general-purpose` agent in the background with the explorer prompt in [references/agents.md](references/agents.md). It walks the app breadth first from launch and finishes each page while it is standing on it, so no page is walked to twice:

1. **Capture** the page at rest with `scripts/capture.sh` (screenshot, tree and layout in one call) and add its row to `navmap.md`.
2. **Use the page.** A screenshot at rest shows maybe a third of it; the rest hides behind controls: sheets, menus, popovers, long-press menus, swipe actions, expandable sections, pickers, tooltips, and the states that only appear after acting (loading, results, success, error, empty). Build a control ledger of every pressable and operate each one (within the off-limits list). Every surface that opens is captured as a state and probed like a page of its own. A surface whose tree matches one already probed elsewhere is only diffed and screenshotted. See "Use the page" in [references/capture.md](references/capture.md).
3. **Run the behaviour probes** that fit the page type and each surface: back, scroll, keyboard, validation, loading, empty, background and resume, double tap, pull to refresh, press feedback, scroll indicators, optional passes.
4. **Time it.** Measure the page open, back, every sheet and every allowed core action (3 runs each), plus cold start (3 launches, timed once per run, before any other timing), as in "Timing probes" in capture.md. On an iOS simulator or Android, also record the key transitions on video and turn them into frames and a change timeline with `scripts/frames.sh`.
5. **Reproduce before leaving.** Every behaviour that looks wrong (a tap that does nothing, a lost input, a wrong result) is tried a second time on the spot and recorded as `repro 2/2` or `repro 1/2`. An intermittent result is evidence too.
6. Writes `ledger.md`, `probes.md`, `timings.md` and `states/`, then touches `pages/NN-<slug>/DONE`. A page is not done while its ledger has an untried row without a reason.

When the cap is reached or the app is exhausted, it writes `RUN/EXPLORE_DONE`.

Behaviour is half of this review, and speed is part of behaviour. A page that looks perfect but loses the form on back, or hides the submit button under the keyboard, has a worse issue than any spacing problem.

### 2. Critique (pipelined, evidence only)

While the explorer runs, the main thread runs `bash "${CLAUDE_PLUGIN_ROOT}/loops/native-design-critic-loop/scripts/wait-pages.sh" RUN <pages-dispatched>` in the background. Each time it exits, dispatch critics for the newly finished pages and start it again with the new count, until it reports `EXPLORE_DONE`.

- **Page critics**, as pages finish: 2–3 small pages per agent. A page with more than about 20 states gets one critic per surface group instead (for a chat page: composer and attachments; sending and answers; answer actions and sheets; edge replies and navigation). Each gets its page folder, its page type, [references/checklist.md](references/checklist.md) and [references/taxonomy.md](references/taxonomy.md).
- After `EXPLORE_DONE`, in one message: **one consistency critic** for all pages (the same thing should look and behave the same everywhere, theme included: colour per role, corner radius, shadow, borders, fonts, state styles) and **one flow critic** for the navigation map and probes (dead ends, lost state, confusing back stacks, tab behaviour, modals without a way out, flows that take too many steps).

None of them touch the device. Each returns issues in the issue shape from [references/taxonomy.md](references/taxonomy.md), each tagged with a root-cause key.

### 3. Verify and merge

0. **Coverage gate** (main thread). Read every ledger. Any pressable marked untried without a reason, any surface opened but not probed, or any page type whose probes are missing goes back to the explorer before critique results are trusted.
1. **Merge** (one merger agent, prompt in agents.md). Group issues by root-cause key first: the same root problem on five pages is one issue listing five pages. Then judge the `other:` leftovers by hand, calibrate severity against the rubric, not against how sure the critic sounded, and give IDs in final order: `C1…`, `H1…`, `M1…`, `N1…`.
2. **Prove the top issues** (main thread). For every critical and high, re-read the evidence yourself. A behaviour already recorded `repro 2/2` stands on its record; re-probe on the device only the ones at `1/2`, `likely`, or never repeated. Downgrade or drop anything you cannot show in a screenshot, a measurement or a recorded probe.

### 4. Report

**When output appears.** The ranked list is given once, after phase 3, never while issues are still being found: unverified issues and duplicates would otherwise reach the reader. During the run, post one short progress line at the end of each phase and when a batch of critics is dispatched (pages done, states captured, critics finished with their counts), clearly marked as unverified.

Write `report.md` with [references/report.md](references/report.md). Order is fixed and must not change:

1. Severity: **Critical → High → Minor → Nitpick**.
2. Within a severity, the category order in [references/taxonomy.md](references/taxonomy.md).
3. Within a category, the page order of the navigation map.

Reply in chat with the counts table, the critical and high titles, and the report path. Offer to publish it as a shareable page.

## Rules

- **Thoroughness over speed.** Use every control, open every surface, wait for every after-action state. Capture transitions as a burst (straight after the action, mid-way, settled), not only the final screen. A control missing from the accessibility tree is still operated (see capture.md) and is itself an accessibility finding.

- **House rules always apply.** Press feedback on every pressable, no visible scroll indicators, consistent padding across pages, alignment (always high severity), a consistent theme (one value per colour role, corner radius, shadow, border, font and state style), and a clear text hierarchy. They are defined in [references/taxonomy.md](references/taxonomy.md#house-rules) and checked on every page.

- **Evidence or it did not happen.** Every issue names its page, its screenshot file and, for layout findings, the measured numbers.
- **The user's view only.** No architecture, no component names, no code. "The Save button sits under the keyboard", not "KeyboardAvoidingView is missing".
- **Compare against platform expectations.** iOS Human Interface Guidelines on iPhone, Material Design on Android. Where they differ, judge each platform by its own (back gesture, navigation bar, sheet behaviour, type scale).
- **Do not invent states.** If you could not reach an error or empty state, say "not reached" in the coverage section; do not imagine what it looks like.
- **Every file stays in the run folder.** The report, screenshots, trees, recordings, findings, verification shots, helper scripts and temporary files all go under `./app-critique/<run>/` in the folder Claude Code is running in. Nothing goes to the home folder, `/tmp` or a scratchpad. A tool that saves a screenshot elsewhere has its file copied into the run folder at once, so the report links only to files inside it.
- **Leave the app as you found it.** Reset dark mode, text size and orientation after optional passes. Log out only if you logged in.
- **Stop and ask** before any action on the off-limits list, before entering personal data, and if the app shows real customer data you were not expecting.
- **Personal content stays private.** System pickers (photos, files, contacts) show the owner's own content: crop or skip those screenshots and never describe what is in them.
- Session end: `stop-all-simulator-servers` with `devices: [<udid>]` for the device you used only.

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
