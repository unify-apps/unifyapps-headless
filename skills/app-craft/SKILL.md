---
user-invocable: false
name: app-craft
description: Only for the app-agent builder agent. The bar for what a finished UnifyApps page looks and behaves like — composition, real user flows, cross-page consistency, real states, the words on the screen, the compositional anti-patterns that read as unfinished even when every block is correctly configured, the app look decided once and stored in the app's theme or header so every block follows it, and where a look can live — design tokens first, then a block's custom CSS and HTML attributes, a page's header and footer code, and the app's header, footer and HTML attributes. Adapted from the pbakaus/impeccable design skill's judgment for a closed 50/71-block catalog. Read at the same moment as the header/body/footer split, before the first write of a COMPLETE screen, and before any custom CSS or custom code write.
---

# Building a page that looks finished

A page can pass every correctness rule in `app-verify`'s `config-review.md`
and still be the thing a person complains about: sparse, flat, missing half
the actions they asked for, or built from the same three boxes over and
over. Correctness is "does this work." This skill is "does this look like
someone finished it" — a separate, checkable bar, not a matter of taste.

This is UnifyApps' own version of that judgment, not a general one. A page
here is a JSON block tree on a remote tenant, changed only through
`application-builder` MCP tool calls. Its blocks come from the existing
50-block web catalog (or 71-block native catalog), and nothing here invents
a block or a prop — see `app-design`'s "Never invent a block, prop, action,
event or binding shape to fill the gap." Its look starts from tokens
(`get_style_options`, `get_color_tokens`, `get_typography_size_options`)
and goes further with custom CSS and custom code, in the places the next
section names.

**The mode.** Every page this skill governs is a working page: the
person using it is completing a task, not being persuaded or entertained.
Scanability and matching what the rest of the app already does come first.
Consistency means the app's pages agree with each other. It is never a
reason for a page to look plain or sit still.

## Pick the look before the first write

Every COMPLETE screen is something a person will look at, so every one gets
a look, even when the task body names only blocks and data. A screen with
the right blocks and no look is half built.

The look comes from lines the plan wrote, with the `app-page-planner` skill. Your message carries them:

- **`App look:`** the app's design, decided once for the whole app by the
  plan before any page: who opens it and how often, light or dark with a
  reason, a direction from the subject, 13 colours by role, a font, its text
  sizes and weights, three corner sizes, a density, the gaps inside and
  between groups, how content is grouped, depth, icons, its one bold thing,
  its motion, and what leads. It is stored once, as the app's theme (in the
  app header on a tenant without the theme tools), where every block reads
  its colours, font and corners. Page builders apply it
  and never pick a colour, a size or a gap. How it is decided, stored and
  applied: [references/app-look.md](references/app-look.md).
- **`Job:`** what this page is for: who uses it and where, the questions it
  answers in order, its main action, its states, and the values that need a
  state. It names no block and no colour.
- **`Design`** the page's regions in page order, each with its weight
  (`lead`, `support`, `quiet`, or `later` for one that waits one click
  away), what it shows and does, and the part of the job it serves. Build
  those regions, in that order; the lead one is what the eye meets first.
  A region that a part of
  [references/kit.md](references/kit.md) covers starts from that part's
  proven settings. Your message's Rules give the steps, and `plan report`
  checks them.

Take the app look from the first of these that exists:

1. **Your message carries an `App look:` line.** That is the look; follow
   it. On an `app` task, store it ([app-look.md](references/app-look.md)
   § Store it). On a page task the `app` task already stored it.
2. **The app already holds a stored look.** That is the look; follow it.
   It is the look block in the app header (`entity context app <appId>`), or
   `--ds-*` names in the app's theme (`get_app_theme {includeCssVars: true}`).
3. **An existing app with no stored look.** Match the closest page
   ([consistency.md](references/consistency.md)): its tokens, its custom CSS
   and its effects. Do not add app code unless the task is about the app's
   look.

How a region looks, once the Design says what it holds, is yours: the
`agentic-editing-designer` skill's "Find the direction in the subject" and
"How far to push it".

Build the look in the layout task itself, in the same batches as the
blocks. No later task comes back to add it. Name the look in the report's
`notes`, so the person sees it.

## Where the look lives

