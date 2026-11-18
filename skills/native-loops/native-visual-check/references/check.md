# One pass of the visual check: measure, compare, judge, brief

`S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-visual-check/scripts"`; `<run>` the run folder; `<pass>` is `<run>/visual/pass-<n>`. The board under `<run>/board/` holds `spec.json`, `screenshot.png` (or `figma/screenshot.png`) and `crops/` from [native-design-spec](../../native-design-spec/SKILL.md). The device comes from `device-pool reserve` and the device protocol of [native-device-pool](../../native-device-pool/SKILL.md): boot, connect, the app on Draft (or Published when the run says so), the signed-in precondition, the fresh-config proof. Write down the version the device showed; every evidence row of this pass carries it. Sign-in, LogBox and the one-time Open tap are the protocol's job, never a script's.

## 1. Measure

```sh
node "$S/measure.mjs" --udid <id> --bundle <bundleId> --out <pass> \
  --containers <run>/board/spec.json --build "draft v<N>"
```

Fresh config first (`restart-app`), `await-screen-idle` 400 ms, then per viewport `native-describe-screen` to `raw/describe-<k>.json`, `describe` to `raw/ax-<k>.json` (the groups the native dump leaves out: images, pressables), a full-resolution screenshot to `device-<k>.png` (never into the context). A page whose viewport-1 content fits the screen is not swiped at all; otherwise a swipe `0.5,0.62 → 0.5,0.22` of 450 ms without momentum per viewport (never from the bottom edge: that opens the Preview app's dev menu), and the loop stops when the screenshot no longer changes (`no-scroll`, or `bottom` after a real scroll), when a sheet opened (`sheet`), or at `--max-viewports` (8). The merge writes `measured.json` — with `overlays[]` for the parked dev-menu sheet and the LogBox banners, `scrolled` and `stopReason` — and prints one line: `OK measured 5 elements, 0 containers, content 874pt, no scroll (fits), mode native, 16 overlays (14 sheet, 2 banner) · k1 +0 (top, exact) · no header band, no tab bar band`, or with `· k2 +436.9 (rows+anchors, high) · header 74–119, tab bar 843–857` on a page that scrolls. The delta is measured from the screenshots and the dumps, never assumed from the swipe ([Measurer](measurer.md)).

- `WARN banners on screen: "!, …"`: LogBox is still up. Its rows are excluded from the measurement, so the rows under it are measured, but dismiss it before the next pass — through the tree (`await-ui-element` on the banner, then the tap point the tree gives), never by a blind tap.
- `WARN accidental sheet: "Bottom Sheet" opened after the swipe at viewport k`: the pass keeps the viewports before it; dismiss the sheet through the tree and run the measure again when the page needed more viewports.
- `WARN offsets with low confidence in viewport k`: run the measure once more before trusting those rows; a second low answer is a `Not proven` for that band.
- Exit 5: native devtools unavailable after each recovery was tried once. A release build has no other reader: stop the pass with `needs: native devtools` and the `measure.log` line.
- `--reproduce <baseline.json>` (a later pass against a stored baseline) nudges each viewport until the stored anchor sits within 1pt, so `screenshot-diff` against the baseline is valid.

## 2. Compare

```sh
ua cache outline <pageId> --app-id <appId> --json > <pass>/outline.json
ua cache blocks <pageId> --app-id <appId> --limit 500 --json > <pass>/blocks.json
node "$S/gap-table.mjs" <run>/board/spec.json <pass>/measured.json --blocks <pass>/blocks.json --outline <pass>/outline.json \
  --pass <n> --max-passes <max> --page-name <Page> --board <run>/board --tolerance 2 --crops \
  --out <pass>/gaps.json --report <pass>/pass-report.html
```

Refresh the cache reads (`--refresh`) when the page version differs from the one the plan read. The script prints the summary line and the table of non-match rows (at most 20), writes `gaps.json`, `pass-report.html`, `composite.png` beside the report and `crops/<region>.png`; exit 4 means the verdict is `off`, 0 means `match`. `--regions a,b` keeps only those regions (a scoped pass, for a feature added to one region).

## 3. Judge the visual rows

Rows with judge `visual` (gradient, shadow, blur, opacity, image, a fill nobody could read) stay `unjudged` until you say. Look at the crops of at most two regions (`<pass>/crops/<region>.png`: device left, Figma right), then write `<pass>/visual-verdicts.json`:

```json
{ "schema": "loops.visual.verdicts/1", "verdicts": { "ask/glow.gradient": { "status": "off", "note": "hard gold edge, no blur" }, "ask/glow.shadow": { "status": "match" } } }
```

and run the same `gap-table.mjs` command with `--verdicts <pass>/visual-verdicts.json`. A row you cannot judge from a crop stays `unjudged` and becomes a `Not proven` line at the end.

## 4. The visual check approval

Show `composite.png` (the only image of the pass), then print exactly:

```
Pass 2/4 · Home · 41 rows: 33 match · 5 off · 1 missing · 0 extra · 2 visual (1 off) · 3 noise
Report: <pass>/pass-report.html
<the markdown table gap-table printed>
```

Then AskUserQuestion "Pass n found k gaps on <page>. What next?" with these options, the first recommended:

1. **Fix and run pass n+1** → step 5, the send loop, then the next pass.
2. **Accept as is** → store the baseline; every remaining `off|missing` row becomes a `Not proven` line; exit `accepted`.
3. **Stop, I'll fix by hand** → exit `stopped`; the plan stays resumable.
4. **Change tolerance or ignore rows** → rerun `gap-table.mjs` with `--tolerance <pt>` or `--accept "<row>:<words>"` (no re-measure), print the approval text again.

Inside a UnifyApps Headless loop run the orchestrator holds this approval, never a test runner: a test runner of the test-and-fix stage stops after step 3 and returns the open rows as issues ([formats](../../loop-orchestrator/references/formats.md)); the orchestrator reopens them for the fix stage while gaps remain and n < max, and brings the page to the person at max ([approvals](../../loop-orchestrator/references/approvals.md)). Outside a run, ask as above.

## 5. Fix brief

```sh
node "$S/fix-brief.mjs" <pass>/gaps.json --page <pageId> --page-name <Page> --app <appId> --app-name <App> \
  --outline <pass>/outline.json --pass <n> --depends-on <t3 or the previous fix task> --next-id <next free id> \
  --plan <planId> --board <run>/board --evidence <pass>/evidence.json --out <pass>/fix-task.json --md <pass>/fix-brief.md
```

Add `--publish-task <id> --publish-json '<the stored task from ua plan get>'` when a publish task is pending; the publish is re-listed waiting on the fix and the impact turns `major`. Then `task-lint` from [native-lint](../../native-lint/SKILL.md) on `fix-task.json`, the `plan revise` line from the end of `fix-brief.md` with the person's words in place of `<words>` and `--evidence-file <pass>/evidence.json`, the send loop until the task reports done, the read-back, and the next pass. [Fix brief](fix-brief.md) has the body rules.

## Exit rules and baselines

- `matched`: verdict `match` (`unknown`, `noise` and `accepted` rows do not count).
- `accepted`: the person accepted the page as is.
- `stopped`: the person stops.
- `exhausted`: n = maxPasses and the verdict is still `off` → the escalation.

On `matched` or `accepted` copy `device-<k>.png` and `measured.json` (as `baseline.json`) to `<solution>/.nebula/loops/baselines/<appId>/<pageId>/<deviceModel>/`; ask before overwriting an existing baseline. On `accepted` or `exhausted` every remaining `off|missing` row is written as `Not proven: <page> · <region> · <element> <property> expected <e>pt, measured <m>pt (pass n) — <report path>` into the run's `summary.md`, and carried into the spec's "Not proven when done".

## Evidence rows

One row per `off`, `missing` and fixed row: phase `pass n`, kind `measure`, artefact `visual/pass-n/gaps.json#row=<n>`, the version from the fresh-config proof, verdict `ok (Δ0)` or `off (Δ12)`. A visual row judged from a crop is kind `screenshot` with the crop path.
