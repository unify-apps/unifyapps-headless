# The design spec

`spec.json`, the design spec, is the answer key of the visual check: every element of the frame with the value the phone should show, each value with the source it came from. Schema `loops.design.spec/1`; the field names are shared with `native-visual-check`, which reads it together with `region-map.json`. The same builder (`scripts/lib/spec/build.mjs`) writes it from a Figma frame (`figma-spec.mjs`, below), from an HTML prototype's measure and from boxes marked on a screenshot (`store.mjs`, [intake](intake.md)). Whatever the source, the `figma` block describes the design's frame.

## Contents

- [Command](#command)
- [A WEB spec](#a-web-spec)
- [Summary lines](#summary-lines)
- [Shape](#shape)
- [How the script reads the frame](#how-the-script-reads-the-frame)
- [region-map.json](#region-mapjson)
- [What the spec does not know](#what-the-spec-does-not-know)

## Command

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts/figma-spec.mjs" \
  --metadata board/figma/metadata.xml [--design-context board/figma/design-context.md] [--css board/exports/temp.css] \
  [--svg board/exports/frame.svg] [--overrides overrides.json] [--board board/board.json] \
  --scale 402/440 --grid 4 --font-round whole --small-below 7 --text-cap-trim auto \
  --device-width 402 --device-height 874 --device-model "iPhone 16 Pro" --safe-area-top 62 --status-band auto \
  [--pinned-top "Greeting"] [--pinned-bottom "Bottom Nav"] [--skip-region "Debug.*"] [--region-depth auto|1|2] \
  [--exclude-names "status ?bar|home ?indicator|dynamic island"] \
  --page <pageId> --app <appId> [--page-name ..] [--app-name ..] --out board/spec.json [--region-map board/region-map.json] [--json]
```

Exit 0 when written, 1 on bad input (a section as root, a missing file). It prints `OK spec <path>`, four summary lines, any notes, and `OK region-map <path>`. `--json` prints the summary and notes as JSON instead.

## A WEB spec

For a WEB app, `--platform web` replaces the scaling flags: the frame 1:1 in CSS px (`--scale 1`, `--grid 1`, `--safe-area-top 0`, `--status-band 0`, no names excluded), and `device.widthPt` is the frame's own width (a 1440 frame → 1440; `--device-width` overrides it):

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts/figma-spec.mjs" --platform web \
  --metadata board/figma/metadata.xml [--css …] [--design-context …] --page <pageId> --app <appId> --out board/spec.json
```

The spec's `device` is `{ model: "browser <w>px", widthPt: <w>, heightPt: <frame height>, safeAreaTop: 0, platform: "web", unit: "px" }`, and every `app` and `expect` number below is CSS px from the frame's top-left. A child as wide as the frame keeps the frame's width (`full-width`). `store.mjs add-spec` keeps it as `specs/<screen>@<w>.json`, the file `web-visual-check` compares the page with at that width; a store's `spec-from-measure` and `spec-from-screenshot` write the same shape for a prototype or a picture. One frame per width: a 1366 spec comes from a 1366 frame, never from scaling the 1440 one.

## Summary lines

```
regions 3 · elements 41 (18 container, 2 image, 15 text, 4 icon, 2 shape)
properties by source: metadata 160 · css 92 · rule 3 · svg 6 · override 1 · unknown 0
unknown font properties on text: 0 · visual-judge rows: 12
positions relative · status band 54pt · factor 0.9136
```

`unknown` rows reach the visual check as `unknown`, never as `off`. When a CSS export or a design context was given and fonts are still unknown, the layer names in the source did not match the metadata names: compare `matchedBy` on those elements.

## Shape

All `app.*` and `expect.*.value` numbers are device points on the `device.widthPt` phone (CSS px on a WEB spec); `figma.*` are Figma points on the frame; `y` is relative to the top of the frame, `x` to its left edge.

```jsonc
{
  "schema": "loops.design.spec/1",
  "page": { "id": "e_…", "name": "Home", "appId": "<app-id>", "appName": "Sample App" },
  "figma": { "fileKey": "…", "nodeId": "2027:33645", "frameName": "Account / Dashboard | Dark",
             "width": 440, "height": 2635, "statusBand": 54, "statusBandSource": "metadata|rule|flag",
             "screenshot": "figma/screenshot.png", "pxPerPt": 4.6545, "fetchedAt": "2026-10-11T…" },
  "scale": { "factor": 0.913636, "grid": 4, "middle": { "tolerance": 0.1, "spacing": "down", "size": "up" },
             "fontRound": "whole", "smallBelow": 7, "textCapTrim": true, "textCapTrimEvidence": "css leading-trim",
             "capHeightRatio": 0.7, "letterSpacing": { "copy": "-0.02em", "upper": "+0.02em" } },
  "device": { "model": "iPhone 16 Pro", "widthPt": 402, "heightPt": 874, "safeAreaTop": 62 },
  "sources": { "metadata": "…", "designContext": null, "css": "…", "svg": null, "overrides": null,
               "positions": "relative", "positionsEvidence": "containment|css", "regionDepth": 1,
               "skippedRegions": [], "excluded": ["Status bar"] },
  "regions": [
    { "id": "r1", "name": "Greeting", "key": "greeting", "figmaNodeId": "2027:2", "pinned": "top",
      "figma": { "x": 0, "y": 54, "w": 440, "h": 70 }, "app": { "x": 0, "y": 62, "w": 402, "h": 64 },
      "flow": "row", "elements": ["e1", "e2", "e3"] }
  ],
  "elements": [
    { "id": "e3", "region": "r1", "key": "greeting/welcome-back", "name": "Welcome back", "figmaNodeId": "2027:4",
      "kind": "text", "parent": "e1", "prevSibling": "e2", "flow": "row", "visible": true,
      "figma": { "x": 82, "y": 83, "w": 173, "h": 11, "lines": 1 }, "app": { "x": 75, "y": 88, "w": 158, "h": 20 },
      "centered": { "x": false, "y": true },
      "expect": {
        "fontSize":   { "value": 15, "figma": 16, "source": "css" },
        "lineHeight": { "value": 20, "figma": 22, "source": "css" },
        "w":          { "value": 158, "figma": 173, "source": "metadata", "rule": "text-width", "tolKey": "textWidth" },
        "h":          { "value": 20, "figma": 11, "source": "css", "rule": "lines x lineHeight" },
        "gapLeft":    { "value": 12, "figma": 12, "source": "metadata", "neighbour": "e2" },
        "gapTop":     { "value": 32, "figma": 40, "source": "metadata", "neighbour": "e6", "correction": { "a": 0, "b": 4.5, "capTrim": true } }
      },
      "block": null, "matchedBy": { "designContext": "node-id", "css": "name" } }
  ],
  "notes": []
}
```

Every `expect.<prop>` is `{ value, figma, source, correction?, neighbour?, judge?, rule?, approx? }` with `source` one of `metadata | design-context | css | svg | override | rule | unknown | n/a` for a Figma frame, `html` for a prototype's measure, and `marked` or `screenshot` (sampled from the pixels, always `judge: visual` and `approx: true`) for a screenshot. A spec from the store also carries a `design` block: `kind` (`html` or `screenshot`), the reference picture, the prototype's URL and window, or the screenshot's palette and background. `judge: "visual"` marks rows the pass cannot measure (gradients, shadows, blurs, opacity, images, fills under a gradient). `block` stays `null` until the pass matches the element to a block.

## How the script reads the frame

| Step | Rule |
| --- | --- |
| Positions | Children inside their parents under the relative reading vs the absolute one; ≥95% wins, a CSS export's `left/top` settles it. Recorded as `sources.positions`. |
| Excluded names | Dropped anywhere in the tree (default `status ?bar|home ?indicator|dynamic island|notch`). |
| Status band | The height of a dropped top-level child at `y = 0`, else 54 (`source: rule`), else `--status-band <pt>` (`flag`). `app.y = safeAreaTop + (figma.y − statusBand) × factor`. |
| Factor | `--scale`, else `deviceWidth / frame width`. |
| Regions | Top-level sized children; a single-child wrapper is opened while the child is a container; in `auto` one page-sized frame that holds everything is opened one level; `--skip-region` drops by name; `pinned` from the flags. |
| Flow | `column` when children stack without vertical overlap, `row` when they stack horizontally, else `free`. Siblings are ordered by the flow axis; `prevSibling` is the one before in that order. |
| Kind | `text` for text nodes; `image` for image fills or names like image/photo/avatar/logo; `icon` for vectors, boolean operations, lines and instances or small groups ≤ 48 pt without text; `container` for frames, groups and instances with children; `shape` for the rest. |
| Keys | `<region-slug>/<name-slug>`, the region's own node is `<region-slug>`, repeats get `#2`, `#3`. |
| `w` | text: Figma width × factor to whole points (tolerance key `textWidth`); a child as wide as the frame: `full-width`; a child spanning its parent with insets ≤ 48: `parent-minus-insets` (parent width − scaled insets); else `scaleSize`. |
| `h` | text: `lines × lineHeight` once fonts are known, else unknown; others `scaleSize`. |
| `lines` | `1 + round((h − 0.7 × fontSize) / lineHeight)` under cap trim, else `round(h / lineHeight)`. |
| `gapTop` / `gapLeft` | Distance to the previous sibling along the flow. Vertical gaps lose each text neighbour's cap correction before rounding; horizontal gaps do not. Negative gaps are kept with `rule: overlap`. |
| Insets | First child `insetTop` / last child `insetBottom` in a column (`insetLeft` / `insetRight` in a row); across the flow both insets for a stretched child, the nearer edge only for the others, none when `centered`. |
| `centered` | Equal insets within 1 pt on that axis. |
| Style | design context (by node id, then text, then name+size) → CSS export (name+size, name, text, position+size) → SVG shapes at the same box → `rule` (letter-spacing only) → `unknown`. Fonts and line heights are rounded to whole points, radii with `scaleSize` (`pill` when ≥ half the box), shadows and blurs with the spacing rule, colours to `#RRGGBBAA`, letter-spacing to em. `fontFamily` is recorded with `compare: false`. |
| Overrides | `[{ key, property, value, words }]` replaces `expect.<property>` with `source: override` and keeps `figma`. |

## region-map.json

```json
{ "greeting": { "figmaNodeId": "2027:2", "blockIds": [] }, "white-sheet": { "figmaNodeId": "2027:8", "blockIds": [] } }
```

The visual check fills `blockIds`; a rebuild of the spec keeps the ids it finds there.

## What the spec does not know

- Visibility: metadata has none, so every element is `visible: true`; a hidden layer that is still in the metadata shows up as `missing` on the device.
- Component internals: an instance without children in the metadata is one opaque container.
- Content-driven heights: a card that is `padding + content` on the phone is scaled as a box here (88 → 80, where the accepted reference spec wrote 84); see [Scaling](scaling.md).
- A row that holds an icon and a text line is corrected as a box, not as text; the reference spec treated such rows as text, so expect up to 4 pt of difference on a gap next to one.
