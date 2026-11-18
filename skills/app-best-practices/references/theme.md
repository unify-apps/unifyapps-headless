# Theme, styles and branding

Tokens over hard-coded values; the client's brand.

56 rules: P0 1, P1 4, P2 28, P3 23.

## P0

- Never put an underscore token name in a Tailwind arbitrary class (bg-[var(--x_y)]); it breaks the app's whole stylesheet. (web only)

## P1

- Don't pick text-white from the colour picker for typography.
- Fix style values stored as character-indexed objects like `{"0":"b","1":"g"}`.
- Store the theme font as one bare family name and pick only weights it ships; native matches by exact name, else draws the system font. (mobile only)
- Point the app at a theme id that exists on the tenant; a missing theme falls back to the default purple.

## P2

- Remove hardcoded 'text-white' color usage from block.
- Flag a task's `App look:` line whose look is not stored in the theme or app header.
- Flag text sizes or weights off the App look's `type`/`weights`, and shadows when `depth` is flat.
- Take colours from tokens, not inline hex; in custom CSS use `var(--ds-*)` when the app has a look.
- Replace one-sided coloured stripes wider than 1px and gradient text (`background-clip: text`).
- Remove hover lift or pointer effects from blocks with no click wired.
- Pull values from `get_style_options`, `get_color_tokens` and `get_icon_options`, not memory.
- Flag a page using only body text where `composition.md` calls for a section heading.
- Flag typography, accent colour or repeated controls that differ from a sibling page's without reason.
- Flag a complete screen with no look in notes, or a named look the config doesn't show.
- Fill all three app logo slots, favicon, small and large, with the client's assets.
- Keep the accent (primary) for the main action, the selection and links, about a tenth of coloured area; headings and borders stay neutral.
- Give different statuses different colours; two statuses in the same grey cannot be told apart at a glance.
- Colour status by urgency: red means act now, amber look soon, green or grey fine.
- Set the app font through the theme font families, never font-family on blocks; that misses text inside composite blocks. (web only)
- Show a value that is simply none or zero (nothing due) as a quiet state, not in the error colour.
- Use 3 to 6 text sizes, each at least 1.1x the one before, with the largest at least twice the smallest.
- Set a Card's default shadow to none when the look's depth is flat or borders.
- Use colour ids, not hex, in component styles on a dark-mode theme, or add a dark rule for each; a hex stays the same in dark. (web only)
- Remove an old look block from the app header once the app has its own theme; it covers the theme. (web only)
- Use a token, never a hex, for any native colour that changes between light and dark mode. (mobile only)
- Use a Button color, size or variant the app theme declares; an undeclared name renders unpadded with unset colour tokens.
- Wrap raw lengths in style keys as {custom:"22px"}; a bare "22px" or "320px" is read as a class name and does nothing.
- Change the theme through the app theme (seeds, typography, component styles), never per-page edits or hex in block styles.
- Set an app-wide font through the --fontFamily-* variables, not font-family on blocks. (web only)
- Edit the theme entity, not theme.cssVars, on an app that has a defaultThemeId; inline cssVars are dormant there.
- Use a style key's listed class or a real CSS value; an invented class id is dropped by the browser silently.
- Store borders as borderWidth, borderStyle and borderColor; borderStroke is never stored, and colour alone draws nothing.

## P3

- Remove hardcoded hex color values in custom CSS.
- Set client-specific logos instead of default brand assets.
- Remove `backgroundSize` / `backgroundRepeat` from a block with no `backgroundImage`.
- Set the symbol and the favicon as well as the logo. (web only)
- Choose the brand colour from the subject; not the stock theme purple or a reflex purple-to-blue gradient nobody asked for.
- Don't put the same soft grey shadow under every card; shadows grow with height, or there are none.
- Never use pure #000000 for text.
- No identical fade-and-slide entrance on every section. (web only)
- Colour tags only for states a person acts on; show a plain category as a neutral tag.
- Make every grey token lean the same way: all warm, all cool or plain.
- Set body text to 13 or 14 px in a daily or expert tool; 16 only on a demo.
- Use two font weights (400 and 600), adding a third only for one display size.
- Keep the largest text size for the one bold thing or a page's one big number, not for every heading.
- Leave corners to the look's three radii, small for tags, medium for buttons, large for cards; set no radius by hand.
- Use one icon set across the app, in one style, one stroke and a few set sizes.
- Animate nothing on page load in a daily or expert tool; a demo may have one entrance.
- Make theme hover, pressed and disabled states change colour only, never size or layout. (web only)
- Keep one header, one way to show a state and one place for the main action across the app's pages.
- Set a mobile app's whole-screen background in Theme Colors Background, not on a full-page Stack. (mobile only)
- Store a conditional border colour as borderColor {all: condition}, never as a condition object at the key's root.
- Leave a BottomSheet cornerRadius unset unless the design needs its own; a stored value stops following --bottomsheet-radius.
- Set CodeEditor appearance.theme to dark in a dark app; inherit renders the light editor.
- Set a custom font through customStyles.fontFamily or the theme, never a font name in appearance.fontFamily.
