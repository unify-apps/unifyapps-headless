# Config review checklist

## Contents
- Must fix (27)
- Should fix (94)
- Optional (19)
- Mobile only
  - Must fix (31)
  - Should fix (12)
  - Optional (2)

The self-check a page gets after it is written: what to read, what counts as a
violation, and what the fix is. It applies to every page. The **Mobile only**
part at the end adds the rules for a MOBILE app, which renders on
the UnifyApps mobile renderer; confirm `appType` with `get_app_overview` before using it.

Every group carries a **Read:** line — the tool call and the config keys that
decide the rules under it. A rule you cannot evidence from what that line names
is skipped, and the skip goes in the report as unverified.

Severity is **what a fault costs**, not how hard it is to fix. Several Must-fix
items are one property; several Optional ones are an afternoon.

Work top down, inside the design skill's cap of 2 check-fix rounds: round 1
fixes Must and Should findings in one batch; round 2 re-checks, fixes what is
left and only then touches Optional items. What is still off after round 2 goes
in the report. Optional last — restructuring a page you haven't proved correct
just moves the bug.

**Scope.** Fixes, renames, collapses and cleanups apply only to blocks this
task created or was asked to change. Anything else you notice goes in the
report's `notes`. A delete or a move into an occupied socket follows
`app-design` § Destructive steps: a `delete_blocks` in scope is routine page
editing, while `delete_pages`, field replacement and a move into an occupied
socket need the accepted spec or the person's yes.

---

## Must fix (27)

### Page tree & routing (4)

**Read:** `get_page_paths`, `get_app_overview`, `get_page_outlines` — `address`,
`parentId`, each page's `children[]`, slug segments, tab-item `pageId`s.

- Remove duplicate page slugs and duplicate sibling segments — the second one is never reached, and it surfaces as a plain 404
- Place every page the tree reports with a null address
- Reconcile any `parentId` that disagrees with the parent's `children` array
- Attach segments the root can't reach, and pages holding a slug no segment holds

### Read the config before you judge it (2)

**Read:** `get_page_outlines` (`unreferenced`), the console/log line itself, and
the block's own config array before believing either.

