---
user-invocable: false
name: app-design
description: Only for the app-agent builder agent. Builds and edits UnifyApps no-code apps through the application-builder MCP tools — pages, blocks, forms, data sources, event wiring and styling — reading the knowledge each write needs and reading back after it. Use when creating or changing an app or page, wiring a page to data, or diagnosing why a page renders empty or misbehaves. Load before the first application-builder write of a session.
---

# Building a UnifyApps app

You build real UnifyApps apps by calling the app surface's MCP tools. These
are live apps people configured by hand: treat every write as hard to undo,
because the platform's version history rolls back the whole app, not one page.

Every page tool named here is on the `application-builder` MCP server
(`mcp__plugin_ua_application-builder__<tool>`), and every page call
carries the resolved `host` and `interfaceId`. `create_app` takes the https
origin and no `interfaceId`; `publish_app` takes `host` and `appId`.

## Session shape

Read existing app configuration during spec preparation. Create or modify apps
only for the assigned app-agent task after spec acceptance and `plan start`.

1. [references/open-page.md](references/open-page.md) resolves `host`,
   `interfaceId` and `pageId` from a builder URL. Pass them exactly as
   resolved on **every page call**; never invent them, never pass the MCP server's
   own address as `host`.
2. No resolved app coordinates yet? Creating a NEW app, or an existing app
   with no builder URL, is in [references/open-page.md](references/open-page.md)
   under "A new app".
3. Auth fails → report `auth_expired` and stop; the router runs the login
   step in `/ua:setup`.
4. For every page touched the loop runs in this order: build → **read-back**
   (the proof; `app-verify` names the reads and the line each must show) →
   UX pass → optimization pass → self-check against
   `app-verify/references/config-review.md` (its native rules apply only
   when the app is MOBILE — confirm `appType` first, as that checklist
   says) → the page's best practice score, fixed to 90 in two rounds at most
   (`app-verify` § The best practice score) → the task report. Every step is
   a tool call against the stored config; none opens Chrome or a simulator.
   **You are the one owner of this proof.** Nobody re-opens the page after
   you; what your report lists as still off comes back to you.

## The non-negotiables

The app's look lives in its theme, built with the `app-theme` skill. Pages
use its tokens, never hex values.

**Never guess about the platform.** If a sheet or a tool cannot confirm that
something is supported, say so and offer the nearest thing you know works. A
plausible value that is not in the sheet stores fine, matches nothing and
renders empty with no error. Silence, not a crash, is this platform's failure
mode.

**Know the shape before you write it.** A guessed prop stores fine and
renders nothing, so read the sheet for anything whose shape you do not know:
`get_app_builder_knowledge` to read every sheet you need by id in one call,
asking again only for what `omitted` still lists. The write
verbs refuse a write until they receive the `id@hash` tokens of the sheets it
leans on. How to read cheaply, `have`, part sheets,
refusals that name every unread sheet, the `get_style_options` batching rule
and the option menus are in
[references/knowledge-reads.md](references/knowledge-reads.md).

**Read narrow, not wide.** `get_page_outlines` first, then `get_blocks` for
only the blocks you need. Never pull a whole page.

**`get_blocks`'s `paths` filter needs the `component.` prefix.** A content or
appearance key read through `paths` only resolves as `component.content.<key>`
or `component.appearance.<key>` — a bare `content.data` answers `notSet` with
no hint that the prefix was missing, even though the key is stored. Right:
`paths: ["component.content.data"]`. Wrong: `paths: ["content.data"]`.

**Values come from menus, not from your head.** Icons, style keys, colour
tokens, slot positions and event targets each have an options tool; the
knowledge-reads reference names them.

**Read back what you wrote; it is the proof, not a courtesy.** After a
change, read the affected part and confirm it landed: `get_page_outlines`
(`tree`) for blocks and names, `get_blocks` on the ids you wrote for props,
`dataSourceIds` and `dpOn`, `get_data_sources` and
`get_data_source_output_schemas` for a source and its shape, the
`update_event_actions` result's `callbacks` for wiring. Those lines ARE the
evidence a page task reports. When a read-back disagrees with what you sent,
keep both values in the final JSON report's `notes` and correct the write
within the assigned task. Do not report success you have not seen.

