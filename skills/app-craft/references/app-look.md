# The app look: decided once, stored once, applied on every page

## Contents
- Why once
- Decide it
- The App look line
- Store it
- Apply it on every page
- What it does not cover yet

## Why once

A look picked page by page drifts. Pages are built side by side, so each
builder picks its own colours, and a later page copies hex values out of
another page's CSS. So the look is decided once for the whole app, by
whoever plans the app and sees every page, before any page is built. Page
builders apply it. They never choose a colour.

The platform's own copilot works this way: its planner writes one design
brief with 13 role colours and a font, and every page builder gets the same
brief. Its one failure is the lesson: it pointed the app at a theme id
that did not exist, so every page fell back to the default purple. A look
is only decided when it is stored where the platform reads it, and read back.

And it is only decided when the plan wrote values, not words. A brief that
said "a strong red, a light neutral gray" left the first page builder to pick
all 13 colours, and it picked a cool grey page under pink panels. So `plan
propose` and `spec draft` refuse a new app until its line holds every value
below, and they run the same checks as the script that stores it.

## Decide it

Decide the whole app before any page. Every page's design uses these
answers: its text takes the sizes, its groups take the gaps, and one page
carries the bold thing. A page designed first fixes the app around one page.

Answer these in this order. Each is a choice with a reason, never a default.
Each answer is a label on the App look line, and `plan propose` and `spec
draft` refuse a new app's line with any label missing.

1. **Who opens it, and how often → `use`.** Settle "How far to push it"
   from the `agentic-editing-designer` skill. It sets how far every answer
   below goes:
   - `demo`: seen once, to convince someone. The bold thing can be large,
     and one entrance on first load is allowed.
   - `daily`: opened every day to get work done. Personality lives in type,
     spacing and one accent. Nothing moves on load.
   - `expert`: read under pressure by someone who knows the subject better
     than you. Density and legibility are the design. A flourish that costs
     a row of data is out.
2. **Light or dark, from who uses it and where.** A roaster at a brightly
   lit desk is light. A night-shift control room is dark. Say the reason in
   the line. Do not pick light "to be safe" or dark "to look cool".
3. **A direction from the subject's own world.** Follow the
   `agentic-editing-designer` skill's "Find the direction in the subject":
   list the subject's own materials and objects (kraft paper, jute sacks,
   espresso; a ledger's ruled rows) and take the look from them, not
   from a style name.
4. **What the request already fixes → `brand`.** Brand colours, a logo or
   a font the request names win over every choice below. Write what it
   names, or `none named`.
