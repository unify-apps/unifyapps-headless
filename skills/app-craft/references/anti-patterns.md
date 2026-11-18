# Anti-patterns

## Contents
- 5 shapes
- 2 CSS patterns to refuse

A quick final check against shapes that read as unfinished even when every
block is correctly configured and every value is really bound. Each of these
is a composition choice, not a config error — `config-review.md` catches
config errors; this is judgment about the shape itself.

1. **A row of same-size `card` blocks (icon + heading + one line of text) as
   the page's whole structure.** This is the laziest possible container.
   Fine as one section among several; never as the entire body. Nested
   cards inside it are always wrong — a card is four blocks and a slot map,
   not a plain box.
2. **A label `typography` block sitting directly above a section-heading
   `typography` block, restating what the heading already says.** The
   heading carries its own weight; a redundant label above it (an "eyebrow")
   adds a block without adding information.
3. **A `modal` or `drawer` for a task that needs neither interruption nor a
   protected focus target.** A modal is the right tool when the person must
   decide something before continuing, or when the task needs room the main
   layout doesn't have. It is the wrong tool for something that could be an
   inline expansion, a second section, or a plain navigation to a detail
   page — reach for it first only when the flow actually calls for an
   interruption.
4. **A dropdown, tooltip or popover-style overlay nested inside a scrolling
   or `overflow`-clipped ancestor.** Read the ancestor chain before placing
   one: a block whose own sheet documents an overlay/portal behavior
   escapes its container correctly; one built by hand inside a clipped
   `stack` gets cut off the moment the page scrolls. Confirm against the
   block's own sheet rather than assuming — not every composite block that
   looks like an overlay actually portals out of its parent.
5. **The app's menu rebuilt on the page** — a `stack` of `button` or `link`
   blocks pointing at the app's other pages, an app-name link beside them,
   a hamburger and a second hidden copy for phones. The app menu is one
   write on the app record (`apply_navigation_edits`); a bar on the page
   exists on that page only, ignores the menu's permissions and has no
   active state, and the phone copy reimplements behaviour the real menu
   already has. When the ask was a top bar or a drawer, the items still go
   in the app menu: the position is `appearance`, a manual builder step no
   tool writes. When the ask was a custom-LOOKING bar where the app's bar
   already sits, `set_navigation_style` attaches a module that draws it on
   every page. Breadcrumbs, and `tabs` for sections inside one page, are
   not this. Like the four shapes above this is a judgment, not a ban: a
   person who asked for the bar knowing what it costs gets the bar, and
   `app-design/references/navigation.md` § When the person asks for it
   anyway says how to build one that survives.

## 2 CSS patterns to refuse

These two are the plainest marks of a machine-made screen. If you are about
to write one, stop and build the element another way. A full border, a
tinted background or a leading icon all work; a shadow standing in for the
stripe does not.

6. **A coloured stripe on one side of a card, row, alert or stat tile:**
   `border-left`, `border-right`, `border-top` or `border-bottom` wider than
   1px. It counts with a `var(--ds-…)` colour too.
7. **Gradient text:** `background-clip: text` with any gradient. Text is one
   solid colour; emphasis comes from size and weight.

Both come from the design rules the platform's own copilot loads, written for
the same blocks.