**The browser runs only for a task marked `[visual]`:** `app-verify` § The
browser and the device.

**Hard cap: at most 2 check-fix rounds per task**, read-back rounds and
visual rounds alike. After the second round, stop. Put what is still off, what
you read, what you fixed and the known fix per item in the report. Do not stop
to ask about a fix you already know. The best practice score has two fix
rounds of its own, on top of these.

## Five habits, each a real failure when skipped

- **Name every block you create, as an identifier.** `create_block` takes
  `name`; pass a camelCase name for the block's role (`orderList`,
  `checkoutButton`) on EVERY block, and `rename_blocks` any unnamed block this
  task created or was asked to change. A block name is an identifier, not a
  label: the tool changes a name with a space or one already taken, and says
  so in `warnings`. Use the stored name from then on. A page of bare "Stack"s
  is unnavigable in the layers panel.
- **The sheet is the whitelist.** Write only properties the block's sheet or
  an options tool names. Deprecated types are refused at the wall (Stepper →
  StepperV2); a property absent from the sheet is absent from the platform.
- **A design beats a description.** Building from a design → read
  [references/design-input.md](references/design-input.md) first.
- **Spacing comes from a scale.** Gaps and paddings from 4/8/12/16/24/32,
  `gap` on the container over margins on children, ONE horizontal page
  padding on the outermost body Stack.
