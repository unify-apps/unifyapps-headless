# Theme patterns from hand-built themes

These patterns come from themes that people built by hand in the theme
manager, with many overrides. Use them when the direction needs more than
tokens.

## Tokens first, components second

- Set the brand palette and the radius preset first.
- When the brand has its own text, border and background colours, set them
  as tokens (`cssVars`), not as component rules.
- Put the type scale in tokens too: font size and line height per text
  variant. Use a component rule only for weight or letter spacing.
- Then point every component style at a token or a colour id. A later theme
  change then reaches every component.

## Buttons as a grid

- Pick the two to four colours the brand uses, and the variants it uses.
- Write one rule per colour and variant pair. Name both in `variants`.
- On a theme with dark mode, write the matching dark rule for each pair.

## States change colour, not layout

- Hover, pressed and disabled change only the background, border or text
  colour.
- Focus is an outline with a small offset, usually 2px.
- Loading keeps the base look.
- Inputs use focus, error, read-only and disabled on the border colour.

## Few radius choices

- Fields and checkboxes: a small radius.
- Buttons, toggles and tags: full (pill) or the same small radius. Pick one
  and use it everywhere.

## Sizes

- Set height, side padding, gap and icon size for each size.
- Use plain px values. A preset id like `px-lg` compiles, but the theme
  manager shows it as a custom value.
- Send a shadow as a full CSS value, not a preset id like `shadow-xl`.

## When to use custom CSS

Use the component's `customCSS`, or `set_theme_custom_css`, only for what a
rule cannot reach:

- inner parts of a component that the schema lists no target for
- hover effects that need `:has()` or `::before`
- right-to-left or language-specific font swaps
- `prefers-reduced-motion` and `forced-colors` media queries

Keep each rule under the component's class. Avoid `!important` unless the
base rule uses it. `set_theme_custom_css` replaces the whole stylesheet, so
read the current one first and send it back with your change.

## Not possible yet

- Turning a variant option off (for example a size the design never uses).
- Adding a new variant option or group.

Say so in `notes` when the direction needs one of these.
