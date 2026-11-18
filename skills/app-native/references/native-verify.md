# native-verify — the device loop, on request

## Contents
- Pre-flight — fixed, first whenever the loop runs
- Discovery cheatsheet — which tool locates a tap
- The block check table
- Trap coverage — every device-verified trap has a check
- Flow / journey — the page works as one chain
- Visual — does it look right (agent self-judges)
- What stays manual
- Manual-checklist fallback template

The procedure for proving a native page you just wrote actually works on the phone.
It runs when the person asked for the phone or the plan's Proof row names a screen —
the default proof of a native write is the read-back (`app-verify`), and a page
nobody asked to see on a device is recorded `device: not requested`. Once it runs,
it runs whole. It runs on the app's saved draft in the UnifyApps Preview app, so
a change is checked before it is published (the app itself must have been
published once). This file is **procedure, not new facts** — every check restates a
`[DEVICE-VERIFIED]` line from a block sheet (`get_app_builder_knowledge` on the native block)
onto an action, and what the Preview app itself does is marked `[DERIVED from
the mobile renderer]`. When a sheet and the `app-native` rules disagree, the rules
win (`app-native` § Sheets on a native target); fix this file to match them.

## Pre-flight — fixed, first whenever the loop runs

1. **Open the draft in the UnifyApps Preview app. The change needs no publish.** The
   Preview app runs the app's saved draft. A client's own store build runs only the
   published version, so it cannot show a change that is not published yet. The app
   must have been published once: the Preview app reads the published copy too, and
   refuses an app never published ("The tenant may have never published…"). Such an
   app opens only from the builder's QR with "Use current login session" on.
   - **On a simulator or emulator,** run
     `node "${CLAUDE_PLUGIN_ROOT}/skills/app-native/scripts/preview.mjs" open <app id or builder URL>`.
     It asks the tenant for the app's Preview link (`get_preview_link`, or
     `derive_matrix_url` on a tenant without it), checks with `list_interface_versions`
     that the app has been published, prints the link, and opens it in the Preview app
     on the booted device that has it. For an app never published it stops before
     opening and says so; when the check itself fails it says that and opens anyway.
     `link` in place of `open` only prints the link, with the same warning. Pass
     `--device ios|android|<id>` when several have it, and `--package <app id>` for an Android
     Preview build other than the store one; `open` alone picks the store build first. On iOS, with several Preview apps installed, iOS picks which
     one takes the link. The app then asks "Choose a
     version to open": tap **Draft** (with a device driver, `describe`, then tap the Draft
     card). It runs on the app's own runtime address ([native.md](native.md) rule 52) and
     asks for the tenant's sign-in the first time. A link to the app already open is
     ignored: to move between Published and Draft, open the debug sheet, choose **Exit
     Application**, and open the link again. Exit Application wipes the Preview app back
     to a fresh install, sign-in included, so the link asks for the sign-in again. Another
     app's link signs the open one out. [DERIVED from the mobile renderer]
   - **On a phone,** the person scans the builder's Preview QR code, or pastes its "Copy
     preview link" into the app's link field. With "Use current login session" off the
     app behaves as above: pick **Draft**; its card says when it was last edited. With it
     on, the app runs against the builder, signed in as the person who made the QR, with no
     login page, and always opens the draft. Push notifications are off there, and a public
     app behaves as a private one.

   The builder's preview link carries the person's live sign-in, so it never goes into a
   report, a file or chat; the script's link carries no sign-in. Before you check anything,
   confirm the version: the Preview app's debug sheet (the lower half of the floating pill,
   below, or shake the device) shows **Draft** or **Published** and the app's version as
   `v<n>` in its header. [DERIVED from the mobile renderer]
2. **Refresh page config before you look. Foregrounding NEVER refetches it** — the single most
   common false "it works." A backgrounded app keeps the stale page; you will verify the old
   build and report a pass on a bug. Every Preview build draws a **floating pill**, small, dark
   and translucent, at a screen corner (bottom right until someone drags it; it stays where it
   was dropped). Its **upper half** reloads the app, which fetches the latest saved draft before
   it draws anything and then comes back to the page you were on; its **lower half** opens the
   debug sheet. A relaunch fetches the draft too, but lands on the app's start page. Refresh
   every time before you look,
   and after every builder save: the draft you opened is the one saved when it loaded. Offline,
   the reload silently draws the copy the app already had, so a refresh that shows no change
   is no proof the save is missing until the device is known to be online. A client's own
   release build has no pill. [DERIVED from the mobile renderer]
