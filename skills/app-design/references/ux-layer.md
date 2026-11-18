# UX layer — the pass after the build

A plan's page quality pass audits with `skills/app-page-quality/references/rulebook.md`; X1–X4, U1, U4 and U7 there are this pass's rules — prevent the findings here.

## Contents
- 1. Loading states — a skeleton the exact size of what it replaces
- 2. Empty and error states — for every list and fetched value
- 3. Keyboard — nothing the user types into may hide behind it (MOBILE only)
- 4. Double-submit and busy buttons
- 5. Tap targets and feedback (MOBILE)

Run this ONCE, after the build's read-back matched (and, when the visual
check was asked for, its rounds are done). It is a config pass — reads and
writes against the stored page, no browser. It makes the screen behave
right under real conditions: data that has
not arrived yet, a keyboard covering the input, a list with nothing in it, a
button pressed twice. Each item says how to detect the need from the page, what
to write, and the platform trap that makes the naive version fail.

Work in this order. Batch every edit into ONE `apply_page_edits` per page.

## 1. Loading states — a skeleton the exact size of what it replaces

**Detect:** any block whose content binds to a data source
(`{{ e_<dsId>['data']… }}`): Repeatable, Table, Chart, KeyValue, Typography
bound to a fetched value, Image whose src is fetched. Each of those is blank or
jumps while the source loads.

**Write:** a SIBLING `Loader` beside the data block, in the same parent, built
from the Loader's own sheet: `blocks/loader`, or `native/blocks/loader` on a
MOBILE app. Its type table, "Sizing a skeleton" and "Making a loader appear
only while something loads" are the recipe; this pass does not copy them,
because a copy goes stale. What this pass decides on top of the sheet:
- a `CONTENT` skeleton, not the arc spinner;
- its box the size of the FINAL block's box — read those off the data block's
  own `appearance.styles`. A skeleton of a different size causes the very
  layout jump it exists to prevent;
- a colour in `appearance.styles.backgroundColor`, which the sheet calls the
  shimmer colour. On web a skeleton with no colour paints nothing, so the
  loading state reads as a blank gap;
- its visibility the loading condition the sheet gives, not `isLoading` alone,
  and the data block the inverse. The condition shape is in
  `ai-editing/condition-objects`.

**Traps:**
- The data block has NO loading state of its own (Repeatable, Chart, Table:
  none). Nothing under `content` adds one; the sibling is the platform pattern.
- `properties.loader` (the page-level skeleton) is a different feature: the
  whole page's placeholder while the page itself loads. No verb creates it;
  do not confuse it with per-block loaders.
- When the task's Proof marks `[visual]`, verify the skeleton with the
  force-show → shoot → revert loop in
  [visual-verification.md](../../app-verify/references/visual-verification.md).
  Otherwise its read-back is the proof, and the report says `visual: not
  requested`.

## 2. Empty and error states — for every list and fetched value

**Detect:** the same data-bound blocks as above.

**Write:** a sibling Typography (or Stack with icon + text) whose visibility is
a condition on the EMPTY result. Careful with arrays: a `MISSING`/is-empty
check matches only null/undefined — an empty array slips through. Compare the
length: property `{{ (e_<dsId>['data']['objects'] || []).length }}` equals `0`.
For errors, the same shape on `{{ e_<dsId>['error'] }}`.

**Trap:** a block placed in a Repeatable's `header` slot renders whether or not
there is data — it is not an empty state.

## 3. Keyboard — nothing the user types into may hide behind it (MOBILE only)

**Detect:** any TextInput, TextArea, Form, or MessageInput on the page,
especially in the lower half of the screen or inside a scroll region.

**Write:** a `keyboardConfig` in one block's Style JSON, stored the way
`app-native`'s `references/native.md` rule 18 says. Which block:

- When a vertical scroll owner already scrolls the inputs, that block takes
  it: a `Scrollable` gets `keyboardConfig: {"type": "scroll"}`, and a
  scrolling Stack takes the keyboard scroll in place of its `overflow` token.
- Only when nothing above the inputs scrolls does the NEAREST ancestor
  `Stack` that holds the inputs AND the content above them take it (usually
  the section wrapper, sometimes the body root).
- Never add a second scrolling Stack inside a scroller: a `keyboardConfig`
  of `type: "scroll"` makes a Stack scroll, and one scroll owner per axis is
  the page quality pass's U2.
- Inside a BottomSheet, set the sheet's
  `appearance.behaviour.keyboardAvoidance: true` instead (below).

```json
{ "keyboardConfig": { "type": "scroll", "scrollViewOffset": { "iosOffset": 16, "androidOffset": 24 } } }
```

- `type: "scroll"` — the block becomes a keyboard-aware scroll view; inputs
  scroll into view above the keyboard. The default for forms and any
  scrolling content, and the only type a `Scrollable` acts on.
- `type: "keyboardAvoidingView"` (+ `behavior: "padding"`,
  `automaticOffset: true`) — the stack shrinks/pads instead of scrolling; for
  a fixed-height layout with one input.
- `type: "sticky"` — for a bar that must ride on top of the keyboard (chat
  composer).
- Only a `Stack` (any type) and a `Scrollable` (`scroll` only) read
  `keyboardConfig`. A BottomSheet lifts with `appearance.behaviour.keyboardAvoidance`,
  and a sheet too tall to lift (full screen, a percentage height over 60%, or
  no height) also keeps `appearance.behaviour.scrollableBody` on. A Drawer
  never lifts, and on any other block the key is silently ignored.
- A Stack's `keyboardConfig` never takes effect when the same Stack has
  `linearGradient` or `blurConfig`; put it on a plain Stack inside.
- The `extraKeyboardSpace` per-platform offsets exist for a footer that sits
  above the keyboard — measure, do not guess.

## 4. Double-submit and busy buttons

**Detect:** a Button whose event chain calls a data source or submits a form.

**Write:** `appearance.loading` as a condition object on that source's
`['isLoading']` (or the form's submitting state), stored as
`{ "type": "filter", "payload": <group> }` the way the builder writes it. Loading
already disables the button — do NOT also write `disabled`, that is two knobs
for one state.

## 5. Tap targets and feedback (MOBILE)

- Which blocks take a tap on native is in the `app-native` skill
  (`references/native.md`, rules 1–5). A Stack or Icon with an event is dead.
- A small tappable (icon, chip) gets `hitSlop` on the Pressable rather than a
  bigger visual box, written as an object, `{ "all": 8 }`; the phone drops a bare
  number.
- Press feedback is on by default (`appearance.interactions`); do not zero it.

The config-review self-check follows as `app-design` step 4 says; it is not
repeated here.
