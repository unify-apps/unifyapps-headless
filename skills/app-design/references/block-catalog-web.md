## Web block catalog (50) — WEB / COPILOT / DISPLAY apps

## Contents
- 50 blocks, alphabetical: alert, avatar, barcode, button, button-group, card, carousel, chart, chat, checkbox, code-editor, comments, container, contextual-dialog, copilot, divider, drawer, file-upload, filters, form, icon, icon-button, image, key-value, link, loader, lottie-animation, menu, message-input, modal, module, navigation-container, navigation-menu, organization-chart, pdf-viewer, repeatable, single-select, stack, stat-card, stepper, stepper-v2, table, tabs, tag, template-component, text-area, text-input, timeline, timer, typography

Pick from THIS list, never from memory. A few more blocks exist, such as
Password: a type with a `blocks/<name>` sheet in your sheet
list exists and is read from that sheet; a type with neither does not exist
on this platform, however plausible the name. Full contract: `get_app_builder_knowledge`
with `blocks/<name>`. Two lines each: what it is, and when it is the right
choice over its neighbours.

- **alert** — A coloured status banner (info / success / warning / error) with a title, message and optional action.
  Use for a page- or section-level notice that stays on screen; for a transient toast use the `showNotification` action instead.
- **avatar** — One person or entity as a circle: initials, an icon, or a photo, with a size and optional status dot.
  Use wherever a single identity is shown; for a row of people use `avatar-group` (native) or a Repeatable of avatars.
- **barcode** — Draws a scannable 1-D barcode (Code128, EAN…) from a text value.
  Use to DISPLAY a code; scanning is the `Scanner` block on native. Not a QR code — that is `qr-code` on native.
- **button** — The labelled tap target: label, variant, size, start/end icon, `onClick`, with `loading` and `disabled` as condition objects.
  The default for any explicit action. Icon-only → `icon-button`; a whole tappable region → `pressable` (native) / `card`.
- **button-group** — A set of related buttons as a row, a dropdown menu, or a segmented toggle that holds a selected value.
  Use for mutually related choices or a compact action cluster; a single action is a `button`, a form choice is a form field.
  Its `onClick` fires once on initial render with the starting selection, not only on a person's click: wiring it straight to a save or a write double-writes on first load, so guard the handler against the initial value or trigger the write from a real user event instead.
- **card** — A bordered, optionally collapsible panel with `header` and `body` slots (each a Stack) and its own click event.
  Use to frame a distinct unit of content; for plain grouping with no chrome a `stack` is cheaper (a Card is four blocks).
- **carousel** — Paged, swipeable slides with dots/arrows; one slide visible at a time.
  Use for hero banners, onboarding, image galleries. Not a general horizontal scroller — that is a row `stack` or a horizontal `repeatable`.
- **chart** — Data visualisation: bar, line, area, pie, donut, scatter and more, from a bound data set with axes/legend/tooltip config.
  Use for any numeric series; a single headline number is `stat-card`, tabular data is `table`.
- **chat** — A full conversational thread UI: message list, composer, attachments, streaming replies.
  Use for human-to-human or human-to-agent conversations as a product surface; for an AI assistant panel use `copilot`.
- **checkbox** — A standalone boolean toggle with a label, outside a Form.
  Use for a single on/off setting bound to a page variable; inside a Form the checkbox field type handles it.
- **code-editor** — A syntax-highlighted code editing area (JSON, JS, SQL…) with validation.
  Use when the user must author code or config text; for prose use `text-area`.
- **comments** — A threaded comments widget on an entity: list, reply, mention, resolve.
  Use for collaboration on a record; for free-form chat use `chat`.
- **container** — A grid container: fixed column ratios (1:2:1, 2:1…) with cells that hold blocks.
  Use when columns must keep proportions; for one-dimensional flow (row or column) `stack` is the right tool.
- **contextual-dialog** — A popover anchored to a trigger block, shown on click/hover.
  Use for a small inline menu or detail beside its trigger; a full overlay is `modal`, a side panel is `drawer`.
- **copilot** — The embedded AI assistant surface: conversation, tools, voice, with agent selection.
  Use to put an agent in the app; it composes its own input and thread blocks.
- **divider** — A horizontal or vertical rule with spacing.
  Use only for a visible separating line; for spacing alone use `gap`/`margin` on the neighbours.
- **drawer** — A panel sliding in from an edge over the page, opened/closed via the `controlDrawer` action.
  Use for secondary flows that keep page context (filters, detail, settings); a blocking decision is `modal`.
  Only one drawer can be open on a page at a time, even across `module` boundaries: a drawer a module opened and a drawer the page itself opens cannot both be open together. Never design two drawers meant to be open at once.
- **file-upload** — Drop zone / picker that uploads files and exposes the uploaded records.
  Use for standalone uploads bound to a variable; inside a Form the file-uploader field type handles it.
- **filters** — A filter toolbar of typed controls (select, date, text…) whose values feed a data source's inputs.
  Use above a table or list the user narrows; the controls' types come from `get_app_builder_knowledge` under `blocks/filters/`.
- **form** — A schema-driven form: fields with validation, layout and submit, from a friendly `fields` spec.
  Use for any multi-field input; single inputs bound to a variable are `text-input`/`checkbox`/`single-select`.
