# Performance and page weight

What the page costs to load and render.

51 rules: P0 1, P1 18, P2 27, P3 5.

## P0

- A hidden subtree of tens of blocks, or one bound to a heavy query, still ships.

## P1

- Remove always hidden blocks.
- Keep action delays at 200 ms or less.
- Limit Number of Table Columns Displayed.
- Limit the total number of blocks under 500 per page.
- Keep data sources under 50 per page.
- Keep each page at or under 100 data sources (hard cap).
- Keep block inputs plain references: no functions, array methods or `{{ }}` over 200 characters. (mobile only)
- Keep on-load data sources below 2 (blocking at 5+); merge sources hitting the same automation. (mobile only)
- Serve static images as WebP at 1×-2× the box, under 200 KB, with width and height set. (mobile only)
- Past 160 blocks, defer below-the-fold heavy regions behind a 150-300 ms `onPageLoad` variable or Tabs. (mobile only)
- Search and filter inputs debounce 250 to 500 ms before refetching.
- No more than 3 sources run on page load, fewer if synchronous.
- No base64 or data: images, or large inline blobs, in block props or page variables; upload the file and use its URL.
- A visibility or run condition that reads a variable nothing ever writes is a constant; the block is always hidden or always shown.
- Hold only edited fields keyed by row id in a draft variable, never a full copy of every row.
- Never cache approval state, stock, prices or a read that feeds a write.
- Don't set a Repeatable's containerId while the list's own height is clamped; the render window freezes.
- Don't set flags.shouldUseBuiltDependencies true on a hand-assembled page; bindings stop updating.

## P2

- Limit the total number of blocks under 300 per page.
- Remove always hidden columns in tables.
- Remove hidden row actions in tables.
- Remove hidden toolbar actions in tables.
- Remove hidden column actions in tables.
- Flag excessive custom CSS usage on page.
- Split Tabs with more than 5 tabs or 50 children into modules.
- Turn a Repeatable with more than 20 nested blocks into a module.
- Avoid Using a Repeatable Component Inside Another Repeatable.
- Combine more than three consecutive Set Variable actions.
- Avoid too many or too-large images on one page: over 15 Image blocks or 20 megapixels.
- No state lost when a block is hidden by a condition.
- No heavy bindings: a function call, an array method, or over 200 characters.
- Remove structural cruft: single-child wrapper Stacks, a Pressable around a Button, spacer Dividers, unfilled scaffold slots. (mobile only)
- Heavy above-the-fold tables and charts are non-blocking data sources.
- Images have a fixed width and height.
- Custom CSS on half the blocks or more means the theme is not doing its job.
- Remove page-scoped variables and sources nothing reads.
- Expensive queries carry a cache TTL.
- A keystroke never re-renders a heavy table or chart through a variable.
- No expensive bindings in a Repeatable's row template.
- Turn Realtime Events on only when a page publishes or subscribes to a topic, and give each topic an event schema.
- Turn on app analytics before release, so Insights has real-user load and query timings for the live review.
- Use PLAIN_TEXT Typography for text needed on first paint on mobile; HTML and MARKDOWN load lazily. (mobile only)
- Upload a changed image under a new file name; the phone and the CDN keep showing the old picture.
- Remove references to deleted modules and template components; each stale id costs a failed backend fetch on every load.
- Set Capture Photo quality to 0.8 or lower on mobile; full quality makes 3.5 to 5 MB photos and previews about 12 s late. (mobile only)

## P3

- Collapse single-child Stacks that add no layout of their own.
- Question anything nested more than about four levels below the body.
- Keep a Stack that owns scroll, holds `keyboardConfig`, is slot content, or is condition- or event-bound.
- Preload a pushed screen's remote images with the Mobile Utils preloadMedia action; otherwise each appearance refetches them. (mobile only)
- Store template preview images as uploaded urls, never data: URLs.
