# The measurer

Two dumps per viewport. `native-describe-screen` lists the leaf text views and some views with their frame in points on the portrait axes; `describe` (the accessibility service) lists the groups the native dump leaves out — image groups, pressable groups with their label — as a text rendering with frames normalised to the screen. `native-view-at-point` reads up to 15 spec containers (frame, `backgroundColor`, `clipsToBounds`) in viewport 1. All of it works on the Preview app's release build.

Raw files per viewport k: `raw/describe-<k>.json` is the `native-describe-screen` answer, `raw/ax-<k>.json` the `describe` answer (`{description, source: "ax-service"}`; there is no structured tree besides the text), `device-<k>.png` the full-resolution screenshot (1206×2622 on an iPhone 16 Pro through `argent run screenshot --out`). `raw/scroll.json` records what the scroll loop decided; `measure-merge.mjs` reads all of it and can be rerun on a pass folder alone.

## Merging the two dumps

`lib/ax-describe.mjs` parses the description — one `  AXGroup "label"  (x, y, w, h)` per line, `ROOT` skipped, `Mode: flat` today — and converts the frames with the screen size (the printed three decimals give ±0.4pt in y). A line whose frame sits on a native element within 1.5pt on all four sides is that element (`source: "native+describe"`; the native element takes the label when it had none); every other line is its own element with `source: "describe"`; a native element nobody listed twice stays `"native"`. Two describe lines never merge with each other: a group and its only child can share a frame and are still two things. On one welcome page the native dump held the two texts, the parked dev menu and two banners; `describe` added the background photo group, the logo (`AXGroup "Logo"`, 24×86pt, 96×40pt) and the Login/Register pressable group.

## Overlays

`lib/overlays.mjs` classifies every dump; the result goes to `measured.json#overlays[]` and never into `elements[]`, `contentHeight`, the anchors or the gap table:

- `offscreen-sheet`: a full-width non-text element that says sheet by label (`Bottom Sheet`, modal, drawer, dev menu) or trait (`adjustable`), or is parked exactly at a screen edge (y = screen height, or bottom = 0) with members — and its members, the run of elements right after it in dump order whose frames sit inside it. The dumps carry no hierarchy, only tree order, and page content mounted below the fold is listed before the overlay hosts, so it is not swallowed. The Preview app's dev menu is such a sheet: `Bottom Sheet` at y 874 with 13 rows (the app name, Build, Draft, vNNNN, DEV TOOLS, Network … Exit Application).
- `banner`: a LogBox or snackbar whose label starts with its icon and a comma (`!, Open debugger to view warnings.`, `2, TypeError: …`), and the run inside it. The measurer prints `WARN banners on screen: …` so the caller dismisses them through the tree (`await-ui-element`, then the tree's tap point) — never by a blind tap: on 2026-10-11 a blind tap landed on Login/Register because the banner had already gone.

## Scroll plan

Viewport 1 is the scroll top after the fresh config. Its content extent (the lowest bottom edge of the non-overlay elements) decides: at most the screen height plus 4pt → no swipe at all, `scrolled: false`, `stopReason: "fits"`. Otherwise each further viewport follows one swipe `0.5,0.62 → 0.5,0.22` over 450 ms with `momentum: false` and `await-screen-idle` 400 ms. The start is mid-screen on purpose: a swipe from 0.78 opened the dev menu sheet instead of scrolling; never start below 0.7. After each swipe the dumps are taken first, then the screenshot:

- a sheet-like group on screen now that was not on screen before → `WARN accidental sheet: "<label>" …`, `stopReason: "sheet"`, the viewport is dropped and the device is left for the caller to dismiss the sheet through the tree;
- the new screenshot compared with the previous one below the status band (the clock changes): under 0.2% differing rows means the page did not move → the shot is discarded, `stopReason: "no-scroll"` when nothing ever scrolled, `"bottom"` after a real scroll;
- `--max-viewports` (8) → `"max-viewports"`.

`--overlap` is informational. `--reproduce <baseline.json>` nudges each later viewport until the stored anchor sits within 1pt before the shot.

## Offsets

`lib/page-offset.mjs`. Elements are keyed by normalised text, rounded width and height, class name and x; a key that occurs twice in one shot is not an anchor. For consecutive shots every shared key gives Δy = y(k−1) − y(k), clustered in 1.5pt bins. The pixels and the clusters answer in this order:

- **pixels first.** With decodable PNGs (the built-in reader handles 8-bit RGB and RGBA, which is what the simulator writes) a row-luminance correlation over the content band gives `rowsOffset`; banner rows are flattened first so they cannot vote for "nothing moved". `offset` follows it (`offsetMethod: rows`).
- **anchors as the cross-check.** The largest non-zero cluster gives `anchorsOffset`. Within 2pt of the pixels → `rows+anchors`, confidence from the cluster (≥3 members and spread ≤1.5pt `high`; ≥6 and ≤0.5pt `exact`; a smaller cluster leaves it to the correlation score, ≥0.6 → `high`). Every anchor at Δ≈0 while the pixels moved → the tree kept page coordinates: `axStale`, confidence from the score. A different non-zero answer → `low`.
- **anchors alone** when no PNG decodes (`anchors`, confidence from the cluster); neither → the previous delta, else half the screen, `assumed` and `low`. The approval message says re-shoot.

`axShift` is the tree's accumulated lag behind the pixels: the whole offset for a tree that never moves, 0 for one that tracks the scroll. `page.y = window.y − axShift(k) + offset(k)`, so a frame that already is a page coordinate stays one. Pinned elements (Δ≈0 in a step that did move, and the same frame in every earlier shot) keep window coordinates: a header when the element sits in the upper half, a tab bar in the lower half; a still tree pins nothing, so `bands.header` and `bands.tabbar` stay null there and a pinned-bottom region falls back to its default offset. Twins (same key, page y within 3pt) merge into one element with `seenIn: [k…]`, keeping the instance most inside its viewport: viewport-1 geometry is the page's geometry and later dumps only add what was not mounted at load (virtualised rows). `bands.status` is `{0, safeAreaTop}`; `contentHeight` is the lowest page bottom of the page's own elements and containers.

## Native statuses

`native-describe-screen` answers a status instead of elements when devtools are not live; `measure.mjs` uses each recovery once, then exits 5:

| status | recovery |
| --- | --- |
| `restart_required` | `restart-app`, idle, retry |
| `service_stale` | `argent server stop && argent server start --detach`, wait 3 s, retry |
| `connect_pending` | wait 2 s, retry, at most 5 times |
| `init_failed` | report; the simulator needs a reboot (device block) |

`describe` failing is not a stop: the native list stands alone for that viewport and `measure.log` says so.

## Safe area

`device.safeAreaTop` comes from `--safe-area-top`, else a table by simulator name. Only the iPhone 16 Pro value (62pt) was read on a device; the other rows are Apple's published insets and `raw/device.json` records `safeAreaSource: table|guess`.

## Testing without a simulator

`--runner <file.mjs>` (or `LOOPS_FAKE_ARGENT=<file>`) loads a module exporting `runArgent(tool, args)` → `{ok, data, error}` and, for screenshots, `screenshot(udid, file)` that writes a PNG. Such a runner can replay recorded fits, no-scroll, scroll and sheet scenarios and log every call to `LOOPS_FAKE_LOG`, so `measure.mjs` runs without a simulator.

## Confirmed on the device (2026-10-11)

iPhone 16 Pro simulator `0449C53C…`, a UnifyApps Preview build, a welcome page draft; artefacts under `$LOOPS_HOME/runs/experiment-measure-20261011-1730/pixel/`.

1. **`native-describe-screen` lists only leaf text views and some views.** The logo image was not in it; `describe` listed it as `AXGroup "Logo" (0.060, 0.098, 0.239, 0.046)`. Hence the two dumps per viewport, merged by frame.
2. **Off-screen overlays are in the dumps.** The dev menu `Bottom Sheet` group parked at y 874 (= the screen height) with its 13 rows, and two LogBox banners at y 734 and 788 over the page. Hence `overlays[]`, excluded everywhere, and the banner WARN.
3. **A swipe from `fromY 0.78` opened the dev menu instead of scrolling**, and the page's content (bottom edge 798pt) needed no swipe at all. Hence the fits rule, the mid-screen swipe and the pixel-identical and sheet stops.
4. **Everything mounted at load is listed at viewport 1 with its unscrolled position**, the parked sheet's rows included (y 898–1288), so viewport-1 geometry is the page's geometry; later viewports exist for the screenshots and add only what was not mounted at load. Whether a dump taken after a scroll reports page or window coordinates was not separated today (the page did not scroll): the merge measures it per step (`anchorsOffset` against `rowsOffset`) and `axShift` handles both.
5. **`argent run screenshot --out <file>` writes the full-resolution PNG** (1206×2622), nothing enters the context.
6. **`argent run <tool> --json` prints the raw result**, and `describe` carries nothing structured besides `description` (and `source: "ax-service"`).

## Unconfirmed

Each item names the check that settles it; the answers belong above.

- **R2 Text inside Pressable** — partly settled: on Welcome the pressable's `AXGroup` carries the text as its label AND the static text is listed on its own, so the text keeps its frame. The matcher takes a group that repeats a text as its label for the text only when it is text-sized, and prefers the smallest text-kind candidate otherwise.
- **Open sheet in a dump** — the accidental-sheet rule expects the opened sheet's group on screen (`y` below the screen height) under its label or `adjustable` trait; today the opened menu was seen in a screenshot, not in a dump. Check: open the dev menu by hand, run `native-describe-screen`; expect `Bottom Sheet` with y < 874.
- **Below-fold content next to a parked sheet** — the member rule relies on dump order (page content before overlay hosts). Check on a long page with the dev menu parked: a row at page y > 874 must stay in `elements[]`.
- **R4 metadata absolute vs relative** — owned by the board's `figma-spec.mjs`.
- **R5 Figma screenshot pixel scale** — the board records `figma.pxPerPt`; the report divides by it.
- **R8 Typography `nativeID`** — no native block sets `nativeID`, so `native-find-views {nativeID}` cannot find a text block by id today. Block identity stays text → displayName slug → common ancestor.
- **R9 UnifyApps Headless count regex** — copied verbatim into `fix-brief.mjs` (`HAND_COUNT`).
- **R10 hierarchy size** — `native-full-hierarchy` is not used; `native-view-at-point` per container keeps the raw dump small.
- **R11 pngjs** — not needed: the built-in reader decodes the simulator's PNGs; a vendored pngjs under the design board is used only for palette or 16-bit files.
- **R12 safe-area per model** — see above.