3. **Launch the app, then navigate to the exact page you wrote** (deep link or in-app nav).
   Confirm you are on that page, not a cached sibling.
   **First deep link into a given simulator needs one tap.** iOS asks
   "Open in “UnifyApps Preview”?" the first time a scheme is routed on that sim and
   command-line launch cannot answer it. Use `describe`, `gesture-tap` the
   `AXButton "Open"`, then relaunch through the device driver. iOS
   records the answer (`com.apple.launchservices.schemeapproval.plist`), so it is one
   tap per simulator, ever. [DEVICE-VERIFIED on the iOS simulator]
4. **Branch on the device driver before touching anything else.** `native-setup` installs one (argent, with a pool of iOS 18 simulators reserved through
   the `native-device-pool` block); a person may also have another installed.
   - **Device driver present** — your tool list has an emulator or simulator
     driver: launch, a discovery call (`describe` or similar), `screenshot`, tap,
     and a reload (step 2). Run the checks below on the simulator you launched in
     step 3, and report each as pass/fail **with evidence** (the element that took
     the tap, the value that changed on screen, the screenshot).
   - **No device driver** — do NOT claim the page works. Print the manual
     fallback template (bottom of this file) and hand it to the user. Verify
     only what you can observe.

## Discovery cheatsheet — which tool locates a tap

- **`describe`** (accessibility tree) is the tap locator: it reports app-level AX elements with
  frames. Find the Pressable / Button / row element, tap its center. It is also the only way to
  frame a bottom sheet (below).
- **`screenshot`** is required for every *visual* claim (something rendered, a gap drew, a style
  applied), for reading geometry the tree gets wrong, and for reading a value the page shows.
- **Bottom-sheet AX black hole:** the sheet interior is invisible to the tree. `describe` shows
  exactly one `AXGroup "Bottom Sheet"`, with nothing inside it, whose **frame is accurate**.
  Recipe: anchor on that frame, read the child control positions off a **screenshot**, and
  `gesture-tap` by geometry. There is no
  reliable element tree inside — geometry taps are the ceiling.
- **Scrolled-row caveat:** AX `describe` reports a scrolled list's rows at their **unscrolled**
  positions. After any scroll, take coordinates from the **screenshot**, never from the tree.

## The block check table

Derive your check set from the blocks the page actually uses: for each placed block, run its
"what to verify" via the "how." Tool-agnostic column states the observable claim; the driver column
names the calls as one common driver exposes them; map them to your driver's equivalents.