- Treat `Handler with ID "…" already registered` as transition noise before treating it as a bug — it usually means a MODULE mounted twice at once (both pages alive through a navigation animation), because module block ids are not namespaced per instance. Confirm a genuine duplicate in config before changing anything; the transient kind clears itself
- Verify an outline `unreferenced` entry before treating it as an orphan — a block wired through a config array (a Carousel's `items[].blockId`) is referenced, just not via `content.blockIds`

### Scroll ownership & height (1)

**Read:** `get_page_outlines` in `tree` view for nesting, then `get_blocks` on
the scroll candidates — `appearance.styles.height`, `flex`, `flexGrow`,
`overflow`, `content.scrollable`, `shouldWrapContentInScrollView`, and
`root_id`'s own styles.

- Flag N sibling subtrees with the same block types in the same order as ONE Repeatable that was hand-built — three "card" Stacks, five identical rows, a set of tiles. Tells: `duplicate_blocks` numbering in the displayNames (`card`, `card1`, `card11`), an inflated `_blockCounter`, and the same literal copy repeated across them. "No data source yet" is NOT a reason to hand-place: `content.data` takes a literal array plus `content.primaryKey`. This is a rebuild, so raise it as Must fix with the block ids and let the builder confirm before deleting anything

### Navigation (5)

**Read:** `get_blocks` on every block carrying `events` and on the icon inside
it — `events[].action.actionType`, `payload`, and the child Icon's
`content.icon`. A **back control** is any Pressable / Button / IconButton whose
name or icon says "go back": `ArrowLeft`, `ArrowNarrowLeft`, `ChevronLeft`,
`XClose`, or a name containing back / close / cancel / dismiss — most often the
first child of the header band.

- Wire a back control to `navigateBack`, never to `navigateToPage` — on native `navigateToPage` PUSHES another screen, so "back" grows the stack instead of popping it and the user walks deeper with every tap, while the OS back gesture still has the old screen behind it. Web hides this because history is a URL stack the browser's own Back button resolves anyway, so a page that behaves on web is exactly the page that breaks on the phone. Fix: replace the action with `{"actionType": "navigateBack", "payload": {}}` — an EMPTY payload is the normal, correct case
- Give a back control an event at all — a back arrow with `events: []` is a mock control, the dominant bug class on builder-authored pages, and it looks finished in every screenshot
- Flag a hand-built app menu: a `stack` near the top of the page holding `button`, `link` or `typography` blocks that navigate to the app's OTHER pages, an app-name link beside them, a hamburger `icon-button`, or a second hidden copy for phones (`desktopMenu` / `mobileMenu` naming, a `hidden` binding on screen width). Tells: two or more `navigateToPage` controls in one container whose targets are all pages of this app, or a container named nav / navbar / menu / header holding them. That is `properties.navigation` rebuilt on one page — it lives on that page only, ignores the menu's permissions and has no active state. Must fix: move the items into the app menu with `apply_navigation_edits` and delete the blocks. When the ask was a TOP bar or a drawer, the items still go in the app menu and the position is a manual step (*App settings → Navigation → Appearance*), which no tool writes; when the ask was a custom-LOOKING bar where the app's bar already sits, the fix is `set_navigation_style` attaching a module, not blocks on a page. Breadcrumbs and in-page section switching (`tabs`, `navigation-menu`) are not this and stay. **Check the spec first:** a bar the accepted spec's `## Contract` or the brief's `## Changes` asked for in the person's own words is a decision, not a defect — then review it as a bar instead, and flag only what makes it fail: raw blocks repeated per page rather than one `template-component` or `module` in each page's `header_id` socket, two menus drawing because the real one was never switched off, items shown to groups that may not open them, and no active state where the design asked for one. A bar built as a `module` and left in header sockets is a should-fix, not a must-fix: `set_navigation_style {appId, resolutions, style: "custom", moduleId}` makes that same module the app's own bar, which switches the real one off and drops the per-page placement
- Pair `navigateToSpecificPage: true` with a real `pageId`, and fill every `:param` of the destination — the toggle without a `pageId` silently degrades to the plain back it was meant to replace; a `pageId` naming nothing navigates ANYWAY, to a dead route built from the string; and a destination with an unfilled `:param` does nothing at all in the published app, silently. Only reach for this form when the user may have arrived by direct link and history cannot be trusted, or on a MOBILE app to return a result to the page underneath in `pageInputs` (`app-native` iron rule 16) — a result-returning `navigateBack` there is right, so keep it
- Link to a page of this app with `navigateToPage`, never `navigate` with a path such as `/home` — a hand-written path leaves the builder and preview routes and lands on the tenant root, a 404; `navigate` is for an address outside the app (`app-design`'s `references/navigation.md`)

### Page sockets (2)

**Read:** `get_page_outlines` — `header_id` / `root_id` / `footer_id`, their
`children[]` and each root's `visibility`.

- Switch `header_id` / `footer_id` visibility on after filling them — they ship hidden
- Move sticky CTAs into the footer socket — as the body's last child, the button is unreachable until the user scrolls

### Blocks & their sheets (2)

**Read:** `app-design`'s `references/block-catalog-web.md`, then
`get_app_builder_knowledge` for `blocks/<block>` of every type on the page.

- Never invent a property — anything absent from the block's sheet is absent from the platform
- Replace deprecated block types — refused at the write wall

### Styles that throw or erase themselves (2)

**Read:** `get_blocks` → `appearance.styles`, `appearance.customStyles`,
`additional.customCSS`, `additional.isCustomCSSValid`; `get_style_options`
for the legal shapes.

- Check for a style value stored as a character-indexed object (`{"0":"b","1":"g",…}`) — that is a token string spread into an object; the token is destroyed and only a `custom` fallback, if any, survives
- Fix custom CSS the save marked invalid (`additional.isCustomCSSValid: false`) — the page drops every rule of that block, not just the bad one; the write's warning names what to fix

### Bindings & data (7)

**Read:** `get_data_sources`, `get_dependency_graph`, `get_context_keys`, and
the binding strings themselves in `content` / `visibility` / `events`.

- A page function that reads a source reads it in its body as `{{ e_<dsId>[…] }}` — the tool derives `dataSourceIds` from the body and refuses the key as an input, so an empty `dataSourceIds` means the body never names the source and the function never refreshes
- Never leave layout arithmetic inside display text — a `{{ }}` height calculation pasted into a Typography's value renders to the user as a bare number
- Store flags as condition objects, never a raw `{{ a && b }}` string
- Test array emptiness with `.length == 0` — an is-empty check matches only null and undefined
- Use `['context']['item']` inside rows and `['selectedItem']` in the Repeatable's own events
- Point every Table column over a Storage source at `properties.<field>` — `fieldKey` is `{"path": "properties.<field>", "key": "<field>"}`, because a Storage row keeps its fields under `properties`. A flat path renders an empty column with no error; check the paths against `get_data_source_output_schemas`
- Remove IIFEs from bindings and fix filter operators the parser throws on. A binding is one expression; a value that groups, joins, counts or sums rows — an array method (`.filter`, `.map`, `.reduce`, `.sort`, `.forEach`), a function body, or an expression over about 200 characters — is a page function (`create_page_functions`, a body that reads the source as `{{ e_<dsId>[…] }}`), read as `{{ func_<id>['value'] }}`. The write-time heavy-binding guard treats that as heavy on every platform, so the function is manual (`runBehaviour: "manual"`), run by a `triggerFunction` action from the source's `onSuccess`, the relevant `onChange` or page load (`app-native` iron rule 14 for MOBILE's own, separate reason); use `runBehaviour: "automatic"` only for a small, cheap value under that bar. The body contract is in `concepts/functions`

### Process & safety (2)

**Read:** the session's own change manifest and the saved visibility values you
overrode.

- Get a yes before `delete_pages`, `delete_data_sources`, field replacement, or a move into an occupied socket. A `delete_blocks` of blocks this task created or was asked to change needs none: name each block in the report's `notes`
- Always restore a force-shown state, even if the screenshot failed — never end with a forced visibility left in the page

## Should fix (94)

### The scope gate for loading / empty / error (2)

**Read:** `get_data_sources` FIRST. Zero sources → this whole group is
inactive, and flagging its absence is noise.

- SCOPE for every loading, empty and error rule: they apply ONLY where a data source exists. An app with zero data sources needs none of them, and flagging their absence is noise. The whole group activates the moment the first real endpoint is wired — audit for them then, not before
- On a pre-integration app, do not just SKIP the loading/empty/error rules — MAP them. Record every place a data source will land: each button that will call an endpoint, each list that will become data-bound, each select whose options will be fetched. That map is the integration checklist, and writing it while the page is fresh costs minutes where rediscovering it later costs a re-audit

### Loading states (8)

**Read:** blocks binding `{{ e_<dsId>['data']… }}`, their siblings, and
`appearance.loading` / `appearance.type` / `appearance.styles` on each Loader.

- Set `appearance.loading` on every button that submits a form or calls a data source — bound to that source's `['isLoading']`. PRECONDITION: there must be something asynchronous to reflect. With no data source the submit is synchronous, there is no `isLoading` to bind, and no loader is needed — the rule activates the moment the first real endpoint is wired, not before
- Don't also set `disabled` — loading already disables
- Add a sibling Loader beside every data-bound block — Repeatable, Table and Chart have no loading state of their own
- Use the `CONTENT` skeleton, not the arc spinner
- Size the skeleton to the real block's box — a mismatched skeleton causes the very jump it exists to prevent
- Give a `CONTENT` skeleton `appearance.styles.backgroundColor` — on web one with no colour paints nothing, so the loading state reads as a blank gap
- Give the data block the inverse visibility of its loader
- Leave press feedback on — `appearance.interactions` is on by default

### Empty & error states (3)

**Read:** the same data-bound blocks, their `visibility` condition objects, and
the Repeatable's slot map.

- Give every data-bound block an empty state
- Add error states on the source's `['error']`
- Don't use a Repeatable's header slot as an empty state — it renders whether or not there is data

### Page bands (3)

**Read:** `get_page_outlines` — the three roots and the body's first and last child.

- Split the page into header, body and footer sockets before writing blocks
- Move title bars and back buttons out of the body — as the body's first child they scroll away with the content
- Don't force bands the design doesn't have — a plain content screen is correctly all-body

### Page craft (17)

**Read:** `get_page_outlines` in `tree` view for section count and block-type
tally, `get_blocks` on every `stat-card` for its container ancestor and on a
sibling page's equivalent control for a consistency check, the task's spec
`## Changes` and `## Rules` rows for this page, the `app-craft` skill's
`references/composition.md`, `flows.md`, `consistency.md`,
`states-and-fakery.md`, `anti-patterns.md` and `app-look.md`, and the app
header from `entity context app`.

- Tally the block types used across the whole page BEFORE checking anything else here — a page above a few dozen blocks using only 2-3 types, almost always `stack` and `typography`, is very likely a hand-rolled `stat-card` or `chart` standing in for the real block. Run this even on a page with zero data sources; the scope gate above excuses the loading/empty/error rules only, never this tally
- Flag ANY large, low-diversity page with no justification line in the report's notes, not just the stat-card/chart shape — a real settings list is fine when explained; an unexplained one is not
- Flag a COMPLETE screen at or under `composition.md`'s block-type-diversity floor
- Flag 2+ `stat-card` blocks with no non-stat-card content block beneath them
- Flag a `stat-card` or repeated row with no container ancestor — a bare label/value pair
- Flag a page whose only typography role in use is body text where `composition.md`'s role table calls for a section heading
- Flag a list block whose spec Changes row names a per-record action (acknowledge, edit, approve, delete, decide) with no affordance wired to it
- Flag a summary/rollup whose spec Touches list also names the detail page for its records, with no navigation from the summary to that page
- Flag a submit or action control wired to only one of success or failure
- Flag a list the spec describes as grouped or filtered by a field, with no real filter or grouping control on the page
- Flag a page whose whole body is one row of same-size `card` blocks (icon + heading + one line of text) with nothing else — a legitimate section among several, never the entire structure
- Flag a typography role, an accent color, or a repeated control (a "Retry" button, a status badge) that uses a different token or block choice than the equivalent on a sibling page of the same app, with no reason named
- Flag an overlay-style control (dropdown, tooltip, popover) placed inside a scrolling or `overflow`-clipped ancestor, unless its own sheet documents that it escapes the container
- Flag a COMPLETE screen with no look: no look named in the report's `notes`, or a named look the stored config does not show (its accent token, its custom CSS effects) — `app-craft` § Pick the look before the first write
- Flag a task whose message carries an `App look:` line while the look is not stored, so every block shows the tenant's default theme (`app-craft`'s `references/app-look.md`). On a tenant with the theme tools, `get_app_theme` shows other colour seeds or another font than the line; the header then holds no colours. Elsewhere, the app header holds no `<!-- UnifyApps Headless app look -->` block, or holds one with other colours
- Flag a text block whose size is not one of the App look line's `type` sizes or whose weight is not one of its `weights`, and a block shadow on a page whose look says `depth` flat or borders — the app's levels and depth were decided once, and one page off them reads as another app
- Flag groups that break the look's `groups` (a card where it says open sections, a card inside a card) and a group whose inside gap equals the gap between groups — nothing reads as a group

