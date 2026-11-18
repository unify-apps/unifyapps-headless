# Custom CSS and custom code

## Contents
- Block custom CSS
- Block HTML attributes
- Page header and footer code
- App header, footer and HTML attributes
- One look on many blocks
- Mobile apps

The facts behind the "Where the look lives" table in `SKILL.md`. Each part
names the knowledge sheet that owns it; read that sheet before your first
write there, because the write gate refuses a write that leans on an unread
sheet. Every fact here was read from those sheets and from the platform's
own rendering code.

## Block custom CSS

Stored at `additional.customCSS`, a CSS string. Write it with
`update_blocks` (an op on `path: "additional.customCSS"`) or in
`create_block`'s `props`, inside `apply_page_edits`. Sheet:
`concepts/appearance-styles`, section "Custom CSS and HTML attributes".

1. **Name the block in every top-level rule:** `[data-block-id='<id>'] { … }`.
   Nothing scopes the CSS to its block. A rule without the id styles
   whatever it happens to match on the page, or nothing, and no error says so.
2. **The page wraps every block's CSS in `[data-page-scope-key="…"] { … }`.**
   So a rule reaches this page's blocks only. `body`, `html`, the navigation
   rail and the app bar are outside it; style those from the app header.
3. **`@media` and `@keyframes` work.** `@media` nests fine, and the page
   lifts `@keyframes` out of the wrapper. `@font-face` and `@import` do not
   survive the wrapper: load a font in the page or app header instead.
4. **A `{{ }}` in CSS is never evaluated.** The text is literal and static.
   To make data change the look, put the data in an HTML attribute (below).
5. **One CSS text for every device.** A `device` on this edit is ignored.
   Use `@media` for a size change.
6. **A warning is not optional.** The tool warns on a bad selector or bad
   CSS and stores `additional.isCustomCSSValid`. When that is `false`, the
   page drops ALL of this block's CSS, not just the bad rule. Fix the text
   until the write comes back with no warning.
7. **The stored text comes back pretty-printed.** Compare rules, not
   formatting, when you read it back.
8. **Hover, focus, motion and transitions live only here.** No style key
   holds them: `:hover`, `:focus-visible`, `transition` and `@keyframes` are
   the way. A button's own press feedback (`appearance.interactions`) stays
   on; your CSS adds to it. Timing: 100–150ms for a press, 200–300ms for a
   hover or a state change, 300–500ms for something that opens, and up to
   800ms for an entrance, staggered 100ms per item. Ease out
   (`cubic-bezier(0.25, 1, 0.5, 1)`), never bounce. Animate only `transform`
   and `opacity`. Wrap motion in `@media (prefers-reduced-motion:
   no-preference)`. A hover lift goes only on a block with a click wired: a
   card that lifts but does nothing tells a lie.
9. **A rule styles the element it matches.** A composite block (a table, a
   file uploader, a checkbox) has inner parts with their own classes. A rule
   on the block's root does not reach their text. Look in the browser before
   you say a CSS change worked.
10. **No raw colour when the app has a look.** When the app has a look
    ([app-look.md](app-look.md)), in its theme or its header, write `var(--ds-primary)`,
    `var(--ds-surface)` and the rest, and `color-mix(in srgb,
    var(--ds-primary) 12%, var(--ds-surface))` for a tint. A hex value here
    is a second palette that drifts from the first.

## Block HTML attributes

Stored at `additional.htmlAttributes`, an array of `{key, value}`, not a
map. Same tools and sheet as custom CSS.

1. **Send the whole array on every write.** There is no per-key update.
2. **A `{{ }}` in a value IS evaluated at render.** This is how data drives
   a look: `{"key": "data-status", "value": "{{ …status… }}"}` on the block,
   then `[data-block-id='<id>'][data-status='overdue'] { … }` in its CSS.
   The browser already knows hover, focus and window width, so those need no
   attribute; only what the page's data knows does.
3. **It can differ per device.** Pass `device` on the edit.

## Page header and footer code

Stored at the page's `properties.customCode.{header, footer}`. Written with
the `update_page_settings` step of `apply_page_edits`: send
`customCode.header`, `customCode.footer` or both. A side you leave out is
kept, and `null` clears one side. Sheet: `concepts/pages/custom-code`.

