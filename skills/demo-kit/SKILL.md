---
name: demo-kit
description: Makes UnifyApps stories from a story folder, in the UnifyApps theme (light or dark), the Vox or Kinetic look, or a theme of the person's colours and fonts. A story.json (each scene's data and lines), the scenes the story writes for itself (one file each, any motion, GSAP included, on the film's clock), the kit's title, end, product-screen and standard-diagram scenes, and a facts.json (every figure with its source) become an animated HTML presentation in one file, a PowerPoint in PowerPoint's own shapes with each build a click, or a narrated 1080p or 4K MP4 where every build lands on the word that names it. It plans and directs each scene in design notes, voices the lines first so every build has a real window, shows any scene on that clock as stills and motion strips, and holds every scene to four checks. A check refuses any figure without a source, and a video with a dead stretch. Loaded by the content loop, never typed.
user-invocable: false
---

# Demo kit

The stage every story plays on: the theme, the clock, the camera, the
voice, the music, the outputs and the checks. The story brings its scenes.
Each content scene is designed on its card and written for its story as one
file in `scenes/` ([writing a scene](references/scene-authoring.md)), with
motion found for what it says ([motion ideas](references/motion-ideas.md)).
The kit keeps the title and end cards, the product screen and the UnifyApps
standard diagrams as they are; its other scenes are examples to learn from,
and `D check` refuses one used as it stands in a story with design notes.

`D` is `node "${CLAUDE_PLUGIN_ROOT}/skills/demo-kit/scripts/demo.mjs"`.
Every command that works on a story takes its folder first. With `--json`,
each command answers with one JSON line.

## One page, three outputs

```
story.json + facts.json ──check──▶ the story page (HTML: scenes, theme, logo)
                                    ├─ deck    out/<slug>.html   stepped build by build, one file
                                    ├─ slides  out/<slug>.pptx   the deck in PowerPoint's own shapes, builds as clicks
                                    └─ video   out/<slug>-<cut>.mp4   rendered from the voice's clock
```

The deck is made first, always: its stills are the layout check and the
storyboard for every output, and the slides are laid out from its page.

## The story folder

```
content/<slug>/
  story.json     the story: scenes, what each shows, the lines said over it
  facts.json     every figure on screen or in a line, with its source
  scenes/        the scenes written for this story, <name>.js each, and _<name>.css / _<name>.js, the parts they share
  design/        film.md, the plan of the whole film, and <scene id>.md, each scene's card
  brief.md       what the loop learned from the material (the loop writes it)
  story.md       the story sheet handed over with the files (the loop writes it)
  inputs/        notes on the material the person gave, with no secret copied from it
  assets/        screenshots and pictures a scene shows
  build/         stills, contact sheets, voice and music tracks (the kit's own)
  out/           <slug>.html, <slug>.pptx, <slug>-<cut>.mp4 with .srt, .html preview and -share.mp4
  versions/      every full video, with the story.json and facts.json behind it
```

`D new <dir> --title "<title>"` starts one, with `design/film.md` to write
first. Never delete anything a person made; the kit only overwrites
`build/` and `out/`.

## Design notes

`design/film.md` plans the whole film before any scene: its purpose, its
concepts (each idea in the person's words, with the forms it must never
take), its audience and setting, its length and pace, its arc, its visual language,
its motion palette, its references and a row per scene. `D design <dir>`
writes it and a card for every scene in story.json that has none, and never
overwrites one. A card holds the scene's **Content** (its one idea, every
word and figure on screen, why this picture), its **Motion** (the concept,
the ideas weighed, the references, each build, the live motion, the
hand-overs) and its **Voice** (the lines and the word each build lands on),
then four checks, ticked in the order a scene is made:

```markdown
## Checklist
- [x] Content thought through: …
- [x] Motion thought through: …
- [ ] Built and checked: …
- [ ] Voice matches the motion: …
- overruled gutter: the tile bleeds off the frame on purpose
```

`D check` refuses a story with design notes until the plan is written and
every scene has a card with its content. `D review` holds each scene's
checks to evidence: a box counts once its section is written and, for the
last two, once `D scene` has shown the scene since its last change, with its
layout check clean (an issue overruled on the card with its reason aside).
The full video waits until `D review` passes.

## story.json

