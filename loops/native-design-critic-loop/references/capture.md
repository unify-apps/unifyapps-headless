# Capture and probes

## Contents

- [Run folder](#run-folder)
- [Device facts (once, into device.md)](#device-facts-once-into-devicemd)
- [Base capture per page](#base-capture-per-page)
- [Use the page](#use-the-page)
- [Behaviour probes](#behaviour-probes)
- [Timing probes](#timing-probes)
- [Recording pass (iOS simulator and Android only)](#recording-pass-ios-simulator-and-android-only)
- [Measurements](#measurements)

## Run folder

```
./app-critique/<app-slug>-<YYYYMMDD-HHMM>/      (inside the folder Claude Code is running in)
  brief.md            answers from the brief: app, device, account secret name, scope, off-limits, passes
  device.md           platform, model, OS, screen size in pt/dp, scale, safe areas
  navmap.md           every page, how to reach it, page type, parent, notes
  EXPLORE_DONE        written by the explorer when no page is left; ends the critic pipeline
  pages/
    01-<slug>/
      screen.png      base screenshot, full resolution
      screen.txt      the describe tree for screen.png, verbatim
      layout.json     output of scripts/layout.mjs
      scroll-1.png …  one per scroll step until the end of the page
      ledger.md       every pressable and what operating it did
      probes.md       explorer's record: probe, steps, result, repro, screenshot file
      probe-*.png     a screenshot for every probe result
      timings.md      measured times for this page's opens and actions (see Timing probes)
      recording-*.mp4 simulator and Android only: video of the page's key transitions
      frames-*/       frames and change timeline from scripts/frames.sh
      states/         every surface and after-action state, .png + .txt
      DONE            empty marker: the page is final and a critic may start on it
  timings.md          app-wide timing table: cold start, every page open, every core action
  findings/           one file per critic, raw
  merged.md           merger output: deduped, ranked, numbered
  report.md           final report
```

## Device facts (once, into device.md)

- **Screen size in points or dp.** Take the screenshot's pixel size (`node scripts/contrast.mjs <png> --info`) and divide by the scale:
  - iOS: scale 3 on current iPhones (2 on SE and older models).
  - Android: scale is `density / 160`, from `adb -s <serial> shell wm density`.
- **Safe areas.**
  - iPhone with Dynamic Island: top about 62 pt, bottom 34 pt.
  - Android: read the status bar and navigation bar from the tree when they appear.
- **Timing resolution.** On a page that is not changing, run `await-screen-idle` with `pollIntervalMs: 100, minStableMs: 500`. Its `waitedMs / polls` is the cost of one tree read on this device; write it to device.md as the timing resolution. No time closer to a threshold than this resolution may be reported as a failure.
- **Recording.** Note whether `screen-recording-start` works on this target (iOS simulator and Android: yes; physical iPhone: no).

## Base capture per page

1. Wait for the page to settle: `await-screen-idle`, or `await-ui-element` for a known element.
2. Run `scripts/capture.sh --udid <id> --out pages/NN-<slug>/screen --screen <W>x<H> --platform ios|android --layout`. One call saves `screen.png` at full resolution, `screen.txt` (the describe tree, verbatim) and `layout.json`. `--screen` is in points or dp from device.md, never pixels.
   - Look at a downscaled shot (default scale) only when you need to decide where to go next.
3. If the page scrolls, swipe momentum-free (`momentum: false`; older argent called it `settle: true`) until the content stops changing. Save each step with `capture.sh --out pages/NN-<slug>/scroll-N`, which writes `scroll-N.png` and its tree `scroll-N.txt`.
4. Add a line to `navmap.md`:

   `NN | slug | page type | reached by | parent | notes`

**Page types:** auth, onboarding, home, list, detail, form, search, settings, profile, chat, media, checkout, sheet, dialog, tabs-shell, empty, error, webview, other.

**Exploring the app:**
- Go breadth first.
- Treat a page reached two ways as one page, and note both routes.
- Do not open every row of a list. One detail page per list is enough unless the rows lead to different kinds of pages.
- Stop at the page cap and list what was left unvisited.

## Use the page

**Control ledger.** Before probing, list every pressable on the page in `pages/NN-<slug>/ledger.md`:

`| control | where | in tree? | action taken | result (state NN or "nothing") | off limits? |`

Sources: every interactive element in screen.txt, plus every control visible on the screenshot that the tree misses (icons, chevrons, avatars, chips, cards). Add new rows for controls found inside each surface you open. Done means no row left untried without a reason.

**Operate every control** and capture each resulting state into `states/NN-<state>.png` and `.txt` with `capture.sh --out pages/NN-<slug>/states/NN-<state>`:
- tap; long-press (about 600 ms) on rows, bubbles, cards and text; swipe left and right on list rows; expand and collapse every chevron or "show more";
- open every sheet, menu, picker, popover and dialog; inside it, operate its own controls, type into its inputs, then close it every way the platform allows (swipe down, tap outside, close button, Android back) and reopen to see if input was kept;
- perform the core action when the brief allows (send the message, apply the filter, add the item) and stay for every after-action state: in-progress, streaming, thoughts or reasoning, result, actions on the result, error, empty;
- repeat the core action with edge input: very long, multi-line, gibberish, a query with no answer, an empty submit, a double submit, a second action while the first is still running, backgrounding mid-action.

**Bursts for transitions.** Straight after any action that changes the screen, run `capture.sh --burst 0,1,3 --out .../states/NN-<state>`: small frames at 0, 1 and 3 s, then the settled full-resolution frame and tree, in one call. Add more seconds for slow states (streaming, uploads). Fast burst frames may be the small screenshot an action returns; the settled frame of every state must be a full-resolution capture. A critic marks any finding that rests only on a small frame as `likely`. Record time to first feedback and time to final state. A blank, a jump or a flash between them is evidence.

**Surfaces seen before.** The same sheet or menu often opens from several places. When a surface opens, compare its tree with the ones already probed (`diff` the two `.txt` files). Same labels and frames within about 1 pt: screenshot it, write "same as <path>" in the ledger, and do not probe it again. Any difference (a missing option, other spacing, kept or lost input): probe it fully, because that difference is the finding.

**Reproduce before leaving.** Every behaviour that looks wrong (a tap that does nothing, lost input, a wrong or stale result, a control that changes meaning) is tried a second time on the spot, the same way, and recorded in probes.md as `repro 2/2` or `repro 1/2`. An intermittent result is evidence too; write down what differed between the tries. This replaces most re-probing after critique.

**Finish the page.** When the ledger has no untried row without a reason and every probe for the page type is recorded, touch `pages/NN-<slug>/DONE`. Never touch DONE early: a critic starts on the page as soon as it exists.

**Controls missing from the tree.** Tap coordinates come from the tree. When a control is visible but absent from it, locate its centre on the full-resolution screenshot (pixel x / width, y / height), tap it, and verify on the returned screenshot that the intended thing happened. Log it as "pixel-located" in the ledger; two misses means stop on that control. Its absence from the tree is an accessibility finding in its own right.

## Behaviour probes

Run the probes that fit the page type. Record every probe in `probes.md`:

`| probe | steps | expected | actual | repro | screenshot |`

The explorer records what happens. It does not judge severity.

| Probe | Applies to | How |
|---|---|---|
| Back | every page | iOS: swipe from the left edge (`gesture-swipe` from x 0.0 to 0.6). Android: `button back`. Expect the parent page, with scroll position and inputs kept. |
| Back with unsaved input | form | Type into two fields, then go back. Is there a warning? Is the input kept when you return? |
| Scroll end | any scrolling page | Is the last item fully visible above the tab bar, home indicator or bottom button? Do headers stick sensibly? |
| Keyboard | every text input | Tap each input and take a screenshot with the keyboard up. Is the focused field visible? Is the submit button reachable, or can you scroll to it? Check the keyboard type. Does return/Next move to the next field? Does tapping outside or scrolling dismiss the keyboard? |
| Empty submit | form | Submit with nothing filled in. Where do the errors appear? Are they clear? Is the input kept? |
| Invalid input | form | Enter a wrong email, a too-short password, or letters in a number field. Is the message timely and clear? |
| Loading | pages that fetch | Take a screenshot straight after navigating, before waiting for idle. Look for a blank screen, flash or layout shift. |
| Empty state | list, search | Search for nonsense like `zzqxv`, or open a filter that has no results. |
| Pull to refresh | list, home | Swipe down from the top. Is there an indicator, and does the list update? |
| Double tap | safe primary buttons only | Tap twice quickly. Does it open twice, or submit twice? Never do this on off-limits actions. |
| Background and resume | forms, long flows | `button home`, wait 5 s, launch the app again. Are you still where you were, with your input? |
| Tab memory | tabs-shell | Scroll down in tab A, switch to tab B and back. Is the position kept? |
| Sheet and dialog exit | sheet, dialog | Can it be closed by swipe down, a close button, tapping outside, and back (Android)? |
| Press feedback | every pressable on the page, including off-limits ones | Press without triggering: `gesture-custom` with `Down` on the element, hold about 400 ms, take a screenshot while still held, then `Move` the finger well off the element before `Up`, which cancels the tap. Save `probe-press-<element>.png` and compare with `screen.png` (`screenshot-diff`). If the tool cannot hold a press across a screenshot, on Android use `adb shell input motionevent DOWN x y`, `screencap`, `motionevent MOVE` off, `motionevent UP`; otherwise record "not measurable". On a physical iPhone argent cannot hold a press across a screenshot (tools run one at a time, gesture-custom is press-and-release), so this probe needs the simulator or Android; say so in the coverage section. Record feedback seen: highlight, dim, ripple and its colour, or none. |
| Scroll indicators | every scrollable: page, list, sheet, carousel, multi-line text | Drag with the finger kept down (`gesture-custom` `Down`, `Move` a third of the screen, screenshot, `Up`), so the indicator cannot fade before capture. Save `probe-scrollbar-<area>.png`. Record whether a bar is visible and where. The describe tree always lists scroll bars, so it is not evidence; the screenshot is. On a physical iPhone, use the screenshot an interaction tool returns straight after a swipe instead (bars are still fading in it). |
| Long content | detail, list | Look for long names or values. Are they truncated, wrapped, or overflowing? |

**Optional passes** (only if chosen in the brief; reset each one afterwards):

| Pass | iOS simulator | Android | Physical iPhone |
|---|---|---|---|
| Dark mode | `xcrun simctl ui <udid> appearance dark` | `adb shell cmd uimode night yes` | Ask the user to switch |
| Large text | `xcrun simctl ui <udid> content_size accessibility-extra-large` | `adb shell settings put system font_scale 1.5` | Ask the user to switch |
| Landscape | `rotate` | `rotate` | Not available |

In each pass, re-capture only the main pages (home, one list, one detail, one form) as `pass-dark-*.png` and `pass-large-*.png`.

## Timing probes

Speed is part of the experience. Argent sees the screen only when asked, so every time is measured from outside: a tap's timestamp, then tools that wait for the screen. Put the steps of one measurement in a single `run-sequence` with `delayMs: 0` on the tap, so nothing waits on a round trip in between.

**One measurement, three numbers:**

| Number | How | Meaning |
|---|---|---|
| first feedback | `await-ui-element` `hidden` on an element of the current page, or `visible` on a spinner, pressed state or new sheet | the user sees that the tap registered |
| first content | `await-ui-element` `visible` on text that only the destination has (a title, the first row, the answer's first words) | the page or result is usable |
| settled | `await-screen-idle` with `minStableMs: 500` right after | late content, layout shifts and skeleton swaps have stopped |

Use `pollIntervalMs: 100` and a `timeoutMs` long enough for the slowest case (30000 for answers and uploads). For a streaming result, settled is the end marker (the stop button turns back, a copy or action row appears), not screen idle. Wait on text, not on controls, when the app leaves controls out of the tree.

**What to time, on every run:**
- **Cold start:** launch to first real content, 3 launches, timed once per run before any other timing. Android: `adb shell am start -W` gives the system's own time. iOS: `restart-app`, then `await-ui-element` on the first content; the tool round trip is included, so report it as "at most".
- **Every page open** in the navmap, by its main route, and back to its parent.
- **Every sheet and menu** open and close.
- **Every core action** the brief allows (send, search, filter, save draft, add item): 3 times, plus once while the previous one is still running.
- **Background and resume:** time from relaunch to the same screen, content included.
- **Pull to refresh and load more**, where they exist.

Write each to `pages/NN-<slug>/timings.md`:

`| action | from → to | first feedback | first content | settled | runs (ms) | end marker | notes |`

and add the page's lines to the run's `timings.md`. Round to 0.1 s. Record what the screen showed while waiting (nothing, spinner, skeleton, progress text), because a 3 s wait with progress feels very different from 3 s of nothing. A timeout is a result too: write "never within <timeout>".

## Recording pass (iOS simulator and Android only)

A video catches what single frames miss: flashes, blanks, jumps and frame-level timing. On targets that support it, for every page's key transitions (open, back, each sheet, the core action, a long scroll):

1. `screen-recording-start`, perform the transition, wait until settled, `screen-recording-stop`; save as `pages/NN-<slug>/recording-<transition>.mp4`.
2. Run `scripts/frames.sh <video> pages/NN-<slug>/frames-<transition>` (10 frames a second, plus `changes.txt`, a timeline of every visible change).
3. In `timings.md`, record from the video: time to the first change after the tap, the last change (settled), and any spike that reverts within 0.5 s (a flash or blank). Copy the frames that show a problem into `states/`.

On a physical iPhone this pass does not exist: say so in coverage, and rely on the timing probes and bursts. `frames.sh` needs `ffmpeg`; without it, skip this pass, say so in coverage, and rely on the same probes.

## Measurements

- `scripts/layout.mjs` turns a describe tree (`screen.txt`) into points and flags signals:
  - small targets;
  - unlabeled controls;
  - near-miss left edges;
  - the dominant left and right page margins;
  - the type ramp: distinct text line heights in pt, with the texts at each size (line height is about 1.2 × font size, so read it as a ranking, not an exact size);
  - uneven gaps;
  - elements inside the unsafe edges.
- Signals are leads, not issues. A critic confirms each one on the screenshot before raising it.
- `scripts/contrast.mjs <png> x y w h` reports the background colour, the strongest foreground colour and the contrast ratio inside a normalized box. Take the box from the element's frame in the tree.
- WCAG minimums:
  - normal text 4.5:1;
  - large text (18 pt regular or 14 pt bold and up) 3:1;
  - icons and control borders 3:1.
