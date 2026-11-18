# Reading a gap row

`gaps.json` (`loops.visual.gaps/1`) holds one row per spec element and property, plus `extra` rows for text the device shows and the frame does not. A row: `n, region, element, elementId, figmaNodeId, property, unit, expected, figma, measured, delta, tol, status, judge, source, matchedBy, confidence, block {id, displayName, parentId, parentDisplayName, how}, neighbour, boxes {expected, measured, viewport}, noise, configPath, hint, advisory, accepted`, and `decorative` on a presence row that names why the layer cannot be measured. `expected` is in device points, `figma` is the canvas value it was scaled from.

## Status

| status | meaning | counts in the verdict |
| --- | --- | --- |
| `match` | within tolerance (±2pt; text width ±6pt; fonts and line heights exact; `lines` exact) | no |
| `off` | outside tolerance, or a visual row judged off | yes |
| `missing` | the element has no measured match and is something a tree can list: a text, an icon with a glyph name, an image with a real name, a container whose child matched; the hint says when the outline shows its block hidden | yes |
| `extra` | measured text no spec element matched; `tag: data?` when it looks dynamic (digits, currency, a long sentence). Overlays (the parked sheet, LogBox banners) and a pressable that repeats a matched text as its label are never extra | no, but the fix brief lists the untagged ones |
| `unknown` | nothing to compare: the spec has no value (`source: unknown`), the text is bound to data, a neighbour or parent was not measured, the block is not identified — or a decorative layer with `judge: visual` and `decorative` naming why: `bare shape`, `generic layer name` (`Rectangle 34625918`, `Group 21…`, `Mask`, `Background`, `Grabber`), `background photo` (`AdobeStock…`, `IMG_…`), `icon without a glyph name`, `container without a matched child`. No accessibility tree can show these; the hint says "decorative layer: judge from the crop" and the report's side-by-side is where to look | no |
| `unjudged` | a `visual` row with no verdict yet | no |
| `noise` | off, but by a known cause (below) | no |
| `accepted` | the person accepted it with words (`--accept "<n>:<words>"` or `"<elementId>.<property>:<words>"`) | no |

`drift` rows (absolute page y against the spec, ±8pt) carry `informational: true`: they are in the file and the report, never in the `off` count, the table or the brief, because 4pt-grid rounding accumulates down a page and builders act on gaps, paddings and sizes.

The verdict is `off` while any `off` or `missing` row is not accepted.

## Judge

`measured` rows come from frames: `w, h, lines, gapTop|gapLeft` (to the previous sibling), `insetTop|Left|Right|Bottom` (inside the parent), `centerX|centerY`, `drift`. `config` rows read the block in `blocks.json` at `configPath` (`fontSize, lineHeight, fontWeight, color, letterSpacing, radius`; `rounded-full` counts as half the shorter side). `fill` is `native` when `native-view-at-point` or the block's `backgroundColor` gave a colour, `pixel` with `--pixels` (a sample at the box centre), else `visual`. `gradient, shadow, blur, opacity, image` are always `visual`. `text` is equality after loose normalisation: case, whitespace, spacing around `/ - · | &` and other punctuation, curly quotes, dashes and a trailing period; when only that differs (`Login / Register` against `Login/Register`) the row is `match` and `advisory` carries both spellings as the note. The approval's `visual` count is the rows a person judges (`unjudged` or judged); decorative `unknown` rows are not in it, and crops go to the judgeable regions.

## Noise rules

| noise | when |
| --- | --- |
| `status-band` | the element sits inside the status band (the frame's clock, battery) |
| `vertical-centering` | a `centerY` row off by half the header band's height (iOS centres in the full header) |
| `cap-trim` | a `gapTop` between two text lines off by ≤4pt (iOS spreads extra leading unevenly) |
| `font-width` | a text `w` off by ≤12pt (the device font is not the frame's) |
| `tabbar` | an element in the tab bar band off by ≤4pt (the bar floats; the navigator module is out of scope) |

## Confidence and matching

`matchedBy` is how the element was paired: `block` (a block id, authoritative), `text` (the same words after loose normalisation; a group that repeats a text as its label counts only when it is text-sized), `name` (layer name against the measured label or displayName, only with boxes within 50% in size, and for a text only when the texts are alike: equal, or one inside the other at ≥60% of its length — `Acme` is not `Begin your journey with ACME`), `geometry` (centre within ±24/±40pt, size within 30%, lowest cost), `derived` (a container as the union of its matched children; its own size and insets are `unknown`), `none`. Decorative layers and overlays never pair: a bare `Rectangle` takes no element, a LogBox banner is nobody's `Buttons`. `confidence` is `high` for a unique text or block match, `medium` for a name or several text candidates, `low` for geometry, a derived box or a viewport whose offset is `low`. `block.how` says how the block id was found in mode B: `text`, `name-slug`, `ancestor`, or `blockId` in mode A; `none` means the brief names the element and its region instead.

## The approval message

```
Pass <n>/<max> · <Page> · <rows> rows: <match> match · <off> off · <missing> missing · <extra> extra · <visual> visual (<visual off> off) · <noise> noise
Report: <pass>/pass-report.html
| # | region | element | property | expected | measured | Δ | status | block | note |
…at most 20 rows…
```

Then "Pass n found k gaps on <page>. What next?" with the four options of [check.md § 4](check.md#4-the-visual-check-approval). The table rows are the ones the person decides on; `noise`, `unknown` and `drift` rows stay in the report.
