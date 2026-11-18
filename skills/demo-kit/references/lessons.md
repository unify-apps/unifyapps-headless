# Lessons

What cost earlier films their takes, and what avoids it the first time.
Read it before writing a scene; each row is something a film had to be made
again to fix.

## Contents

- [Direction](#direction)
- [Timing](#timing)
- [Layout](#layout)
- [Motion](#motion)
- [Product screens](#product-screens)
- [Building in parallel](#building-in-parallel)
- [Joins](#joins)

## Direction

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| Scenes that each look fine and the film looks assembled | Each author decided what its scene shows | The director's storyboard decides what each build shows and on which word; the author decides how it moves |
| Every film looks the same | Scenes reached for the same few patterns | A picture found for this idea on its card, from its verb (grows, travels, splits, replaces) |
| Two scenes disagree about a time, a figure or a name | Each scene invented its own data | One story-data table in the film plan, used exactly by every scene |
| An agent drawn one way here and another way there | Each author drew its own badge | Shared parts built once (`scenes/_film.*`) before any scene |
| A colour means "done" in one scene and "warning" in the next | No meaning was set | The film plan's colour meanings, kept in every scene |
| Text everywhere, nothing to look at | A slide's habits in a film | The picture says the idea; words only label it |

## Timing

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| A build still moving when the next word arrives | Motion designed without its window | Design to the cue sheet's window: done by 85% of it, 0.6 s or less when the window is under a second (`D scene` reports an `overrun`) |
| A build that lands before its word, then waits | Its line's word is not the one that names it | Pin the word with braces in its line |
| A scene that sits still while a long line plays | All its builds land in its first seconds | Split the line and give the scene a build for what it names |
| A number counts on after the voice has moved on | A long count on a short window | Count in less than the window, or start it on the word before |
| Many lines changed after the scenes were built | The script was settled late | Voice the lines and read the cue sheet before any scene is built |

## Layout

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| A grid of cards that says nothing | Cards for the sake of cards | Content straight on the page in open columns, a panel only where it means something |
| Text that floats with nothing anchoring it | No shared edge or line | Align to a few edges; hairlines and space do the grouping |
| Words wrap or chips overflow in a grid | `1fr` columns grow with long content | `minmax(0, 1fr)` and shorter labels |
| Big numerals clipped at their top | A rise mask cuts the glyph | Leave room above the numeral, or rise without a mask |
| A number that jumps its layout as it counts | Its width changes with each digit | Give it tabular figures and a fixed width while it counts |
| Readable text under something moving | Layers planned for the end state only | Nothing that must be read ever sits under a moving part |

## Motion

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| Everything arrives at once | One stagger for the whole scene | Five or fewer things at once; each part that matters on its own beat |
| Every element fades and slides up | One move used everywhere | A move that says the idea: drawn, travelling, assembling, splitting, counting |
| An arrowhead shows before its line draws | The marker renders at full opacity | Keep the line hidden until its draw starts |
| A panel goes grey during a change | A filter or opacity on a parent of coloured content | Animate the content's own opacity, never a brightness filter |
| A loop that never stops, or never starts again after a jump | It was started by a callback | Endless motion only on `c.loops`, placed at its time; no callbacks |
| A moving part jumps when a second animation starts | Two animations set the same element's transform | One animation per property per element; nest a wrapper for the second |
| A held product screen looks frozen | Nothing moves while the voice explains it | Let the pointer glide slowly toward what the voice names next |

## Product screens

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| A product screen that cannot show anything changing | A screenshot can only zoom and swap | Rebuild the screen in HTML (`.ua-app`) so statuses, counters and rows can change on their words |
| A rebuilt screen that does not look like the product | Sizes guessed | Measure the screenshot: colours, type sizes, spacing, and the scale it was taken at |
| A pointer that teleports | Positions set without a path | `c.pointer()`: it glides on a bowed path, presses on the click |
| Typing that finishes after the line | Typing speed not set to the window | `c.type(el, text, { at, dur })` with `dur` inside the window |
| Real names or another company's logo on screen | Taken from a live app | Illustrative data, and the footnote "Built to match the product · illustrative data" |

## Building in parallel

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| Authors overwrote each other's helper scripts | One shared scratch folder | Each author writes only its own files and its own build folder |
| Two scenes shared a name | Names picked by each author | Scene names come from story.json, one per scene |
| A shared change made by one author broke another's scene | Shared parts edited mid-build | Shared parts change only through the director, then every affected scene is looked at again |

## Joins

| What went wrong | Why | Do this instead |
| --- | --- | --- |
| Every scene good, and the film still a slideshow | Each scene's lines were written on its own card, each opening on a topic sentence ("Here's how it works.") | One script read straight through; most first lines carry on from the last line before, and some sentences run across the cut (`cutOn`) |
| The same silence before every scene | Every join took the default pause | The last line's `pause`: short where the thought runs on, longer before a new chapter |
| The old picture leaves, then an empty page, then the new one builds up | The scene opened on a bare heading and drew its picture on later builds | The opening picture comes in with the scene's entrance; `D seams` shows each join |
| Two scenes seen on top of each other for half a second | The scene before stayed as a faint copy under the next, to hide openings that were empty | The scene before clears just as the next one's entrance begins; only a carried element crosses the cut |
| The same line drawn twice across a cut, the second from nothing | Both scenes drew it; the cut threw the first away | Mark it `data-carry` in both scenes: the kit moves it across |
| A green page out of nowhere in every film | A rule put the deep ground on "the turn" in every story | One ground for the film unless its colour meanings give a change a reason |