```json
{
  "title": "Accounts payable, matched in minutes",
  "slug": "acme-ap",
  "theme": "unifyapps",
  "ground": "paper",
  "footer": "Agentic Automation for the Enterprise",
  "scenes": [
    { "id": "title", "type": "title", "data": { "kicker": "Accounts payable", "title": "Every invoice matched,", "em": "in minutes" },
      "say": ["Here's how UnifyApps would take invoice matching off your team's plate."] },
    { "id": "flow", "type": "flow", "ground": "deep",
      "data": { "title": "From inbox", "em": "to posted", "nodes": [{ "title": "Capture" }, { "title": "Match" }, { "title": "Post" }] },
      "short": "An invoice is captured, matched and posted, on its own.",
      "say": ["Follow one invoice.", "It's captured from any channel.", "Matched against the purchase order.", "And posted back to SAP."] }
  ],
  "video": { "voice": { "engine": "edge", "name": "andrew", "rate": "+3%" }, "music": { "on": true, "mood": "warm" }, "cuts": { "sample": ["title", "flow", "end"] } }
}
```

- **`type`**: the scene that draws it: the name of one the story wrote
  (`scenes/<name>.js`), or the kit's `title`, `end`, `screen` or a `ua-`
  standard diagram.
- **`builds`**: for a scene the story writes, how many builds its
  storyboard plans, so its lines are voiced and timed before it exists;
  its file's `steps(data)` must give the same number.
- **`say`**: the lines, in order. The video speaks them; the deck shows
  them as speaker notes, beside the build each one brings in; the slides
  carry them as notes. In the video each build lands on the word that names
  it: the first word of its line that shares a stem with what the build
  shows (a node's title, a point, a figure's number). Braces pin it to a
  word instead: `"We'd cut approvals to {2 days}."` (the braces are never
  said or shown). A line is a string or
  `{ "text", "step"?, "pause"?, "mood"?, "accent"? }`. Each scene has builds
  (its `steps`, from its data: one per item, row or node). With one more line
  than builds, line 1 introduces the scene and each next line brings in the
  next build; with as many lines as builds, each line brings in one; with
  fewer, the builds share out across the lines. `step` pins a line to a build
  (or a list of builds). `pause` is the breath after it in ms (default 380);
  on a scene's last line, the pause before the next scene's first line
  (default 700; 400 when that line runs on with "And", "So", "But" or
  "That"; 1100 when the next scene changes ground).
  `mood`: calm, warm, confident, upbeat, tension, punch, question. `accent`:
  boom, riser or shimmer on that line.
- **`short`**: the scene in one sentence, spoken in the video's sample and
  shorter cuts.