### Tables, forms and status (8)

**Read:** `get_blocks` on every Table, Form and status Tag or Badge on the page —
its columns, their `fieldKey`, `align` and type, its bulk actions and filters,
each field's label and required mark, each button's label and events — and
`app-craft`'s `references/kit.md` § Rules every table, form and status follows.

- Make a Table's first column a name a person reads, not an id
- Right-align number and money columns and left-align text; a header aligns like its column; nothing in a table is centred
- Round a number shown for a quick look ($3.8M, not $3,848,305.93), with the exact value in the record
- Show bulk actions only after rows are selected, and show a filter that is on as on, with a way to clear it
- Put form labels above their fields, in one column, never a placeholder as the label; mark the smaller group, optional or required
- Put a form error next to its field, saying how to fix it and keeping what was typed
- Word the primary button as its result ("Save order"); a destructive action asks first, names the item, and its buttons say the result
- Show a status with an icon or its word as well as its colour, and keep the status colours out of a chart's series

### Hand-rolled components (5)

**Read:** `get_page_outlines` in `tree` view for the SHAPE — sibling repetition,
`displayName` numbering, nesting rhythm — then `get_blocks` on the parent and
two children of any group the shape nominates. Confirm the replacement exists:
the app's block catalog (`app-design`'s `references/block-catalog-web.md`, or
`app-native`'s `references/block-catalog-native.md` on MOBILE), then `get_app_builder_knowledge` on its sheet.

