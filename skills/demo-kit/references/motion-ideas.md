# Motion ideas

Where a scene's motion comes from. Start from what the scene has to say,
find its verb (it grows, travels, connects, splits, replaces, stacks,
narrows, compares), and make the picture do that verb. The ideas below are
starting points, never a menu to fill: take any reference that serves the
story, combine two, or invent one. The craft numbers that make any of them
look made are in [motion](motion.md); how to build them, in
[writing a scene](scene-authoring.md).

## Contents

- [A system, not a slide](#a-system-not-a-slide)
- [By what the scene says](#by-what-the-scene-says)
- [Openings and the turn](#openings-and-the-turn)
- [Hand-overs between scenes](#hand-overs-between-scenes)
- [The camera](#the-camera)
- [Type that moves](#type-that-moves)
- [Depth and texture](#depth-and-texture)
- [References worth borrowing from](#references-worth-borrowing-from)
- [Building the hard ones](#building-the-hard-ones)

## A system, not a slide

The scenes people remember move as one system with a meaning: dozens of
small parts doing one thing together, each on its own beat. Tickets pile
against a funnel; its walls swing open; lanes draw out from the middle;
every ticket becomes a dot riding a lane; the waiting count drains to zero
as the last one leaves. Nothing in it is a bullet or a card. When a scene's
idea is a change (work stops waiting, a backlog empties, a process runs on
its own), draw the change happening to many parts at once, in the order the
voice explains it. GSAP on `c.gs` makes this short to write
([writing a scene](scene-authoring.md#gsap-on-the-film-clock)).

## By what the scene says

**A number that matters.** A figure alone is forgettable; a figure with a
physical scale is not.
- The number counts up while a scale fills under it: a bar, a meter, a
  tank, a stack of units that piles past a line.
- One unit becomes many: a single invoice icon multiplies into a grid of
  3,000 that fills the frame, then the camera pulls back to show its size.
- Time made visible: a clock face whose sweeping hand leaves minutes behind
  as chips that drop into an hours bar.
- A comparison that races: two bars start together, one stalls, the other
  runs on; the gap is the story.
- The number lands with weight: it overshoots in scale by a few percent and
  settles as a rule draws under it.

**A process or a journey.**
- One token rides a route through each stage, and the route is drawn only
  as far as it has come (`c.tick` with `getPointAtLength`).
- A relay: each stage is a card that hands the work to the next, sliding it
  across rather than redrawing it.
- A conveyor: work items move left to right on a belt; a stage that
  automates speeds its section of the belt up.
- A stamp at each stage: the same document gets a mark as it passes, so its
  history piles up on it.
- A scrubbed timeline: a playhead moves along the bottom and each stage
  lights as it passes.

**Many systems, complexity, a mess.**
- A tangle: wires drawn between every pair of systems, each a slightly
  different curve (`c.rand()`), the count of wires rising; then they
  retract into one hub, each endpoint travelling to the centre.
- Noise to signal: scattered dots drift into a grid or a line as the voice
  names the order.
- A wall of logos or tools collapses into one panel.
- Tabs and windows stacking on a desk until the screen is buried.

**Before and after.**
- A wipe: a line sweeps across the frame and the same picture changes as it
  passes (`clipPath` on the after layer).
- The same object transformed in place: the five-step form folds into one
  field; the long queue shrinks to two items.
- A split screen that is not static: both sides play at once, the before
  side visibly slower.

**A platform, layers, an architecture.**
- An exploded stack assembles: layers fly in from depth and lock together
  (3D transforms under a `perspective` parent), each landing on its word.
- A building is built: foundation, frame, floors, each layer's parts
  dropping into slots.
- The stack lights from the bottom up as data rises through it.

**Time and a plan.**
- A calendar whose pages flip to the milestone; a week compresses into a
  day as the automation lands.
- A road with milestones the camera drives along.
- A Gantt bar that shortens as each step is automated.

**People, work and AI.**
- A queue of tickets that drains as an agent picks them up.
- A cursor that types a request; the answer streams in word by word.
- A reasoning trace: steps appear and tick, tool calls fan out as lines to
  systems and return with results.
- A person steps back from a task as the agent takes it over: the hand-off
  is a card sliding from one lane to another.

**Data.**
- A table whose rows sort themselves, the one that matters rising to the
  top and lighting.
- A chart that morphs from one form to another as the voice reframes it:
  bars become a line, a pie becomes a stacked bar.
- A map: routes draw between sites; the camera zooms from the region to
  the plant.
- A dot matrix of every record, filtering down to the exceptions.

**The product, used.** Rebuild the screen in HTML from its screenshot
(`.ua-app`) so every part can move on its word: the pointer glides to the
prompt and the request types in, a draft replaces the templates, statuses
flip from waiting to done, a time strip's marker moves to each step's time,
the pipeline's steps turn green one by one, the cost and the tool calls
tick up. A screenshot is for a screen nobody needs to see change.

**Their own words.** Type them on at the speaker's cadence, with the words
that carry the pain turning heavier or into the accent as they land.

**The ask.** A path forward with each step lighting; a date being circled;
a door, a frame or a panel opening onto the next step.

## Openings and the turn

- Open on the subject, never on a logo: the problem in one image within the
  first 5 seconds.
- A cold open: the hero object alone (one invoice, one ticket), then the
  camera pulls back to show thousands like it.
- The turn: one line built word by word, and the film's one big move: the
  tangle resolving, the stack assembling, the frame splitting open.
- Keep the biggest motion in the film for this moment, and use it once.

## Hand-overs between scenes

A film runs on from one scene to the next; a slideshow starts again each
time. Plan each pair of neighbouring scenes together: what the eye follows
across the cut, and what the voice says across it. A plain fade is a fine
answer when nothing more serves the story.

- **Carry the subject**: the element the scene before ends on is the one
  the next starts from, moved into its new place (`data-carry` in both
  scenes): a process line grows the stages the next scene adds; a ticket
  rides into the screen where it gets worked; a card becomes the next
  scene's header.
- **Change the words in place**: two scenes in a row with a heading keep
  one heading whose words change (`U.head(d, { carry: 'head' })`).
- **A sentence across the cut**: the cut lands on a word of a sentence
  that runs on (`cutOn`), so the voice is mid-thought as the picture
  changes.
- **A push through**: the camera pushes into one element (a card, a screen)
  until it fills the frame and becomes the next scene's ground.
- **A wipe in the motif's direction**: if the token travels left to right,
  the next scene wipes in left to right.
- **A hard cut on the beat**: for energy, cut on the first word of a line.
- **A slow dissolve** (`"cut": "dissolve"`): both pictures for half a
  second, for time passing.
- The kit's push, whip and blur move the whole picture and carry nothing:
  keep them for a change of place or a burst of energy.

## The camera

The frame is a window onto a stage that can be larger than it.

- One wide canvas: lay the whole process out at three frames wide and pan
  across it build by build (animate an inner wrapper, `camera: false`).
- Dolly to a detail and back: push in to read one field, pull out to show
  the whole again.
- Rack focus: blur the background layer while the subject sharpens.
- Parallax: layers at different depths move at different speeds in a pan.
- Lock the camera off when the content moves a lot; never move both hard
  at once.

## Type that moves

- Words that land on the beat of the voice, each a little heavier in weight
  or scale when it carries the point.
- A word swapped in place: "weeks" turns over to "minutes" as a flip card.
- A highlighter swept behind the key words (the Vox and Kinetic looks do
  this on headings).
- A letter-spaced kicker closing up as it arrives.
- Never more than one line of type moving at once, and a landed heading
  stays still.

## Depth and texture

- Soft shadows that grow as a card rises toward the viewer.
- 3D: cards that turn to face the viewer, a stack in isometric view, a
  floor plane the camera tilts over (`perspective` on a parent, `rotateX`,
  `rotateY`, `translateZ` on the child).
- Masks and reveals: a picture revealed through the shape of a word; a
  circle that opens from a dot (`clipPath: circle()`).
- A canvas for many moving parts: particles that become a shape, a field of
  dots, a flowing gradient, drawn each frame from the clock in `c.tick`
  with `c.rand()` for any scatter.

## References worth borrowing from

Borrow the move, never the brand.

| Reference | What to borrow |
| --- | --- |
| Apple product films and keynotes | One object on a clean ground, slow precise camera, numbers that land with weight |
| Stripe Sessions and its site | Gradients and grids that move with purpose, diagrams that draw themselves |
| Linear's launch films | Interface pieces gliding on a tight spring, calm and exact |
| Vox explainers | Paper texture, highlighter sweeps, maps that zoom from country to street |
| Kurzgesagt | Flat shapes with depth and parallax, scale shown by zooming out |
| The Pudding, NYT graphics | Data that morphs from one view to the next as the argument moves |
| Saul Bass title sequences | Bold shapes and type cutting together on the beat |
| Google I/O and Figma Config openers | Playful UI motion, shapes that snap into a layout |
| Vercel Ship | Dark ground, glowing lines, code and product in one frame |

## Building the hard ones

- **A token along a route**: an SVG path; in `c.tick`, compute how far the
  token has come at time `t`, read `path.getPointAtLength(l)` and place it;
  draw the path to the same length with `strokeDashoffset`.
- **One shape becoming another**: two SVG paths with the same number of
  points, interpolated in `c.tick`; or two elements cross-faded while one
  scales into the other's box.
- **Many becoming one**: place each piece's start (scattered with
  `c.rand()`) and end (its slot), then move each in `c.tick` from one to the
  other with its own small delay.
- **A pan across a wide canvas**: a wrapper three frames wide inside the
  scene, moved with `c.tw` on its `transform` at each build, the scene
  saying `camera: false`.
- **A counter tied to a scale**: `c.count` on the number and `c.tw` on the
  scale with the same `at` and `dur`, so they finish together.