- **A block's custom CSS styles only its own page.** The page nests every
  block's `additional.customCSS` inside `[data-page-scope-key="…"] { … }`.
  So a rule for the app's chrome around the page — the navigation rail
  (`.nocode-navigation-container`), the app bar, the background behind the
  page, `body` or `html` — matches nothing, and nothing reports it. Style
  app chrome from the app's custom code instead:
  `update_app_settings {panel: "customCode", values: {header, footer}}`
  with a `<style>` block in `header`. Send both sides: the save can clear
  the one you leave out, so read what is stored and keep it. A long value
  goes in `update_app_settings {argsFile}`, a `.json` file you make with a
  script, so the text is never typed out. The
  `concepts/interface-record/custom-code` sheet has the rules, and
  [app-craft's custom-css-and-code.md](../app-craft/references/custom-css-and-code.md)
  has every place a look can live. It changes every page of the app, so it is in scope only when
  your message carries the app's `App look:` line or the task is about the
  app's look; otherwise report `needs_confirmation`. The app look itself is
  written by a script, never by hand: `app-craft`'s
  [app-look.md](../app-craft/references/app-look.md).
- **App-wide CSS never names a bare platform class.** The header and footer
  also load in the builder. The builder's own left rail is built from the
  same navigation component as the app's menu, so it carries the same
  markers (`[data-nav-root=side]`, `.ua-side-nav-item`), and its panels use
  `.MuiDrawer-content` and `.bg-workspace`. A bare rule on one of them
  restyles the builder: its rail gets the app's border and its Data, Finder
  and Saved Versions buttons slide out of view. Scope every rule:
  - A rule for the app's navigation starts with
    `.nocode-navigation-container`, the wrapper around the app's menu in the
    published app, the builder canvas and the settings preview, and never
    around the builder rail:
    `.nocode-navigation-container [data-nav-root='side'] { … }`. A navigation
    module attached with `set_navigation_style` renders inside
    `.custom-navigation-container` instead: a rule meant for that module
    scopes to that class, not `.nocode-navigation-container`.
  - A rule for the rest of the app, such as its theme variables, may start
    with `.interface-theme`. In the builder that class is on the app canvas
    only, and in the published app it is on `body`. A leading `html ` is
    fine: `html .interface-theme.interface-theme { --fontFamily-text: … }`.
  - A rule outside the app (`body`, `main.ua-page-workspace`, `.bg-workspace`,
    dialogs, drawers) starts with `html:not(:has(.ua-builder-side-nav))`,
    which is false only in the builder, where `.ua-builder-side-nav` is the
    rail.
  - `:root` variables and `@font-face` need no scope.

  After the write, open the builder and read it back: the rail's border is
  `0px`, all its buttons stand in one column, and the app's own navigation
  still has its style.

## A whole page: partition into header / body / footer FIRST

Every page carries three root sockets: `header_id` (band above), `root_id`
(the body), `footer_id` (band below). There is no create step. When the
request is a COMPLETE screen, load the `app-craft` skill and split the
design before the first write:

- **header** → `placement: {parentBlockId: "header_id"}`: app bar, page title
  and back button, top tabs, global search.
- **body** → `placement: {parentBlockId: "root_id"}`: everything that
  scrolls. On web the body is the ONLY scroll region of the page frame; on
  MOBILE it does not scroll at all (`app-native` rule 2).
- **footer** → `placement: {parentBlockId: "footer_id"}`: bottom tab bar,
  sticky CTA, summary bars that stay on screen.

State the split in one line before the first write ("header: title bar ·
body: order list · footer: checkout CTA"), then place each section under its
OWN root. A title bar as the body's first child scrolls away; a CTA as its
last child is unreachable until the user scrolls.

In the same one-liner, name the body's sections and, for each, the composite
block that will carry it (`app-craft`'s `composition.md`) and the real action
or flow it must support from the spec's Changes/Rules rows (`app-craft`'s
`flows.md`) — "body: 3 stat-cards (StatCard) for the totals · status
breakdown (table, navigates to the Purchase Orders page) · supplier
breakdown (table)". End it with the look (`app-craft` § Pick the look
before the first write): the app look it follows, and what leads, from the
job's first question — "look: the app look from the header · leads: the
overdue count, the job's first question; its rows lift on hover because each
opens the order".
A body with one section and no named flow, for a COMPLETE screen, is a sign
the split was skipped rather than genuinely all-body. A line with no look
is a sign the look was skipped.

Two traps: **the bands ship OFF** (`header_id` and `footer_id` start with
`visibility.value: false`; set the root block's `visibility` to
`{value: true}` in the same batch, with the path `visibility` and not
`visibility.value`, or the band is dropped from the published page while the canvas
still shows it), and **don't force bands the design lacks** (a plain content
screen is all-body, correctly). On MOBILE a filled header owns the top inset,
the footer chrome owns the bottom inset, the body pads for neither.

## Writes

Almost every page write is a step inside `apply_page_edits`: up to 40 steps,
validated in order against one in-memory page, saved once; one failing step
refuses the whole call and nothing is written. Batch up to 40 steps per call.
Send a big call as a `.json` file through `argsFile`: a JSON mistake or a bad
step then comes back with its line number before anything is sent. The step
grammar is the `apply_page_edits` tool description itself: verbs, tempIds,
a scaffold child named `<tempId>.<childKey>` in the same call, and what needs
a second call. Follow the description over any copy of it. The traps it leaves
out, the inputs you must choose, this page's own data sources inside the
batch, the standalone verbs, and what a write's reply carries are in
[references/writes.md](references/writes.md).

## A page is two tasks: layout first, bind later

A plan builds a page as `page <path> — layout` (blocks, variables, static
text, state blocks hidden, data-bound blocks left unbound with a literal
sample) and `page <path> — bind` (data sources, bindings, callbacks) so the
layout runs beside the object and automation work. Each builder holds one
page, and a bind goes back to the builder that did its layout when that
builder is free. The layout steps, the ids the layout hands to its bind, the seven-step
bind, the publish step, the waits and the two-tries rule are
in the `app-page-build` skill, which every app-agent loads at start.

## Destructive steps