1. **Read it first** with `get_page_outlines {view: "settings"}`. The header
   may already hold font `@import` rules, and replacing it drops them.
2. **`header` goes at the end of `<head>`**, before the page paints: a
   `<style>` block, a font `<link>`, a `<meta>`. **`footer` goes last in
   `<body>`**: a widget that needs the page to exist first.
   Neither sits inside `.interface-theme`, the element inside `<body>`
   that holds the theme's `--ds-*` variables, so markup there that reads
   `var(--ds-…)` gets nothing (an SVG gradient stop drew black). Markup that
   needs a theme colour is put inside `.interface-theme` by a footer
   `<script>`.
3. **A `<style>` here is not wrapped in the page scope.** It reaches the
   whole document while the page is open. That includes the builder itself
   while someone edits the page. So name narrow targets (a block id, an
   attribute you set), never bare tags such as `button` or `div`.
4. **Only a top-level `<script>` runs.** One inside another element never
   runs. A `{{ }}` is read only inside script text, and only the signed-in
   visitor's names are in reach (`user`, `customer`, `environment`,
   `modules`). A script cannot read blocks, page variables or data sources.
5. **A throw is silent, and a script can run twice.** Guard your globals,
   and undo timers and listeners on the `__CLEANUP__` window event.
6. **A page embedded in another page brings its code along.**
7. **A page has no `htmlAttributes`.** Only the app record has them.
8. **Prove the write** with `get_page_outlines {view: "settings"}`. A side
   over 2000 characters comes back as its length and sha256: compare them
   with the text you sent. A shorter side comes back whole: compare the text.

## App header, footer and HTML attributes

Stored on the app record at `properties.customCode.{header, footer,
htmlAttributes}`. Written with `update_app_settings {appId, panel:
"customCode", values: {…}}`; put a long value in its `argsFile`, made with a
script. Sheet: `concepts/interface-record/custom-code`.

1. **It changes every page.** It is in scope when your message carries the
   app's `App look:` line (the app's `app` task stores it), or
   when the task is about the app's look; otherwise report
   `needs_confirmation`. The look block, used on a tenant without the theme
   tools, and the script that builds it are in [app-look.md](app-look.md).
2. **Send `header` and `footer` together.** The builder's own save writes
   both every time, so a write with one side can clear the other. Read what
   is stored, keep it, add your part, and send both.
3. **Read what is stored** with `entity context app <interfaceId> --save
   --json` and look at `properties.customCode` in the saved file. No key
   means nothing is set.
4. **This is the place for the app's chrome:** the navigation rail
   (`.nocode-navigation-container`), the app bar, the background behind the
   page, `body`. A block's CSS cannot reach them. The header and footer also
   load in the builder, so scope every rule as `app-design` § Five habits
   says (App-wide CSS never names a bare platform class), or it restyles the
   builder's own rail.
5. **App `htmlAttributes` land on the app's page container**, not on
   `<html>`. A value can be a binding. Send the whole array.
6. **App code and page code both run.** Neither replaces the other.
7. **The app-wide font is the app look's job.** The app's theme, or on a
   tenant without the theme tools the look block, points the theme's
   `--fontFamily-text` and `--fontFamily-display` at the app's font, and
   every block follows, inside composite blocks too (checked on a test tenant
   on 2026-10-04). A `font-family` rule on `[data-block-id]` misses text
   inside composite blocks, so do not set the font block by block.
8. **Prove the write** from the `update_app_settings` reply: it reads each
   key back at the path it was written to.

## One look on many blocks

When many blocks share one effect (a card that lifts on hover, one brand
gradient), do not paste the same CSS into each block. Give each block the
same HTML attribute, such as `{"key": "data-look", "value": "lift-card"}`.
Then write the rule once: in the page header for one page, or in the app
header for every page, as `[data-look='lift-card']:hover { … }`. One block's
own look still goes in that block's CSS.

## Mobile apps

None of this is CSS on a MOBILE app. A block's `additional.customCSS` holds
Style JSON (`app-native`). Page and app code are never injected, and
`htmlAttributes` do nothing. Nothing reports any of this.
