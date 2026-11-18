# Layout, sizing and responsive

Sizes, scroll and per-device overrides that hold on every screen.

57 rules: P0 1, P1 13, P2 38, P3 5.

## P0

- Give a PAGE-mode Repeatable an explicit height or minHeight on itself or a parent; otherwise only the pager renders and rows are blank. (web only)

## P1

- Give a chart using h-full or a percentage height a parent with a fixed height.
- Give images in an export header or footer a fixed height.
- Add at least minHeight or maxHeight for vertical repeatable.
- Add at least min or max width for horizontal repeatable.
- Set width and height on bound Images, `CONTENT` Loaders and progress blocks before data lands. (mobile only)
- Put sticky CTAs in the footer socket, not as the body's last child.
- List every child of the base parent in a device's own copy of that parent (content.blockIds), or a new child is invisible on that device.
- Keep per-device overrides to presentation (style, visibility, text); flag overrides of data binding, defaults, module or child refs.
- A page meant for PDF export has no iframe or fixed-height box that scrolls inside it; a scrolling box prints as one page. (web only)
- When root_id has h-full, give each direct child flex-shrink-0 or unset the root height; else sections with overflow hidden cut content. (web only)
- Keep a Calendar's h-full only under a parent with a resolvable height; otherwise the calendar collapses to nothing.
- Put a real visible block inside header_id; an empty header shows in the builder but is absent when published.
- Pair a fixed height with the same minHeight or flex-shrink-0 on charts and loaders in a column Stack, or they shrink.

## P2

- Avoid forced scrollbars.
- Flag blocks with event overrides in non-base devices.
- Flag an overlay control inside a scrolling or `overflow`-clipped ancestor unless its sheet says it escapes.
- Omit the width/height key to size to content; there is no auto value.
- Leave height off blocks inside a scroll owner unless they need a fixed pixel size.
- Give flex columns `{flex:1, minWidth:0}`.
- Set explicit width and height on Image and Carousel so the layout doesn't jump on cold load.
- Use `object-contain`, not `contain`.
- Remove per-device overrides left on deleted or restructured blocks.
- Put one `gap` on the container instead of margins on each child.
- Set one horizontal page padding so left and right edges align down the page.
- Give sibling cards the same padding, radius and gap.
- Make gaps between sections larger than gaps within them.
- Keep padding, gap and margin numbers on the 4pt grid; use one side gutter across the app. (mobile only)
- Move title bars and back buttons out of the body into the header socket.
- Don't force header or footer bands the design doesn't have.
- Flag groups that break the look's `groups`, cards inside cards, or inside gap equal to between-group gap.
- Fill with `w-full` / `h-full`; flex with `flexGrow` or `{flex:1, minWidth:0}`.
- Add `{flexShrink:0}` to trailing control clusters so they align across rows.
- Read sibling keys like `objectFit` and `position` before changing any block size.
- Use the 4/8/12/16/24/32 scale for new spacing only; never renumber existing values.
- Let wide content scroll inside its own container rather than stretching the page.
- Review per-device block overrides for drift between devices.
- Do not hardcode a height in custom CSS to rescue a block that renders at zero height; it clips the block when its content grows. (web only)
- A sticky block sets top: 0 in custom CSS (the panel has no offset), has a background, and no overflow ancestor sits above it. (web only)
- Padding and gap on a paginated, virtualised Repeatable's style are ignored; pad inside the row template or a wrapper. (web only)
- In right-to-left locales mirror directional icons and left-only styles; keep phone, ID and amount inputs left-to-right with Western digits. (mobile only)
- Give a drawer a header, a body that grows and scrolls, and a footer, so content doesn't bunch and the footer stays visible.
- Give each topic or metric group its own section under root_id with a section heading, not one flat stack of everything.
- Give each cell of a row template a fixed width so counts, times and prices line up from row to row.
- Make the gap between groups at least twice the gap inside them, both from 4/8/12/16/24/32.
- No fixed width of 380pt or more on a mobile block; Figma's 440pt frame overflows a 402pt phone. (mobile only)
- Give bottom-edge chrome (footer bar, custom tab bar root) pb-safe; content blocks never pad for the bottom inset. (mobile only)
- Clear a floating tab bar with the last block's bottom padding, not a trailing fixed-height spacer Stack. (mobile only)
- To paint root_id's background past one screen, give it minHeight min-h-full and flex-shrink-0 and unset its h-full height. (web only)
- Give a root_id child that must keep a fixed height a matching minHeight or flex-shrink-0; root_id's children shrink. (web only)
- Don't switch a Container to a layout with fewer columns than it has sockets; leftover sockets keep taking grid cells.
- Don't drive responsive layout from deviceContext dimensions; use per-device appearance settings.

## P3

- Avoid redundant 0° rotation in block styles.
- No percentage height inside an auto-height parent.
- Replace spacer Dividers, empty Typography and padding-only Stacks with one style key.
- Remove device override entries whose only change is an empty dataSourceIds list.
- Give select fields in a form full width so they line up with the inputs around them. (web only)
