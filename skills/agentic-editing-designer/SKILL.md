---
user-invocable: false
name: agentic-editing-designer
description: Use when building or restyling anything a person will look at, when a request is about how a screen reads rather than what it does, or when judging a screenshot of your own work. Covers finding a direction in the subject itself, how far to push it, the order to build a screen in, typography, colour, motion, composition, texture, and the states a screen has beyond its full one.
---

Build screens someone will remember. The style config is the fast path and keeps
a page consistent with the app around it. Custom CSS reaches everything the
config has no word for, including animation, gradients, and texture. Most
memorable pages use both. Reach for whichever one the idea needs.

## Find the direction in the subject, not in a list of styles

Every category of screen has a template waiting: a film page is dark with one
hot accent and a row of stat bars, a landing page is a hero over three feature
cards, a dashboard is tiles in a grid. Reaching for the category gives you a
screen that could be about anything, which is a screen about nothing.

Picking an adjective does not escape it. "Industrial", "luxury", "editorial",
"retro-terminal" each have their own stock picture attached, so choosing one
swaps one template for another and the result still could have been made for
some other subject entirely.

What escapes it is the subject's own world. Not adjectives about the thing —
the actual nouns, surfaces, instruments and rituals that belong to it and to
nothing else. A film about racing owns asphalt, a speedometer dial, tyre marks,
roadside signage, pit telemetry, a checkered flag. A tax tool owns stamps,
carbon copies, ruled columns, the filing deadline. A sleep app owns dusk, tide,
breath, the slow fade of a room going dark. List those in plain words before
you name a single block.

Then the one test that says whether you have a direction at all: **could this
direction be lifted onto a completely different subject?** Dark with an orange
accent fits a racing film, a crypto dashboard and a gym equally well, and that
is the proof it says nothing. A speedometer dial that fills the whole viewport
fits exactly one thing. Aim for the second kind, and when what you have passes
the transplant test, throw it out and go back to the list.

## How far to push it

The right amount of design is not the maximum every time. It is set by who
opens the screen and how often — so settle that before anything else.

- **Seen once, to be convinced.** A launch page, a fan page, a pitch, a
  campaign. Someone gives it fifteen seconds and decides how they feel. Here
  ambition IS the requirement: full-bleed scale, motion that runs on its own,
  texture, a structure nobody has scrolled before. Restraint reads as having
  nothing to say.
- **Opened every day to get something done.** A dashboard, a list, a form, a
  settings screen. Someone is here for the eleventh time this week and wants
  the thing they came for. Personality lives in the type scale, the spacing
  rhythm, one accent that earns its place, a real empty state — never in
  anything standing between them and the work.
- **Read under pressure by someone expert.** An operations console, a dense
  table, anything watched while something is going wrong. Density and
  legibility ARE the design, and the person reading it knows the domain better
  than you do — so do not simplify what they came for. Show the summary at the
  top level and put the depth one step away rather than on the screen at once,
  and let the shape of the data carry the eye instead of decoration. A flourish
  that costs a row of data is a bad trade.

Both directions of error cost the same. A showpiece built like a form has
nothing to say; a daily tool built like a showpiece is exhausting by the third
visit.

## Work in passes, not block by block

The reliable way to get a screen wrong is to finish each block before starting
the next — place a card, style it completely, move on. Every block ends up
locally fine and the screen has no hierarchy, because hierarchy belongs to the
whole thing and nothing ever looked at the whole thing.

Work the other way: the entire screen at one level of finish, then the entire
screen again at the next. Each pass has one job and one question that says
whether you may leave it. Each is also naturally one batched write.

**Pass 0 — the real content.** Write down what actually goes on the screen, in
priority order, in real words. Not "a heading and three cards" but the actual
heading and what is actually in each card, taken from the data source or from
what was asked for. Layout built around placeholder text falls apart when the
real thing arrives, because a column sized for "Starter" is not the column
"Enterprise for teams" needs.
*Leave it when:* you can say which single item matters most and which are
support.

**Pass 1 — structure only.** Place every region and every block, in order,
nested correctly, with its real text. No styling at all. You are answering what
is on this screen and in what order, and nothing else.
*Leave it when:* the page reads top to bottom in the right order with no
styling whatsoever.

**Pass 2 — hierarchy, with no colour.** Size, weight and spacing only. No
accent, no background fills, no borders, no decoration. This is the pass that
does the real work: if the eye cannot find its way by scale and space alone,
the hierarchy does not exist, and colour laid on top will hide that from you
rather than fix it.
*Leave it when:* squinting until the words blur, the loudest area is the thing
that matters most — and the gaps inside a group are visibly tighter than the
gaps between groups.

**Pass 3 — colour and surface.** Now the direction's palette goes on: the
dominant colour, the one accent, backgrounds, borders. Because pass 2 already
holds, all of this is additive — nothing here is carrying hierarchy that
spacing should be carrying.
*Leave it when:* taking all the colour back off would still leave the screen
readable.

**Pass 4 — texture, motion, and the one break.** Grain, gradient, shadow, the
staggered entrance, and the single deliberate rule-break the screen gets
remembered for.
*Leave it when:* you can name the one thing someone would describe to someone
else.

**Pass 5 — the other states.** Empty, one item, far too many items, text three
times longer than your sample, still loading, failed. Most screens are only
ever designed in the state where everything happens to fit.

