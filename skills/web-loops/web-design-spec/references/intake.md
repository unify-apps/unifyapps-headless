# Intake: a WEB design

## Contents

- [Start the store](#start-the-store)
- [Sources](#sources)
- [Widths](#widths)
- [The spec](#the-spec)

A WEB design goes into the same design store as a MOBILE one ([store](../../../native-loops/native-design-spec/references/store.md#a-web-app-one-spec-per-width)). Nothing is scaled: a screen is kept at the width it was drawn at, and the width is part of its name, `home@1440` or `home--empty@1440`. What each source can give, and what stays a judgement by eye, is the same as on MOBILE ([what each source can give](../../../native-loops/native-design-spec/references/intake.md#what-each-source-can-give)). Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"`, `--app <appId>` is the app's id, and every command runs from the solution folder (or takes `--solution <dir>`).

## Start the store

```bash
node "$S/store.mjs" init --app <appId> --app-name "<App>" --platform web [--widths 1440,375]
```

Do this before the first capture or add. An app is WEB or MOBILE, never both (`init` refuses to switch), and the capture agent's own `init` makes a MOBILE store when none exists. `loops platform <appId>` says which the app is. Give `--widths` only when the design is not drawn at 1440 (`--widths 1366,375`); running `init` again with `--widths` replaces the list.

## Sources

### A Figma frame

1. **Capture it at its own width** with the `ua:design-capture` agent, as the [board](../../../native-loops/native-design-spec/references/board.md) says. The agent saves the frame's screenshot, its metadata and, at most once, its design context into the Figma cache. Given `solutionDir`, `appId` and `page`, it also keeps the screenshot in the store as `screens/<screen>@<frame width>.png`. The node is a FRAME, never a section or a page. One capture per frame: a design with frames at two widths is two captures.
2. **Make the spec** with `--platform web`, which replaces the phone's scaling flags (`--scale`, `--grid`, `--safe-area-top`, `--status-band`), and keep it:

   ```bash
   node "$S/figma-spec.mjs" --platform web --metadata "$RUN/board/figma/metadata.xml" --board "$RUN/board/board.json" \
     [--css "$RUN/board/exports/<name>.css"] [--design-context "$RUN/board/figma/design-context.md"] \
     [--pinned-top "<header region>"] [--pinned-bottom "<footer region>"] \
     --page <pageId> --app <appId> --out "$RUN/board/spec.json"
   node "$S/store.mjs" add-spec --app <appId> --page <page> [--state <state>] --spec "$RUN/board/spec.json" --figma <fileKey>:<nodeId>
   ```

   `RUN` is the run folder. `add-spec` files the spec under the width the spec holds (`device.widthPt`): a 1440 frame lands in `specs/home@1440.json`.
3. **Fonts.** The acceptance is the same as on MOBILE: `unknown font properties on text: 0` once a CSS "all layers" export or the design context exists. A rate limit, a View seat or a frame too big for the tools: ask once for the person's exports ([Figma exports](../../../native-loops/native-design-spec/references/figma-exports.md)).

### An HTML prototype

The same steps as on MOBILE ([an HTML prototype](../../../native-loops/native-design-spec/references/intake.md#an-html-prototype)), once per width the prototype is a design for, with the window at the width instead of a phone:

1. **Keep the source.** `node "$S/store.mjs" add-source --app <appId> --page <page> <prototype.html> [<css, js, images…>]`. A folder or a zip is unzipped into the store's `sources/` first, then its `.html` is added.
2. **Open it.** Load the Playwright tools with ToolSearch (`select:mcp__plugin_ua_playwright__browser_navigate,mcp__plugin_ua_playwright__browser_resize,mcp__plugin_ua_playwright__browser_evaluate,mcp__plugin_ua_playwright__browser_take_screenshot`), run `node "$S/store.mjs" serve --app <appId>` as a background Bash call, and navigate to the URL it prints. Open the screen the way the prototype does (a `#hash`, a tab, a click).
3. **Size the window to the width.** `mcp__plugin_ua_playwright__browser_resize { width: 1440, height: 900 }`. A prototype that only lays out at one width is measured at that width only; the other width stays without a spec and is never derived.
4. **Measure.** Pass the whole text of `$S/measure-html.snippet.js`, unchanged, as the `function` of `mcp__plugin_ua_playwright__browser_evaluate`, with `filename: ".nebula/loops/tmp/<screen>@<width>.measure.json"` so the result goes to disk. Pass `target` with the app's root: the element that starts at the app's top-left, without a browser frame or a device mock-up drawn around it. Without `target` the snippet measures `[data-screen]`, else `body`.
5. **Reference picture.** `mcp__plugin_ua_playwright__browser_take_screenshot { fullPage: true, scale: "css", filename: ".nebula/loops/tmp/<screen>@<width>.png" }`, then `node "$S/store.mjs" add-screen --app <appId> --page <page> [--state <state>] --source-kind html --image <that file> --width <width>`.
6. **Spec**, every measured width in one call. Each measure's window width names its spec:

   ```bash
   node "$S/store.mjs" spec-from-measure --app <appId> --page <page> [--state <state>] \
     --measure .nebula/loops/tmp/<screen>@1440.measure.json [--measure .nebula/loops/tmp/<screen>@<width>.measure.json] \
     --page-id <e_…> --page-name "<Page>"
   ```
7. Stop the background `serve` and delete `.nebula/loops/tmp/`: the store holds copies of both files.

What differs from the phone: every value is the CSS px the browser computed, from the app's top-left, whole px; nothing is dropped as a phone bar (`status-bar`, `notch` and the like are the page's own elements), and there is no status band or safe top. A `position: fixed` bar is pinned to the bottom or the top of the frame as on MOBILE.

### A picture

1. `node "$S/store.mjs" add-screen --app <appId> --page <page> [--state <state>] --image <file> [--width <px>]`. The picture is the app at the width it was shot at, from the app's top-left: crop off the browser's own bars first. The width is read from the picture when it is a known width at 1x, 2x or 3x (a 2880 px picture is 1440 at 2x, a 750 px one is 375 at 2x; the known widths are 2560, 1920, 1680, 1440, 1366, 1280, 1024, 768, 390 and 375). Any other size needs `--width <px>`. It writes `screens/<screen>@<width>.png`, at most twice the width wide. One picture per width. A PNG is copied; JPEG, HEIC and WebP need macOS `sips`.
2. A picture alone is a reference, judged by eye. For numbers, mark the boxes that matter ([marked boxes](../../../native-loops/native-design-spec/references/intake.md#marked-boxes), in picture pixels with `"unit": "px"`) and run:

   ```bash
   node "$S/store.mjs" spec-from-screenshot --app <appId> --page <page> [--state <state>] [--width <px>] --boxes <boxes.json>
   ```

   The marked boxes are divided by the picture's pixels per CSS px, with no status band and no safe top. Without `--boxes` the spec is one `Screen` region and the palette.

A screenshot the person pasted into chat is saved to a file first, then added. Pictures with real names or numbers stay in `sources/`; they are never quoted into a brief or the run log.

## Widths

The store holds the design width and 375, the width of the app frame inside the preview's phone frame.

| Width | Where its spec comes from | What the loops do with it |
| --- | --- | --- |
| The design width (1440 unless the design is drawn at another) | the frame, the prototype window or the picture at that width | the visual check measures the page at that width and compares it with `specs/<screen>@<width>.json`; this is the match target |
| 375, no frame | none, by design | the responsive check covers it (overflow, cut text, text over text, the navigation) with no spec |
| 375, with a frame | a frame, a prototype window or a picture at 375 | the visual check compares that width too |

`store.mjs status` prints `home@375: no spec, so not compared at 375` for every screen that has no 375 spec. That line is expected: it is the responsive pass, not missing work, and it is no reason to ask the person for a mobile design. A width with no spec is never derived from another. Another width (1024, 768) joins the store only when the design has frames at it or the person asks (`init --widths`).

## The spec

Each width's spec is `loops.design.spec/1` in CSS px, 1:1 ([A WEB spec](../../../native-loops/native-design-spec/references/spec.md#a-web-spec)):

- `device` is `{ model: "browser <width>px", widthPt: <width>, heightPt: <page height>, safeAreaTop: 0, platform: "web", unit: "px" }`; `scale.factor` and `scale.grid` are 1.
- Every `app` box and `expect` value is CSS px from the top-left of the app, the design frame's top-left, in whole px. A child as wide as the frame keeps the frame's width.
- Text is in the page's own CSS values: `fontSize` and `lineHeight` in px, `fontWeight` as a number, `letterSpacing` in em, `color` and `fill` as hex.
- A value that cannot be read from the source is `unknown`, never guessed, and the visual check reports it as `unknown`, not as `off`.
- A WEB store refuses a spec scaled to a phone (a factor other than 1, or a safe top), and a MOBILE store refuses a WEB one.
