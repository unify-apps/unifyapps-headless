# Verifying what the resting screenshot cannot show

A screenshot after `open-page` captures the canvas AS IT SITS: overlays
closed, loaders hidden, empty states suppressed. A clean resting shot proves nothing about those
states — and they are exactly where reported failures cluster. This procedure
runs INSIDE the normal check rounds (the 2-round cap still holds).

## 1. Overlays — BottomSheet, Drawer, Modal, MobileContextualDialog

The canvas renders an overlay open when the overlay block is SELECTED in the
builder, and selection is addressable by URL: `?blockId=<overlay block id>`.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> open-page "<builder URL>?blockId=<sheetBlockId>"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" <browser> screenshot --filename=<sheet>.png
```

`open-page` loads that exact URL, query included. The query survives
`…/builder/page/<pageId>`. The shot shows the sheet open → judge its content
like any screen. The next `open-page` of the plain page URL shows the resting
page again: every `open-page` loads fresh.

If the shot still shows it closed (not every builder version auto-opens on
selection): verify structurally instead — `get_blocks` on the overlay
subtree, confirm children, bindings and height — and SAY the visual could not
be checked. Never report an unverified overlay as looking right.

**A module's Modal:** the builder canvas does not run a module's onPageLoad,
so a Modal it opens stays closed there. The preview route runs it. Walk the
page there: `open-page` the preview URL, click what opens the Modal when the
load does not, then `screenshot`.

**Height:** give every BottomSheet a height: an explicit height, snap points, or `h-auto`, which sizes the sheet to its
content, capped at 90% of the window (`native/blocks/bottom-sheet`). With none it opens at 61.8% of the window.

## 2. Conditional states — skeleton Loaders, empty states, error states

Hidden behind `isLoading`/emptiness conditions that are false in the canvas.
Force-show → shoot → revert:

1. `get_blocks` each state block FIRST and copy its exact `visibility`
   value. You restore this verbatim — never rebuild a condition from memory.
2. ONE `apply_page_edits`: set those blocks' `visibility` to `true` (and
   where a state block overlaps its data block, set the data block's to
   `false`). All of the page's conditional states in this one call.
3. `open-page` and `screenshot`. A skeleton must occupy the SAME box as the block it replaces —
   same height and width — or it causes the very jump it exists to prevent.
4. ONE `apply_page_edits`: restore the saved `visibility` values verbatim.
   The revert is unconditional — it happens even if the shot failed or the
   task is abandoned. Never end with a forced state left in the page.

## 3. Judging spacing in any shot

Judge spacing against the scale in the `app-design` skill (one `gap` per
container, one horizontal page padding, values from 4/8/12/16/24/32) and the
"Spacing rhythm" rules in `app-verify/references/config-review.md`. One check
only a shot can show: gaps BETWEEN sections must be larger than gaps WITHIN
them.