The hand-built Repeatable is already **Must fix** (Scroll ownership & height) —
it is the most costly case, not the only one. A Stack imitates almost any
component, and it imitates them convincingly in a screenshot; what it cannot
imitate is the behaviour underneath — selection state, gesture handling, paging,
column sizing. So this is the defect class that passes the visual check and
fails on the device. Same tells as the Repeatable rule: `duplicate_blocks`
numbering in the `displayName`s (`step`, `step1`, `step11`), an inflated
`_blockCounter`, and the same literal copy repeated across siblings.

**The shapes that give it away, and what each one should have been:**

| What the outline shows | Almost always | What is missing, not just prettier |
| --- | --- | --- |
| Small fixed-size Stacks/Icons alternating with thin Stacks or Dividers | `stepper-v2` (+ `step-separator`) | Active / complete / upcoming is real config on the block. Hand-rolled it is N hardcoded style sets and nothing can advance the state |
| A row of Pressables whose taps toggle sibling `visibility` | `tabs` | Selection state, swipe between panes, native focus order — all free on the block, all absent here |
| Horizontal `scrollable` of equal-width children | `carousel` (or `stories`) | Paging, snap physics and momentum are native behaviours a Scrollable does not have |
| Rows of Typography pairs in a two-column rhythm | `key-value` | Label/value alignment and truncation, and one bound node instead of 2N |
| A Typography header row over fixed-width Stack rows | `table` | Column sizing, sort, row virtualization; the hand-rolled version reflows wrong at every other width |
| 3+ sibling subtrees with the same componentType sequence | `repeatable` | Already **Must fix** — see Scroll ownership & height. Do not raise it twice; merge into that finding |

**Rules:**

- Check the shape table against the outline on every page, before judging any single block's config — this is a whole-page structural read, and it is invisible one `get_blocks` at a time
- Name the replacement block explicitly, and confirm it exists in THIS app's catalog first — `stepper`, `timeline`, `tag` and `statcard` are WEB-only; a MOBILE page gets `stepper-v2`, and there is no native `timeline` at all, so "use a Timeline" is an unapplicable step on a native page
- Read the replacement's sheet before proposing it — "use Tabs" without the tab items and the pane binding is not something the builder can apply
- Give the evidence as the shape you read: the parent `blockId`, the child count, the repeated componentType sequence, and the `displayName` numbering. "Looks hand-rolled" is not evidence
- Do NOT flag a fixed small layout that will never be state- or data-driven — a two-item header, a three-icon footer row. The trigger is repetition standing in for behaviour, not repetition

### Sizing (11)

