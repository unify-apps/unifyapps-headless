# Kit: parts proven to look finished on this platform

## Contents
- How to use this file
- Rules every table, form and status follows
- A table of records to compare
- Rows grouped under headings
- What a page is laid out at
- Adding a part

## How to use this file

Each part below was built on a test tenant, shot, and judged by a reviewer that
did not build it. Its settings are the ones that worked, not a guess. When a
page's design names a region that one of these parts covers, start from its
settings; read the block's knowledge sheet for anything else. A part here
holds no page shape: it says how to build one region well, not which regions
a page has. The page's job and design decide that.

The platform's defaults are the reason this file exists. A Table left on its
defaults draws dark lines on every cell and an empty filler column; that is
what the first Parts Finder page shipped with.

## Rules every table, form and status follows

These rules come from design research (Nielsen Norman Group, Luke
Wroblewski's form studies, GOV.UK, Carbon, WCAG), not from a run on this
platform, so they hold whatever block builds the region. Take each setting
from the block's knowledge sheet. `app-verify`'s config-review checks them.

**Tables**
- The first column is a name a person reads, never an id.
- Columns go in order of importance, with related ones side by side.
- Numbers and money are right-aligned; text is left-aligned; a header lines
  up like its column. Nothing in a table is centred.
- A number meant for a quick look is rounded ($3.8M, not $3,848,305.93); the
  exact value is in the record.
- Bulk actions show only after rows are selected, beside a way to select
  all. A filter that is on shows that it is on, and how to clear it.

**Forms**
- Labels sit above their fields, in one column, and a field is as wide as
  its answer. A placeholder is never the label.
- Mark the smaller group: the optional fields when most are required, the
  required ones otherwise.
- An error sits next to its field, keeps what was typed and says how to fix
  it. A long form also lists every error at the top.
- One primary button, worded as its result ("Save order", not "Submit"). A
  destructive action asks first, names the item, and its buttons say the
  result ("Delete order" and "Keep order").

**Waiting**
- Under 1 second, show nothing. From 2 to 10 seconds, a skeleton in the shape
  of what is coming for a whole region, or a spinner for one small part.
  Past 10 seconds, a progress bar.

**Status**
- A status shows its colour plus an icon or its word, never colour alone.
- At most 5 or 6 statuses, and one status looks the same everywhere.
- Red means act now, amber means look soon, green or grey means fine.
- A chart's series take the app's brand and grey shades, never the status
  colours. Bars and lines over pies.

## A table of records to compare

Use it for rows a person scans and compares: parts, orders, stores. Proven
on a test app's parts table.

| What it gives | Settings |
|---|---|
| Lines between rows only, none between columns | `appearance.gridLineAxis: "xBetween"`, `appearance.gridLineColor: {custom: "var(--border-secondary)"}` |
| No empty filler column; the main column takes the spare width | `content.addOns.layoutMode: "grid"`, and on the main column `columnComponentProps.appearance.grow: true` with a base `width`; on every other column `grow: false`, because in grid mode a column that leaves it out stretches too, and a 2-column table splits about half and half; the table `appearance.styles.width: "w-full"` |
| A header row that does not compete with the rows | `appearance.headerAppearance: {styles: {color: "text-secondary", backgroundColor: "transparent"}}`, and on each column `columnComponentProps.appearance.header: {variant: "text-xs", weight: "medium", color: "text-secondary"}` |
| Numbers and money right-aligned | `columnComponentProps.appearance.align: "right"`; money as a `CURRENCY` column with `addOns.currencyCode` |
| Two lines in one cell: a name, and a code or note under it | a `TEXT_DESCRIPTION` column: `fieldKey` on the name, `addOns.description` bound to the second line, `columnComponentProps.appearance.title` and `.description` for the two sizes; set `appearance.rowHeight: "comfortable"`, because `compact` clips the second line to nothing |
| A state chip beside a number (in stock, low, out) | a `CUSTOM` column whose cell holds a Stack (`justifyContent` end) with a Tag (`size: "sm"`, `variant: "soft"`, `label` and `color` bound to the row's state) and a Typography for the number |
| A row action whose words follow the row (Hold, Transfer, Order) | a last `CUSTOM` column with an empty `label` that holds one Button, its label bound to the row's state |

A click on a column header never sorts. Sorting needs the rows from a data
source (the table's own sort over the source's sortable fields), or a sort
written as a page variable and a function (`blocks/table`). A table that holds
a literal sample has no sort, so a layout never promises one; the bind adds it.

A `TAG` column with `addOns.colorMapping` gives every value its own colour.
Keep colour for states a person acts on; a plain category reads better as a
neutral tag. Check every label a binding picks against its row: the proven
page shipped "Order" on parts that were in stock, because the state names in
the binding did not match the data.

The Table cannot group rows under headings. That needs the next part.

## Rows grouped under headings

Use it when a list splits into a few named groups (front and rear axle,
open and closed). Proven on a test app's search page, where the reviewer
passed it.

- One small Typography heading per group, with its count ("Front axle · 4").
- Under each heading, one Repeatable: `appearance.layout: "list"`,
  `direction: "vertical"`, `separator: {enabled: true, appearance: {styles:
  {backgroundColor: "bg-tertiary", height: {custom: "1px"}, width: "w-full"}}}`,
  `styles.gap.all: "gap-0"`.
- The row template is one Stack in a row. Not yet proven: on that page each
  cell took its content's width, so the counts, times and prices did not line
  up from row to row. Give each cell a fixed width so the columns align, and
  shoot it to check.
- Build the Repeatable and its row template in one `apply_page_edits` call.
  Replacing the template in a later call breaks every row binding (found on
  the same run).

## What a page is laid out at

A desktop page sits in a frame at least 1440 px wide (`min-w-[1440px]`). In a
narrower window the page does not shrink: whatever sits at its right edge is
cut off, with no scroll bar. The preview's "Switch variant" menu lays the page
out at the platform's own device sizes: Laptop 1366 x 709, Laptop 1440 x 834,
Desktop 1680 x 1050, 1920 x 1080 and 2560 x 1440. Those are the sizes a page
is shot at (`app-verify`'s `references/browser-walk.md`).

A body root (`root_id`) with `height: h-full` is a column as tall as the
window, and its sections are its flex children, so they shrink to fit it
rather than let the page grow. A section whose custom CSS has `overflow:
hidden` then shows cut off: values, rows and the last tiles go missing with no
error. Give every direct child of such a root `appearance.styles.layout:
"flex-shrink-0"`, or leave the root's height unset.

## Adding a part

A part joins this file only after a run proves it: built, shot at two device
sizes, and passed by a reviewer that did not build it. Write the settings that
worked, the kind of page it was proven on (never a client's app name), and
what is not yet proven. A part that is only believed to work stays out.
