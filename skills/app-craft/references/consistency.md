# Consistency, across the whole app

## Contents
- Color (2 rules)
- Typography and affordances, across pages (3 rules)
- Custom CSS and code, across pages (2 rules)

`composition.md` and `flows.md` are about one page. These rules are about
whether this page looks like it belongs in the same app as every other page
— checked against the app's OTHER pages, not just this one.

## Color

Verified on the platform (`get_color_tokens`): color tokens are organized in
named families — `brand`, `error`, `success`, `warning`, `gray`, plus
`primary`/`secondary`/`tertiary`/`white` and numbered `palette` scales. This
is not invented; it is what the tenant's own token list returns.

1. **One accent, reserved.** Pick ONE family — almost always `brand` — for
   primary actions, the current selection, and the one thing on the page
   that most wants attention. Everything else reads from the neutral
   families (`text-primary`, `text-secondary`, `text-tertiary`, `gray-*`).
   Color is not decoration: a page where every heading, every card border,
   and every icon pulls from `brand` has no accent left, because everything
   is one.
2. **Semantic state colors stay semantic.** `text-error-primary`,
   `text-success-primary`, `text-warning-primary` (and their block-specific
   equivalents — a `tag`'s color variants, a status badge) are reserved for
   the state they name. A "Closed" status in gray and a "QC Rejected" status
   in the same gray is a real finding: the person cannot tell them apart at
   a glance, which is the one job a status color has.

Note: nothing here says the platform encodes a contrast ratio between a
text token and its surface — that was not confirmed on the tenant, so no
rule here checks for it. Don't invent a contrast check the platform doesn't
expose.

## Typography and affordances, across pages

3. **The same role uses the same `appearance.variant` everywhere in this
   app.** If "Issue Order" uses `text-lg` for its page title, "Pending
   Approval" uses `text-lg` for its page title too — read one sibling page's
   outline before choosing a role's variant on a new page, the same way you
   already read a sibling page's header pattern before building
   (`app-page-build`'s layout task already does this for one page; this
   rule extends it to the whole role table, not just the header).
4. **The same action uses the same control, styled the same way, on every
   page.** A "Retry" button, a primary "Submit," a destructive "Delete" —
   if one page's Retry is a `button` with `variant: primary` and another
   page's Retry is a bare `typography` link, one of them is wrong. Read
   `get_blocks` on the equivalent control on a sibling page before deciding
   a new one's block type and variant.
5. **A `table` or `repeatable` uses the same column/row pattern for the same
   kind of data across pages.** Two pages both listing "orders by status"
   with a different column order or a different row action is not a design
   choice unless the spec names a reason — it is drift.

Read a sibling page's outline before writing a new one whenever the app
already has a page that does something similar. "No sibling page yet" (the
first page of a new app) leaves no blocks to match, but the app look still
applies: it is in the task body, and this page stores it.

## Custom CSS and code, across pages

6. **The same effect is written the same way everywhere.** A hover lift, a
   gradient or a card shadow that two pages share uses the same CSS on both.
   When many blocks share it, it is one rule in the page or app header on an
   HTML attribute each block carries — see
   [custom-css-and-code.md](custom-css-and-code.md), "One look on many
   blocks". Read a sibling page's custom CSS before you write a new effect
   it may already have.
7. **Colour and font come from the app look, never from a sibling page's
   CSS.** When the app has a look, in its theme or its header
   ([app-look.md](app-look.md)), every page reads it, so pages built side by
   side agree without copying. Copying hex values out of another page's
   custom CSS is how two palettes start.
