# Motion

The craft every scene keeps, whatever its motion: the clock, the eases, the
timing between pieces, and what makes a video look generated. These are how
motion is made well, not a style to repeat; what a scene's motion is comes
from its idea ([motion ideas](motion-ideas.md)). The numbers are adapted
from HyperFrames'
motion, film and sound references (HeyGen, Apache-2.0,
https://github.com/heygen-com/hyperframes), which measured them frame by
frame from shipped launch films. The entrances and the live motion are the
UnifyApps platform story's own (the Demo Library's standard presentation).

## Contents

- [The clock](#the-clock)
- [Easing by role](#easing-by-role)
- [Builds, words and the camera](#builds-words-and-the-camera)
- [Live motion](#live-motion)
- [Cuts](#cuts)
- [Sound](#sound)
- [What looks generated](#what-looks-generated)

## The clock

Every animation is a paused Web Animation or a ticker set from the clock, so
any frame can be drawn on its own: no CSS transitions, no timers, no
`Math.random` (use `ctx.rand`), and no `transform` on an element another
animation already moves. A sound is listed with `ctx.sfx(kind, at)` at the
moment its picture happens; the mix plays it one frame later.

## Easing by role

| Move | Ease | In the kit |
| --- | --- | --- |
| An arrival | a long ease-out that lands slowly | `out` |
| A camera move | eases both ways | `cine` |
| An exit, a zoom through | accelerates away | `in` |
| A pop (a dot, a ring) | a spring, damping 0.78: one small overshoot | `back` |
| Opacity, colour | never bounce | `soft` |
| A card gliding up into place (`ctx.rise`, `slide`) | the platform story's glide | `glide` |
| A part dropping into its slot (`ctx.snap`) | a little past it and back | `drop` |
| A bar or a state changing (`ctx.tw` on a width) | quick, then settles | `ui` |

An exit is 40 to 50% shorter than its entrance. The next element starts
when the one before is 30 to 50% done: all at once looks cheap, one after
another looks robotic. Words stagger 60 to 120 ms, list items 40 to 80 ms.

## Builds, words and the camera

- A build starts 250 ms before the word that names it, so it lands as the
  word is said. A scene reveals its pieces across its lines, never all in
  its first quarter.
- A build's motion lives in its window, from its word to the next build's
  (the cue sheet gives each one): its main motion is done by 85% of the
  window, and by 0.6 s in a window under a second. Several beats may land
  on several words inside one window.
- Five or fewer things arrive at once; each part that matters gets its own
  beat.
- In a video the camera reframes on each build as it arrives (a punch-in, a
  little closer each time, never pushing text past 44 px from the edge) and
  then holds. It never creeps between builds. Title and end cards hold
  still: a landed title is still.
- A heading arrives one of three ways in turn (words rising, sharpening
  from a blur, or turning from grey to ink), so no two scenes in a row
  arrive alike.
- When the voice names something already on screen, it lights in the
  accent for about a second.
- Motion that carries meaning keeps a scene alive between builds: data
  moving along wires, work crawling along a tangle, a product screen being
  used. Never a loop that only fills time.

## Live motion

A built scene keeps moving while it holds, in the deck as in the video, the
way the platform story does. Live motion runs on the film clock plus the
deck's hold time, starts once the build that brought its part in has landed,
and never delays a build.

| What it says | Move | In the kit |
| --- | --- | --- |
| Data or work flows along this wire | dashes marching along it | `ctx.current(paths, from)` |
| Things travel between these parts | dots riding the path, end to end | `ctx.travel(paths, from)` |
| Everything here reads from this centre | a slow glow breathing behind it | `ctx.halo(el, from)` |
| This is where we are now (the stage, the milestone reached) | a ring leaving it every 2.5 s or so | `ctx.ping(el, from)` |
| This is the part the story is about | a band of light crossing it every 3 s or so | `ctx.sheen(el, from)` |
| This keeps turning (a glyph, an engine) | a slow turn | `ctx.spin(el, from)` |

Put it only where it carries one of those meanings: the wires, the centre,
the current step, the accent band. One glow per scene. Never on a heading or
a line of text, never on every card at once.

## Cuts

A scene fades in unless it names its cut. Choose another for a reason: a
change of place, a burst of energy, time passing. A scene that makes its
own entrance (a push through, a wipe in the motif's direction) asks for
`"cut": "cut"`, a hard cut, and draws it itself. An element both scenes
mark with `data-carry` travels across a fade or a hard cut, and a change of
ground fades in across the cut like light changing:

| Cut | The scene leaving | The scene arriving |
| --- | --- | --- |
| `fade` | clears in 180 ms, from 60 ms before the cut | fades in over 150 ms from 40 ms after it, as its own entrance begins: the two are never seen together |
| `dissolve` | fades out over 500 ms | fades in over the same 500 ms, the two seen together |
| `push` | scales past the lens and fades, 380 ms | arrives 3.5% large and settles, 720 ms |
| `whip` | slides left with a 10 px blur, 280 ms | slides in from the right, sharpening, 560 ms |
| `blur` | blurs out on one stage, 200 ms | sharpens in, 300 ms |

A click on a product screen is itself the cut: the next screenshot arrives a
touch large and settles as the button comes back up.

## Sound

Every sound has a cause on screen: a whoosh into a pushed or whipped scene,
a soft pop as a build lands, a click as the cursor clicks, a key for each
typed letter. They rotate through a few takes and sit a little left or right,
so a run of them never stacks. Music sits under the voice and ducks while it
speaks; the sounds do not.

## What looks generated

Never add these to a scene: breathing, floating or pulsing loops on titles,
text or every card at once (live motion goes only where the table above
says); a title that keeps moving after it lands; a slow creeping zoom late
in a scene; bounce on UI; rings around clicks; every scene entering the
same way; every element fading and sliding up; everything arriving at
once; a grid of cards that says nothing; particles and glow on a dark void.
What earlier films had to be made again to fix: [lessons](lessons.md).
