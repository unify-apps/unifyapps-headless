---
user-invocable: false
name: app-theme
description: Only for the app-agent builder agent. Stores the plan's app look as the theme of a UnifyApps app through the application-builder theme tools, from files a script writes, then adds component styles and theme-wide CSS and reads the theme back. Use for an app task before its first page is built, for the first layout in an older plan, and for any task that changes how a whole app looks.
---

# Building an app theme

The theme is the look every page shares. Pages built on a good theme look good
without per-block styling. Pages that hard-code colours do not follow a later
theme change. So the theme comes first, and pages use its tokens.

Every tool here is on the `application-builder` MCP server and takes `host`
and `appId`. Every write takes `dryRun`. A tenant that does not list these
tools stores the look in the app header instead
([app-look.md](../app-craft/references/app-look.md) § Store it): say so in
`notes`.

| Tool | What it does |
|---|---|
| `get_app_theme` | Reads the app's theme: colour seeds, light and dark tokens, fonts, type scale, radius, styled components. With no `appId`, reads the tenant default. |
| `get_theme_options` | The menus: built-in fonts, radius presets, component ids, colour seeds. |
| `set_app_theme` | Colours, colour scheme, radius, and raw tokens. |
| `set_theme_typography` | Text font, code font, base font size. |
| `get_theme_component_schema` | One component's targets, variants, states and allowed styles. |
| `set_theme_component_style` | Styles for one component. Web apps only. |
| `set_theme_custom_css` | CSS for the whole app. |

## When this runs

- **A new app.** Its `app` task creates the app and stores the app look as
  its theme before any page starts. Every page layout waits on that task.
  In an older plan without an app task, the first layout does this before
  its page.
- **An existing app.** Only when the task asks to change the app's look. Never
  restyle an app as a side effect of a page task.

## Which theme is written

The tools write only a theme the app owns. The first write copies the theme the
app renders with today, marks the copy as the app's own, and points the app at
it. Later writes change that copy. A standard or shared theme is never written.

- An app that picks its theme by a condition is refused. Store its look in
  the header instead (§ When a write fails).
- A person can link a second app to an owned theme in the builder. A write then
  changes both apps. The tools cannot see this, so say in `notes` that the
  theme changed, with its id.

## The order of work

The plan already decided the look: the `App look:` line in your message. Choose
nothing here. A colour, font or radius you pick yourself is a second look.

1. **Write the arguments.** Write the App look line to `look.txt` in your work
   folder, as [app-look.md](../app-craft/references/app-look.md) § Store it
   says. For an existing app whose look changes, also save the app with
   `entity context app <appId> --save --json`; a new app has nothing to save
   (the cache answers `miss`), so leave `--app-file` out. Then run
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-craft/scripts/app-look-args.mjs" theme --look-file <work folder>/look.txt --app-id <appId> [--app-file <saved app file>] --out-dir <work folder>`.
   It prints each contrast number, the calls in order and what to read back.
2. **Colours, scheme, radius and tokens.**
   `set_app_theme {host, argsFile: "<work folder>/theme-args.json"}`. The file
   holds all ten colour seeds, so nothing of the old theme stays.
3. **Font.** `set_theme_typography {host, argsFile: "<work folder>/typography-args.json"}`.
4. **The old header look.** Only when the script wrote `header-args.json`:
   `update_app_settings {host, argsFile: "<work folder>/header-args.json"}`. It
   takes the old look block out of the app header, which would cover the theme.
5. **Check.** `get_app_theme {host, appId, includeCssVars: true}`. Compare it
   with the list the script printed: the scheme, radius, font, every colour
   seed and every raw token.
6. **Component styles (web only).** Only when the look line needs more than
   tokens give, such as a button shape or an input border. First
   `get_theme_component_schema`, then `set_theme_component_style`.
   - A colour is a colour id from `get_style_options`, such as
     `bg-brand-dark`. The theme manager shows an id. It cannot show another
     `var()`, and the tool warns when you send one.
   - Leave a variant out to style every option of it.
   - Some options are not CSS, such as the snackbar position or the date
     picker's icons. The schema lists them under `settings`. Send them as
     `settings`, using only the values it lists.
   - On a theme with dark mode, every rule applies in dark mode too, unless a
     dark rule replaces it. A hex there stays the same in the dark, so add a
     dark rule or use a colour id, which follows the scheme.
   - A dark rule changes contrast too. Check text on its new background at
     4.5:1, the same as in light.
   - For proven ways to style buttons, states, sizes and radius, read
     [references/theme-patterns.md](references/theme-patterns.md).
7. **Theme-wide CSS.** `set_theme_custom_css` only for what no token or
   component style covers. Keep it short. It replaces the whole stylesheet,
   so read the current one first and send it back with your change.

Put the theme id in `ids`, and the App look line in `notes`.

## Pages use tokens

On every page, colours come from the theme's tokens and colour options, never
from a hex value. A block that needs another shade uses a palette step, such
as `brand-700`. This keeps one fact in one place: change the theme and every
page follows.

## Native (MOBILE) apps

A native app reads only tokens from its theme.

- `set_theme_component_style` is refused. Use tokens instead.
- A raw token value must be a hex colour, a `var()` reference, or a size in
  rem, em or px. Other values are refused.
- Custom CSS is accepted, but a native app does not render it. Do not rely on
  it.

## When a write fails

A refusal names every bad field and writes nothing. Fix exactly what it names.
Some apps cannot take a theme: a code-builder app, or one that picks its
theme by a condition. A theme write for one is refused. Store its look with
the script's `header` command instead
([app-look.md](../app-craft/references/app-look.md) § Store it). Say so in
`notes`.
A create that worked but could not link the app says so, with the new theme's
id. Report that id in `notes` and the task `failed`. Do not run the create
again: each run makes one more copy.