- **`cut`**: how the scene is cut into. `fade` (the default): the scene
  before clears in under 0.2 s just as this one's entrance begins, so the
  two are never seen together. `dissolve`: half a second with both on
  screen, for time passing. `push` (through the lens), `whip`, `blur` (a
  blur swap on one stage), or `cut`, a hard cut that leaves the entrance to
  the scene's own motion. Choose one of these for a reason, such as energy
  or a change of place. An element both scenes mark with the same
  `data-carry` travels across a fade or a hard cut from where it was to
  where it is, and on a fade it is the only thing that crosses
  ([writing a scene](references/scene-authoring.md#joins)).
- **`cutOn`**: a word the cut lands on, so a sentence runs across it. In
  this scene's first line, the words before it are heard over the scene
  before; in the last line of the scene before, its last words run on over
  this one. Left out, the scene arrives just after the last word.
- **`ground`**: `paper` or `deep`, the theme's deep colour (green in the
  UnifyApps theme). The story's `ground` is every scene's unless the scene
  says otherwise: `"paper"` (default) is the light look and `"deep"` the
  dark look. A film keeps one ground throughout unless its plan gives a
  reason to change; a change fades in across the cut like light changing.
- **`hold`**: extra seconds on the scene's last build, in the video.
- **`kind`**: what the story is: `use-case` (a client's problem solved),
  `demo` (a product walkthrough), `overview` (what UnifyApps is, with some
  examples, for a C-suite, a partner or a room new to it) or `teaser`. An
  `overview` shows all nine UnifyApps standard diagrams, in the company
  deck's order; `D check` refuses one without them.
- **`customer`**: for a story made for a customer, `{ "name": "Acme Corp",
  "logo": "assets/acme-logo.png" }`, the logo from the material or
  downloaded from the customer's own site (SVG, or PNG at least 600 px
  wide). The kit sets it beside the UnifyApps logo on the title, in every
  footer and on the end card, in the deck, the slides and the video; on the
  deep ground it is turned white, unless `logoOnDeep` names a version made
  for dark backgrounds. A use-case story always has one; `D check` refuses
  a `customer` without a readable logo file.
- **`without`**: in an overview, a standard scene the person asked to leave
  out, with their words: `{ "ua-engagement": "no partner in the room, skip
  the engagement model" }`. Only the person's own ask leaves one out.
- **`video`**: only the video reads it. `voice.engine` `edge` (the default:
  Microsoft's online neural voices, so every line is sent to Microsoft) or
  `say` (the Mac's own voice: flatter, and nothing leaves the laptop). Edge names: andrew
  (default), ava, brian, emma, sonia, ryan, neerja, prabhat. `rate` +2% to
  +4% sounds natural. `music.mood`: warm (default), calm or bright;
  `"on": false` for none. `captions`: `false` leaves the burned-in
  captions out (the `.srt` is always made). `sfx`: `false` leaves out the
  sounds of the screen. `size`: `1080p` (default) or `4k`; `fps` 30.
  `length`: the length the person asked for, in seconds (120, 300 or 600;
  30 for a teaser); `D check` fails a film more than a fifth off it.

How to write a scene, with the clock's every call, GSAP on the film clock,
shared parts, a product rebuilt in HTML and a complete example:
[writing a scene](references/scene-authoring.md). Where its motion comes
from: [motion ideas](references/motion-ideas.md). What earlier films had to
be made again to fix: [lessons](references/lessons.md). The kit's scenes,
what each needs and how it builds: [scenes](references/scenes.md).
The UnifyApps standard diagrams (the 80/20, the code-first stack, the N+N
problem, assembly-first, the one platform and its Enterprise Context Graph,
the four ideas, the engagement model, the principles) are
scenes of their own, with the company deck's words and motion; a
story that needs one uses it, never a drawing of its own:
[the standard diagrams](references/unifyapps-standards.md).
How the kit moves (easing, transitions, the camera, live motion, sound) and
what makes a video look generated: [motion](references/motion.md).

## The theme

`"theme": "unifyapps"` is the default: gold on warm paper, deep green for the
key moments, Spectral for what is said and Inter for small labels.
`"theme": "vox"` is Vox's explainer look: newsprint with grain, condensed
black headlines, a yellow highlighter swept behind each heading's key words,
black label tags, red for what is wrong and black for the big moments.
`"theme": "kinetic"` is bold type: heavy, tight Inter Tight headlines on the
UnifyApps paper, a gold bar swept behind each heading's key words, set
lighter in italic, and ink for the big moments. UnifyApps with
`"ground": "deep"` is the dark look: near-black forest green throughout,
with gold. The person may choose another look, such as
their client's brand. Then `theme` is an object of these keys, each
optional; a key left out keeps the UnifyApps value:

```json
"theme": { "paper": "#ffffff", "ink": "#0b1f33", "accent": "#0a66c2", "deep": "#0b1f33", "alert": "#c2410c", "serif": "Merriweather", "sans": "Source Sans 3" }
```

- `paper`: the light ground. `ink`: the text on it. The softer text, rules
  and cards are mixed from these two.
- `accent`: the emphasis (kickers, the italic clause, bars, the progress
  line) and the colour of the logo and its mark.
- `deep`: the deep ground; the text on it is drawn from `paper`.
- `alert`: what marks a failure, such as today's tangled wiring.
- `serif`, `sans`: Google Fonts family names.

Read the colours from what the person gave: a hex code they wrote, their
logo, their site or their deck. Name the source of each in the story sheet.
`D check` refuses a theme whose text would be hard to read on its ground.

## facts.json

```json
{ "facts": [
  { "id": "F1", "value": "3,000+", "claim": "invoices a day", "kind": "customer", "source": "Discovery call, 4 Nov 2026, transcript line 212" },
  { "id": "F2", "value": "8 min", "claim": "per exception", "kind": "illustrative", "source": "Our illustration", "basis": "the 24 minutes an exception takes today (call, line 88), less the 16 spent matching by hand" }
] }
```

`kind` is `customer` (they said it), `unifyapps` (an approved UnifyApps fact),
`research` (a published survey or study: its source names the publisher,
the date and who was asked, and the scene's footnote names the publisher),
`plan` (our proposal, not a promise) or `illustrative` (made up to show the
idea, only when the person asked for figures). An illustrative fact carries
its `basis`: how it is worked out from what the person gave. `D check`
refuses a figure in any line or on any screen with no fact whose `value` or
`claim` holds it. It also refuses an illustrative fact with no `basis`, and
warns about a fact no scene shows. A scene that shows an illustrative figure must say so in
its `footnote`. A stats scene always has a footnote. Writing
rules and the UnifyApps facts you may use: [writing](references/writing.md).
A use-case story or overview for one leader follows that leader's file: [a CFO](references/audience-cfo.md),
[a CIO](references/audience-cio.md) or [a CTO](references/audience-cto.md).
The company's own account (its vision, the page for each industry and each
leader, its customer stories) and how a story may use it:
[UnifyApps, from its own site](references/unifyapps-site.md).

## Commands

| Command | What it gives |
| --- | --- |
| `D doctor [--for deck,slides,video] [--fix]` | the tools those outputs need: Chrome for Testing, fonts and GSAP for all; ffmpeg and a voice for the video. `--fix` installs the voice engine and GSAP (one pinned release from npm, checked against npm's checksum) into `~/.nebula/demo-kit/` |
| `D inputs <dir> <files, folders or zips...>` | the material as numbered parts in `inputs/parts/`, each small enough to read whole: zips unpacked, a page's words without its embedded pictures, sound and code, long transcripts split, a PDF as 20-page reads, a film as a sheet of 12 frames for its look and reading sheets of a frame at each change of picture, four to a sheet, for every word and figure on screen (its spoken words come from the captions beside it). Writes the ledger `inputs/parts.json`; from then on `check` refuses the story until `inputs/notes.md` has notes under `## P<n>` for every part |
| `D find <dir> <words...>` | every line of the material holding all the words, as part, file and line |
| `D scenes` | each scene type the kit has and what it needs |
| `D design <dir>` | `design/film.md` and a card for every scene that has none; never overwrites one |
| `D check <dir>` | errors and warnings, and how long a video of each cut would run. Errors include a part of the material with no notes, a film plan or a scene's content not yet written, a line that says a form `design/film.md` § Concepts rules out, a card whose build lands on a word its lines never say, a scene file that breaks the clock rules, a content scene taken from the kit as it stands, two scenes of one type in a row, a UnifyApps standard diagram drawn again with another scene, and a full video more than a fifth off `video.length` |
| `D scene <dir> <id>[,<id>...] [--deck]` | one scene as its author needs to see it, on the voice's clock (its voiced lines, else their estimate), in `build/scenes/<id>/`: each build settled with the layout check, frames at 0, 25, 50, 85 and 100% of each build's window, a strip across its hold, and for each build its word, its window and how long its motion takes. Exits 1 on a layout issue or a build that overruns its window |
| `D review <dir>` | each scene's four checks as its card ticks them, held to evidence made after the scene's last change; exits 1 until all hold |
| `D deck <dir> [--open]` | `out/<slug>.html`, and in `build/deck/`: a still of every build, `contact-<n>.jpg` sheets, `storyboard.html` and the layout check |
| `D slides <dir> [--open]` | `out/<slug>.pptx`: the deck in PowerPoint's own text, shapes and pictures, its fonts inside; each build a click with the deck's motion, and a new slide that morphs in where a build replaces what is on screen. Makes the deck first when it is out of date |
| `D video <dir> --cut <c> [--scenes a,b] [--size 4k] [--no-music] [--open]` | the MP4, captions and a preview page; for `full`, a share copy under 30 MB and a versions folder. The full film waits for `D review` in a story with design notes |
| `D plan <dir> --cut <c> [--estimate]` | the video's timeline, voiced (`--estimate`: at the voice's pace, nothing sent), and its cue sheet `build/<cut>/cues.md`: each build's time, its window and the words said in it, then every join, the last line of one scene beside the first of the next with the pause between them. Runs before the scenes are written, on the builds story.json plans |
| `D seams <dir> [--cut <c>] [--estimate]` | every join between two scenes in `build/<cut>/seams/`: five frames across its cut with the words said there, its pause, its cut, what it carries, and how long both scenes are seen at once. Exits 1 on a bare frame (next to nothing on it: the scene before has gone and the next has not arrived) or a doubled join (both scenes seen together for more than 0.2 s on a cut other than a dissolve) |
| `D shot <dir> <page.html> [--out <name>.png] [--width 1440] [--height 900] [--scale 2]` | a PNG of a screen written as HTML, in `assets/`; `--scale 2` writes `<name>@2x.png`, sharp under a zoom |

Video cuts: `sample` (the scenes in `video.cuts.sample`, or the first, one
content scene and the end, each speaking its `short`; 20 to 30 s), `short`
(every scene speaking its `short`, about a third of the length), `full`.
`--estimate` times the lines at the voice's pace without voicing them.

## The deck

One HTML file, about 1 MB plus its pictures, with its fonts, pictures and
logo inside, so it plays offline, from email, or uploaded to a page with a
strict security policy. It opens on the title card as it enters. Each click,
→ or Space brings in the next build, animated as in the video; ← goes back.
A scene is entered together with its first build, so the deck never rests on
a bare heading.
Its controls (a bar that hides while the deck is watched) and keys:

| Key | Does |
| --- | --- |
| → Space Enter, click, swipe | next build |
| ← | back |
| Shift → / Shift ← | next or previous scene |
| Home / End | first or last scene |
| a number, then Enter | that scene |
| O | all scenes, as thumbnails |
| N | speaker notes: the scene's lines, the current build's lit |
| P | presenter view in a second window: notes, the next build, a timer |
| F | full screen |
| B | black screen |
| A | play on its own, each build held for its lines, looping |
| M | motion off: each scene shown whole, scene by scene |
| ? | the keys |

The address carries the place (`#4.2` is scene 4, build 2), so a reload or a
shared link opens there. Motion is off by default for a viewer whose system
asks for reduced motion.

## Reading the results

- **Layout check**: `deck` reads every build's settled frame and exits 1
  on any of these (`slides`, laid out from the deck, reports the same): text that leaves the frame (`off-frame`) or
  enters the side margins (`gutter`), is clipped, is under 18 px, sits on
  other text (`overlap`), spills out of its card (`spill`), or ends a heading
  on one word alone (`orphan`); content taller than the space it has
  (`overflow`); repeated cards or columns spaced unevenly (`uneven-gap`),
  holding their text at different insets (`uneven-padding`), or a row of
  cards not centred in its space (`off-centre`); and a column of blocks a few
  pixels off one left edge (`misaligned`); a letter whose ink is cut by the
  mask its word rises through (`cut-letter`); text of another scene still on
  screen when a build has settled (`two-scenes`); and, read frame by frame
  across every cut between scenes, text of the leaving scene lying on text
  of the arriving one (`cut-overlap`, with that frame kept as
  `build/deck/cut-<from>-<to>.jpg`). Headings and large lines wrap to balanced lines already; a no-break
  space (`\u00a0` in story.json) keeps two words together. Fix each one in story.json (shorter
  words, fewer items, or `layout: rows` on a points scene) and make it
  again. Then read the contact sheets yourself: the check cannot see
  balance, crowding or a wrong emphasis.
- **Video checks**: the build prints length, size, frame rate, loudness and
  true peak, and exits 1 when one misses: the length within half a second of
  the plan, 1920 x 1080 (3840 x 2160 with `--size 4k`), -16 LUFS within 1.5,
  and a peak at most -1.5 dB. It also prints the motion: how much of the
  picture has nothing moving, the longest such stretch, how many builds
  landed on their word and how many sounds play. A stretch over 3 s with
  nothing moving, before the end card, fails the build. The fix is in the
  story, never padding: shorter lines, or a build for each thing a long
  line names ([writing](references/writing.md) § Lines for a video).
- **Speed**: a 10-scene deck builds in about 5 s and its slides in about
  3 s more (the first time a font is fetched, a few seconds more). A 20 s video sample builds in about 35 s, a 2 to 3 minute video in
  about two minutes, and a rebuild voices only the lines that changed.

## The UnifyApps logo

Never draw, trace or rebuild the UnifyApps logo, in a scene or in a mock-up.
The kit ships the real files, in
`${CLAUDE_PLUGIN_ROOT}/skills/demo-kit/scripts/runtime/assets/`:

- `logo-gold.svg` is the brand logo: the gold dot-spiral mark and the
  UnifyApps wordmark, without the ™ mark. The story page uses it for the
  footer and the wordmark, and draws its animated mark from this file's own
  dots, so the mark on the title and end cards is the logo, dot for dot. A
  theme changes only its colour, to the theme's `accent`.
- `logo-product.svg` is the product's logo, the one the UnifyApps app and
  builder show. For a mocked UnifyApps screen, copy it into the story's
  `assets/` and put it in an `<img>`.