Deleting a block of this task's page is routine page editing: a
`delete_blocks` of blocks this task created or was asked to change (a wrapper
a restructure emptied, a template it replaces) needs no yes. Name each one in
the report's `notes`. `delete_pages` and `delete_data_sources` delete an
entity: they need the person's yes, as your Rules say. `set_form_fields` in
replace mode and `move_blocks` into an occupied socket drop work that cannot
be got back: do them only when the accepted spec names the loss; otherwise
report `needs_confirmation` before the step. In a page quality fix task, the
body's line naming a block to remove is that named loss (`app-page-build`
§ A page quality fix task).

## Building for the mobile renderer (MOBILE app)

`appType` is MOBILE → load the `app-native` skill now, before planning blocks
and before reading a single block sheet. A mobile app runs on the
UnifyApps mobile renderer, whose physics differ from these sheets in silent
ways, and that skill OVERRIDES this file wherever they differ. Any other
appType → do not load it, and do not carry native rules across:
`Stack.onClick` works on web, `Scrollable` is available, there is no safe
area.

## Block catalogs

- appType MOBILE → the `app-native` skill, which opens with its native block
  catalog.
- anything else → [references/block-catalog-web.md](references/block-catalog-web.md).

Read the catalog the moment the appType is known, BEFORE planning blocks.
Pick only from that list; a type not in it does not exist on this platform,
and never open the other platform's catalog.

## After the build: two more passes, in this order

The read-back match is the midpoint. Once it matched (and, when the visual
check ran, its rounds are done), run two config passes, each a separate
reference you read only when you reach it:

1. **UX layer** — [references/ux-layer.md](references/ux-layer.md): skeleton
   loaders the size of the final block beside every data-bound block, empty
   and error states, keyboard config on the scroll owner above any input or
   else the nearest Stack (MOBILE), busy buttons, tap targets.
2. **Optimization layer** —
   [references/optimization-layer.md](references/optimization-layer.md):
   Stack-in-Stack and Stack-in-Pressable collapses, Repeatable inside a
   Scrollable (kills virtualization), duplicate scroll owners, spacer blocks,
   half-empty scaffolds, dead events — only on blocks this task created or was
   asked to change, and any delete per § Destructive steps; then a final
   `get_page_outlines` in `tree` view.

Skip a pass only when it has nothing to act on (a text-only edit needs no UX
pass; a layout task's state conditions belong to the bind task) and say so
in the report.

The passes prevent most failing best practice checks as you build. Whatever
they miss, the page's score finds afterwards (`app-verify` § The best practice
score).

## The task report

The report shape is the UnifyApps Headless rules block at the top of the `app-agent`
prompt. A page that is finished also reports its best practice score and any
exceptions, as `app-verify` words them. A layout report hands over the page id,
block ids by role, form field keys and `var_` ids, as the `app-page-build`
skill lists, so a bind task that lands on a new builder can read them.

## Reference files

| File | Read it when |
|---|---|
| [references/open-page.md](references/open-page.md) | resolving a builder URL to `host`, `interfaceId`, `pageId`; building a page's builder URL; creating a new app |
| [references/knowledge-reads.md](references/knowledge-reads.md) | before the first sheet or options read of a task |
| [references/writes.md](references/writes.md) | before the first `apply_page_edits` of a session |
| [references/block-catalog-web.md](references/block-catalog-web.md) | choosing blocks for a non-MOBILE app |
| [references/ux-layer.md](references/ux-layer.md) | the first pass after the read-back matched |
| [references/optimization-layer.md](references/optimization-layer.md) | the second pass, last |
| [references/design-input.md](references/design-input.md) | building from a Figma link, an image or a written description |
| [references/worked-examples.md](references/worked-examples.md) | a kind of page work you have not done before |
| [references/navigation.md](references/navigation.md) | before any `get_navigation`, `apply_navigation_edits` or `set_navigation_style` call: the app menu, the home page, what draws the bar, menu looks no tool writes, and page events that move the person |
| [../app-native/references/data-layer.md](../app-native/references/data-layer.md) | a page on any app type with validation, derived values, constants or a rule used twice — one validator per page, constants written once |

The proof itself — the read-backs, and the browser and device for a `[visual]`
task — is the `app-verify` skill.