**Read:** `get_blocks` → `appearance.styles` width/height/flex plus the SIBLING
keys (`objectFit`, `position`) on the same block.

- Omit the width/height key entirely to size to content — absence IS the value; there is no "auto" on this platform
- Leave height off every block inside a scroll owner unless it needs a fixed pixel size — that omission is the correct default, not an oversight
- Fill with `w-full` / `h-full`; flex with `flexGrow` or `{flex:1, minWidth:0}`
- Give flex columns `{flex:1, minWidth:0}`
- Add `{flexShrink:0}` to trailing control clusters so they align across rows
- A custom pixel value is DESIGN INTENT, not a defect. `28px`, `307px`, `15.56px` came from Figma and are there on purpose — LEAVE THEM. Flag one only when it causes an OBSERVED failure on a device, and even then the fix is usually removing the constraint (let the block size to its content) — never substituting a different number
- Read the SIBLING properties before changing any size — `objectFit` decides what a width change does to an Image (`object-cover` crops the overflow, so widening the box can blank the graphic), and absolutely-positioned children inherit the parent's new width. Changing one dimension in isolation can fix layout and break rendering in the same edit
- Set explicit width and height on Image and Carousel too — they DO render unsized, but the box is 0 until the asset loads, so the layout jumps on a cold open over a slow network. Verify before fixing: on a warm app with cached assets there is often nothing to see
- The 4 / 8 / 12 / 16 / 24 / 32 scale is guidance for NEW spacing you author. It is NOT a licence to renumber existing values — do not rewrite a designer's `28px` to `24px` to make it fit the scale. That is churn, not a fix
- Use `object-contain`, not `contain`
- Let wide content scroll inside its own container rather than stretching the page

### Per-device overrides (2)

**Read:** each block's `componentOverrides` / device-scoped appearance, against
the outline's live block ids.

- Review per-device block overrides for drift — a block restyled on one device and not the others diverges silently
- Check that overridden blocks still exist — an override left on a deleted or restructured block is dead config

### Styles & custom CSS (12)

**Read:** `appearance.customStyles`, `additional.customCSS`,
`additional.htmlAttributes`, and `get_color_tokens` / `get_style_options`
for what is honoured; the page's `customCode` from `get_page_outlines`
`{view: "settings"}` and the app's from `entity context app`; `app-craft`'s
`references/custom-css-and-code.md` for the rules.

- Take colors from tokens, not inline hex; in custom CSS, from `var(--ds-*)` when the app has a look, in its theme or its header
- Remove banned custom CSS — viewport units, `position:fixed`, `cursor` without an event
- Check custom CSS keys are real properties — a wrong key fails silently
- Move app-chrome rules out of a block's custom CSS — the page nests all of it under `[data-page-scope-key="…"]`, so a rule for the navigation rail (`.nocode-navigation-container`), the app bar, the background behind the page, `body` or `html` matches nothing; it goes in the app's custom code header (`update_app_settings`, panel `customCode`)
- Check app-wide CSS in the custom code header and footer is scoped — a navigation rule starts with `.nocode-navigation-container`, a rule for the rest of the app may start with `.interface-theme`, and a rule outside the app starts with `html:not(:has(.ua-builder-side-nav))` (`body`, `main.ua-page-workspace`, `.bg-workspace`, dialogs, drawers). A bare `[data-nav-root=side]`, `.ua-side-nav-item`, `.MuiDrawer-content`, `.bg-workspace` or `body *` rule also hits the builder's rail and drawers: its Data button disappears and the app's border shows on it (see `app-design` § Five habits)
- Name the block in every top-level rule of a block's custom CSS, `[data-block-id='<id>']` — nothing scopes it to its block, so a rule without the id styles whatever it matches on the page, or nothing
- Move a `{{ }}` out of custom CSS — it is never evaluated; put the data in an HTML attribute, whose value is evaluated, and select on that attribute
- Move `@font-face` and `@import` out of a block's custom CSS into the page or app header — only `@keyframes` survives the page wrapper
- Narrow a page or app header `<style>` rule to a block id, an attribute you set, or one of the app-wide scopes above — that code is not page-scoped, so a bare `button` or `div` rule restyles the whole document, the builder included
- Lift every `<script>` in page or app code to the top level — a script nested inside another element never runs
- Replace a coloured stripe on one side (`border-left`/`-right`/`-top`/`-bottom` wider than 1px) and gradient text (`background-clip: text`) — `app-craft`'s `anti-patterns.md`
- Remove a hover lift or pointer effect from a block with no click wired — it promises an action that is not there

### Spacing rhythm (4)

**Read:** container `gap` vs per-child margins across one axis; sibling cards'
padding / radius / gap.

- Put one `gap` on the container instead of margins on each child — mixed margin and gap reads as random rhythm
- Set one horizontal page padding so left and right edges align down the page
- Give sibling cards the same padding, radius and gap — an odd one out is a bug unless it was asked for
- Make gaps between sections larger than gaps within them