| Block | What to verify | How (tool-agnostic) | driver-specific note |
|---|---|---|---|
| **Pressable** | `onPress` fires; the Pressable is the tap target, not a dead Stack/Icon under it | Locate the Pressable node, tap its center, assert the press chain's effect (nav, var, sheet) happened — not the builder preview | `describe` → `gesture-tap` its frame center → `screenshot` to confirm. A red CTA rendering transparent = bare-hex `backgroundColor` (write `{"custom":"#..."}`), caught on screenshot. |
| **Repeatable** | list scrolls to the last row; each row's root is a Pressable whose `onPress` takes the tap, shows press feedback and reads the row as `['context']['item']`; gap/separator/inset renders; not mounted at height 0 | Screenshot shows rows + gap; swipe to reach the last row; press and hold a row and screenshot the feedback, then tap it and assert its `onPress` effect ran with THAT row's data (the sheet or page shows that row). Feed dummy data if datasource-bound (cold list may not paint) | `describe` for a row → `gesture-tap` → assert via `screenshot`. AX reports scrolled rows at **unscrolled** positions — use the **screenshot**. Re-test on long/heavy lists (scroll dies partway). A `"12px"` gap string renders no gap — screenshot the band. |
| **BottomSheet** | opens via `controlDrawer show` (not `controlBottomSheet` / `controlBlockMethod open`); reachable (id in a parent's `blockIds`); shows the row you triggered from, not the previous one; closes on backdrop tap; interior takes taps at the chosen px height | Trigger the opener; screenshot the open sheet; confirm the shown data matches the source row; tap an interior control **by geometry**, assert its effect; tap backdrop, assert closed | Interior is an AX/discovery black hole — `describe` gives one `AXGroup "Bottom Sheet"` with nothing inside it and an **accurate frame**. Anchor on it, read child positions off the **screenshot**, `gesture-tap` by geometry. At the ~61.8% default height paint and hit-test disagree (taps fall through, sheet just closes) — verify an explicit px height. |
| **TextInput / TextArea** | `onChange` wired — typed text lands in the bound var, not just "accepts typing"; a TextArea inside a BottomSheet takes typing, but its `focusTextArea` does nothing there | Focus, type, then read back the bound page var / form draft and assert it holds the text; in a sheet, focus the TextArea with a tap, never by its `focusTextArea` | `gesture-tap` the field → `keyboard`/`paste` → read the value back on a screen that shows the var (submit, or reopen it) and `screenshot` it to assert. Typing that "looks accepted" is not proof. |
| **Form** | inputs submit into the draft; datasource prefill populated; long form scrolls to the LAST field | Fill fields, submit, assert the payload; for prefill open the form and screenshot the seeded values; scroll manually to the last field (no scroll-to-first-error on native) | `describe` for field nodes → `gesture-tap`+`keyboard` → submit, then assert the saved values where the page shows them (`screenshot`). Verify prefill on device, don't assume it. Submit-inside-a-sheet has frozen Android — test on Android. |
| **SingleSelect** | selecting an option commits the bound var; inside a sheet on the raw path it is broken | Open it, pick an option, assert the bound var took the value | `gesture-tap` to open → tap option → assert var. **Inside a BottomSheet (raw-path) the options sheet dismisses without selecting** — if so, flag it and fall back to Pressable option rows. |
| **Card / StatCard** | `onClick` fires as a whole-card tap target | Tap card center, assert nav/effect | `gesture-tap` the card frame from `describe`. One of four confirmed-tappable blocks — if dead, the "card" is a styled Stack; wrap it in a Pressable. |
| **Button** | `onClick` chain fires on the phone (web-preview success does NOT carry over); secondary/`soft` style renders | Tap the button, assert the full chain ran; screenshot to confirm it is not bare text | `gesture-tap` → assert effect. `variant:"soft"` renders as **bare text** — screenshot to confirm an outline button drew its border. Chains that pass in web preview frequently no-op on native. |
| **IconButton** | `onClick` fires (unlike a bare `Icon`, which is dead) | Locate node, tap, assert effect | `describe` → `gesture-tap`. If the tap does nothing, confirm it is an IconButton and not a decorative `Icon` (`Icon.onClick` is dead). |
| **Tabs** | tab bar renders on device; tab switch changes content; bar scrolls if overflowing; labels truncate to one line | Tap each tab, screenshot each panel | `describe` for tab nodes → `gesture-tap` → screenshot per tab. The whole tab header has gone missing on device while fine in web preview — screenshot to confirm the bar drew. Most shipped tabs are the Pressable+var pattern; verify that if used. |
| **Scrollable** | the region actually scrolls to its last child; bounded height (not collapsed to 0) | Swipe inside the region, confirm content moves and reaches the end | Screenshot before/after a `gesture-swipe`. If two scroll views fight, the page has two scroll owners on one axis — keep one. Use the one-item Repeatable host only when `create_block` refused the Scrollable. |
| **Iframe (WebView)** | loads without hard-crash; sized explicitly; never a `data:` URI | Navigate to the page, `await-screen-idle {udid, timeoutMs: 10000}` → `settled: true`, then screenshot (it paints solid white while loading — a settle, never a `sleep`) | Screenshot after the settle. A "blocked By CSP" banner is a **mislabeled generic error** (native has no CSP) — read it as a load failure, not a policy block. |
| **MobileContextualDialog** | opens ONLY via the trigger slot press (Show/Hide/Toggle actions are dead); the trigger actually lays out; popover options fire | Tap the trigger, screenshot the floated popover, tap an option by geometry and assert its chain; do NOT expect any action-chain open to work | `gesture-tap` the trigger node from `describe` → screenshot → `gesture-tap` an option. Registered on native but not yet checked on a device — treat as **UNCONFIRMED**, and prefer a BottomSheet when a sheet will do. Popover never appears → suspect a zero-size / off-screen trigger. |
| **SwipeableStack** | the deck renders with an explicit height (no zero-height flash); `OnSwipeItem` carries the decision; the `swipeLeft/Right` control methods are DEAD | Screenshot the rest state; a real commit fling is a human test — never build approve/reject on the dead control methods | Screenshot the mounted deck. Scripting a reliable commit fling (>150px OR velocity >1000) is brittle — record the rest state and hand the swipe to a human. Probe `OnSwipeItem` (e.g. `showNotification`) only if you can land a commit. |
| **Stack** *(negative — trap)* | taps must NOT work — `Stack.onClick` is dead on native. A tap "working" here means something else caught it | Locate the styled Stack, tap it, assert **nothing** happens (no nav, no var change). If it responds, a Pressable/Card is really underneath — find the real target | `get_page_outlines` to confirm the block is a Stack (not a Pressable) → `gesture-tap` its frame from `describe` or the screenshot → assert no effect. A tappable-looking Stack with border/radius and zero events is the dominant mock-control bug — wrap it in a Pressable, then re-verify the wrapper fires. |

**Any other block** (StepperV2, Drawer, DatePicker, Image, FlippableCard, Signature, Camera,
QRCode, Container, Typography, Icon, …): no full row here — **derive its check from that block's
sheet's `[DEVICE-VERIFIED]` lines** using the same pattern (what does the sheet say breaks →
what would prove it works → which discovery tool locates it → screenshot the visual claim).

