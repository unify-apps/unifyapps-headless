# The film plan

`F/design/film.md` is written once the material is read and before any
scene exists. Every scene is held to it, so a scene author can make its
scene well without seeing the others. `D check` refuses the story while a
section is empty. Everything below is how to decide each part for this
film; none of it is a value to copy into every film.

## Contents

- [Purpose, audience and setting](#purpose-audience-and-setting)
- [Concepts](#concepts)
- [Length and pace](#length-and-pace)
- [The arc](#the-arc)
- [Visual language](#visual-language)
- [Colour meanings](#colour-meanings)
- [Shared parts](#shared-parts)
- [Story data](#story-data)
- [Motion palette](#motion-palette)
- [References](#references)
- [Scenes](#scenes)
- [The storyboard](#the-storyboard)

## Purpose, audience and setting

The purpose is one sentence: what the viewer does or believes after it,
from the intake's answer and the brief. Every scene earns its place against
it; a scene that does not move the viewer toward it is cut.

The setting decides more than it seems:

| Shown | What it changes |
| --- | --- |
| Presented live | The deck leads; lines are the speaker's notes; a scene can hold while the presenter talks; the video is a backup |
| Sent as a link | The film must carry everything alone; open on the subject in the first 5 seconds; captions on |
| An event, a big screen | Bigger type, fewer words on screen, slower holds; motion can be larger and bolder |
| Social, muted | Captions carry the story; the first 3 seconds must stop a scroll; every scene readable with no sound |

## Concepts

Each idea the film has to teach that the viewer may not already share: a
framework of the person's, how their work divides into levels, a term with
a meaning of its own here. For each one:

- the person's definition, word for word, with where they gave it;
- one example of it from this story;
- how it is drawn, so every scene draws it the same way;
- the scene that first shows it (no scene uses it before that);
- the wrong forms it must never take, one per line as `Never: "<words>"`.
  `D check` refuses any line or screen that says one.

A film whose every term is plain to its audience says so in one line. The
section is written once and kept whole: when the person corrects a concept,
rewrite it here, quote it in every brief that touches it, and check every
scene against it.

## Length and pace

Pace is about 2.6 spoken words a second. What holds a viewer is how often
the picture changes: a new beat (a build, or a part of one that lands on its
own word) every 2 to 3 seconds in a film that explains, slower for a
leader's reflective film, faster for a teaser. A build's window is the time
until the next build; the cue sheet gives each one after step 5.

| Length | Words | Scenes | A scene holds | Builds a scene |
| --- | --- | --- | --- | --- |
| Teaser, 20 to 40 s | 50 to 100 | 4 to 6 | 4 to 7 s | 1 to 2 |
| 2 minutes | about 310 | 10 to 14 | 8 to 12 s | 2 to 5 |
| 5 minutes | about 780 | 18 to 26, in 4 or 5 chapters | 10 to 16 s | 3 to 6 |
| 10 minutes | about 1,560 | 30 to 40, in 6 to 8 chapters | 14 to 20 s | 3 to 7 |
| A deck, 10 / 20 / 30 minutes | the speaker's | 7 to 9 / 14 to 18 / 20 to 26 | a minute or so | up to 5 clicks |

These are where to start, not limits: a dense scene earns more builds, a
quiet one fewer. A longer film is not a slower one: it has more chapters,
and each chapter opens with a scene that says where the film is going next.
Plan where it slows down (their pain in their words, the turn) and where it
speeds up (how it works, what changes), and write the seconds and builds of
each scene in the scenes table. `D check F` prints how long the film would
run; it fails a film more than a fifth off its `video.length`.

## The arc

The beats, in order, each one sentence, each leading into the next: say
why every beat follows the one before ("…but it waits on one person", "so
the loop takes the steps"). A film whose beats only follow each other
reads as a list. A use-case story: the hook (their problem in one image),
their world today, what it costs, the turn, how UnifyApps fits, how it
works, what changes, the plan, the ask. A story about a solution or an
idea, made from a brief: the problem as people live it, how it is done
today across the industry and where that stops, how it looks with
UnifyApps, what changes, the ask, when the brief fits that shape; the film
never names its parts aloud. A product demo: the job the app does, the
screens in the order a person uses them, what changes for the user, the
ask. An overview: the company deck's order, with the examples after the
platform. A teaser: four to six beats of one of these, with no plan and no
detail. The kit's
[writing rules](../../../skills/demo-kit/references/writing.md#the-story-by-kind)
and, for a film for a leader, the audience file shape the beats; the plan
gives each one a picture.

## Visual language

What makes the film one film rather than a run of slides:

- **A motif**: one thing that recurs and changes as the story moves. An
  invoice that travels through every scene of an AP story; a single line
  that becomes a process, then a chart, then a path forward; the client's
  six systems as six shapes that tangle, connect, then light. Name it, and
  say where it appears.
- **The camera**: locked off, with things entering the frame; one wide
  canvas the camera travels across; a push in at each key moment and back
  out for the next idea. Say which, and when it changes.
- **Layout**: content laid straight onto the page in open, evenly spaced
  columns, with hairlines and space doing the grouping. A panel or card
  only where it means something (the one place the story is about); never
  a grid of cards for the sake of cards. Where content sits in the frame,
  and what stays clear (the corners the footer and footnote use). A heading
  on every scene is a slide's habit: give a scene one where it helps the
  viewer, and where two scenes in a row have one, it changes in place.
- **Hand-overs**: how one scene becomes the next. The kit fades by default:
  the scene before clears just as the next one's entrance begins. Where the story
  allows, the eye should follow something across the cut: the element one
  scene ends on carried into its place in the next (`data-carry`), a
  heading whose words change in place, a sentence that runs across the cut
  (`cutOn`), a push through one element into the next scene, a wipe in the
  motif's direction, a hard cut on the beat. Plan them in pairs, so the two
  authors meet; a plain fade is a fine answer where nothing more serves.

## Colour meanings

Decide what each colour stands for in this story, from its actors and
states, and keep it in every scene: a viewer learns the meaning once and
reads it everywhere after. The ground is one of them: a film stays on one
ground throughout unless a change means something this story can name (the
outcome on the deep ground, say), and then it changes once or twice, as
light changing across the cut. Map each meaning to the theme's variables
(`--accent`, `--deep`, `--deep2`, `--alert`, `--muted`…), never to a new
colour. For example, in a story about people and agents: the person in the
accent, the agent in the deep colour, done in the deep green with a tick,
waiting or failing in the alert colour, and the loop in the accent with a
dot travelling it. A story about invoices has other actors (a supplier, an
exception, a match) and gets meanings of its own.

## Shared parts

The pieces more than one scene draws: the actors' badges, chips for a kind
of item, the motif object, a pointer, a product's frame and sidebar. List
each, with what it means and which scenes use it. Step 6 builds them once,
in `F/scenes/_film.css` and `_film.js`, before any author starts, so no two
authors draw the same thing two ways.

## Story data

One table of every name, id, time and figure the film shows, used exactly
by every scene: the ticket and its number, the people's roles (never a real
person's name), the times of a day, the figures with their fact ids. Scenes
written by different authors then never disagree, and every name is spelt
one way. A figure here still needs its fact in facts.json.

## Motion palette

Three to five kinds of motion this film owns, each tied to what it means
here: "lines draw between systems as they connect", "figures count up on a
physical scale that fills", "work items ride a route and stop at each
stage", "layers slide together as the platform assembles". Assign each
scene one of them, and vary them so no two scenes in a row move alike.
Keep one big move, the largest motion in the film, for the turn or the key
moment, and use it once. The kit's
[motion ideas](../../../skills/demo-kit/references/motion-ideas.md) holds
the ideas to draw from, by what a scene has to say.

## References

The films, launch videos, sites or decks this one borrows from, and exactly
what it borrows from each: "Linear's launch films: interface pieces glide
in on a tight spring and settle without bounce"; "Vox explainers: a map
zooms from the country to the street as the voice narrows the subject". The
person's own reference from the intake comes first, and it binds: name the
scenes that borrow from it and its path, so each of those authors opens it.
Borrow the move, never the brand: no other company's logo, type or artwork.

## Scenes

One row per scene, in order:

```markdown
| # | id | Beat | The idea | The picture | The motion idea | Joins the scene before | Builds | Seconds |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | title | Hook | Every invoice matched, in minutes | Title card | The kit's title card | (opens the film) | 0 | 6 |
| 2 | backlog | Their world | 3,000 invoices a day wait on 4 people | A paper stack that grows past four small figures | One sheet multiplies into the stack as the count runs; the four figures stand up at its foot | "But today…": the title's invoice carried in as the first sheet | 2 | 10 |
```

The row's motion idea is a sentence an author can build from. "Animated
stats" is not a motion idea; "minutes drop as chips into an hours bar" is.
The join says what links the scene to the one before, in words and in the
picture: a linking word or a question, what is carried across, or a plain
fade.

## The storyboard

Each scene's card carries the director's brief, written in step 4 and timed
in step 5. It is what makes a film look directed rather than assembled: the
author spends their effort on how to move each part well, not on what the
scene should be.

1. **The picture**: the metaphor in one sentence, then what sits where in
   the frame (the heading's place, the main shape and its parts, the labels,
   what stays clear), using the shared parts and the colour meanings.
2. **Each build, in order**: the word it fires on (a word its line says;
   `D check` refuses a card whose build fires on a word the lines never
   say, as when the card draws a "capacity" the voice calls a
   "bottleneck"), its window from the cue
   sheet, and what arrives or changes, as concrete as a shot list. A build
   may hold several beats when its line does: "on 'ten' the figure counts
   to 10×, on 'twenty' the '–20' opens beside it".
3. **The hand-overs**: how it arrives from the scene before and what the
   next scene inherits from its last frame: the element carried and its
   `data-carry` name, the words that link the two lines, and the pause.

For illustration, the storyboard of a scene about a bottleneck:

> The picture: a funnel drawn in two hairlines narrows from the left to a
> neck at the middle of the frame, where one person badge sits; work items
> pile up in the funnel. The heading top left; the queue count bottom left.
> Build 1, on "one" (2.2 s): the person badge lands at the neck. Build 2,
> on "38" (2.9 s): the items crowd in from behind, the queue counts to 38
> and the walls warm to the alert colour. Build 3, on "eight" (3.3 s): the
> walls swing open, the person steps up out of the path, eight lanes draw
> out from the neck (the middle ones first), each item becomes a dot that
> rides a lane, and the queue drains to 0 as the last dot leaves. While it
> holds, dots keep riding the lanes. It hands over by carrying the top lane
> (`data-carry="lane"`), which becomes the next scene's timeline, as the
> voice runs on: "So every ticket moves on the day it arrives."

Five or fewer things arrive at once; each part that matters gets its own
beat; nothing that must be read sits under something that moves.
