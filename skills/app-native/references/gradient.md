# A background gradient on native — `linearGradient` in a Stack's Style JSON

The `native/blocks/stack` sheet has the builder's own example and the clash
with `keyboardConfig`; read it first. This file explains the fields.

```json
{"linearGradient":{"colors":["#6D28D9","#2563EB"],"locations":[0,1],"start":{"x":0,"y":0},"end":{"x":0,"y":1}}}
```

- `colors` — two or more hex or named colours; one colour is an error.
- `locations` — optional, one per colour, 0 to 1 ascending; left out, the colours spread evenly.
- `start` / `end` — `{x, y}` fractions of the box, 0 to 1. Top to bottom is
  `{0,0}→{0,1}`, left to right `{0,0}→{1,0}`, diagonal `{0,0}→{1,1}`. There is
  no `angle` or `direction` key.

**Write it as JSON text in `additional.customCSS`, on a Stack**, the way
`native.md` rule 18 says. The tool fills `appearance.customStyles` from that
text; never write `appearance.customStyles` yourself. A Container reads no
Style JSON. Then `get_blocks` and read `appearance.customStyles` back: an empty
`{}` means no gradient. The warning that the text is not valid CSS is expected
on a mobile app.

**What it paints.** The gradient fills the Stack under its children, with the
Stack's corner radius. Keep the Stack's `backgroundColor` so a failed gradient
still shows a colour. Two clashes: `linearGradient` with `blurConfig` on one
Stack turns the gradient into a blur mask and paints no colour, and with
`keyboardConfig` it drops the keyboard avoidance. Put the gradient on the page
Stack and `keyboardConfig` on the Scrollable that scrolls the inputs, or on a
child Stack above them when nothing scrolls them.

The builder canvas also draws the gradient, so a canvas screenshot is not
device proof. The default proof is the read-back of `appearance.customStyles`.