## Trap coverage — every device-verified trap has a check

Self-review gate: each of the 12 traps below (the ones that look right in the builder and
break on the phone) must be reachable by a row above. If you add a trap to a sheet, add its
check here.

- 1 Row tap wiring (`onPress` on a Pressable at the row's root, not `Repeatable.onSelectItem`, which shows no feedback, and not `Stack`/`Icon`) → **Pressable, Repeatable, Stack**
- 2 Sheet open = `controlDrawer show`, not `controlBottomSheet` / `controlBlockMethod open` → **BottomSheet**
- 3 Var-before-show ordering (sheet shows the source row, not the previous one) → **BottomSheet**
- 4 Editors at page level, not inline in a Repeatable row → **Repeatable, Form**
- 5 Picker inside a sheet — SingleSelect raw-path broken, use Pressable rows → **SingleSelect, BottomSheet**
- 6 Inside a BottomSheet a `TextArea` takes typing, but `focusTextArea` does nothing → **TextInput / TextArea, BottomSheet**
- 7 `TextInput.onChange` wired — typed text is captured → **TextInput**
- 8 Row binding grammar `b_<rep>['context']['item']`, not `currentItem` → **Repeatable**
- 9 Explicit sheet height (px form), not `"MEDIUM"` / no height → **BottomSheet**
- 10 Numeric style values as numbers/tokens, not `"12px"` in customStyles (gap renders) → **Repeatable** (gap-band screenshot)
- 11 Scroll ownership — the body never scrolls; one Scrollable / scrollable Repeatable owns tall content → **Scrollable, Repeatable**
- 12 Sheet reachability — parented to root AND referenced in a parent's `blockIds` → **BottomSheet**

## Flow / journey — the page works as one chain

The block table proves each control works in isolation; this proves the intended **path** works
end to end on the page you wrote. Derive the journey from what you built — a Repeatable + a
row-keyed BottomSheet + a save action IS a journey — and walk it as one chain: tap a row → the
sheet opens showing THAT row → change a value → save → the sheet closes and the row reflects the
change. The pass criterion is the **end state** (the row/list actually changed), not that each
tap "did something." A chain that is one silent write (e.g. Save = only a MERGE, no visible
advance) reads as broken here even though every tap fired — diagnose by tapping through, closing
the sheet, and looking at the row.

- **How:** run the per-block taps in sequence (`gesture-tap` at each step from the discovery
  tool), then assert the final observable — the changed row on screen (`screenshot`), or the
  bound var where the page shows it.
- Single page only. Cross-page / deep-link / `pageInputs` journeys stay manual (below) — you
  verify the page you wrote, not the whole navigation graph.

## Visual — does it look right (agent self-judges)

Beyond "it works," judge the look from the screenshot — do not default to handing this to a
human. Run **both** signals, whichever inputs exist:

- **Figma compare** (when the page was built from a source frame — the initial build always has
  one). Put the device `screenshot` beside the Figma frame and flag divergence: layout, spacing,
  color, wrong/missing/extra elements, wrong text or order. The design is the answer key, so this
  is gradeable, not taste. (Figma centers against the full frame while native centers below the
  header — a ~58pt "off-center" in a side-by-side is usually NOT a bug.)
- **Defect rubric** (always, no design needed) — grade the `screenshot`, PASS/FAIL each:
  1 text truncated / overflowing / clipped · 2 a block collapsed to ~zero height
  (`List height is 0`) · 3 an invisible element — white-on-white (the classic
  linear-gradient / `backgroundColor`-hidden header) · 4 columns touching (gap → 0) or
  overlapping · 5 an element off-screen or under fixed chrome · 6 a missing image that collapsed
  its parent · 7 broken safe area (content under the notch, or a bottom dead band) · 8 a
  blown-out row (`minWidth:0` miss) · 9 a red `cssToNativeStyles` toast / LogBox in frame.

**Do not flag environment artifacts as design bugs** (known, not the page's fault): an
Iframe/WebView paints white for ~2s — wait (`await-screen-idle`), then shoot; external image
hosts blocked by the corp proxy render nothing (a trust-store artifact, not a design choice);
font substitution and simulator chrome. The Preview app's **floating pill** (pre-flight step 2)
is in every screenshot: it belongs to the Preview app, not the page, so never grade it, and
drag it to another corner when it covers what you check. A page draws its header region at
once but its body and footer only after the screen's interactions end
(`InteractionManager.runAfterInteractions`, then an idle callback), so a frame taken the
moment a page opens can show an empty body: that is the runtime, not a collapsed block. Shoot
after the page settles. [DERIVED from the mobile renderer]
Wait/retest before calling a defect. Aesthetic / brand
polish stays a human's optional final look — it never blocks a functional pass.

## What stays manual

Verify only what you can **observe and assert** on the page you just wrote. Never claim an
un-observed pass. Surface each of these as a labeled manual step, never a silent skip:

- **Per-client gated blocks** (Camera family via `EXPO_PUBLIC_DISABLE_CAMERA`, `DISABLE_BLOCK_*`,
  `DISABLE_BLOCK_TABS`). Whether a gated block ships is a per-client build-flag fact, invisible
  from the generic emulator build. Ask the human which client build is targeted.
- **Physical-gesture feel** — SwipeableStack commit fling, FlippableCard flip, pull-to-refresh,
  drag. Reliable velocity/multi-touch scripting is brittle; screenshot the rest state and ask
  the user to perform the gesture.
- **Real-hardware behaviors** — keyboard avoidance, notch/safe-area insets, long-list scroll
  dying partway on heavy screens. Emulator geometry approximates a phone, it does not equal one.
  Flag for a human pass on real Android.
- **Bottom-sheet interior state beyond geometry taps.** The interior is a discovery black hole —
  you can tap by geometry and screenshot, but cannot read an element tree inside. Anything
  needing exact interior element state falls to a human reading the screenshot.
- **Cross-page / deep-link / `pageInputs` flows.** A person judges the end-to-end graph. You
  verify the single page you wrote; its inputs are declared with `update_page_contracts`
  ([native.md](native.md) rule 43).
- **The tenant sign-in in the Preview app.** The first open on a device asks for it, and so
  does every open after Exit Application or another app's link, since both sign the app out.
  Typing the person's password is theirs; wait for them, then go on.
- **Everything, when no device driver is present.** Print the fallback below and stop.

## Manual-checklist fallback template

When no device driver is available, hand the user this (fill in the block-specific lines from
the table for the blocks the page uses), with: *"I can't drive a device from here — run these on
your own phone and tell me what fails."*

```
Native page verification — <page name>

Pre-flight:
[ ] Open the draft: in the UnifyApps Preview app, scan the builder's Preview QR (or paste its preview link), or open this link: <the Preview link preview.mjs printed>. Pick Draft. The change needs no publish (the app must have been published once); a client's store build shows only the published version.
[ ] Confirm the version: tap the lower half of the floating pill (the small dark pill at a screen corner). The sheet's header shows Draft. If it shows Published, choose Exit Application there, open the link again and pick Draft; the app asks for the sign-in again.
[ ] Refresh page config: tap the upper half of the floating pill. It loads the latest saved draft and comes back to the same page. Do NOT just re-open the app. Ignore the pill itself in what you report: it is the Preview app's, not the page's.
[ ] Navigate to <page>. Prefer testing on Android.

Per-block (one line per block the page uses — see table):
[ ] Pressable / rows: pressing <row/tile> visibly reacts, and tapping it actually does <nav/opens sheet/sets var>.
[ ] BottomSheet: opens from <trigger>, shows the row you tapped, closes on backdrop, and the
    controls inside it respond; the sheet is sized to a fixed height.
[ ] TextInput: type into <field>, then confirm the value was saved (submit / re-open).
[ ] Form: fill and submit; prefill (if any) shows real data; the LAST field is reachable by scroll.
[ ] SingleSelect: pick an option and confirm it committed (esp. inside a sheet).
[ ] Button / IconButton / Card: tapping runs its action (not just a visual press).
[ ] Tabs: every tab switches content; the bar is visible.
[ ] Scrollable / list: content scrolls to the end without fighting the page.
[ ] Iframe: the web content loads (no blank/white, no crash).
[ ] Swipe/flip decks: perform the gesture and confirm the decision registers.

Report back: which lines failed and what you saw.
```
