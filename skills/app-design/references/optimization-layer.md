# Optimization layer — the pass after the UX layer

A plan's page quality pass audits with `skills/app-page-quality/references/rulebook.md`; P1, P5, P7, U1 and U2 there are this pass's rules, and so are P3's duplicate sources — prevent the findings here.

## Contents
- 1. Stack inside Stack with nothing to add
- 2. Stack inside Pressable
- 3. Repeatable inside a Scrollable
- 4. Two scroll owners
- 5. Block that renders nothing where a prop would do
- 6. Composite scaffolds left half-empty
- 7. Bindings and data
- 8. Events on the wrong block
- When you are done

Run this ONCE, last. The screen looks right and behaves right; now make its
structure cheap. Every extra block is a render, a dependency walk and a
config surface a maker has to read later. Each item says how to detect it
from `get_page_outlines`, what to do, and why it matters on this platform.

**Scope.** Act only on blocks this task created or was asked to change;
anything else you notice goes in the report's `notes`. A `delete_blocks`
below is routine page editing (`app-design` § Destructive steps): it needs no
yes, and the report's `notes` names each block it removed.

Read the outline in `tree` view first — structure problems are visible there
without loading a single block's config. Batch fixes into one
`apply_page_edits` per page; `move_blocks` and `delete_blocks` are its steps.

## 1. Stack inside Stack with nothing to add

**Detect:** a Stack whose ONLY child is another Stack, or a Stack that adds no
layout of its own (same direction, no gap/padding/background/border/height of
its own) around a single child.

**Fix:** `move_blocks` the grandchildren up to the outer Stack, `delete_blocks`
the inner one. Keep whichever of the two carries the real styling.

**Why:** each Stack is a full render boundary and a row in every dependency
recompute; on native it is an extra `View` in a tree that is already deeper
than the web's. A single-child wrapper that styles nothing is pure cost.

**Keep it when:** the inner Stack is a scroll owner, has its own
`keyboardConfig`, is a slot content (Card header/body are Stacks by rule), is
the target of a visibility condition, or is bound to events.

## 2. Stack inside Pressable

**Detect:** a `Pressable` whose only child is a `Stack`.

**Fix:** Pressable IS a flex container — `direction`, `alignItems`,
`justifyContent`, `reverseOrder`, `wrapContent` are all on its appearance.
Move the Stack's children into the Pressable, copy the layout props across,
delete the Stack. (Its `justifyContent` is narrower — no `space-around`; if the
Stack used that, keep the Stack.)

## 3. Repeatable inside a Scrollable

**Detect:** a `Repeatable` anywhere under a `Scrollable` (or under another
Repeatable's row that scrolls).

**Fix:** make the Repeatable the scroll owner itself — `content.scrollable:
true` + `customStyles {flex:1}` in a parent with no fixed height/overflow —
and delete the Scrollable, or move the Repeatable out of it.

**Why:** on native a scrollable Repeatable is a VIRTUALIZED list. Nesting it in
a Scrollable (a plain ScrollView) either turns virtualization off — every row
mounts at once — or leaves two scroll views fighting for the gesture
(Android especially). Infinite pagination and pull-to-refresh also stop
working, because they hang off the virtualized renderer. Long data belongs
in a Repeatable, never in a Scrollable.

**Keep it when:** the Repeatable is deliberately `scrollable: false` and short
(a fixed handful of items inside a larger scrolling region) — then the
Scrollable (or, on web, the page) owns the scroll and the list just grows.

## 4. Two scroll owners

**Detect:** two blocks that both scroll in the same axis in the page body
(two `scrollable: true` Repeatables, a Scrollable beside a scrolling
Repeatable). On MOBILE the body itself never scrolls, so a Scrollable under it
is one owner, not two.

**Fix:** one owner per axis. Section bands inside one list are marker rows in
its data, not a second list.

## 5. Block that renders nothing where a prop would do

**Detect:** a `Divider` used as spacing; a Stack used only to add padding
around one child; a Typography with an empty value used as a spacer.

**Fix:** `gap`, `padding` or `margin` on the neighbour — one style key instead
of a block.

## 6. Composite scaffolds left half-empty

**Detect:** a Card whose `body` or `header` Stack holds only `__PLACEHOLDER__`;
a Form with only its sample fields; a Repeatable whose row template is the
scaffold's default.

**Fix:** either fill the slot or, for a Card used as a plain box, replace it
with a Stack carrying the same border/background — a Card is four blocks and a
slot map.

## 7. Bindings and data

- Two data sources fetching the same resource with the same inputs → one
  source, two consumers.
- A page function that should refresh with a source but whose
  `dataSourceIds` is empty → its body does not read that source as
  `{{ e_<dsId>[…] }}`, so it never refreshes; read the source in the body.
  The tool derives `dataSourceIds` from the body on every write and
  refuses the key as an input.
- A page variable never read anywhere (the checker reports
  `UNUSED_PAGE_VARIABLE`) → delete it.
- On a MOBILE app, the native binding traps (`deviceContext` never
  re-evaluates) are in the `app-native` skill, `references/native.md` rule 37.

## 8. Events on the wrong block

**Detect:** `events` on a Stack, Icon, Typography or Divider.

**Fix:** move the handler to a `Pressable` wrapping the content (native), or
to a Button.

## When you are done

Read the outline back in `tree` view: the structure must be the one you meant,
and every bound block must still carry its `dataSourceIds`. When the visual
check ran, take one final screenshot too: the screen must look the same as the
one that passed. Put what was removed and why, and the block counts before and
after, in the report's `notes`.
