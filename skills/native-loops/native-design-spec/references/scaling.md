# Why 24 becomes 20 and 72 becomes 64

Every value in a spec comes from one module, `scripts/lib/scale.mjs`, and the golden pairs below are its tests in the plugin repository. The rule is the one an accepted Home-page visual check settled on an earlier rebuild: Figma canvas 440 pt, iPhone 16 Pro 402 pt, factor 402/440 = 0.9136. A source drawn at the device's own width (an HTML prototype in a 402 pt window, a simulator screenshot) scales by 1 and rounds to whole points instead.

## The rule

| What | Rounding | Function |
| --- | --- | --- |
| Element sizes, radii, icon boxes | × factor, to the nearest multiple of 4; within 0.1 of an exact middle → the upper multiple | `scaleSize` |
| Paddings, gaps, insets, shadow blur | × factor, to the nearest multiple of 4; within 0.1 of an exact middle → the lower multiple | `scaleSpacing` |
| Anything that scales below 7 pt | whole points | both, through `smallBelow` |
| Font sizes, line heights, shadow offsets, blur radii, border widths | whole points, half up | `scaleFont` |
| Letter-spacing | stays in em; px ÷ Figma font size; unknown → −0.02em on copy, +0.02em on uppercase | `letterSpacingEm` |
| A vertical gap or inset next to text | × factor, minus each text neighbour's cap correction, then as spacing | `scaleTextGap` |

So 24 × 0.9136 = 21.93 sits 0.07 from the middle 22: a padding of 24 becomes 20 and an icon of 24 stays 24. 72 × 0.9136 = 65.8, nearer 64 than 68.

## Golden table (Figma → app)

| Kind | Pairs |
| --- | --- |
| Sizes | 46→44, 56→52, 88→80, 72→64, 40→36, 32→28, 148→136, 256→232, 298→272, 24 (icon)→24, 28→24, 44→40, 48→44, 76→68, 146→132, 331→304, 89→80, 34→32, 43→40, 25→24, 61→56, 14→12, 108→100 |
| Spacing | 24→20, 12→12, 8→8, 4→4, 6→5, 19→16, 16→16, 20→20, 32→28, 10→8, 122→112, 120→108, 1→1 |
| Fonts | 16→15, 14→13, 12→11, 18→16, 22→20, 24→22, 26→24, 8→7 |
| Line heights | 22→20, 28→26, 32→29, 20→18, 18→16, 16→15, 24→22 |

## Text gaps

Figma measures a gap from the cap height of a trimmed text line (`leading-trim: both; text-edge: cap`); the phone lays text out at its full line box. A gap next to text therefore loses half of that line's extra leading, per text neighbour, before rounding. The corrections that spec settled per app font/line height, which win over the formula `(lineHeight − 0.7 × fontSize) / 2`:

| App line | 11/15 | 13/16 | 13/18 | 15/20 | 16/22 | 20/26 | 22/29 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Correction | 3.5 | 3.5 | 4.5 | 4.75 | 5.25 | 6 | 6.5 |

| Gap (Figma) | Neighbours | Result |
| --- | --- | --- |
| Ask anything → QUICK ACTIONS 40 | a 56-high field box ↔ 13/18 text | 36.5 − 4.5 → 32 |
| Heading → tiles 24 | 13/18 text ↔ a row | 21.9 − 4.5 → 16 |
| Icon → label 12 | an icon ↔ 13/16 text | 11.0 − 3.5 = 7.5 → 8 |
| Status → title 12 | 11/15 ↔ 16/22 | 11.0 − 3.5 − 5.25 = 2.2 → 2 |
| Eyebrow → title 24 | 13/18 ↔ 22/29 | 21.9 − 4.5 − 6.5 = 10.9 → 12 |
| Title → button 24 | 22/29 ↔ a button | 21.9 − 6.5 → 16 |
| Between sections 40 | cards ↔ a 20/26 title | 36.5 − 6 → 32 |
| Sheet top padding 32 | the sheet edge ↔ 20/26 | 29.2 − 6 → 24 |
| Service title → subtitle 12 | 15/20 ↔ 13/16 | 11.0 − 4.75 − 3.5 = 2.7 → 3 |
| Divider → detail line 16 | a line ↔ 13/16 | 14.6 − 3.5 → 12 |
| Event title → location 20 | 16/22 ↔ an icon row | 18.3 − 5.25 → 12 |

Only a text node loses its correction. The Ask field, a row of icon and text, a card and a divider keep their box edge: subtracting both text corrections on "Ask → QUICK ACTIONS" would give 28, which the spec rejects.

## Exceptions the tests pin

- **Day → month 12 → 2.** The rule gives 11.0 − 6 − 3.5 = 1.46 → 1. No reading of the rule gives 2; the script emits 1 and the visual check sees a 1 pt difference inside its tolerance.
- **Upcoming card 88 → 84.** The rule gives 80; the spec derived 84 as padding 16 + ring 52 + padding 16. Content-driven heights are left to the visual check.
- **Status row → title 12 → 2.** In a real frame the status line is a row of icon and text; the script corrects only text nodes, so it gives 6 here where the spec wrote 2 by treating the row as its text line.

`capCorrection` also accepts the Figma trimmed line height, which gives the cap height from the design when the table has no entry for a pair.
