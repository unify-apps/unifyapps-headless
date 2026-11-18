# Build the board

One board per page and run, captured once, within the limit on Figma calls. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"` and `RUN` is the run folder ([rules](../../loop-orchestrator/references/rules.md#run-folder)). Every script prints `--help`. A page whose design is already in the solution's design store needs no capture: `store.mjs link-run` fills the board from it ([store](store.md#from-the-store-to-a-run)).

## What you need

| Need | From |
| --- | --- |
| The frame: `fileKey` and `nodeId` | The Figma link: `figma.com/design/<fileKey>/...?node-id=<a>-<b>` gives `nodeId = a:b`. A FRAME, never a section or a page. |
| The run folder and the page id | The loop that called you |
| The person's exports, when they have them | A folder with the CSS all layers, PNG, SVG, PDF ([Figma exports](figma-exports.md)) |

## Capture order

Cheapest first; stop as soon as the spec has what it needs.

1. **Init and link the cache.** Creates `RUN/board/board.json` and the link `RUN/board/figma` to the shared cache. A frame captured by an earlier run is reused as is.

   ```bash
   node "$S"/board.mjs init --run-dir "$RUN" --file-key <fileKey> --node-id <nodeId> --page <pageId> [--exports <folder>]
   ```

2. **Exports present?** Fold them in; they are the reliable path and cost no Figma call. A later `exports.mjs import --run-dir "$RUN" <files>` adds more.

3. **Ask `status`** for the next cheapest Figma call. It reads the cache and the exports:

   ```bash
   node "$S"/board.mjs status --run-dir "$RUN"
   ```

   The order it follows: screenshot (skipped when a PNG export exists) → metadata of the frame → spec → design context only when fonts or colours are still `unknown` and no CSS export exists and no rate limit was recorded in the last 24 h.

4. **Capture through the agent, never in the main session.** Call the `ua:design-capture` agent with `{fileKey, nodeId, cacheDir, runDir, want: [...]}` (plus `solutionDir`, `appId` and `page` to keep the screen in the design store, and `platform: "WEB"` on a WEB app, so the design context comes back for the web framework) where `want` holds only what `status` asked for. `cacheDir` is the path `status` prints. The agent writes `screenshot.png` + `screenshot.json`, `metadata.xml`, `design-context.md` into the cache and returns paths and sizes only. Read its summary; never read the files it wrote into the context (`metadata.xml` of a frame is 5–60K characters, of a section 400K+).

5. **Spec.** Metadata plus whatever style source exists:

   ```bash
   node "$S"/figma-spec.mjs --metadata "$RUN/board/figma/metadata.xml" --board "$RUN/board/board.json" \
     [--css "$RUN/board/exports/<name>.css"] [--design-context "$RUN/board/figma/design-context.md"] [--svg "$RUN/board/exports/<name>.svg"] \
     --device-width 402 --safe-area-top 62 --pinned-top "<header region>" --pinned-bottom "<bottom nav region>" \
     --page <pageId> --app <appId> --out "$RUN/board/spec.json"
   ```

   Read the summary it prints. `unknown font properties on text: 0` is the acceptance when a CSS export or design context exists. Keep the spec in the design store with `store.mjs add-spec --app <appId> --page <page> --spec "$RUN/board/spec.json" --figma <fileKey>:<nodeId>`. With neither, `status` now points at the design context call (`mcp__claude_ai_Figma__get_design_context`); run step 4 once more with `want: [designContext]`, then rebuild the spec. [Spec](spec.md) has the schema and every flag.

6. **On a rate limit** the agent records it in `meta.json` and stops. Keep the spec with its `unknown` rows and ask the person ONCE for the exports, with the recipe in [Figma exports](figma-exports.md). Do not retry the call in this run; `status` keeps saying so for 24 h.

7. **Crops**, one PNG per region, at most 400 px wide, for the judge and for builder briefs:

   ```bash
   node "$S"/board.mjs crops --run-dir "$RUN" --out "$RUN/board/crops"
   ```

   From `figma/screenshot.png`, else from the PNG export. With no `sips` (not macOS) and no vendored pngjs it writes `crops.json` with the rectangles instead.

## board.json

| Field | What it holds |
| --- | --- |
| `page` | the page id or slug |
| `figma` | `fileKey`, `nodeId`, `frameName`, `width`, `height` in Figma points, `pxPerPt` of the screenshot or PNG export, `rootTag` (`section` means the wrong node was fetched) |
| `sources` | `screenshot`, `metadata`, `designContext` (paths under `board/figma/`, null when absent) and `exports {css, svg, pdf, png, svgRaster, pdfText, pngPx, other[]}` |
| `regions` | the frame's top-level children from metadata, for crops before a spec exists |
| `crops` | region key, path, pixel size, tool |
| `figmaCalls` | `calls` made this run, `rateLimitedAt` (ISO) copied from the cache (a board written before this name kept them under `budget`; it is read from there) |

## Cache

`LOOPS_HOME/figma-cache/<fileKey>/<nodeId>/` holds `meta.json {fileKey, nodeId, frameName, fetched{metadata, screenshot, designContext, assets}, rateLimited{designContext}, fileVersion}`, `metadata.xml`, `screenshot.png` + `screenshot.json {maxDimension, pxWidth, pxHeight, pxPerPt, frameWidth}`, `design-context.md`, `assets/`, `exports/`. Writes go through a temp file and a rename. `board.mjs cache status|put|link|invalidate|rate-limit --file-key K --node-id N` drives it by hand; `invalidate` is the only way to re-fetch a frame that changed in Figma.

## Stops

- The metadata root is a `section`: stop and fetch the frame node. A section holds every frame on the page (434K characters for one measured login section) and scales to nonsense.
- The screenshot is missing and no PNG export exists: the board has nothing to judge against; capture or ask for the PNG.
- `status` says the design context is rate-limited: ask for the exports once, continue with `unknown` rows.