Two habits run through all of them. **Pick the scales once** — one type scale,
one spacing scale, one palette — and take every value from them, because a
one-off value is most of what makes a screen look assembled rather than
designed. And **start with more space than feels right, then take it away**,
since cramped is by far the more common failure.

## Give every region its own idea

A page where each section is a heading above a row of cards is the template
even when the colours are loud. Let each region earn a different shape: one
full-bleed, one a single enormous number, one an instrument readout, one a
picture with the words laid across it, one a list that runs to the edge. That
variety is most of what makes a page read as authored rather than assembled.

This is not five unrelated designs. The scales from pass 2 and the palette from
pass 3 run through all of them — the ideas differ, the system holds.

## Build the idea out of boxes and CSS

The block palette suggests its own layout — a Stack of Typographies with a row
of Cards underneath — and taking that suggestion IS the template. It is why so
many pages look like each other, and no amount of colour rescues one. The blocks
give you boxes. What makes the screen is what you put on the boxes.

Almost every ambitious idea comes apart into a box plus CSS:

- A number that dominates the screen is a Typography with a font size in the
  hundreds of pixels — not a heading wearing a heading's size.
- A dial, gauge, ring or meter is one box with a border radius and a
  conic-gradient.
- Texture — asphalt, grain, paper, scanlines — is a repeating background or an
  inline SVG data URI on the region sitting behind everything else.
- Diagonal energy is a rotate or skew transform on a Stack, with its parent
  clipping the overflow.
- Full-bleed is a full-viewport width with a negative margin escaping the page's
  own padding.
- Overlap is a negative margin or a translate, never a gap.
- A road, a horizon, a receding perspective is a gradient plus a perspective
  transform.

So when the direction wants something the property panel has no word for, that
is the ordinary case rather than a dead end, and custom CSS is where it lives.
Reaching for the panel first keeps a value editable, which is worth having — but
a screen built only from what the panel offers is a screen designed by the
palette.

**Centring is a choice, and usually the wrong one.** A centred title over a
centred subtitle over two centred buttons is what arrives when nobody decided
anything. Push it left, into a corner, or off the edge.

**No image beats a stock image.** Identical gradient placeholders repeated
across a row announce that the page is unfinished more loudly than empty boxes
would. With no real picture to use, build the space out of CSS — a colour field,
a pattern, an enormous letterform, a number — and say plainly that a real asset
belongs there.

**A colour you did not choose is still on the screen.** A button left alone
comes out the theme's primary, and that is why an untouched control makes a
considered page read as generic. Every colour someone can see is one you either
chose or allowed.

## Aesthetics here

**Typography.** Few steps, big jumps between them. A handful of sizes far apart
reads as clear levels; many sizes a step apart reads as fog. Same for weight,
where two is usually the whole answer.

**Colour and theme.** The theme's tokens follow the app when it changes, so
they are right for anything the app already has an opinion about. Anything the
theme has no word for is CSS. Commit to a dominant colour with one sharp accent
rather than five spread evenly, and take the dominant one from the subject's
own world rather than from what looks safe.

**Motion.** Nothing in the config declares a transition, so every animation is
CSS you write yourself. That is a reason to write it, not to skip it. One
well-orchestrated entrance with staggered delays beats a dozen scattered hover
effects. Animate transform and opacity, ease out, skip bounce.

**Composition.** Asymmetry, overlap, and a deliberately broken grid make a page
look authored. Equal columns and identical cards make it look generated. One
deliberate break — one card wider, one number far bigger, one element the only
thing in colour — is the part people remember seeing.

**Texture and depth.** A flat fill is the default nobody chose. Gradient
meshes, grain and noise overlays, geometric patterns, layered transparency,
dramatic shadows, decorative borders, a custom cursor. All of it is CSS and all
of it is reachable here. Take the ones your direction actually wants.

**States.** Some blocks have a real empty-state setting or slot; where none
exists, build the empty state yourself and show it conditionally. Empty is
where most screens fall apart.

## Never

Identical cards in an even grid. One padding value everywhere. Every heading
the same size as every other heading. The theme accent sitting where it landed,
doing no work. Dark with a single glowing accent, reached for because it looks
designed. Purple-to-blue gradients, cyan on near-black, neon on dark. Pure
`#000` or `#fff`, which never appear in nature. Gradient text. A rounded icon
tile above every heading. Placeholder content standing in for the real thing.
The same look you built last time.

## The test

Show the finished screen to someone and tell them a machine made it. Would they
believe you instantly? That is the failure. You want the question to be how
this was made, not which model made it.

Ask one more: hand someone the screen with every word replaced by nonsense.
Could they still tell you what it is about? If the shapes alone say nothing,
the direction never left the copy.

Then actually look at it. Squint until the words stop being words: one area
should be obviously loudest, and it should be the thing that matters most. Read
the gaps rather than the things, because if the gap inside a card matches the
gap between cards, nothing groups and the row reads as one block of mush. When
something is wrong, name which pass it belongs to and fix it there — a spacing
problem repainted in colour stays a spacing problem. A picture is one width, so
how the page reflows at other widths is not in it, and it shows what is saved
rather than what you meant to save.

You can do extraordinary work here. These tools reach much further than the
style panel suggests. Don't hold back.