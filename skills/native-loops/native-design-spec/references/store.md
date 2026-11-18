# The store script

## Contents

- [Layout](#layout)
- [A WEB app: one spec per width](#a-web-app-one-spec-per-width)
- [Commands](#commands)
- [design.md](#designmd)
- [From the store to a run](#from-the-store-to-a-run)
- [Figma frames into the store](#figma-frames-into-the-store)

The design store's rules (what approved means, captured once, no real data in references) are in the loops' [design store](../../loop-orchestrator/references/design-store.md). This page is how `store.mjs` keeps it. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"`; every command takes `--app <appId>`, `--solution <dir>` (default: the current folder) and `--json`, and answers `--help`.

## Layout

```
<solution>/design/<app-id>/
  design.md                      the index (below)
  sources/                       every file as given: prototype .html and assets, screenshots, Figma exports and
                                 screenshots, PDFs, a browser measure (<screen>.measure.json), marked boxes
  screens/<screen>.png           one reference per screen and state, at most device width × 3 px wide
  specs/<screen>.json            loops.design.spec/1, the design spec: the answer key of the UI check and the visual check
  specs/<screen>.region-map.json
```

A store made before the design spec was named kept these files in `contracts/`: the first command that opens it moves the folder to `specs/` once, and reads its index in the new names.

A screen is a page in one state: `--page Home` is `home`, `--page Home --state empty` is `home--empty`. The same file is never copied twice into `sources/` (by its SHA-256); its version defaults to `sha:<first 8>`.

## A WEB app: one spec per width

`init --platform web [--widths 1440,375]` makes a WEB store (an app is WEB or MOBILE, never both: `init` refuses to switch). Each screen then has one entry per width, `home@1440`, `home--empty@375`, and the files follow the key:

```
screens/<screen>@<width>.png         the reference shot at that width, at most 2 × the width px wide
specs/<screen>@<width>.json          loops.design.spec/1 in CSS px, 1:1, the file web-visual-check reads for that width
specs/<screen>@<width>.region-map.json
sources/<screen>@<width>.measure.json   a prototype's measure at that width
```

- **The spec.** `device` is `{ model: "browser <width>px", widthPt: <width>, heightPt: <page height>, safeAreaTop: 0, platform: "web", unit: "px" }`; `scale.factor` 1 and `scale.grid` 1 (whole px); `figma.statusBand` 0; nothing is dropped as a phone bar (an element named "status bar" is the page's own). Every `app` box and `expect` value is CSS px from the top-left of the app, the design frame's top-left.
- **The widths.** The design's own width (1440 unless the design is drawn at another) and 375, the app frame of the phone view; `--widths` sets another list. A width comes from its own source: a measure taken with the window at that width, a Figma frame of that width, a picture shot at that width. A store width with no spec is listed by `status` under `notCompared`; a spec is never derived from another width.
- **Which width a command acts on.** `--width <px>` names it. Without it: `spec-from-measure` takes each measure's window width (`viewport.width`; one `--measure` per width, repeatable in one call); `add-screen` takes `--frame-width` (a Figma frame's width), else the picture's own width read as a known width (2560, 1920, 1680, 1440, 1366, 1280, 1024, 768, 390, 375) at 1x, 2x or 3x (a 2880 px shot is 1440, a 750 px one is 375), else it asks for `--width`; `add-spec` takes the spec's `device.widthPt`; `spec-from-screenshot` and `link-run` take the only width the screen has (`link-run`: the widest), else ask.
- **Refusals.** A WEB store refuses a spec scaled to a phone (factor ≠ 1 or a safe top): make it with `figma-spec.mjs --platform web`. A MOBILE store refuses a spec whose `device.platform` is `web`.

## Commands

| Command | Does |
| --- | --- |
| `init [--app-name N] [--device-model M --device-width 402 --device-height 874 --safe-area-top 62 --px-per-pt 3]` | Makes the folders and `design.md`; the device values go into every spec made here (MOBILE) |
| `init --platform web [--widths 1440,375]` | A WEB store: one spec per width, CSS px, 1:1 (above) |
| `approve --words "<their words>"` | Records that the person approved the design, in their words and with the date. A run builds or fixes only against an approved store |
| `add-source <files…> [--page P --state S] [--kind K]` | Copies files into `sources/` |
| `add-screen --page P [--state S] --image F [--source-kind figma\|html\|screenshot] [--figma <fileKey>:<nodeId>] [--frame-width PT] [--width PX]` | Keeps the picture in `sources/` and writes `screens/<screen>.png`; `--frame-width` is the design's width in its own points (a Figma frame's width, a prototype's window), so `pxPerPt` is right. WEB: `screens/<screen>@<width>.png` |
| `spec-from-measure --page P --measure F [--measure F2 …] [--width PX]` | An HTML prototype's browser measure → spec ([intake](intake.md#an-html-prototype)); WEB: one spec per measure, at its window's width |
| `spec-from-screenshot --page P [--image F] [--boxes F] [--width PX]` | A picture and the boxes marked on it → spec ([intake](intake.md#screenshots)) |
| `add-spec --page P --spec F [--region-map F] [--width PX]` | Puts a spec made by `figma-spec.mjs` into the store (WEB: under its `device.widthPt`) |
| `link-run --page P [--state S] [--width PX] --run-dir RUN` | Fills `RUN/board/` from the store (below); WEB: from the width asked, else the widest |
| `serve [--port 0]` | Serves the store on `127.0.0.1` for the browser; run it in the background and stop it after |
| `status [--page P]` | Per screen: source, reference, spec, and the next step |

Exit 0 when done, 1 on bad input with one `FAIL <reason>` line.

## design.md

The part between `<!-- design-store:index:start -->` and `<!-- design-store:index:end -->` is rewritten from the data block at the end of the file on every command; write notes under `## Notes`, never in the tables. It holds:

- `Approved:` the person's words and the date, or `not yet approved`.
- `Device:` model, size, safe top and the scale rule each canvas width gets (`canvas 440 → 402 (×0.9136), 4 pt grid`, or `canvas 402 = device, whole points`). On WEB: `browser (WEB) · widths 1440, 375 · one spec per width, CSS px from the app's top-left, 1:1`.
- One row per screen: `screen | state | page (name · id) | source | version | reference | spec | notes`. A WEB store adds a `width` column after `state` and has one row per screen, state and width, the widest first. The source reads `figma <fileKey>/<nodeId>`, `prototype <file>#<anchor>`, or `screenshot <file>`. The spec cell says how many elements it has and how many font values are still unknown.
- One row per file in `sources/`.

The table is drawn from the data block on every write.

## From the store to a run

The visual check and the UI check read a run's board. `link-run` writes:

- `RUN/board/spec.json` and `region-map.json`, copied from the store;
- `RUN/board/screenshot.png`, the reference;
- `RUN/board/board.json` with a `store` block (`dir`, `screen`, `sourceKind`, `version`; on WEB also `width` and the screen's `widths`), the frame size and `pxPerPt`, and the regions;
- for a Figma screen, the `board/figma` link into the Figma cache, as `board.mjs init` makes it.

On WEB the board holds one width (the widest unless `--width` names another): builders brief from it, while the visual check reads each width's spec straight from the store (`web-visual-check` `gap-table.mjs --store <solution>/design/<app-id> --screen <screen> --width <px>`). Then `node "$S/board.mjs" crops --run-dir RUN --out RUN/board/crops` cuts the region crops, and `board.mjs status` says no Figma call is needed for an HTML or screenshot board. The pass writes block ids into the run's `region-map.json`; keep them for later runs with `add-spec --page P --spec RUN/board/spec.json --region-map RUN/board/region-map.json`. A later `spec-from-*` of the same screen keeps the block ids the store's region map holds.

## Figma frames into the store

The `ua:design-capture` agent captures a frame into the Figma cache and, when its caller passes `solutionDir`, `appId` and `page`, also runs `add-screen --source-kind figma --figma <fileKey>:<nodeId> --frame-width <frame width>` with the cached `screenshot.png` (on a WEB store the frame width is the screen's width: a 1440 frame is `<screen>@1440`). After `figma-spec.mjs` has written the run's `board/spec.json` (with `--platform web` for a WEB app), keep it in the store with `add-spec --page <page> --spec RUN/board/spec.json --figma <fileKey>:<nodeId>`. A WEB design with frames at several widths is captured and kept once per frame. The person's exports go in with `add-source --kind figma-export`.
