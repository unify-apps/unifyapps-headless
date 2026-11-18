# One pass of the WEB visual check, per width

## Contents

- Before the pass
- 1. Measure
- 2. Compare
- 3. Judge the visual rows
- 4. Hand the issues on
- What differs from a MOBILE pass
- On the first pass for an app

`S="${CLAUDE_PLUGIN_ROOT}/skills/web-loops/web-visual-check/scripts"`; `<pass>` is
`R/visual/<pageId>/pass-<n>/<width>`. A pass covers every width the page has a
design spec for; each width is measured and compared on its own.

## Before the pass

- The specs: `<solution>/design/<appId>/specs/<screen>@<width>.json`
  for each width, from the design store ([native-design-spec](../../../native-loops/native-design-spec/SKILL.md)).
  A width with no spec is skipped quietly: do not measure it for this check, do not
  run the gap table on it, and do not report it as missing work. The design width
  (1440) has a spec. 375 has none unless the design has a frame at 375 (then
  it is compared too); otherwise the responsive check in
  [web-browser](../../web-browser/SKILL.md) covers it.
- The browser: a WEB test runner's folder ([web-browser](../../web-browser/SKILL.md)),
  signed in through open-page. The preview route shows the saved draft: the
  version shown is `draft (preview route)` with open-page's `loadedAt`.
- The cache reads the orchestrator exported for the page:
  `R/cache/<pageId>/blocks.json` and `outline.json` (a test runner never runs the plugin's CLI).

## 1. Measure

```bash
node "$S/measure.mjs" --browser <browser> --url "<preview url>" --width <width> --out <pass> --blocks R/cache/<pageId>/blocks.json
```

It prints `{ measured, elements, containers, shot, pageIds, width }`. A page
whose data hangs on an input gets it in the URL's query. Several widths of one
page in a row: the first call opens the page, the next ones pass `--no-open`
and only change the width.

## 2. Compare

```bash
node "$S/gap-table.mjs" --store <solution>/design/<appId> --screen <screen> --width <width> \
  --measured <pass>/measured.json --blocks R/cache/<pageId>/blocks.json --outline R/cache/<pageId>/outline.json \
  --pass <n> --page-name <Page> --page-id <pageId> --group <g> --run R \
  --out <pass>/gaps.json --issues-json <pass>/issues.json --issues <pass>/issues.md --report <pass>/pass-report.html --json
```

The JSON line holds the summary line native-visual-check prints
(`Pass n · <Page> · <rows> rows: … → verdict off`), the counts and the files.
`pass-report.html` is native-visual-check's report: the page shot with the
expected (dashed) and measured (solid) boxes of the open rows, with the
design's picture beside it when `--figma <the store's screen picture>` names one.

## 3. Judge the visual rows

Rows judged `visual` (gradient, shadow, blur, opacity, image) stay
`unjudged` until a verdict names them, as native-visual-check's
[gap reading](../../../native-loops/native-visual-check/references/gap-reading.md) says: look at
the shot, write `visual-verdicts.json`, and run `gap-table.mjs` again with
`--verdicts`. The computed `box-shadow` of a block is in `measured.json`
(`style.shadow`) to compare with the spec's by eye.

## 4. Hand the issues on

A test runner stops here: `issues.json` and `issues.md` go to the orchestrator, which
sends them to the fix stage. The fix task is native-visual-check's `fix-brief.mjs`
run on the same `gaps.json`, one task per width that has open rows:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-visual-check/scripts/fix-brief.mjs" <pass>/gaps.json --platform web \
  --page <pageId> --page-name <Page> --app <appId> --app-name <App> --outline R/cache/<pageId>/outline.json \
  --pass <n> --depends-on <task> --out <pass>/fix-task.json --md <pass>/fix-brief.md
```

`--platform web` words the task for the browser: a "Browser pass" in CSS px at the
spec's width, the design's values 1:1, with no device scaling and no grid rule. A WEB
`gaps.json` says `platform: web` in its context, which picks the same wording without
the flag; `--device` then defaults to `browser <width>px wide`.

## What differs from a MOBILE pass

| | MOBILE (native-visual-check) | WEB (this block) |
| --- | --- | --- |
| Device | a reserved simulator, argent | a test runner's browser folder, browser.mjs |
| Spec | one per screen, scaled to the phone | one per screen and width, CSS px, 1:1 |
| Viewports | one per swipe, offsets from the pixels | one: the window made as tall as the page |
| Block ids | the fiber walk on a dev build | `data-block-id` on every block, always |
| Typography, colour, radius | the block config (`judge: config`) | the computed style (`judge: computed`), config as a hint |
| Bands and noise | status bar, header, tab bar | none: no status band, no tab bar |

## On the first pass for an app

Check that the app root (`.interface-theme`) starts where the design frame
starts (a preview toolbar above it is left out), that `main.ua-page-workspace`
holds the scroll the measure adds back, and how a repeated block (one block id on
every row of a list) pairs with the spec.
