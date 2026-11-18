# Plan the loading states

## Contents

- 1. Find the data regions
- 2. Pick each region's skeleton
- 3. The rules every skeleton keeps
- 4. The lines the spec takes
- 5. The task
- 6. Traps

Run this while writing a plan's spec and tasks, for every page the plan
creates or reshapes. A page with no data source (a static page, a form that
only submits) needs nothing here, and its plan says so in one line.

## 1. Find the data regions

A data region is a block whose content shows what a source returned: a list,
a tile's number, a value in a text line, a chart, a fetched image, a form
filled from a record. A block that only reacts to the data (a visibility, a
disabled switch, a style) is not one.

- **A new page.** The regions come from the design spec's regions and the
  Contract's data source lines: each region the design fills from a source
  is a data region. Without a design, from the `design` line of
  `ua:app-page-planner`.
- **An existing page.** `ua cache outline <pageId> --app-id <appId>` and
  `ua cache ds <pageId> --app-id <appId>`, then
  `node "${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/scripts/page-audit.mjs" <pageId> --app-id <appId> --json`:
  its X1 findings are the regions that have no loading state yet.

List the static chrome too: the header and title, section titles, the tab
bar, fixed buttons, and the greeting from `userContext`. It renders at once
and never sits inside a loading condition.

## 2. Pick each region's skeleton

A design with a loading frame wins: follow it. Otherwise:

| Region | Its skeleton | Its size from |
| --- | --- | --- |
| A list (`Repeatable`) | as many rows as fill the region's visible height, at most five; each row the row's own shape: a circle or square where the row has an avatar or icon, one bar per text line (the first about 60% wide, the next about 40%) | the row's height and gap in the design spec; the region's height |
| A tile or stat card | the card's box, one bar for the number, one short bar for its label | the card's box |
| A value in a text line (a name, a total, a date) | one bar the line's height, as wide as a typical value | the line height of its text style |
| An image or avatar | one block the image's box | the image's fixed box (X3) |
| A chart | one block the chart's box | the chart's box |
| Key-value rows, a detail section | one bar per row | each row's height |
| A form filled from a record | each field's box | each field's height |

Each piece is a `CONTENT` Loader (bars or one solid block), never the arc
spinner: the arc is a button's own `appearance.loading`.

## 3. The rules every skeleton keeps

- **One gate per section a source fills**, beside the section, not one per
  leaf. A gate covers every region inside the block it sits beside (X1).
- **The gate's box is the region's final box.** A skeleton shorter or taller
  than what replaces it moves everything below it when the data lands: the
  shift the loading check measures.
- **A list that is not the last region of its scroll has a fixed height or a
  fixed number of rows** (with a "See all" action). Otherwise the rows push
  what sits below them whatever the skeleton's height. A list that is the
  last region, or that owns the page's scroll, grows freely.
- **Shown while the source has neither `data` nor `error`**, and the content
  shown once it has data. Never `isLoading` alone: a manual source starts
  empty on every run, so a gate on `isLoading` leaves the region blank before
  the request starts (X1). The condition's exact shape is in the Loader sheet
  and `concepts/pages/loading-states`, which the builder reads.
- **A colour of its own**, the shimmer colour the Loader sheet names, picked
  from the app look and never the page background: a skeleton the colour of
  the page paints nothing.
- **An empty state and an error state beside every list and fetched value**,
  in the same task, since they read the same source (X4).
- **Nothing static inside a gate.** Chrome that waits for data is the blank
  screen the person sees first.

## 4. The lines the spec takes

- The requirements `ui_states` row: `loading (a skeleton per data region),
  empty, error`, plus every state frame the design has.
- `Contract`, one line per region:
  `loading · <Page> · <region>: <skeleton from § 2> · box <w>×<h> pt (or "the region's box") · shown while <dsName> has neither data nor error`.
  A list that is not the last region adds its fixed height or row count.
- `Business rules`: `static chrome renders at once; every data region shows a
  skeleton its own size while its source loads; an empty and an error state
  beside every list and fetched value`.
- `Proof`, two lines per page:
  `<Page> config | page-audit.mjs | 0 blocking on X1, X3 and X4` and
  `<Page> device | test runner, loading check | no blank band, no shift`.

## 5. The task

One `page-bind` task per page with a data region, after the bind task that
creates its sources, and before its `page-review`. It takes the next free
`t<n>` id (ids are digits only). A feature on an existing page (a Sonic plan,
one `page-bind`) puts the same lines in that task instead.

```json
{
  "id": "t3",
  "kind": "page-bind",
  "title": "Leave Requests: loading states",
  "entity": { "kind": "page", "name": "Leave Requests" },
  "dependsOn": ["t2"],
  "body": [
    "Read: UnifyApps Headless cache outline and UnifyApps Headless cache ds for the page, live on a miss, and note the page version; the data regions are the spec's loading lines.",
    "Check the sheet list (get_app_builder_knowledge_map), then read the Loader block's native and web sheets, the loading-states concept sheet, and app-design references/ux-layer.md sections 1 and 2 before the write.",
    "Done when: each loading line of the spec has its CONTENT Loader gate beside its region or section, the gate's box equal to the region's box, shown while the source has neither data nor error, and the content shown on data.",
    "Done when: an empty state and an error state sit beside every list and fetched value; no static chrome or userContext text is inside a loading condition.",
    "Write once: one apply_page_edits for the whole page.",
    "Read back: get_page_outlines and get_blocks for every gate and its region; report one line per region with the gate's block id, its box and its condition."
  ],
  "proof": "page-audit.mjs reports 0 blocking on X1, X3 and X4 for the page; get_blocks shows each gate's width and height equal to its region's"
}
```

The page's `page-review` task depends on this one, so the reviewer sees the
page with its states in place.

## 6. Traps

- **The loading states left to the layout task.** A layout task has no
  sources yet, so it cannot write a gate's condition; `app-design` hands state
  conditions to the bind task. The gate belongs in this task, after the bind.
- **The loading states left to "after the build".** `app-design`'s UX layer
  runs last in a builder's session and is the step it drops. A task of its
  own, with its own proof, is what gets it built.
- **A page quality pass as the only check.** X1 runs once every page task is
  settled, so a missing skeleton comes back as a late fix task, or not at all
  when the run stops first. The task and its proof catch it at build time.
- **`task-lint` T24** refuses a plan that builds a page with a data source and
  no task that names its loading states.
