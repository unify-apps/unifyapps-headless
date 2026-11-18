# States, and the tally that catches a fake page

## Contents
- The block-type tally (3 rules)
- What "state" actually means on this platform (2 rules)

## The block-type tally

1. **Before writing anything else on a COMPLETE screen, tally the block
   types you are about to use, and again at self-check tally what actually
   got written.** A page above a few dozen blocks that uses only 2-3 types —
   almost always `stack` and `typography` — is very likely a hand-rolled
   dashboard: real numbers and lists drawn as plain text and boxes instead
   of the real `stat-card`, `chart`, `table` or `repeatable` blocks that
   exist for exactly this. Run this tally even on a page with no data source
   yet; the loading/empty/error scope gate below excuses those three rules
   only, never this one.
2. **The two shapes that give it away, checked against
   [composition.md](composition.md):** a repeated group of a label plus one
   big number (sometimes with a delta) standing in for `stat-card`, and
   Stacks arranged as bars, lines or axes with hardcoded positions standing
   in for `chart`. Both look right in a screenshot; both are frozen text
   nobody can update without editing the block, and neither reflects a
   changing number.
3. This tally is not scoped to stat-cards and charts. ANY page above a few
   dozen blocks using only 2-3 types total — regardless of which types —
   needs the builder to name, in the report's `notes`, why that page is
   genuinely that repetitive. A real settings list of label+toggle rows is a
   legitimate low-diversity page; an unexplained 60-block page of only
   `stack`+`icon` is not. Absence of a justification line is itself the
   finding — the page does not need to be wrong, it needs to be explained.

## What "state" actually means on this platform

No style key holds a hover, focus or active state. Confirmed against the
`button` block's own sheet: press feedback (`appearance.interactions`) is
automatic and on by default, and the per-block states a block's own config
holds are `appearance.disabled` and `appearance.loading`, each a condition
object stored as `{ "type": "filter", "payload": <group> }`. Leave `appearance.interactions` on. A hover, focus or motion effect
is real all the same: it is block custom CSS (`:hover`, `:focus-visible`,
`transition`, `@keyframes`), written as
[custom-css-and-code.md](custom-css-and-code.md) says. It adds to press
feedback and never replaces it.

4. **The state vocabulary that IS real, per block, is:** loading and
   disabled (most interactive blocks), plus whatever empty/error state a
   data-bound block's own sheet documents (`app-verify/references/
   config-review.md`'s "Loading states" and "Empty & error states" sections
   own the mechanical checks for these — this file is the reason they
   exist, not a second copy of them). A selection-type block (`tabs`,
   `single-select`, a `repeatable` row) may expose its own selected/active
   state — read that block's own sheet before assuming it does or doesn't;
   never set a config key for a state the block's sheet does not name. A
   look for such a state is custom CSS, not an invented key.
5. **Loading is a skeleton, not a spinner, beside data — never a substitute
   for the data once it's there.** Already required in `config-review.md`
   ("Use the CONTENT skeleton, not the arc spinner"); the reason it matters
   is that a spinner replacing content on every reload reads as the page
   still not being finished, even on the tenth successful load.
