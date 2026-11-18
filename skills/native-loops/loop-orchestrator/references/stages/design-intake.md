# Stage: design intake

Takes the design the person gives (Figma frames, an HTML prototype,
screenshots or PDFs) into the solution's [design store](../design-store.md),
and turns each screen into a reference image and, where the source has
numbers, a design spec the UI check and the visual check measure against. Owned by
the block [native-design-spec](../../../native-design-spec/SKILL.md), through
[web-design-spec](../../../../web-loops/web-design-spec/SKILL.md) on a WEB app;
Figma is fetched only by the `ua:design-capture` agent. Writes files in the solution
folder only, never to the tenant.

Used by `/ua:native-build-loop` and `/ua:app-build-loop` (from a design; a
feature from a description goes through the [feature stage](feature.md)),
`/ua:native-fix-loop` and `/ua:app-fix-loop` (when the design changed or no
store exists) and `native-audit` (when its `ui` check has no store yet).

The store follows the app's platform (`loops platform <appId>`): a MOBILE
store scales the design to the phone; a WEB store
(`store.mjs init --app <appId> --platform web`, made before the first
capture) keeps one design spec per width in CSS px (§ 3).

## 1. Read what exists

1. `design/<app-id>/design.md`: rows already approved are reused as they are.
   A source the person gives again with the same version is not fetched again.
2. Map each page in `scope.json` to its screens and states (on WEB, and its
   widths). A page with no row is audited for breakage only, and the run says
   so.

## 2. Take the sources in

| The person gave | Do |
| --- | --- |
| A Figma frame link (`…/design/<fileKey>/…?node-id=<a>-<b>` → node `a:b`) | `native-design-spec` [board](../../../native-design-spec/references/board.md): init the board for the frame, then one `ua:design-capture` agent per frame (`Agent(subagent_type: "ua:design-capture", …)` with `{fileKey, nodeId, cacheDir, runDir, want: ["screenshot","metadata"]}`, plus `platform: "WEB"` on a WEB app, so a design context comes back for the web framework), or the `design-board` workflow for several frames (`platform: "WEB"` in its args). The agent returns paths and sizes only. On WEB each frame is one width (its own width): a design with a 1440 and a 375 frame is two captures. |
| Figma is rate-limited, or the seat is View | Ask once for the exports ([figma exports](../../../native-design-spec/references/figma-exports.md)): select the frame, export CSS "all layers", PNG @1x and SVG, and drop them in `design/<app-id>/sources/`. Go on with `unknown` rows meanwhile. |
| An HTML prototype (a folder or a zip) | Follow `native-design-spec` [intake](../../../native-design-spec/references/intake.md) § An HTML prototype: `store.mjs add-source`, `store.mjs serve`, the measuring snippet through the Playwright tools into `sources/<screen>.measure.json`, then `store.mjs` writes the design spec (`source: html`). On WEB the window is resized to each width and measured once per width ([web-design-spec intake](../../../../web-loops/web-design-spec/references/intake.md) § An HTML prototype). Stop the server after. |
| Screenshots or a PDF | Follow `native-design-spec` [intake](../../../native-design-spec/references/intake.md) § Screenshots: `store.mjs add-source` keeps them and writes `screens/<page>[--<state>].png` at the device width (on WEB `screens/<page>[--<state>]@<width>.png` at the width the picture was shot at). Unmarked, the design spec holds only the page size and palette; boxes the person marks (§ Marked boxes) add sizes, gaps and sampled colours (`approx: true`). Everything else stays `unknown`, never guessed. |
| Pasted images in chat | Ask the person to drop the files into `sources/` instead; never keep a pasted design in the context. |

Once any frame in this run has come back rate-limited, do not call `ua:design-capture` again for a later frame: ask for its exports the same way, and go on with `unknown` rows for the rest of this run.

## 3. Design specs and references

1. Per page and state with numbers: `native-design-spec`'s
   [spec](../../../native-design-spec/references/spec.md) step writes
   `specs/<page>.json` (`schema loops.design.spec/1`) and the region
   map beside it, scaled by its [scaling](../../../native-design-spec/references/scaling.md)
   rule to the device (402 pt wide, 4 pt grid, safe top 62, on MOBILE). Read
   its printed summary only: regions, elements, properties by source,
   `unknown` fonts.

   **WEB:** one design spec per width, `specs/<page>[--<state>]@<width>.json`,
   in CSS px from the app's top-left (the design frame's top-left), 1:1 with
   the design: factor 1, whole px, no 4 pt grid, no safe top, no status band,
   no phone bars dropped, `device.widthPt` = the width
   ([web-design-spec intake](../../../../web-loops/web-design-spec/references/intake.md)).
   The widths are the design width (1440 unless the design is drawn at
   another) and the second width (375). Each width comes from its own
   source: a Figma frame of that width (`figma-spec.mjs --platform web`, then
   `store.mjs add-spec`), a prototype measured with the window at that width
   (`store.mjs spec-from-measure` takes one `--measure` per width), or a
   picture shot at that width. No device scaling is done, and a width is
   never derived from another: 375 with no frame of its own has no design
   spec, by design, and `store.mjs status` lists it under `notCompared`; the
   responsive check covers it, and the visual check does not compare the page
   at that width. The region map is per width too
   (`specs/<page>@<width>.region-map.json`): a side bar, a top bar or a column
   that moves between widths is its own region at each. `web-visual-check`
   reads each width's design spec straight from the store
   (`--store <solution>/design/<app-id> --screen <page>[--<state>] --width <px>`).
2. One reference image per screen and state in `screens/` (on WEB per width),
   and one crop per region for builders (`board.mjs crops`). On WEB the run's
   board (`store.mjs link-run`) holds one width, the widest unless
   `--width` names another, so builder briefs cite the widest design; the
   other width is checked from the store, not the board.
3. Write the rows of `design.md` ([design store](../design-store.md)).

## 4. Approval

Show the rows (screen, state, width on WEB, source, design spec or not) in one table and ask
once, inside the run settings when the goal asks them: "Is this the approved
design?" · Approved · Change something. Only approved rows are built or fixed
against. Record who approved and when in the `design.md` header.

## 5. Planner lines (`build` only)

For a new page or a reshaped region, load `ua:app-page-planner` for its
method, then derive the page's `job` and `design` lines from the design spec and
the run settings without inventing a look: one region per top-level section in frame
order, weights by its rule, region text from the spec's real labels. No
`app look` line when the app already exists.

## Done when

Every page in scope has an approved row or a `breakage only` note; every row
with numbers has a design spec (on WEB, every width a source exists for, and
the widths without one are named); nothing from Figma or the prototype entered the
chat. Run log: `stage.end` with the counts of rows, design specs and rate limits.
