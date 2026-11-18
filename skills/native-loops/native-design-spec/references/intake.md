# Intake: an HTML prototype or screenshots

## Contents

- [What each source can give](#what-each-source-can-give)
- [An HTML prototype](#an-html-prototype)
- [Screenshots](#screenshots)
- [Marked boxes](#marked-boxes)
- [Not confirmed](#not-confirmed)

Both write into the solution design store ([store](store.md)); a Figma frame goes through the [board](board.md) instead. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"`, `--app <appId>` is the app's id, and every command runs from the solution folder (or takes `--solution <dir>`). Start a store once with `node "$S/store.mjs" init --app <appId> --app-name "<App>"`.

## What each source can give

| Source | Exact in the spec | Only by eye, from `screens/<screen>.png` |
| --- | --- | --- |
| HTML prototype | every box the browser lays out, fonts, line heights, weights, colours, radii, borders, shadows, letter-spacing (`source: html`) | images' content, icon shapes, anything drawn on a canvas |
| Screenshot, nothing marked | page size and the colour palette (`design.palette`, `design.background`) | everything else; the spec is one `Screen` region |
| Screenshot with marked boxes | each marked box's size and position, the gaps and insets between marked boxes, fills and text colours sampled from the pixels (`source: screenshot`, `judge: visual`, `approx: true`), and any font values the marker typed (`source: marked`) | fonts nobody marked, letter-spacing, shadows, blurs, gradients, anything not marked |

A value that cannot be measured is left out or `unknown`, never guessed: the visual check reports `unknown` rows as `unknown`, not as `off`.

## An HTML prototype

1. **Keep the source.** `node "$S/store.mjs" add-source --app <appId> --page <page> <prototype.html> [<css, js, images…>]`. A prototype that is a folder or a zip: unzip it into the store's `sources/` with its assets beside it, then `add-source` the `.html` so the index knows it.
2. **Open it.** Load the Playwright tools with ToolSearch (`select:mcp__plugin_ua_playwright__browser_navigate,mcp__plugin_ua_playwright__browser_resize,mcp__plugin_ua_playwright__browser_evaluate,mcp__plugin_ua_playwright__browser_take_screenshot`). Serve the store: run `node "$S/store.mjs" serve --app <appId>` as a background Bash call and take the URL it prints (a `file://` URL also works where the browser allows it). Then `mcp__plugin_ua_playwright__browser_navigate { url }`, and open the screen the way the prototype does (a `#hash`, a tab, a click).
3. **Size the window to the phone.** `mcp__plugin_ua_playwright__browser_resize { width: 402, height: 874 }` (the store's device size, `status --json` → `device`). A prototype drawn at another width keeps its own width here; the spec then scales it like a Figma frame.
4. **Measure.** Read `$S/measure-html.snippet.js` and pass its whole text, unchanged, as the `function` of `mcp__plugin_ua_playwright__browser_evaluate`, with `filename: ".nebula/loops/tmp/<screen>.measure.json"` (relative to the solution folder) so the result goes to disk and never into the chat. When the prototype draws a phone frame or several screens on one page, pass `target` with the screen's container (a selector or a ref from `browser_snapshot`); without it the snippet measures `[data-screen]`, else `body`. It walks visible elements (at most 2,500) and returns boxes, text and computed styles.
5. **Reference picture.** `mcp__plugin_ua_playwright__browser_take_screenshot { fullPage: true, scale: "css", filename: ".nebula/loops/tmp/<screen>.png" }`, then `node "$S/store.mjs" add-screen --app <appId> --page <page> [--state <state>] --source-kind html --image <that file> --frame-width 402`.
6. **Spec.** `node "$S/store.mjs" spec-from-measure --app <appId> --page <page> [--state <state>] --measure .nebula/loops/tmp/<screen>.measure.json --page-id <e_…> --page-name "<Page>"`. It keeps the measure as `sources/<screen>.measure.json`, writes `specs/<screen>.json` and its region map, and prints the same four summary lines as the Figma path ([spec](spec.md)).
7. Stop the background `serve` when every screen is measured, and delete `.nebula/loops/tmp/`: the store holds copies of both files.

How the measure becomes a spec:

- A text element is measured as a native Text would be: the words' width (a `Range` over its text), the line boxes' height. A button, field or painted box holding text becomes a container with one text child.
- Text in a browser is not cap-trimmed: lines are `round(h / lineHeight)`, and gaps next to text keep their box edge (no cap correction). `line-height: normal` is taken as 1.2 × the font size, `letter-spacing: normal` as 0.
- A window as wide as the device scales by 1 and rounds to whole points (no 4 pt grid); another width scales by `device / width` on the 4 pt grid.
- Bars the prototype draws for the phone (`status-bar`, `home-indicator`, `dynamic-island`, `notch` in a name, class or id) are dropped; a dropped bar at the top sets the status band, else the band is 0, so the first element lands at the safe top.
- A `position: fixed` bar at the bottom of the window moves to the bottom of the frame and is pinned to the bottom; one at the top is pinned to the top.
- Names come from `data-name`, `aria-label`, `alt`, `id`, the first class, else the tag. Give the prototype's important elements a `data-name` when the names come out vague: the visual check matches by key.

## Screenshots

1. `node "$S/store.mjs" add-screen --app <appId> --page <page> [--state <state>] --image <file> [--frame-width <pt>] [--version <v>] [--notes "<words>"]`. Any picture: a PNG is copied, anything else (JPEG, HEIC, WebP) needs macOS `sips`. A picture wider than the device width × 3 px is resampled. `--frame-width` is the width in points of the phone the picture shows; the default is the store's device width (402), right for a simulator screenshot of an iPhone 16 Pro.
2. A screenshot alone is a reference: the UI check compares by eye from at most two crops and marks its issues `GUESS`.
3. For numbers, mark the boxes that matter ([marked boxes](#marked-boxes)) and run `node "$S/store.mjs" spec-from-screenshot --app <appId> --page <page> [--state <state>] --boxes <boxes.json>`. Without `--boxes` it still writes a spec with one `Screen` region and the palette.
4. A screenshot from a phone shows its status bar, so the status band defaults to the device's safe top (62) and a box at y = 150 pt stays at 150 on the device. Pass `--status-band 0` when the picture starts below the status bar.

A screenshot the person pasted into chat is saved to a file first (it stays out of the context after that), then added. Pictures with real names or numbers stay in `sources/`; they are never quoted into a brief or the run log.

## Marked boxes

A JSON file (`[…]` or `{ "boxes": […] }`), one entry per thing to measure, in picture pixels (`"unit": "px"`) or frame points (the default):

```json
{ "boxes": [
  { "name": "Card", "x": 48, "y": 450, "w": 1110, "h": 264, "unit": "px", "radius": 16 },
  { "name": "Balance label", "kind": "text", "text": "Leave balance", "x": 96, "y": 498, "w": 330, "h": 60, "unit": "px", "fontSize": 15, "lineHeight": 20 },
  { "name": "Primary button", "x": 48, "y": 750, "w": 1110, "h": 144, "unit": "px" }
] }
```

- `kind`: `container` (default), `text`, `image`, `icon`, `shape`. A box inside another becomes its child, so gaps and insets come out of the nesting.
- Optional typed values: `text`, `fontSize`, `lineHeight`, `fontWeight`, `color`, `fill`, `radius`. They are `source: marked`. A box with no `fill` gets the most common colour inside it; a text box with no `color` gets the commonest colour that stands apart from its background. Both are `approx` and judged by eye.
- Mark boxes from the picture itself (`Read` the reference once and read off the pixel edges), or from a measurement someone already made. Do not invent a box to fill a gap in the spec.

## Seen in a browser

- The snippet ran in the plugin's Playwright Chromium on a served prototype: a block paragraph, a heading in a flex header, a text in a button (centred, `line-height: normal`), a fixed bottom bar and an inline SVG all came out as described above.
- `filename` on `browser_evaluate` and `browser_take_screenshot` is refused outside the session's folder and its `.playwright-mcp/` ("outside allowed roots"), which is why the paths above are relative to the solution folder.

## Not confirmed

- That this Playwright build opens `file://` URLs; `serve` is the path that always works.
- That `filename` writes the returned string unquoted; `parseMeasure` accepts it as returned, quoted once more, or wrapped in text.
- Fonts the prototype loads from the network render only when the browser can fetch them; a fallback font changes widths and line heights, so check `fontFamily` in the spec against the prototype.
