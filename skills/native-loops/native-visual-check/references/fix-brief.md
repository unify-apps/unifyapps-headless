# The fix brief

`fix-brief.mjs` turns the open rows of a visual check pass into one `page-layout` task in the style of the hand-written layout tasks that landed first time in an earlier rebuild: device values in points, the Figma value beside them, and the keys a builder can change. Open rows are `off` (not informational), `missing`, `extra` without the `data?` tag and `visual` rows judged `off`, minus accepted ones. Rows are grouped by block.

On a WEB pass ([web-visual-check](../../../web-loops/web-visual-check/SKILL.md)) the same script words the task for the browser: `--platform web`, or a `gaps.json` whose `context.platform` is `web`. Line 2 then says to use the design's values as they are, in CSS px at the spec's width in the browser preview (no scaling, no grid; another width has its own pass and the phone width the responsive check); line 3 is `Browser pass <n> on the <device> measured: …` with px and `design` in place of points and `Figma`; the title says `browser pass`; `--device` defaults to `browser <width>px wide`. The candidate keys, the lint and the task shape are the same. Without the flag, and for a MOBILE `gaps.json`, the words are the simulator's.

## The body

1. `Read: cache outline <pageId> --app-id <app>, then cache blocks <pageId> --app-id <app> --id <ids>; live get_blocks before writing.`
2. The scaling rule from the spec (`×factor` to the device width; sizes, paddings, gaps and radii to the nearest multiple of the grid; fonts, line heights and small values to whole points; letter-spacing in em; text gaps minus half the neighbouring leading) and: "Change only look and structure: every binding, data source reference, event, visibility rule and text stays as it is."
3. `Simulator pass <n> on the <device> measured: …` — one fact per row, worded as a builder reads it, for example `askField top at 151pt with Greeting row bottom at 119pt (gap 32, Figma 20)`, `upcomingCard 132 tall (Figma 120)`, `Documents is not on screen (block b_docL qaDocumentsLabel is hidden)`, `"Beta" shows at 334pt, which the frame does not have`.
4. … one line per block: `<displayName> (<id>): <property> <expected>, measured <m> (Figma <f>) — <candidate keys>`, several properties joined by `;`. A block the pass could not identify is named by its element and region ("Beta (block not identified; find it under upcoming)"); an id that is not in the outline is dropped with a warning.
5. `Design: board/crops/<region>.png` for each region in the brief when `--board` is given and the crop exists.
6. `Where a value has no supported key, keep the nearest supported value and say so in the report; add no new blocks.`
7. `Read back with get_blocks on every block this body names and report the values against this body.`

Proof: `get_blocks on <blocks>: every value this body lists; bindings and events unchanged.`

## Candidate keys by property

| property | keys named |
| --- | --- |
| `gapTop`, `gapLeft` | the parent's `appearance.styles.gap.all` when every sibling gap under that parent is off by the same delta; else `appearance.styles.margin.custom.t|l` on the block, the bottom margin of the previous sibling, or the parent's padding |
| `inset*` | the parent's `appearance.styles.padding.custom.<t|l|r|b>` |
| `w`, `h` (not text) | `appearance.styles.width.custom`, `appearance.styles.height.custom` (or `minHeight.custom`) |
| text `h`, `lines` | `appearance.lineHeight.custom`, `content.addOns.truncation.maxNumberOfLines`, the wrapping width of the parent |
| text `w` | the parent's wrapping width (its padding) or `appearance.letterSpacing.custom` |
| `fontSize`, `lineHeight`, `fontWeight`, `color`, `letterSpacing`, `radius` | the row's `configPath` (`appearance.styles.fontSize.custom`, `appearance.lineHeight.custom`, `appearance.weight`, `appearance.color.custom`, `appearance.letterSpacing.custom`, `appearance.styles.borderRadius.all` or `appearance.customStyles.borderRadius`) |
| `fill` | `appearance.styles.backgroundColor.custom` |
| `gradient` | `appearance.customStyles.linearGradient` |
| `shadow`, `blur` | `appearance.effects` (drop-shadow x, y, blur, spread, color) |
| `opacity`, `image` | `appearance.customStyles.opacity`; `content.data.src` and `appearance.objectFit` |
| `centerX`, `centerY` | `alignItems` and `justifyContent` on the parent |
| `missing` | the visibility of the hidden block, else "render <name> inside <parent>" |
| `extra` | "hide or remove "<text>", which the frame does not show" |
| `text` | `content.value` |

## Lint

The same rules as UnifyApps Headless's `plan revise` (`validateTasks`): at least five body lines; no placeholder phrase (`TBD`, `TBC`, `TODO` in capitals, "to be decided", "handle errors", "similar to", "wire it up", "fill in"; a value in quotes or a code span is not one); no stated count of fields, columns or indexes; every `b_…` id named in the body exists in the outline; a proof. `fix-brief.mjs --lint <tasks.json> --outline <outline.json>` runs it on any tasks file and exits 5 on a violation; [native-lint](../../native-lint/SKILL.md)'s `task-lint` adds the known-trap rules.

## Task shape and `plan revise`

`fix-task.json` is an array: `{id, title, kind: "page-layout", entity: {kind: "page", id, name, app, appId}, dependsOn: [<--depends-on>], visual: false, body, proof}`. `visual` is false because a `visual: true` task makes the builder shoot the web preview, which proves nothing for the phone. `--next-id` is the id after `--depends-on` unless given. More than `--max-ids` (25) blocks give two chained tasks, never more.

`--publish-task <id> --publish-json '<stored task>'` re-lists a pending publish with `dependsOn` extended by the last fix task, so the publish waits on every fix of the page.

The impact: `absorbed` by default (one task on the same page and kind, no graph change) — `major` only when a publish task is re-listed (a publish is never absorbed) or two tasks were added. `fix-brief.md` ends with the exact line to run after the visual check approval, with the person's words in place of `<words>`:

```
plan revise <planId> --tasks-file <pass>/fix-task.json --impact <absorbed|major> --reason "visual check pass <n>: <summary> (person: <words>)"
```

`--evidence <file>` writes the rows as lines for `--evidence-file`: `visual check pass <n> | <region> · <element> <property>: expected <e>, measured <m> (Δ…) → <task id>`.
