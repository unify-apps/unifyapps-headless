# The design store

The approved design of an app, MOBILE or WEB, lives in the solution folder,
once, so every run, job and test runner measures against the same answer key:

```
<solution>/design/<app-id>/
  design.md               the index: one row per screen and state (and width, on WEB)
  sources/                what the person gave, as given: Figma exports, a prototype's .html and assets, screenshots, PDFs
  screens/<page>.png      one reference per screen and state, at device size
  specs/<page>.json       the measurable design spec the UI check and the visual check compare with
```

A WEB app's store (`store.mjs init --platform web`) keeps one reference and
one spec per screen, state and width, in CSS px from the app's top-left, 1:1
with the design (no device scale, no grid, no safe top):

```
  screens/<page>[--<state>]@<width>.png      home@1440.png, home--empty@1440.png
  specs/<page>[--<state>]@<width>.json       what web-visual-check compares the page with at that width
```

The widths are the design width (1440 unless the design is drawn at another)
and the second width (375). Each width comes from its own source (a frame, a
measure or a picture at that width). 375 gets a spec only when the design
has a frame at 375; without one, the responsive check covers it. A width with
no spec is not compared, and a spec is never derived from another width.

`native-design-spec` writes it, through `web-design-spec` on WEB
([design intake](stages/design-intake.md)); the `ua:design-capture` agent
fetches Figma frames into `LOOPS_HOME/figma-cache/` and links them here.
Nothing in the store is pasted into chat.

## `design.md`

```
# Design — <App> (<app-id>)
- Approved: <who said so and when, in their words> | not yet approved
- Device: iPhone 16 Pro 402×874 pt, safe top 62 · scale rule: <canvas> → 402 (×<k>), 4 pt grid

| screen | state | width | page (name · id) | source | version | reference | spec | notes |
|---|---|---|---|---|---|---|---|---|
| Home | idle | 402 | Home · e_… | figma <fileKey>/<nodeId> | 2026-10-11 | screens/home.png | specs/home.json | header shadow not drawable (platform) |
| Home | empty | 402 | Home · e_… | screenshot | 2026-10-11 | screens/home--empty.png | — | |
| Leave | sheet open | 402 | Leave · e_… | prototype sources/proto/leave.html#sheet | v3 | screens/leave--sheet.png | specs/leave.json | |
```

On WEB the `Device:` line reads `browser (WEB) · widths 1440, 375 · one spec
per width, CSS px from the app's top-left, 1:1`, and each screen and state has
one row per width, the widest first
(`| Home | idle | 1440 | … | specs/home@1440.json |`, then a 375 row when the
design has a frame at 375).

A `design.md` written before the `width` column is read as it is and gets the
column on its next write.

- `state`: `idle`, `focused`, `sheet open`, `empty`, `error`, `loading`, `in chat` (a card page), or the design's own name.
- `source`: `figma <fileKey>/<nodeId>`, `prototype <path>#<anchor>`, `screenshot`, `pdf <path> p<n>`.
- `version`: the design's own version or the date it was taken in. A new
  version adds rows; old rows stay with `superseded by <version>` in `notes`.
- `width`: the device width on MOBILE; on WEB the CSS px width the row's
  reference and spec are for.
- `spec`: `—` when the source gives no numbers (a screenshot alone): the
  UI check then compares by eye from at most two crops and marks its issues
  `GUESS`.

## Where the numbers come from

| Source | Spec | Exact |
| --- | --- | --- |
| Figma frame | `figma-spec.mjs` from the frame metadata, the design context (once) and the person's CSS export | sizes, gaps, radii, fonts once a design context or CSS export exists |
| Figma exports only (rate-limited seat) | the same script from the CSS "all layers" export and the PNG | sizes and fonts; colours from the PNG |
| HTML prototype | the prototype served on its own port, element boxes and computed styles read with the Playwright tools (on WEB with the window at each width), then `native-design-spec` writes the spec | everything the browser computes |
| Screenshots | `store.mjs` from the screenshot: page size and palette; with marked boxes ([native-design-spec intake](../../native-design-spec/references/intake.md) § Marked boxes) also their sizes, gaps and sampled colours (`approx: true`) | the marked boxes only; the rest stays `unknown` |

The scale rule (canvas width → 402 pt, values to the 4 pt grid, fonts and
values under 7 pt to whole points, letter-spacing in em) is
`native-design-spec`'s; every spec value traces to one rule of it. The rule and
the device's safe top go into every issue log's header. A WEB spec is not
scaled: factor 1, whole px, its width in `device.widthPt`, and the width goes
into the issue log's header instead.

## Rules

- **Approved means the person said so.** A run builds or fixes against an
  approved row only. An unapproved store is audited for breakage only (crash,
  clipped text, overlap, dead taps) and says so.
- **Captured once.** A frame is fetched once per version; a rate limit asks
  once for the exports (`native-design-spec` § Figma exports) and goes on with
  `unknown` values.
- **Big files go to disk.** An SVG over 1 MB is rasterised; a design context
  over 100K characters is kept on disk and read in slices.
- **No real data in references.** Screenshots with real names or numbers stay
  in `sources/`, never in a brief, a ticket or the run log.
- **Known inconsistencies** in the design (two radii for one card) are written
  in `notes` once, so no job copies both.