### Data sources & page variables (4)

**Read:** `get_data_sources`, `get_dependency_graph`, the page's variables and
their `initialValue` strings.

- Merge data sources fetching the same resource with the same inputs
- Give UI-gating page variables an initial value — otherwise nothing is selected on load and nothing enforces a choice
- Check every page variable's `initialValue` actually parses — a literal newline inside a JSON string breaks it silently
- Store ids, not indexes — the row index is a position in the filtered data, not the source

### Content & semantics (3)

**Read:** each Image's `content.data.src` and `uploadDetails.source`, alt text,
and the Repeatable's data shape.

- Give images meaningful alt text, or empty alt if decorative
- Check an Image's `content.data.src` against its `uploadDetails.source` — a migrated placeholder left in `src` while the real asset sits in uploadDetails is two answers to one question
- Replace every seeded or generic word: "Label", "Enter Value", "Button", "Tab 1", "Hello world", "Submit", "OK", "No data" — `app-craft`'s `references/words.md`

### Does it actually do the thing (2)

**Read:** `get_interaction_options` / each control's `events` chain, judged
against the app's integration STAGE.

- Check the form actually does the thing it promises
- Give every control that looks interactive an actual handler — but judge it by STAGE. Before integration, a control waiting on an unmapped data source is expected, not a defect. A control that needs no data at all — an external link, a navigation to an existing page — has no such excuse

### Modules, locales, access (3)

**Read:** `get_module_options` / the module's contract, the app's locale list,
the page's `publicAccess`.

- Declare what a module exposes — declaring nothing and never being read look identical from the outside
- Keep enabled locales aligned with what the UI offers — only the default plus supported locales can ever be switched to
- Check `publicAccess` matches the page's intent — Public is right for a login screen and wrong for everything behind it

### Verification (7)

**Read:** the read-back of what you wrote, and a screenshot or the device only
when the task's Proof asks for one. These are the rules about how a finding
earns its grade; one you cannot meet goes in the report as unverified.

- Never grade a finding critical from the builder canvas alone — it hides blocks that DO render on device (an unsized Carousel), resolves `deviceContext` to nothing so bad text looks fine, and shows a clean page over one throwing 20+ render errors
- Re-read the page after any structural move
- Open overlays for screenshots with `?blockId=<id>` on the builder URL
- Force-show loaders and empty states, shoot, then restore the saved visibility verbatim
- Say when a state couldn't be visually checked — never report an unverified overlay as looking right
- Pull values from `get_style_options`, `get_color_tokens` and `get_icon_options`, not memory
- Read back what you wrote before calling it done

## Optional (19)

### Naming (7)

**Read:** `get_page_outlines` — names alone; no block config needed.

- Name every block you create — the layers panel is the maker's map
- Name blocks for their role, not their order, as camelCase identifiers — `loginSubmitButton` beats `button4`. A space or hyphen is not stored as written, and copy-paste names like `card3` / `card31` actively hide that the two are one pattern
- Rename every block in scope still carrying a default name — `stack27`, `text64`, `image5`, `pressable16`
- Do the rename pass as one batch, before any structural cleanup — renaming is non-destructive and makes every later finding easier to describe
- Name a Repeatable for its data and its template for the row — `policiesList` / `policiesRow`
- Name page variables for the value they carry, not the widget — `selectedLoginRole`, not `card_name`
- Report abandoned blocks when default numbering has gaps; deleting them is a destructive step

### Tidiness with a cost (1)

- Two Typography blocks holding one sentence is untidy, not broken — merge only if you are already editing that block. Never open a page to do it

### Ids (2)

**Read:** the outline's ids; never a name.

- Reach entities by id, never by name — names are not unique across an app
- Prefix temp ids `tmp_` and never name one like a data key — they're substituted textually into binding strings in the same call

### Structure collapse (4)

**Read:** `get_page_outlines` in `tree` view, then `get_blocks` only on the
wrapper candidates — direction, gap, padding, background, border, height,
`keyboardConfig`, events, visibility.

- Collapse single-child Stacks that add no layout of their own — each Stack is a render boundary and a row in every dependency recompute
- Question anything more than about four levels below the body — deep chains of single-child wrappers are Figma-export scaffolding, not layout
- Keep a Stack that is a scroll owner, holds `keyboardConfig`, is slot content, or is condition- or event-bound
- Replace spacer Dividers, empty Typography and padding-only Stacks with one style key

### Composites (3)

**Read:** slot maps and row templates — `__PLACEHOLDER__` contents, Card slots.

- Fill or remove composite slots left as `__PLACEHOLDER__`
- Replace a Card used as a plain box with a Stack — a Card is four blocks and a slot map
- Build repeated rows from Stack + Typography — a Card row renders empty on raw-written pages

(Hand-rolling a block the catalog already has is **Should fix → Hand-rolled
components**, not an Optional tidy.)

### Dead config (2)

**Read:** `get_dependency_graph` for readers; the block's own style keys.

