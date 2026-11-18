# Composition

## Contents
- 8 rules

1. A COMPLETE screen (not a drawer, a modal, or a single-field edit) uses at
   least 2 block types beyond `stack`, `typography` and `divider` — the same
   tally [references/states-and-fakery.md](states-and-fakery.md) requires
   you to run, read here as a floor instead of a ceiling. A page that stays
   at 0-1 rich types past that tally is very likely under-built, not just
   plain by design.
2. A page presenting more than one topic or metric group gets more than one
   visual section, each with its own section-heading `typography` block —
   never one flat `stack` holding every metric and list undifferentiated. A
   "section" is content under a distinct child of `root_id`, not a nesting
   level.
3. 2 or more `stat-card` blocks need at least one non-stat-card content block
   beneath them: a `table`, `repeatable`, `chart`, or `key-value`. Stat-cards
   alone are a fragment of a dashboard, never a finished one.
4. Every `stat-card` and every repeated row sits inside a real container (a
   `card`, or a `stack` with `padding` + `borderRadius` + `background` from
   tokens) — a label/value pair floating with no visual boundary is not a
   finished card even when the data behind it is real.
5. Typography roles come from a table you build once per app from
   `get_typography_size_options` (the real enum: `display-2xl` through
   `display-xs`, `text-xl` through `text-xxxs`, `para-md`/`para-xmd`/
   `para-sm`/`para-xs`), not from memory: page title, section heading, card
   label, card value, body, caption, each mapped to a real `variant` id.
   Refresh the table when `get_typography_size_options` disagrees with it.
   This turns "pull from the token list" into a lookup instead of a guess.
6. When a page shows more than one KPI or stat-card, give each a distinct
   semantic color token from `get_color_tokens` — never every card sharing
   the page's one default text color. See
   [consistency.md](consistency.md) for which family means what.
7. A row of same-size `card` blocks, each holding one icon plus one heading
   plus one line of text, is never the whole page's structure — that shape
   is the laziest possible container, and nested cards inside it are always
   wrong. It is fine as ONE section among several, never as the entire body.
8. A `stat-card` row with nothing behind it but more stat-cards is the same
   defect rule 3 already names — a hero-metric template (big number, small
   label, supporting stats) with no real content beneath it reads as a
   fragment, not a page.
