---
name: web-visual-check
description: "Only used by the UnifyApps Headless loops, for WEB UnifyApps apps: measures a page's saved draft in UnifyApps Headless's own browser at each width (every block box, text, button and image with its computed typography, colours, radii, borders and gaps, read in the page through browser.mjs eval on the builder preview route), compares it with the page's design spec for that width at ±2 px with native-visual-check's match and gap logic, judges typography, colour and radius from the computed style, and writes gaps.json, the issues and the HTML pass report. The WEB counterpart of native-visual-check: the audit's UI check and the visual-check and retest kinds of the device queue on a WEB app. Read when a WEB page is compared with its design, or a row of a WEB visual check is judged."
user-invocable: false
---

# Web visual check

One pass of the visual check on a WEB page is: measure at each width → compare
with that width's design spec → judge the visual rows → the fix brief. The
browser is a WEB test runner's ([web-browser](../web-browser/SKILL.md)); the specs
sit in the design store that [native-design-spec](../../native-loops/native-design-spec/SKILL.md)
keeps and [web-design-spec](../web-design-spec/SKILL.md) fills; the match, gap and
report logic is [native-visual-check](../../native-loops/native-visual-check/SKILL.md)'s,
reused unchanged, so a WEB `gaps.json` reads like a MOBILE one.

## The design spec of a WEB screen

One spec per width, in the design store:
`<solution>/design/<app-id>/specs/<screen>@<width>.json` (`home@1440.json`,
`home--empty@1366.json`), schema `loops.design.spec/1`, with
`device.widthPt` the width and every box and value in CSS px from the top-left
of the app (the design frame's top-left).

A width with no spec is skipped quietly: it is not compared, and it is not a
finding or missing work. The design width (1440) has a spec. 375, the app frame
inside the preview's phone frame, has none unless the design has a frame at
375 (then it is compared too); otherwise the responsive check in
[web-browser](../web-browser/SKILL.md) covers it.

## Commands

`S="${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-visual-check/scripts"`; `<pass>` is
`R/visual/<pageId>/pass-<n>/<width>`. Both answer `--help`.

```bash
node "$S/measure.mjs" --browser <browser> --url "<preview url>" --width 1440 --out <pass> --blocks R/cache/<pageId>/blocks.json
node "$S/gap-table.mjs" --store <solution>/design/<appId> --screen home --width 1440 \
  --measured <pass>/measured.json --blocks R/cache/<pageId>/blocks.json --outline R/cache/<pageId>/outline.json \
  --pass <n> --max-passes <max> --page-name <Page> --page-id <pageId> --run R \
  --out <pass>/gaps.json --issues-json <pass>/issues.json --issues <pass>/issues.md --report <pass>/pass-report.html \
  [--figma <solution>/design/<appId>/screens/home@1440.png]
```

`blocks.json` and `outline.json` are the page's `cache blocks` and
`cache outline` exports. The orchestrator writes them to `R/cache/<pageId>/`
before it queues the visual check; a test runner never runs the plugin's CLI.

`measure.mjs` opens the page's draft on the preview route (`--no-open` reads
the page the browser shows), puts it at the width as web-browser does, waits
until it is still with the mouse off the controls, and measures it; it writes
`raw/measure-<width>.json`, `measured.json` (`loops.visual.measured/1`: one
viewport holding the whole page, CSS px for points) and `device-1.png`.
`gap-table.mjs` exits 0 on `match`, 4 on `off`; `--spec <file>` names a
spec directly; `--verdicts`, `--accept "<row>:<words>"`, `--regions` and
`--tolerance` work as native-visual-check's.

## What is measured and how it is judged

| Rows | Judged from | Tolerance |
| --- | --- | --- |
| `w`, `h`, `lines`, gaps, insets, centring, `drift` (information only) | the boxes in the page | ±2 px, text width ±6 px |
| `fontSize`, `lineHeight`, `fontWeight`, `color`, `letterSpacing`, `radius` | the computed style (judge `computed`); the block config stays in `config` and a difference is the row's hint | 0.5 px, 50 weight, the exact hex, 0.01 em, ±2 px |
| `fill` | the computed background | the exact hex |
| `text`, `presence`, `extra` | the page's text against the spec's | words, spacing and punctuation loose |
| gradient, shadow, blur, opacity, image | a visual verdict from the shot | — |

A block is measured by the box a person sees: its root when the root paints
(a background, border or shadow), else the first element under it that does
(a Button block's `<button>`). Blocks come before texts in `measured.json`,
so a spec element named by block id takes the block's box. How the match
pairs elements, and how to read a row, are native-visual-check's
[measurer](../../native-loops/native-visual-check/references/measurer.md) and
[gap reading](../../native-loops/native-visual-check/references/gap-reading.md); what differs
on WEB is in [check](references/check.md).

## Issues

Every open row (`off`, `missing`, `extra`, not accepted) becomes an issue
of the orchestrator's shape: check `ui`, id `UI<group>-<nn>`, `rule`
`spec <element>.<property>`, `missing` and an `off` over 4 px major, an
`off` within 4 px and an `extra` minor, the evidence `gaps.json#row<n>`, the
fix hint the block config path and the spec value. A visual-check request
passes when every width that has a spec has zero `off` or `missing`.

## References

| File | Read it when |
| --- | --- |
| [references/check.md](references/check.md) | you run a WEB visual check, judge its rows or write its fix brief |