Take the agent's three rungs in order (the app-agent's "Where the look
goes"): a block's own property set to a token, then a condition on that
same property, then custom CSS and custom code. Rung 3 is not a last
resort. Hover, focus, motion, a gradient, a texture, a web font, a shadow
that lifts under the pointer: no token says these, and rung 3 is the only
way to get them. On a task about how a page looks, a page without them
where the design calls for them is unfinished.

Rung 3 has four places, and each reaches a different part of the screen:

| Place | Stored at | Written with | Reaches |
|---|---|---|---|
| Block custom CSS | `additional.customCSS` | `update_blocks` or `create_block` in `apply_page_edits` | this page's blocks, from rules that name `[data-block-id='<id>']` |
| Block HTML attributes | `additional.htmlAttributes` | the same | one block's own element; a `{{ }}` value is evaluated, so data can drive the CSS |
| Page header and footer code | the page's `properties.customCode` | the `update_page_settings` step of `apply_page_edits` | the whole document while this page is open: a font, a `<style>` many blocks share, a script |
| App header, footer and HTML attributes | the app record's `properties.customCode` | `update_app_settings {panel: "customCode"}` | every page, and the chrome around them: the navigation rail, the app bar, `body`; on a tenant without the theme tools, the app look block here recolours every block and sets the font |

Before your first write in any of them, read
[references/custom-css-and-code.md](references/custom-css-and-code.md). It
holds the traps that make a write store cleanly and do nothing, and how to
prove each one. None of this shows in the style panel, so the report says
where each piece went. On a MOBILE app none of it is CSS (`app-native`).

## When a request is about tone

A person often asks for a feeling, not a change. Read the word as one of
these, and change the page in that direction only:

| They say | Do |
|---|---|
| bolder, more striking, it looks bland | One focal point per screen, made much bigger (3x, not 1.5x); heavier weight on headings; the accent on fewer, larger things |
| quieter, calmer, too loud | Fewer coloured things; lighter weights; more space between groups; the accent only on the main action |
| simpler, decluttered | One purpose per screen; secondary actions into a menu or a drawer; remove what repeats |
| polish, finishing touches | Every gap from one scale; the same element styled the same way everywhere; real words in every label ([words.md](references/words.md)) |
| more personality, delight | One moment that rewards the main task (a finished state, a staggered entrance), never in the way of the work |

When the request is about the whole app's feeling, change the app look's
seeds, not each page.

## When to read this

Read it at the same moment as `app-design`'s header/body/footer split —
before the first write of a COMPLETE screen (not a drawer, a modal, or a
single-field edit). State four plans in the one-liner the split already
requires: the sections, the flows, the consistency, and the look
("header: title bar · body: 3 stat-cards (StatCard) for the totals ·
status breakdown (table) · footer: none · look: the app look from the
header (a purchase-order pad: ruled rows, gray paper surfaces) · this page:
the overdue count as the one large number, its row cards lift on hover
because each opens the order").

## Reference files

| File | Read it when |
|---|---|
| [references/app-look.md](references/app-look.md) | the plan decides the app look, the app's `app` task stores it, or any page applies it |
| [references/default-looks.md](references/default-looks.md) | the plan writes the look's `not` part, or a page looks like it could be any app's |
| [references/kit.md](references/kit.md) | a Design region is a kind of part it covers (a table of records, rows grouped under headings), or before planning a page, for what the platform can and cannot do |
| [references/words.md](references/words.md) | writing any label, button, empty state or message |
| [references/composition.md](references/composition.md) | planning a COMPLETE screen's sections and containers |
| [references/flows.md](references/flows.md) | the spec names an action, a rollup, a multi-step status, or implies filtering |
| [references/consistency.md](references/consistency.md) | the app already has other pages — color, typography and affordance choices must match them |
| [references/states-and-fakery.md](references/states-and-fakery.md) | before the first write, and again at self-check — the block-type tally and the full interaction-state list |
| [references/anti-patterns.md](references/anti-patterns.md) | a quick final check against the shapes that read as unfinished no matter how correct the config is |
| [references/custom-css-and-code.md](references/custom-css-and-code.md) | before the first custom CSS, HTML attribute, page code or app code write — what each place reaches, its traps, and how to prove it |

The matching self-check lives in `app-verify/references/config-review.md`'s
"Page craft" section — this skill says what to build, that file says what
to catch when it wasn't.