5. **The 13 colours, by role.** The roles are fixed (the table in
   plugin's `scripts/lib/app-look.mjs`, `SEEDS`): `page-bg`, `surface`,
   `surface-alt`, `primary`, `primary-light`, `primary-dark`,
   `text-primary`, `text-secondary`, `border`, `border-light`, `success`,
   `warning`, `error`.
   - `primary` comes from the direction. Not the reflex blue, purple or
     orange, unless the subject owns it.
   - One accent only. `primary` is for the main action, the selected tab
     and links: about one tenth of what is coloured on a screen.
   - Every grey leans the same way: all warm, all cool, or plain. A soft
     `primary` (a brown, an olive, a slate) may tint the greys a little
     toward itself; a strong one (a bright red, blue or orange) leaves them
     almost plain, or the panels take on its colour. The check refuses greys
     that lean to different colours. Text is never pure `#000000`.
   - Status colours stay green, amber and red, shifted toward the palette's
     warmth or coolness, and dark enough to read as text. `error` is for
     something that went wrong; a value that is simply none (nothing left,
     nothing due) is a quiet state, not an error.
6. **The font.** Write 3 plain words for how the app should feel ("calm,
   exact, warm"). Pick the font that fits them from the 12 the app theme
   offers (`LOOK_FONTS` in the plugin's `scripts/lib/app-look.mjs`): Figtree,
   Geist, Instrument Sans, Lato, Lexend, Manrope, Merriweather, Nunito,
   Poppins, Source Serif 4, Spectral, Special Gothic Expanded One. It must read
   well at small sizes with even-width numbers, so numbers line up in a
   table. `plan propose` and `spec draft` refuse any other font. One family for
   text and headings is fine for a daily tool; a second family is for
   headings only.
7. **Text sizes and weights → `type`, `weights`.** Pick 3 to 6 sizes, smallest
   first, from the sizes the platform's text offers: 10, 11, 12, 13, 14, 15,
   16, 18, 20, 24, 30, 36, 48, 60, 72. Few sizes far apart read as clear
   levels; many sizes a step apart read as fog. So each size is at least
   1.1x the one before, and the largest is at least twice the smallest. The
   body size of a daily or expert tool is 13 or 14; a demo may use 16. Two
   weights are usually the whole answer (400 and 600); a third is for one
   display size. The look loads 400, 500, 600 and 700.
8. **Corner radius → `radius small / medium / large`.** Small for tags,
   checkboxes and chips; medium for buttons and inputs; large for cards,
   panels and dialogs. A bigger part gets a bigger radius, so one radius on
   everything is a default, not a choice. 0 to 24px each; `0px / 0px / 0px`
   is a formal look, and a choice too.
9. **Density.** Compact for dense operational lists, comfortable for forms
   people fill in slowly.
10. **Gaps → `gaps <n> inside / <n> between`.** The gap between the things
    inside one group, and the gap between groups. Between is at least twice
    inside: when the two are close, the groups melt into one block. Take
    both from the spacing scale (4, 8, 12, 16, 24, 32). Start with more space
    than feels right; a compact app takes the smaller steps, not one gap.
11. **How content is held together → `groups`.** Space first. A border or
    a fill only where space alone does not show what belongs together. A
    card only around something a person acts on as one thing, and never a
    card inside a card. Say which: cards, open sections on the page colour,
    ruled lines, or bands of `surface-alt`.
12. **Depth → `depth`.** Flat, borders, or shadows. With shadows, the look
    has three (`--ds-shadow-1` to `-3`), all falling the same way: a higher
    thing casts a bigger one. Not the same grey shadow under every card.
13. **Icons → `icons`.** One icon set, one style (line or filled), one
    stroke, a few set sizes. No emoji as icons. An icon sits next to a word,
    not in its place, unless everyone knows it (search, close).
14. **The one bold thing → `bold`.** The one thing in the app people will
    remember, taken from the direction, and where it lives. Spend the
    boldness there and keep everything around it quiet. How big it gets
    follows `use`.
15. **Motion → `motion`.** One moment that shows what a person's action
    changed (a row saved, a step done), or on a demo one entrance. An expert
    tool may say `none because …`. Every motion stops for a person who asks
    for reduced motion.
16. **What leads → `leads`.** One sentence on what the eye goes to first
    across the app, and what steps back: "production status and stock levels
    lead; settings and admin controls step back".
17. **Check the plan against the defaults → `not`.** Read
    [default-looks.md](default-looks.md). Then picture the same request from
    another company in another trade: if you would have written the same
    line, it is a default. Name the first idea you dropped, and why it is a
    default ("not white cards with a blue button on each because that fits
    any admin app"). Change every part that still reads like it.

The CLI and the script check the contrast of every text colour on its
background, that the greys lean one way, and the numbers of steps 7, 8 and
10, and refuse a line that fails. Never write a contrast number you did not
get from them.

## The App look line

The plan writes the decision once, as one line in the spec's `## Contract`, for a new app or a task about the
app's look. It goes above every page's `job` line, and `plan propose` and
`spec draft` refuse a look line below one. The labels are fixed, because the
CLI reads the values from them. One example, in a subject of its own, shows
the format only:

```
- app look · Roast House: kraft paper, jute sacks, espresso · light because roasters work at a bright bench ·
  use daily because the roasting team opens it every shift ·
  primary #3D271D / #6A4A3A / #241610 · page #F8F6F0 · surface #FFFDF9 / #F2EFE8 ·
  text #1E1B18 / #686058 · borders #E4DFD5 / #EFECE5 · status #2D6A4F / #8F5200 / #9A2A2A ·
  font Manrope (calm, exact, warm) · type 12 / 14 / 18 / 30 / 48 · weights 400 / 600 ·
  radius 4px / 8px / 12px · compact · gaps 8 inside / 24 between ·
  groups open sections on the page colour, ruled by hairline borders · depth flat, borders only ·
  icons one line set, 1.5px stroke, 16 and 20px · bold today's roast curve, one large line across the top of the dashboard ·
  motion none because it is a daily tool · brand none named ·
  not white cards with a blue button on each because that fits any admin app ·
  leads production status and stock; steps back admin controls
```

(One line in the file; it wraps here to fit.) The colour values, in order:
`primary` main / hover / pressed, `page`, `surface` / `surface-alt`, `text`
main / secondary, `borders` normal / light, `status` success / warning /
error. `font` is one font from step 6's list. `type` and `weights` go smallest
first, `radius` small / medium / large. A new app that should keep the
tenant's theme, or a MOBILE app (it runs no header code), writes `- app look
· <app>: none because <reason>`.

A page's own line is its job, never a look: what it is for, not how it looks
(`job · <page>:`, in the `plan` skill's spec template and short spec
template). The page's layout follows the job, and its colours follow this line.

## Store it

The app's `app` task stores the look: for a new app, the task that creates
the app before any page is built; for an existing app, an `app` task about its
look. No other task writes it.

Your message carries the line as `App look:`; store exactly that. Where it
goes turns on one fact: whether ToolSearch finds `set_app_theme`.

- **It does: the theme path.** The look becomes the app's own theme
  ([app-theme](../../app-theme/SKILL.md)), and the app header holds no look
  block.
- **It does not, or a theme write is refused for this app** (a code-builder
  app, or one that picks its theme by a condition): **the header path.** The
  look goes in a block in the app header.

1. Read what the app header and footer hold now, which turns on whether the
   app is new:
   - **A new app** (this task just created it): there is nothing to read. The
     cache answers `miss` and saves no file, and the new app's header and
     footer are empty, so leave `--app-file` out of step 2.
   - **An existing app whose look changes:** `entity context app <appId>
     --save --json`, then `properties.customCode` in the saved file, which
     step 2 takes as `--app-file`. Never leave it out here: without it the
     header path sends a header holding only the look block, and the theme
     path cannot see an old look block to take out. When the cache answers
     `stale` or `miss`, run `cache app <appId> --refresh`, which re-reads
     that one app into the cache, and ask again.
2. Write the App look line, as your message gives it, to `look.txt` in your
   work folder (in a direct build, `.sessions/<sessionId>/drafts/`) with the
   Write tool. Never put the line on a command line: a
   code span or `$(…)` in it would run in the shell. Then build the
   arguments from that file with
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-craft/scripts/app-look-args.mjs"`:
   - theme path: `theme --look-file <work folder>/look.txt --app-id <appId> [--app-file <saved app file>] --out-dir <work folder>`;
   - header path: `header --look-file <work folder>/look.txt --app-id <appId> [--app-file <saved app file>] --out <work folder>/look-args.json`.

   `--app-file` is the file step 1 saved for an existing app, and is left out
   for a new one.

   It prints each contrast number. It refuses the line for anything `plan
   propose` and `spec draft` refuse it for, in their words. The plan's line
   already passed those checks, so a refusal here means the line was copied
   wrong.
3. Send it.
   - Theme path: the calls the script printed, in that order, each as
     `{host, argsFile}`: `set_app_theme`, `set_theme_typography`, and
     `update_app_settings` only when it wrote `header-args.json`, which takes
     an old look block out of the header.
   - Header path: `update_app_settings {host, argsFile: "<work folder>/look-args.json"}`.
     The file keeps everything else the header held, replaces only an
     earlier look block, and sends the footer back unchanged.
4. Read it back.
   - Theme path: `get_app_theme {host, appId, includeCssVars: true}`, against
     the list the script printed.
   - Header path: the reply reads `properties.customCode.header` back. Check
     it starts with `<!-- UnifyApps Headless app look -->`.

   Put the App look line, and the path you took, in the report's `notes`.

On the theme path the theme holds the whole look. It has the 10 colour
seeds, the nearest radius preset and the font. It also has raw tokens: the
look's own backgrounds, borders, secondary text and darker brand shades, and
the `--ds-*` names for custom CSS. Left to the theme, those colours would grow
into other colours. A `--ds-*` colour, font or radius points at the theme's own token, so a
change in the theme manager reaches custom CSS too.

On the header path the block holds two things. The seeds are `--ds-*`
variables, plus the line's sizes, weights, gaps, three radius sizes and three shadows for custom
CSS. A fixed mapping then points the platform theme's own variables at them:
12 brand shades, 12 grey shades, the backgrounds, the borders, both font
families, the brand tints (a selected row, the focus ring) and every radius
step. Every block reads its colours, fonts and corners from those variables,
so a button, an input, a tab or a table that nobody styled follows the look
too.

## Apply it on every page

- Your message's `App look:` line is the look. Never choose another. On a
  theme tenant it is stored in the app's theme and the header holds no
  colours, so to check it read `get_app_theme`. Elsewhere it is the look
  block in the app header (`entity context app <appId>`).
- A block's own colour property stays a theme token (`brand`, `primary`,
  `text-secondary`). The theme, or the header's mapping, already turns those
  into the app's colours.
- Custom CSS never holds a raw colour, size or shadow. The same `--ds-*` names
  work on both paths. Use `var(--ds-primary)`,
  `var(--ds-surface)`, `var(--ds-radius-small)` to `-large`,
  `var(--ds-text-size-1)` and up, `var(--ds-gap-inside)`,
  `var(--ds-gap-between)`, `var(--ds-shadow-1)` to `-3`, and `color-mix(in
  srgb, var(--ds-primary) 12%, var(--ds-surface))` for a tint.
- No font CSS on a block: the theme, or the header's mapping, sets the font
  for every block.
- **Text.** Every text block takes a size from `type` and a weight from
  `weights`, set from its size and weight lists. No other size. The largest
  size is for the bold thing or a page's one big number, never for every
  heading.
- **Gaps.** Inside a group, a Stack's gap is the `inside` value; between
  groups it is the `between` value. Use the gap token nearest each value.
- **Groups and depth.** Group the page the way `groups` says. With `depth`
  flat or borders, no block carries a shadow; a Card's default style has one,
  so set it to none. With shadows, use only the look's three.
- **Corners.** Blocks follow the look's radius; set no radius by hand.
- **Icons.** Every icon from the set `icons` names, in its style and sizes.
- **Status.** A status shows its colour plus an icon or its word, never
  colour alone. A chart's series take the brand and grey shades, never the
  status colours, so a category never reads as good or bad.
- **Motion.** Only the moment `motion` names, written inside
  `@media (prefers-reduced-motion: no-preference) { … }`.
- **The bold thing.** The page that holds it builds it fully, in custom CSS
  where the panel has no word for it. Every other page stays quiet.
- Spend the page's effort on its job: the region that answers the job's
  first question leads, and every state the job names is built. Colour is
  already done.

## What it does not cover yet

- **Light only.** It was tested for the light scheme on a test tenant on
  2026-10-04, in the builder and the preview. A dark look is untested on
  both paths; say so in the report. The three radius sizes and the brand
  tints were checked there on 2026-10-05: a button, an input and a tab took
  the medium size, the brand tint took the app colour, and the builder's own
  rail kept its look.
- **The nearest of four radius presets, on a theme tenant.** The theme
  offers four presets (`RADIUS_PRESETS`), so a 4px / 8px / 12px look renders
  6px / 8px / 8px, and `--ds-radius-small` to `-large` follow the preset.
- **Web only.** A MOBILE app runs no app header code (`app-native`).
- **On the header path, only the 600 shade of each status colour.** The
  pale status tints (a red chip's background) stay the theme's own. On the
  theme path each status colour grows its pale tints too. There a status
  shows the theme's 600 shade, one step darker than the line's colour.
- **Text sizes are not remapped.** Tables, inputs and badges read the same
  size variables as text blocks, so changing them would resize every part.
  The look picks from the platform's sizes, and builders keep to them.
- **The focus ring is faint.** The platform draws it at 30% of the brand
  colour. The look makes it the app's colour, but at 30% it stays below the
  3:1 contrast a focus ring should have on any palette. Only a platform
  change fixes that.
- **Theme tools depend on the tenant.** The `app-theme` skill builds a real
  theme only where its tools are listed. Never set the app's theme to an id
  you have not read from the tenant.