- **icon** — One glyph from the platform's icon registry, sized and coloured.
  Purely decorative or informational; it fires no events on native and should not carry them on web — wrap in a tappable block instead.
- **icon-button** — A tappable icon with variants and sizes, `onClick`, loading/disabled.
  Use for compact actions (edit, delete, close); a labelled action is `button`.
- **image** — Renders an image from a URL or upload with fit, radius and fallback.
  Use for pictures and logos; a grid of many is `repeatable` over image rows; a person is `avatar`.
- **key-value** — A label/value list laid out in rows or columns, from a bound object or explicit pairs.
  Use for detail panels ("Status: Active"); for editable pairs use a `form`.
- **link** — Text that navigates to a URL or page, with target and styling.
  Use for inline navigation inside prose; an action-shaped navigation is a `button` with `navigateToPage`.
- **loader** — A loading indicator: `DEFAULT` arc spinner, `AI` animated mark, or `CONTENT` skeleton (bars or one solid block).
  Use as a SIBLING beside a data-bound block, visible on the source's `isLoading`; no block has a loading state of its own.
- **lottie-animation** — Plays a Lottie (JSON/.lottie) animation from URL or upload, with loop/autoplay.
  Use for illustrative motion (empty states, success); for a plain spinner use `loader`.
- **menu** — A dropdown/context menu of actions, opened from a trigger.
  Use for an overflow ("…") of actions on a row or header; a persistent choice control is `single-select`.
- **message-input** — The chat composer: text, attachments, mentions, voice, send.
  Use to build a custom conversation surface; `chat` and `copilot` already include one.
- **modal** — A centred overlay dialog opened/closed via `controlModal`, blocking the page behind it.
  Use for confirmations and focused tasks; non-blocking side content is `drawer`, anchored content is `contextual-dialog`.
- **module** — Embeds another interface module (a page with a contract) with inputs and outbound events.
  Use to reuse a screen fragment across pages/apps; for a design-only reusable piece use `template-component`.
- **navigation-container** — The app-shell frame that hosts a page's nav (side/top) and its content outlet.
  Use once, as the shell; pages inside it do not add their own navigation.
- **navigation-menu** — A navigation list (side or top) of pages/links with icons, groups and active state.
  Use inside the app shell for primary navigation; in-page section switching is `tabs`.
- **organization-chart** — A hierarchical org tree from a bound data set with expand/collapse.
  Use for reporting lines and hierarchies; a flat list of people is a `repeatable`.
- **pdf-viewer** — Renders a PDF from URL/upload with paging and zoom.
  Use to show documents inline; for download-only use a `button` with `downloadFile`.
- **repeatable** — Renders a row template once per item of a bound array; the platform's list primitive, with selection, pagination and sorting. Arrives with one template child and holds exactly one — a `create_block` under it while the scaffold stands is refused; delete the scaffold in an earlier step, or build inside it.
  Use for ANY data-driven list or grid of cards; a static set of children is a `stack`, tabular data is `table`.
- **single-select** — A standalone dropdown that holds one selected value, with searchable options from a source or list.
  Use for a page-level selector bound to a variable; inside a Form use the single-select field type.
- **stack** — The layout box: children in a column or row with gap, alignment, wrap, padding and background.
  The default container for everything; it does not scroll on native and its `onClick` is dead there — use `scrollable`/`pressable` for those.
- **stat-card** — A headline number with label, optional description, trend pill and prefix or suffix text, clickable. It has no icon of its own: put an `icon` beside it in a `stack` when a tile needs one.
  Use for KPI tiles; several in a row is a `stack` of stat-cards or a `repeatable` over metrics.
- **stepper** — DEPRECATED multi-step container. Do not create; existing ones stay editable.
  For new work use `stepper-v2`.
- **stepper-v2** — A multi-step flow: steps with content, progress indicator, next/back via `controlStep`.
  Use for wizards and multi-page forms; simple section switching is `tabs`.
- **table** — A data table: typed columns, sorting, filtering, pagination, row actions, inline edit, add-ons (toolbar, save, bulk).
  Use for record sets the user scans, sorts and acts on; a card-per-row experience is `repeatable`.
- **tabs** — Tabbed sections, each holding its own content, with an active tab value.
  Use for switching views within one page; multi-step progression is `stepper-v2`.
- **tag** — A small pill showing a status or category with colour variants.
  Use for labels on rows and cards; a removable/selectable chip set is `button-group` or a form field.
- **template-component** — An instance of a reusable design component defined once and used across pages.
  Use to keep repeated UI in sync; behaviour with inputs/outputs is `module`.
- **text-area** — A multi-line text input bound to a variable, with rows and character limits.
  Use for standalone free text; inside a Form use the textarea field type.
- **text-input** — A single-line input (text, number, email…) bound to a variable, with prefix/suffix icons.
  Use for standalone inputs (search box, quick filter); inside a Form use the string field type.
- **timeline** — A vertical sequence of events with timestamps, icons and descriptions from bound data.
  Use for activity feeds and histories; scheduling by date is `calendar` (native) and free lists are `repeatable`.
- **timer** — A countdown/stopwatch that emits events on tick and completion.
  Use for time-boxed flows (OTP resend, quizzes); a static time display is `typography` with a formatted binding.
- **typography** — All text: headings, body, captions, with variant, weight, colour, truncation and rich formatting.
  Text goes here and nowhere else; a clickable text is `link`, an editable one is `text-input`.
