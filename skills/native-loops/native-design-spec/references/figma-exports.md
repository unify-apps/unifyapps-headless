# Figma exports: the reliable path

When the seat is View, the frame is big, or a call just hit the rate limit, the person exports the frame once and the board never needs Figma again. Ask for this ONCE per run, with the list below, and fold the files in with `exports.mjs import`. On an earlier rebuild the exports (CSS, SVG, PDF, PNG) were the only source for the Home spec; the MCP was rate-limited 10 of 11 times.

## What to ask for

Select the frame (not the section, not the page) in Figma and export:

| Export | How | What the board takes from it |
| --- | --- | --- |
| CSS, all layers | Dev Mode → select the frame → Inspect → Code: CSS, or a plugin that writes every layer as `/* Layer name */` blocks (one such export had one block per layer with `position`, `left/top`, `width/height`, fonts, colours, radii, shadows, gradients, `leading-trim: both; text-edge: cap`) | Every style expectation: fonts, line heights, weights, colours, letter-spacing, radii, fills, gradients, shadows, blurs, opacity, borders, and whether text is cap-trimmed |
| PNG at 1x or 2x | Export → PNG | The picture the visual check is judged against and the crops; its pixel width over the frame width is `pxPerPt` |
| SVG | Export → SVG, "Include id attribute" on when offered, text not outlined | Shadows, blurs, gradients and strokes by geometry when no CSS export exists; above 1 MB it is rasterised with `sips` and the raw file is for the script only |
| PDF | Export → PDF | Text positions; folded in as text only when `pdftotext` is installed |

Exact menu labels change with Figma releases and are not confirmed here; the file shapes are.

## Where they go

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts/exports.mjs" import --run-dir "$RUN" <files or folder>
```

Files land in `RUN/board/exports/` under slug names and are recorded in `board.json` → `sources.exports`. A later `board.mjs status` sees them.

## Size rules

- Never paste an export into chat and never read a raw SVG into the context: a 52 MB SVG paste broke a session that had already compacted four times. The script reads it.
- An SVG above 1 MB is rasterised to `<name>.raster.png` by `sips` at the SVG's own size in about a second; `qlmanage` renders sharper at 2048 px but hung for minutes on the same file, so it is only the fallback for files under 8 MB. The result is marked in `sources.exports.svgRaster`, or `unrasterised` when neither tool worked.
- PDF text needs `pdftotext` (poppler); without it the PDF is kept and the text step is skipped, and `exports.mjs` says so.
- Screenshots the person pastes into chat are saved to a file by the loop and never kept in context; the design store keeps them ([intake](intake.md#screenshots)).
- Keep the exports in the design store too, so the next run needs no Figma call: `store.mjs add-source --app <appId> --page <page> --kind figma-export <files>`.