- Delete page variables nothing reads, when this task created them; report any others
- Remove `backgroundSize` / `backgroundRepeat` set on a block that has no `backgroundImage` — dead config

---

## Mobile only

Rules for a MOBILE app on the UnifyApps mobile renderer, on top of everything above. The
native facts behind them are in the `app-native` skill.

### Must fix (31)

#### Page tree & routing (1)

**Read:** `get_page_paths`, `get_app_overview`, `get_page_outlines` — `address`,
`parentId`, each page's `children[]`, slug segments, tab-item `pageId`s.

- Don't deep-link to a bottom-tab-hosted page — `matrix://<slug>` can't reach them

#### Scroll ownership & height (11)

**Read:** `get_page_outlines` in `tree` view for nesting, then `get_blocks` on
the scroll candidates — `appearance.styles.height`, `flex`, `flexGrow`,
`overflow`, `content.scrollable`, `shouldWrapContentInScrollView`, and
`root_id`'s own styles.

- Flag body content that can grow taller than the screen with no scroll owner — the page body does NOT scroll, it is a bounded view that cuts the content off (`native.md` rule 6). The fix is ONE `Scrollable`, or a Repeatable with `scrollable: true`, holding that content
- Never put a Repeatable with `content.scrollable: true` (or unset) inside a Scrollable — kills virtualization, and breaks pagination and pull-to-refresh. A short list with `content.scrollable: false` inside one is how a nested list is built (`native/blocks/repeatable`)
- Keep exactly one scroll owner per axis — two scrollables on one axis fight for the gesture, worst on Android
- Give every scroll container a bounded height from a parent — `h-full` on the scroll block itself is CORRECT, it is what the container measures against
- Never use `flex:1` or `h-full` along the scroll axis on anything INSIDE a scroll region — use `flexGrow`; the parent has no fixed height to be a percentage of, so they resolve to zero. Across the axis it is fine: the columns of a row Stack take `{flex:1, minWidth:0}` (`native/blocks/stack`)
- Apply that to every descendant of the scroll owner, not just its direct children — grandchildren and slot contents are inside the region too
- Only RELATIVE heights collapse — a fixed pixel height inside a scroll region is a number and resolves fine
- Decide which single block owns the scroll before judging any height — the same `h-full` is right on that block and wrong one level inside it
- Never flag a `Scrollable` directly under `root_id` for double-nesting the body — the body has no scroll of its own, so that `Scrollable` is the page's one scroll owner
- Set the sheet's `appearance.behaviour.scrollableBody: false` when a Repeatable sits in a BottomSheet (a set `scrollableBody` wins over `shouldWrapContentInScrollView`)
- Don't expect `overflow` on a Container to scroll, or any `overflow` on a Stack but the scroll tokens its sheet lists (`native/blocks/stack`) — the rest is inert

#### Native interaction (4)

**Read:** `get_blocks` on every block carrying `events`, plus `list_form_fields`
and each TextInput's `events.onChange`.

- Never put `onClick` on a Stack or an Icon — dead on native
- Wrap Typography in a Pressable to make text tappable
- Wire `onChange` on every TextInput — without it, typed text silently drops
- Keep inputs out of Repeatable rows — they render but never take taps

#### Keyboard (4)

**Read:** every TextInput, TextArea, Form and MessageInput and its ancestor
chain; `keyboardConfig` in the custom styles (`additional.customCSS`) of each
ancestor Stack and Scrollable, with any `linearGradient` or `blurConfig`
beside it; on a BottomSheet, `appearance.behaviour.keyboardAvoidance`,
`appearance.behaviour.scrollableBody` and `appearance.height`.

