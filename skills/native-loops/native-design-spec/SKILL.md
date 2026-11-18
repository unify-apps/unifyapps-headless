---
name: native-design-spec
description: "Keeps the design of a UnifyApps MOBILE app in the solution's design store (one design folder per app: a design.md index, sources, screens and specs) and turns it into spec.json, the design spec the visual check and the audit's UI check measure against. Takes a Figma frame (captured once by the ua:design-capture agent, the person's exports as the reliable path), an HTML prototype (measured in the Playwright browser) or screenshots (with boxes marked on them). Scales the design to the device and never pastes a Figma result into chat. A shared hidden block of the UnifyApps Headless loops, used for design intake by native-build-loop, native-fix-loop and the audit's UI check: 'capture the Figma frame', 'design board', 'make the spec from Figma', 'use this prototype as the design', 'here are the screenshots of the design', 'Figma is rate-limited', 'which values do I use on the phone', 'why does 24 become 20'."
user-invocable: false
---

# Loop design

The design of a MOBILE app lives once in the solution folder, in the design store `<solution>/design/<app-id>/`: `design.md` (the index: screen, state, page, source, version, reference, spec, notes), `sources/` (everything as given), `screens/<screen>.png` (the reference at device size) and `specs/<screen>.json` (the design spec the UI check measures against). The design is scaled to the phone (402 pt, 4 pt grid, safe top 62: [scaling](references/scaling.md)). The store's rules are in the loops' [design store](../loop-orchestrator/references/design-store.md); shared rules for design sources are in [rules](../loop-orchestrator/references/rules.md#design-sources).

A run reads its own board, `<run>/board/`: the spec, its region map, the reference and the region crops. Figma frames are cached once per frame in `LOOPS_HOME/figma-cache/<fileKey>/<nodeId>/` and linked into the board. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"`. Scripts need Node 22 and no packages; crops and picture conversion use macOS `sips`.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A design comes in for an app, or a run needs to know what the store holds | [Store](references/store.md) | `store.mjs status` lists every screen with its source, reference and spec; `design.md` says whether the person approved it |
| The design is an HTML prototype | [Intake](references/intake.md#an-html-prototype) | The prototype is in `sources/`; `spec-from-measure` wrote `specs/<screen>.json` with `source: html`; the reference is in `screens/` |
| The design is screenshots | [Intake](references/intake.md#screenshots) | Each picture is a reference in `screens/`; a spec exists only where boxes were marked, and it says what a picture cannot measure |
| A page needs its Figma board in a run | [Board](references/board.md) | `board.json` lists its sources; the capture agent returned paths and sizes, never content; `board.mjs status` says the next call or "no Figma call" |
| Figma is rate-limited, the seat is View, or the frame is too big | [Figma exports](references/figma-exports.md) | The export recipe asked ONCE; files folded in by `exports.mjs import` and kept in the store; a big SVG rasterised, never read |
| Turn the board into a spec | [Spec](references/spec.md) | `spec.json` with `schema loops.design.spec/1`, its summary printed, 0 `unknown` font properties when a CSS export or design context exists, `region-map.json` beside it, a copy in the store |
| What each Figma tool returns and costs | [Figma sources](references/figma-sources.md) | The capture agent knows the XML shape, the screenshot URL spec, the sparse-metadata fallback and the rate-limit text |
| Why 24 becomes 20 and 72 becomes 64 | [Scaling](references/scaling.md) | Every value in the spec comes from one rule in `scripts/lib/scale.mjs` |

Figma capture goes through the `ua:design-capture` agent: it calls the Figma tools, writes the cache (and, given `solutionDir`, `appId` and `page`, the store), and returns `{paths, sizes, rateLimited[], oversized[], frameName, width, height}`. A page already in the store needs no capture: `node "$S/store.mjs" link-run --app <appId> --page <page> --run-dir <run>` fills the board. The board is copied into every builder work folder for the page and cited as `Design: board/crops/<region>.png`.

Scripts: `store.mjs` (the design store), `board.mjs` (a run's board and the Figma cache), `exports.mjs` (the person's Figma exports), `figma-spec.mjs` (a Figma frame to a spec), and `measure-html.snippet.js` (what the browser runs on a prototype). Each answers `--help`.

Used by `native-visual-check` (reads `spec.json` and `region-map.json`) and by `/ua:native-build-loop`, `/ua:native-fix-loop` and `native-audit` (the `ui` check).
