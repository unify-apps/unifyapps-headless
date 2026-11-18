# The recipe

One JSON file says which parts of the logo each file uses and how they change on a dark
background. Group numbers and ink colours come from `inspect`.

```json
{
  "logo": "logo.png",
  "icon": [{ "group": 1 }],
  "splash": [{ "group": 1, "dy": -52 }, { "group": 2 }, { "group": 4, "dy": -99 }],
  "dark": [{ "from": "#010101", "to": "#FFFFFF" }],
  "tinted": [{ "from": "#D03934", "to": "#FFFFFF" }],
  "notification": { "knockout": ["#D03934"] },
  "notificationColor": "#D03934",
  "colours": { "splashDarkBackground": "#000000" }
}
```

| Key | What it says |
|---|---|
| `logo` | The logo file, relative to the recipe. |
| `background` | Only when `inspect` read the background wrong: `#RRGGBB` or `transparent`. |
| `icon`, `splash` | The parts each uses, in source pixels: `{"group": n}` from `inspect`, or `{"box": [x, y, w, h]}` for part of a group. `dx`, `dy` move a part. |
| `dark` | Inks swapped on the dark icon and dark splash. Each `from` is an ink `inspect` listed. |
| `tinted` | Inks swapped on the dark icon before it turns greyscale for the iOS tinted icon. |
| `notification` | `{"knockout": [...]}` turns those inks clear in the white notification icon; `false` makes none. |
| `notificationColor` | The colour Android tints the notification icon with. Leave it out to keep the platform's. |
| `colours` | Any of `iosBackground` (behind the opaque iOS light icon), `androidBackground`, `splashBackground`, `splashDarkBackground`. Unset ones are white for light and black for dark. The iOS dark and tinted icons are transparent and take no colour. |

## Picking the parts

- **Icons carry the symbol only**, never the name: text is unreadable at launcher size. When
  the person points at part of the logo ("this much"), that part is the icon.
- **The splash carries what the person asked**, and by default the symbol with the name beside
  or under it, as the logo lays them out.
- **Dropping a line** (a word the person does not want) leaves a hole: close it. Move the line
  under it up, so it sits under the line above with the gap it had before, keeping the logo's own
  spacing. From `inspect` boxes `[x, y, w, h]`, with line A above the dropped line D and line B
  under it, B's `dy` is `A.y + A.h + (B.y - (D.y + D.h)) - B.y`. Lines further down move by the
  same `dy`.
- **Recentre a symbol beside text.** When the symbol sat beside the full text block, centre it on
  the shorter one: its `dy` is the text block's middle minus the symbol's middle, both after the
  moves above.
- Never redraw or retype lettering: the parts are lifted from the logo as they are.

## Dark and tinted inks

- **Dark:** swap every ink that barely shows on the dark background, usually black or a dark navy
  text colour, to white. Keep brand colours as they are. `make` warns about an ink that still
  barely shows.
- **Tinted:** iOS keeps only lightness, so make the one accent the symbol is known by white, so it
  still stands out, and leave the rest.
- **Notification:** Android draws it in one colour. When every piece turns white, the symbol can
  lose the detail it is known by; knock out the accent ink so it shows as a gap.

## Colours

Backgrounds default to white for light and black for dark. Use the person's brand colours when
they give them, and otherwise the defaults; say which you used. The notification colour is the
symbol's accent ink unless the person names one.