- Give every input a keyboard-aware ancestor — otherwise the focused field, or the submit button under it, sits behind the keyboard with no way to reach it (the page quality pass's U4, blocking). A Modal keeps clear of the keyboard by itself
- Put the keyboard setting on the vertical scroll owner that already scrolls the inputs: `keyboardConfig: {"type": "scroll"}` on that Scrollable, or on that scrolling Stack in place of its `overflow` token. Only when nothing above the inputs scrolls does the nearest Stack holding them and the content above them take `keyboardConfig`. Never add a second scrolling Stack inside a scroller — one scroll owner per axis
- Put `keyboardConfig` on a Stack (any type) or a Scrollable (`scroll` only), never on a Stack that also has `linearGradient` or `blurConfig`, where it never takes effect (put it on a plain Stack inside). A Drawer never lifts, and on any other block the key is silently ignored
- In a BottomSheet set `appearance.behaviour.keyboardAvoidance: true`, never `keyboardConfig`. A sheet too tall to lift (full screen, a percentage height over 60%, or no height, which opens at 61.8%) also keeps `appearance.behaviour.scrollableBody` on

#### Blocks & their sheets (5)

**Read:** the `app-native` skill's `references/block-catalog-native.md`, then `get_app_builder_knowledge` for
`blocks/<block>` of every type on the page, plus the `app-native` skill and
that skill's `references/native.md` for the native facts.

- Pick blocks only from the 71-block native catalog
- Read the block's sheet: which one on MOBILE is `app-native` § Sheets on a native target
- Set explicit width and height on Camera, PhotoBooth, QRCode, PDFViewer and Iframe — these render NOTHING at all until they are sized
- Give every BottomSheet a height: an explicit height, snap points, or `h-auto` for a sheet sized to its content (capped at 90% of the window; `native/blocks/bottom-sheet`). With no height at all it opens at 61.8% of the window
- Never pass a `data:` URI to an Iframe — Iframe is the native WebView

#### Styles that throw or erase themselves (4)

**Read:** `get_blocks` → `appearance.styles`, `appearance.customStyles`,
`additional.customCSS`; `get_style_options` for the legal shapes.

- Never leave empty-string style values like `borderRadius {all:""}` — throws a red toast on every render
- Use the same map form across `borderWidth`, `borderStyle` and `borderColor`
- Never set `backgroundColor` and `backgroundImage` on one block — the color hides the image
- Write numeric styles as numbers, not px strings — `bottom:8`, never `"8px"`

#### Bindings & data (1)

**Read:** `get_data_sources`, `get_dependency_graph`, `get_context_keys`, and
the binding strings themselves in `content` / `visibility` / `events`.

- Never bind `deviceContext` — use the `userContext['context']` mirror

#### Process & safety (1)

**Read:** the session's own change manifest and the saved visibility values you
overrode.

- Don't rely on foregrounding the app to pick up config changes — it never refetches page config

### Should fix (12)

#### Keyboard (3)

**Read:** each input's `content.inputType`, and the `keyboardConfig` `type`
and offsets on its keyboard-aware ancestor (Must fix › Keyboard).

- Match the type to the layout on a Stack — `scroll` for forms, `keyboardAvoidingView` for a fixed layout, `sticky` for a chat composer; a Scrollable takes `scroll` only
- Measure keyboard offsets rather than guessing them
- Match the input mode to the data

#### Safe area (1)

**Read:** `root_id`'s styles, the header socket's contents, `get_style_options`
for the `*-safe` tokens.

- Follow the `app-native` SKILL.md "Safe area" rule: one top inset, one owner, decided from the `root_id` read

#### Tap targets (2)

**Read:** block types carrying `events`, and `hitSlop` on the small ones.

- Make every tappable a Button, IconButton, Pressable, Card or StatCard — a list row's tap surface is a Pressable at the row template's root with the action on its `onPress`, never the Repeatable's `onSelectItem`, which shows no press feedback
- Use `hitSlop` for small targets instead of a bigger visual box, as an object: `{ "all": 8 }`, or `{ "custom": { "top": 8, … } }` per side; the phone drops a bare number

#### Styles & custom CSS (4)

**Read:** `appearance.customStyles`, `additional.customCSS`, and
`get_color_tokens` / `get_style_options` for what is honoured.

- Write Style JSON, not CSS text — the grammar is `ai-editing/native-custom-styles`, and the keys a block honours are in its own sheet
- Flag CSS TEXT in `additional.customCSS` on a native page — the renderer has no CSS engine, so it stores clean and does nothing. On a MOBILE app that key holds the Style JSON as text, and the tool fills `appearance.customStyles` from it — so the fix is a JSON body in `additional.customCSS` alone, with only keys the block honours: the block's sheet (`app-native` § Sheets on a native target) plus the app-native skill's `references/gradient.md` (they differ per block; `Container` reads none). A rule that cannot be expressed there is a design constraint to report, not a reason to keep the CSS
- Drop `:hover`, selectors, `htmlAttributes`, CSS gradients, `var(--…)` and `box-shadow`
- Don't put token ids inside per-side `{custom:{…}}` maps — silently ignored there

#### Content & semantics (1)

**Read:** each Image's `content.data.src` and `uploadDetails.source`, alt text,
and the Repeatable's data shape.

- Make section bands marker rows inside one list — a second list is a second scroll owner

#### Verification (1)

**Read:** the read-back of what you wrote, and a screenshot or the device only
when the task's Proof asks for one. These are the rules about how a finding
earns its grade; one you cannot meet goes in the report as unverified.

- Device proof runs on the app's draft in the UnifyApps Preview app and needs no `publish_app` of the change once the app has been published once; it runs only when the Proof asks (`app-native` § Verify a native write on a device) — a builder preview is not device proof, and "loaded" is not "verified"

### Optional (2)

#### Structure collapse (2)

**Read:** `get_page_outlines` in `tree` view, then `get_blocks` only on the
wrapper candidates — direction, gap, padding, background, border, height,
`keyboardConfig`, events, visibility.

- Keep the page-padding Stack directly under `root_id` — that nesting is deliberate, not redundant
- Don't put a Stack inside a Pressable for layout — Pressable is already a flex container
