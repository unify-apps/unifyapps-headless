# Scenes

The kit's own scenes. Four are taken as they are in any story: `title`,
`end`, `screen` (a product screen used the way a person uses it) and the
`ua-` UnifyApps standard diagrams. The rest (statement, quote, hub, stats,
before-after, flow, platform, timeline, points, cta) are worked examples of
a scene: read their files in `scripts/runtime/scenes/` to see how a scene is
drawn and moved, then write the story's own
([writing a scene](scene-authoring.md)). A story with design notes may not
use them as they stand. A story made before design notes keeps them.

## Contents

- [Every scene](#every-scene)
- [Opening and closing](#opening-and-closing): title, statement, quote, end
- [Their world](#their-world): hub, stats, before-after
- [The solution](#the-solution): flow, platform, screen, timeline
- [Points and the ask](#points-and-the-ask): points, cta
- [The UnifyApps standard diagrams](#the-unifyapps-standard-diagrams): ua-eighty, ua-code-first, ua-n-plus-n, ua-assembly, ua-platform, ua-four-ideas, ua-engagement, ua-principles, ua-close
- [Choosing scenes for a story](#choosing-scenes-for-a-story)

## Every scene

Every scene takes `kicker` (a small gold label), `title` and `em` (the
headline and its gold italic clause), and `footnote` (a small line at the
bottom left: the source, or "Illustrative figures"). The heading enters with
the scene; a scene's builds (`steps`) come in on its lines. `mark` moves the
logo's animated mark: `{ "x", "y", "s", "a", "spin" }`, where `x` and `y`
are its centre in pixels of the 1920 x 1080 frame, `s` its size in pixels
(about its radius), `a` its opacity from 0 to 1, and `spin` 1 to turn it
slowly or 0 to hold it still, as on the title and end cards.

Keep words short. A heading fits on one line at 66 px (about 45 characters);
an item title fits a column (about 24 characters in five columns, 40 in
three). The layout check tells you when it does not.

## Opening and closing

**title**: the first card. Builds: 0.
`{ "kicker", "title", "em", "sub" }`. The wordmark sits top left and the
logo's mark grows on the right. One line.

`open` gives the card another way in:

- `"question"`: `title` and `em` are typed out key by key as one
  question, and one to three figures count in under it, one build each.
  `{ "open": "question", "title", "em", "items", "footnote" }`, with
  `items` shaped as a stats scene's, and like a stats scene it needs a
  `footnote` naming their source. The first line asks the question; the
  figures land on the lines after it, so nothing counts while it types.
  Builds: one per figure.
- `"product"`: the product's first screen tilts in beside the title. On
  the build, the cursor glides to `click` (a point in the screenshot's own
  pixels, as in a screen scene) and clicks, and `flag` comes up beside it,
  a dark card naming what needs a person. `{ "open": "product", "kicker",
  "title", "em", "sub", "image", "url", "click", "flag": { "kicker",
  "text" } }`. Builds: 1 with `click` or `flag`, else 0.

**statement**: one sentence, large. Builds: 1 when it has `sub`, else 0.
`{ "kicker", "text", "em", "sub" }`. Use it for the turn ("What if…"), on
the `deep` ground.

**quote**: the customer's words. Builds: 0. `{ "quote", "who" }`. `who` is a
role and where it was said ("Head of AP · discovery call"), never a
person's name. Only a sentence they said, as they said it.

**end**: the end card. Builds: 0. `{ "title", "em", "sub" }`. The logo's
mark grows in the middle, the wordmark under it. No line, or one closing
line.

## Their world

**hub**: their systems around one centre. Builds: 2 (the systems appear, then
the wires). `{ "systems": ["SAP", { "name": "Coupa", "sub": "procurement" }], "mode": "connect" | "tangle", "center": { "title", "sub" } }`.
Up to 12 systems. `tangle` draws today's point-to-point wiring in coral with
no centre; `connect` wires each system to UnifyApps in the centre, with data
moving. Use `tangle` for their world today and `connect` later, for how
UnifyApps fits, with other scenes between them.

**stats**: one to four figures that count up. Builds: one per item.
`{ "items": [{ "value": 1000, "prefix": "$", "suffix": "+", "unit": "min", "decimals": 0, "from": 0, "label", "sub" }], "footnote" }`.
`value` is a number to count to; a figure that is not a number goes in `text`
(`{ "text": "2 weeks", "label" }`). Every figure needs a fact; the footnote is
required and names the source.

**before-after**: Today beside With UnifyApps, row by row. Builds: one per
row. `{ "rows": [{ "before", "after" }], "beforeLabel": "Today", "afterLabel": "With UnifyApps" }`.
Up to 5 rows, each side a short phrase.

## The solution

**flow**: a process left to right. Builds: one per node.
`{ "nodes": [{ "title", "sub", "tag" }], "token": "INV-4821" }`. Three to six
nodes. Each build lights the next node and draws the line to it; `token` (a
document, a request, a ticket) rides to the node just lit.

**platform**: layers top to bottom. Builds: one per layer.
`{ "layers": [{ "name", "items": [], "accent": true }] }`. Up to 5. `accent`
fills the layer the story is about. Name UnifyApps' parts only as
[writing](writing.md) gives them.

**screen**: a product screen in a browser frame, used the way a person
uses it. Builds: one per shot.
`{ "image": "assets/queue@2x.png", "url": "the address bar's text", "frame": "browser" | "plain", "shots": [ { "label" }, { "label", "click": [x, y], "image": "assets/detail@2x.png", "zoom": [x, y, w, h] }, { "type": { "at": [x, y], "text", "size": 14 } }, { "callout": { "x", "y", "text" } } ] }`.
Every point and rectangle is in the screenshot's 1x pixels (a 1440 x 900
layout), read off the image. `click` glides the cursor there on a human
path and clicks; with `image`, the next screenshot answers the click. `type`
writes text key by key at a point (the top left of the text in an empty
field), at `size` pixels. `zoom` moves the camera to a rectangle; `callout`
points at a spot with a short line. `label` says in words what the shot
shows, so the line that names it times it. Take each state the clicks lead
to as its own screenshot, at `--scale 2` (`<name>@2x.png`), so zooms stay
sharp. The first shot is usually the whole screen.

**timeline**: milestones on one axis. Builds: one per milestone.
`{ "items": [{ "at": 1, "title", "text", "when": "Week 1" }], "unit": "Week", "counter": true, "min": 0, "max": 8 }`.
Up to 6. `counter` counts the unit up in the corner. A plan is a proposal:
its footnote says so, and its weeks are `plan` facts.

## Points and the ask

**points**: two to five points, no cards. Builds: one per point.
`{ "items": [{ "label", "title", "text" }], "layout": "columns" | "rows" }`.
Columns side by side (default); `rows` one under another for longer lines.
`label` replaces the 01, 02 numbering.

**cta**: the next steps. Builds: one per step. `{ "items": [{ "title", "text" }], "contact" }`.
Two to four steps along one path; `contact` is a closing line under them.

## The UnifyApps standard diagrams

The company's standard presentation as ten scenes with fixed content, added
with `"data": {}`: the 80/20, the code-first stack, the N+N problem, the
assembly-first architecture, the one platform and its Enterprise Context
Graph, the four ideas, the engagement model, the three principles, the
credentials and the close. What each shows, its builds and when to use it:
[the standard diagrams](unifyapps-standards.md). A story that needs one uses
it; `D check` refuses one drawn again with another scene.

## Choosing scenes for a story

A story with design notes picks a picture for each beat on its scene's
card, from what that beat has to say ([motion ideas](motion-ideas.md)), and
takes the kit's scenes only where they fit as they are:

| Beat | The kit's scene |
| --- | --- |
| Open | `title`: `open: "question"` when the material gives two or three of the client's own figures for the problem; `open: "product"` for a product demo with a screenshot of its first screen; else the plain title, or an opening written for the story |
| The product, used | `screen`, one scene per screen |
| Why pilots stall, why building it yourself does not scale | `ua-eighty`, `ua-code-first`, `ua-n-plus-n` |
| How UnifyApps fits | `ua-assembly`, `ua-platform` |
| How we work together, why trust us | `ua-engagement`, `ua-principles` |
| A UnifyApps overview | all nine standard diagrams in the deck's order ([the standard diagrams](unifyapps-standards.md#a-unifyapps-overview-shows-all-nine)), its examples after `ua-platform` |
| Close | `ua-close` before an overview's end, `end` |

Never two scenes of the same type in a row, except `screen` in a product
demo, and one idea per scene. A film keeps one ground throughout unless
its plan gives a reason to change it for a moment.
