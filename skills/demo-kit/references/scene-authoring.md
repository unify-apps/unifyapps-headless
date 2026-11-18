# Writing a scene

A story writes its own scenes: one JavaScript file each, in
`<story>/scenes/<name>.js`, used in story.json as `"type": "<name>"`. The
file draws the scene and moves it on the film's clock, and the same file
plays in the deck, the PowerPoint and the video. Nothing limits the motion
but the clock rules below: draw what the idea needs, with HTML, CSS, SVG or
a canvas.

## Contents

- [The file](#the-file)
- [The frame](#the-frame)
- [Markup](#markup)
- [Motion](#motion)
- [GSAP on the film clock](#gsap-on-the-film-clock)
- [The clock rules](#the-clock-rules)
- [Builds and the voice](#builds-and-the-voice)
- [Shared parts](#shared-parts)
- [A product rebuilt in HTML](#a-product-rebuilt-in-html)
- [What the kit still does for a scene](#what-the-kit-still-does-for-a-scene)
- [Joins](#joins)
- [In each output](#in-each-output)
- [A complete scene](#a-complete-scene)
- [Looking at it](#looking-at-it)

## The file

```js
UA.scene('<name>', {
  need: ['items'],                 // data keys it cannot do without
  max: { items: 5 },               // the most a list may hold
  steps: (d) => d.items.length,    // how many builds (each a click in the deck)
  labels: (d) => d.items.map((it) => it.title),  // one string per build: what it shows, in words
  settle: (d) => 1400,             // ms its entrance takes before it reads (1500 when left out)
  camera: false,                   // optional: the video's camera leaves it to its own moves
  pops: false,                     // optional: no soft pop as each build lands; it lists its own sounds
  css: `.sc-<name> .row { … }`,    // its styles, every rule under .sc-<name>
  build: (d, U) => `<div class="row">…</div>`,   // its markup, from data
  anim(c, d, U) { … },             // its motion, on the clock
});
```

The file name, the `UA.scene` name and the story's `type` are the same, and
never a kit scene's name (`D scenes` lists those). The file defines exactly
one scene. It may start from a kit scene's markup and give it motion of its
own, `UA.scene('acme-flow', { ...UA.scenes.flow, anim(c, d, U) { … } })`;
`D check` refuses one that keeps the kit's motion as it is.

Every word and figure the scene shows comes from its `data` in story.json,
so `D check` can hold each figure to its fact. The file holds the drawing
and the motion, never the story's words.

## The frame

- **1920 x 1080**, drawn on the theme's paper (or its deep ground on a
  `deep` scene, where the root has `.gr-deep`).
- **Side margins of 112 px** (`var(--side)`): text stays inside them.
- **The heading band** starts at `top: 92px` (`.hd` does this).
- **The foot**: the footnote sits at `bottom: 84px`, the footer at 34 px, and
  in a video the captions over the bottom 150 px. Keep the scene's content
  above about 900 px.
- **Text is 18 px or more**; body text 23 px or more reads on a projector.
- **Colours only from the theme's variables**, never a literal, so every
  theme and the dark look work: `--paper`, `--card`, `--ink`, `--ink2`,
  `--body`, `--muted`, `--rule`, `--accent`, `--deep`, `--deep2`, `--alert`,
  and on the deep ground `--on-deep`, `--on-deep-body`, `--on-deep-rule`,
  `--accent-on-deep`. Fonts: `var(--serif)` for what is said,
  `var(--sans)` for small labels.
- Shared classes: `.kicker` (small accent label), `.h2` (the heading, 66 px),
  `.lbl` (a small caps label), `.body` (28 px text), `.area` (the content
  box between the heading and the foot; `D scene` reports content taller
  than it as `overflow`).

## Markup

`U` is the page's toolkit, handed to `build` and `anim`:

| Call | Gives |
| --- | --- |
| `U.esc(s)` | the text, safe in markup |
| `U.words(s)` | the text as word spans (`.w > span`), each able to rise through its own mask |
| `U.line(title, em)` | a heading's words with its accent clause in `<em>` |
| `U.head(d, { carry })` | the kit's heading from `kicker`, `title`, `em`, with the kit's entrance (below); `carry` names it so the next scene's heading takes its place ([joins](#joins)) |
| `U.asset(src)` | a picture of the story's `assets/` (name it in data, e.g. `"image": "assets/queue@2x.png"`) |
| `U.EASE`, `U.clamp`, `U.outCubic` | the eases by name, and two helpers for motion you compute |

Write a heading of your own (`<h2 class="h2">${U.line(d.title, d.em)}</h2>`
outside `.hd`) to give it an entrance of your own; `U.head(d)` takes the
kit's. The footnote (`data.footnote`) is added under every scene for you.

The scene's markup sits in a camera layer, `.lens`, inside the scene's root.
Place what moves with `left`, `top`, margins or a wrapper, never with a CSS
`transform`: an animation that moves it replaces that transform, and the
element jumps.

## Motion

`c` is the scene's clock. Every call places motion at an absolute time in
ms: `c.start` is the scene's entrance, `c.t(k)` the moment build `k` lands
(the voice's word in the video, the click in the deck).

| Call | Does |
| --- | --- |
| `c.q(sel)`, `c.qa(sel)` | one element, or all, inside the scene |
| `c.tw(els, keyframes, { at, dur, stagger, ease })` | any Web Animation: transform (3D too, under a parent's `perspective`), opacity, filter, `clipPath`, colour, background, `strokeDashoffset`, `offsetDistance` along a CSS `offset-path` |
| `c.fadeUp`, `c.fade`, `c.pop`, `c.rise`, `c.snap`, `c.slide`, `c.grow` | the kit's arrivals, each `(els, at, { dur, stagger, … })` |
| `c.draw(paths, at, { dur, stagger })` | an SVG stroke drawn along its length |
| `c.words(el, at, { stagger, dur })`, `c.headline(el, at, 'rise' or 'blur' or 'ink')` | a line's words arriving one after another |
| `c.count(el, { at, dur, from, to, prefix, suffix, decimals })` | a number counting, formatted like its fact |
| `c.tick((ms, t) => { … })` | anything computed from the clock, every frame: a position along a path, a canvas, a morph between two shapes |
| `c.live((k) => { … }, from)` | motion that keeps a held scene alive, `k` ms after `from`; it never delays a build |
| `c.current`, `c.travel`, `c.halo`, `c.ping`, `c.sheen`, `c.spin` | the kit's live motion: dashes along a wire, dots riding a path, a glow, a ring, a band of light, a turn |
| `c.gs`, `c.loops`, `c.at(k, s)` | the scene's GSAP timelines on the film clock, and build `k`'s time in their seconds (below) |
| `c.pointer({ from })` | a pointer a person moves: `.to([x, y], at)` glides on a bowed path and answers when it arrives, `.click(at)` presses with a click sound |
| `c.type(el, text, { at, dur })` | text typed into `el` key by key from `at`, a key sound each; answers when it is done |
| `c.rand()` | a seeded random number: the same scatter every frame and every run |
| `c.sfx(kind, at)` | a sound in the video at the moment its picture happens: `pop`, `click`, `key`, `whoosh` |
| `c.ground`, `c.steps`, `c.end` | the scene's ground, its number of builds, when it leaves |

Eases by name (`ease:`): `out` for an arrival, `cine` for a camera or a
long travel, `in` for an exit, `back` for a pop with one small overshoot,
`soft` for opacity and colour, `glide`, `drop`, `ui`, `snap`, `linear`, or
any CSS easing. The numbers that make motion look made (stagger, overlap,
exits shorter than entrances) are in [motion](motion.md).

A `c.tick` callback runs every frame from the clock. Read the time, compute
the state, and set it: a position, a path's length, a canvas drawing. It
must give the same frame for the same time, whatever came before.

## GSAP on the film clock

For motion with many parts, GSAP is there with its plugins: DrawSVG,
MotionPath, MorphSVG, SplitText, ScrambleText, Text, CustomEase and
Physics2D (`D doctor --fix` fetches it once; a page carries it only when a
scene uses it). It plays from the film clock, never the wall clock, so any
frame draws the same in any order:

- `c.gs` is the scene's timeline, in **seconds from the scene's start**;
  `c.at(k)` is when build `k` lands, `c.at(k, 0.3)` 0.3 s after it.
  `c.gs.to(el, { drawSVG: '100%', duration: .8, ease: 'cine' }, c.at(2))`.
- `c.loops` holds endless motion (`repeat: -1`): a dot lapping a loop, a
  flow along lanes. It keeps going while the deck holds a build.
- Set starting states with `gsap.set` at the top of `anim`. Never
  `gsap.to`, `gsap.from` or `gsap.timeline` (the wall clock), and no
  callbacks (`onComplete`, `onStart`, `.call()`, `.add(() => …)`): a frame
  drawn out of order skips or repeats them. A change at a moment is a tween
  or a `.set` at that time. `onUpdate` that writes what a tween computed (a
  counter's text) is fine.
- The kit's eases work by name in GSAP too: `cine`, `out`, `in`, `soft`,
  `glide`, `drop`, `ui`, `snap`.
- Patterns that make a scene rich: a path that morphs because two shapes
  share their commands (`attr: { d: OPEN }`); parts staggered out from the
  middle (`stagger: { each: .05, from: 'center' }`); dots riding a path
  (`motionPath: { path, align: path, alignOrigin: [.5, .5] }` on `c.loops`);
  a heading split into words that tip up (`new SplitText(el, { type: 'words' })`);
  a counter and its scale tweened with the same start and length.
- Keep simple arrivals (a fade, a rise, a pop) on `c.tw`: PowerPoint plays
  those as its own entrance effects. What GSAP moves shows in PowerPoint
  where it is on each click.

## The clock rules

Any frame of the film is drawn on its own, out of order, so motion comes
only from the clock. `D check` refuses a scene file that breaks these, and
names the line to change:

- no timers: `setTimeout`, `setInterval`, `requestAnimationFrame`;
- no `Math.random` (use `c.rand()`) and no wall clock (`Date.now`,
  `performance.now`, `new Date`);
- no CSS `transition`, `animation` or `@keyframes`: animate with `c.tw`;
- nothing from the internet: no `fetch`, no `url(https:…)`, no remote `src`.
  A picture goes in `assets/` and its path in data. The deck plays offline;
- no GSAP tween on the wall clock and no GSAP callbacks (above).

## Builds and the voice

`steps(data)` is how many builds the scene has; build 0 is its entrance.
`labels(data)` names what each build shows, one string per build: in the
video, a build lands on the first word of its line that shares a stem with
its label, so a build labelled "Match" lands on "matched". Write labels in
the words the lines will say. A build no word names lands where its line
starts; `D scene` says which builds found a word.

The story plans how many builds a written scene has (`"builds"` in
story.json), so its lines are voiced before the scene exists; `steps(data)`
must give that number. The cue sheet (`build/full/cues.md`, from
`D plan <story> --cut full`) gives each build its **window**, from its word
to the next build's, and the words said inside it with their offsets. Time
the motion to it:

- the main motion of a build is done by 85% of its window, and in a window
  under a second it takes 0.6 s or less;
- a build may land several beats on several words of its line: "on 'ten'
  the figure counts to 10×, on 'twenty' the '–20' opens";
- a move that starts in the last 0.4 s before the next build is that
  build's lead-in (a pointer setting off toward the next button), not this
  one's.

Reveal across the scene: a new beat every 2 to 3 seconds. A scene whose
builds all land in its first line, then sit through a long second line,
reads as a slide.

## Shared parts

What every scene of a film draws the same way (the actors' badges, chips,
the motif, a product's shell) is built once in `<story>/scenes/_<name>.css`
and `_<name>.js`, before the scenes. The page loads them before every
scene; the clock rules hold for them too. A shared builder lives on
`UA.film`:

```js
// scenes/_film.js
UA.film.badge = (kind, label, U) => `<span class="film-badge ${kind}"><i></i>${U.esc(label)}</span>`;
```

A scene calls `UA.film.badge('person', d.person, U)` in its `build`, and
never draws its own version.

## A product rebuilt in HTML

A screenshot can only be zoomed, clicked and swapped. A screen rebuilt in
HTML can change on every word: a status flips, a counter ticks, a row
arrives, a time strip moves, a pipeline's steps turn green one by one.

- Measure the real screenshot before writing a line: its colours, type
  sizes and spacing, and the scale it was taken at. Build its shell once in
  the shared parts so every scene of it matches.
- Wrap the product in `.ua-app`: it fills the frame edge to edge with the
  product's own layout and denser type (16 px and up), so the layout check
  does not hold it to a slide's margins.
- Move through it as a person would: `c.pointer()` glides to what the voice
  names and clicks it; `c.type()` types a request inside its window. While
  the voice explains a held screen, let the pointer drift toward what comes
  next, so the frame never freezes.
- Illustrative data only, and the footnote "Built to match the product ·
  illustrative data".

## What the kit still does for a scene

- **The cut in.** The kit fades into each scene: the scene before clears
  in under 0.2 s just as this scene's own entrance begins, so the two are
  never seen together. A scene that makes its own entrance asks
  for a hard cut in story.json, `"cut": "cut"`: the scene before is gone on
  the frame this one appears, and the scene's own motion does the rest (a
  wipe, a zoom out of a detail, a line drawn across the frame).
- **The camera.** In the video, the camera punches in a little on each
  build. `camera: false` turns it off for a scene that moves its own:
  animate an inner wrapper's `transform` (a slow push to a detail, a pan
  across a canvas wider than the frame).
- **A pop as each build lands.** `pops: false` turns it off; then list the
  scene's own sounds with `c.sfx` at the moment each happens.
- **The mark.** The logo's animated mark drifts to a corner on content
  scenes. A scene places it with `mark: { x, y, s, a, spin }` in its
  definition (`a: 0` hides it).
- **The footer and logos.** The footer shows on every content scene. An
  `<img class="ua-word">` shows the UnifyApps wordmark, with the customer's
  logo beside it in a story made for a customer.

## Joins

A scene is a shot in one film, not a slide: it arrives from the scene before
and hands over to the next. The scene's card says how; these are the kit's
parts for it.

- **Arrive with the picture.** The scene before has cleared by the time
  this one's entrance begins. Bring the scene's subject in with its
  entrance, not only its heading, and let the builds add to it: a scene
  that opens on a bare heading shows it alone. `D seams` marks a frame with
  next to nothing on it, and two scenes seen at once.
- **Carry an element across.** Give an element the same
  `data-carry="<name>"` in both scenes, at rest where each has it: still at
  the end of the scene before, and there from the start of this one with no
  entrance of its own. On a fade or a hard cut the kit moves it from where
  it was to where it is in 0.45 s, fast at first and landing gently,
  keeping its proportions: a process line that grows two more stages, a
  card that becomes the next scene's header, a ticket that rides into the
  next screen. On a fade it is the only thing that crosses: the rest of the
  scene before clears, and the rest of this one comes in after. Put it on
  an HTML element or a whole `<svg>`. The kit measures both places, so a
  camera or a parent's transform is fine. A name on one side only shows in
  the layout check.
- **Change the heading in place.** `U.head(d, { carry: 'head' })` in both
  scenes: the new words turn to ink where the old ones stood, and a kicker
  that says the same stays put. A heading is optional; leave it out where
  the voice and the picture already say it.
- **Land the cut on a word.** `cutOn` in story.json, set by the director:
  the scene arrives on that word, so a sentence runs across the cut and its
  first words may be heard over the scene before.
- **Other cuts.** A `push`, `whip` or `blur` moves the whole picture and
  carries nothing; keep them for a change of place or a burst of energy. A
  `dissolve` shows both scenes for half a second; keep it for time passing.

## In each output

- **The deck** steps the scene build by build: each click plays from one
  build to the next, and the live motion keeps going while a build is held.
- **The video** plays it on the voice's clock, with the camera, captions
  and sounds.
- **The PowerPoint** reads the scene at each build: text, boxes and SVG
  shapes become PowerPoint's own shapes, with an entrance read from each
  Web Animation; a canvas, a filter or a mask becomes a picture. Motion
  drawn frame by frame in `c.tick`, or by GSAP, shows as where it is on
  each click.

## A complete scene

A route the deal travels: the road is drawn only as far as the deal has
come, each stop lights as it arrives, and once the route is whole, value
keeps flowing along it.

```js
UA.scene('money-path', {
  need: ['stops'],
  max: { stops: 5 },
  steps: (d) => d.stops.length,
  labels: (d) => d.stops.map((s) => `${s.title} ${s.sub ?? ''}`),
  settle: () => 1300,
  camera: false,
  css: `
.sc-money-path .qh { position: absolute; left: var(--side); right: var(--side); top: 92px; }
.sc-money-path svg { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: visible; }
.sc-money-path .ghost { fill: none; stroke: var(--rule); stroke-width: 3; stroke-dasharray: 2 12; }
.sc-money-path .route { fill: none; stroke: var(--accent); stroke-width: 6; stroke-linecap: round; }
.sc-money-path .stn { position: absolute; width: 0; height: 0; }
.sc-money-path .dot { position: absolute; left: -17px; top: -17px; width: 34px; height: 34px; border-radius: 50%; background: var(--paper); border: 4px solid var(--deep2); box-sizing: border-box; }
.sc-money-path .lab { position: absolute; width: 320px; text-align: center; }
.sc-money-path .lab .t { font: 500 32px/1.2 var(--serif); color: var(--ink); }
.sc-money-path .lab .s { margin-top: 8px; font: 400 23px/1.35 var(--serif); color: var(--body); }
.sc-money-path .tok { position: absolute; width: 0; height: 0; }
.sc-money-path .tok span { position: absolute; transform: translate(-50%, -50%); padding: 10px 20px; border-radius: 999px; background: var(--deep); color: var(--on-deep); font: 600 19px/1 var(--sans); letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }`,
  build(d, U) {
    const route = 'M 300 600 C 560 360, 760 900, 1000 640 S 1420 420, 1620 720';
    return `<header class="qh"><div class="kicker">${U.esc(d.kicker ?? '')}</div><h2 class="h2">${U.line(d.title, d.em)}</h2></header>
<svg viewBox="0 0 1920 1080"><path class="ghost" d="${route}"/><path class="route" d="${route}"/></svg>
${d.stops.map((s, i) => `<div class="stn" data-i="${i}"><i class="dot"></i></div><div class="lab" data-i="${i}"><div class="t">${U.esc(s.title)}</div>${s.sub ? `<div class="s">${U.esc(s.sub)}</div>` : ''}</div>`).join('')}
<div class="tok"><span>${U.esc(d.token ?? 'Deal')}</span></div>`;
  },
  anim(c, d, U) {
    const route = c.q('.route'), len = route.getTotalLength(), n = d.stops.length;
    const at = d.stops.map((_, i) => (n === 1 ? 0 : (len * i) / (n - 1)));
    const pt = (l) => route.getPointAtLength(l);
    // stops sit on the route, their labels above and below in turn
    c.qa('.stn').forEach((el, i) => { const p = pt(at[i]); el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; });
    c.qa('.lab').forEach((el, i) => { const p = pt(at[i]); el.style.left = `${p.x - 160}px`; el.style.top = `${i % 2 ? p.y + 46 : p.y - 46 - el.offsetHeight}px`; });
    // its own heading entrance: the kicker closes up, the words sharpen in from the left
    c.tw(c.q('.qh .kicker'), [{ opacity: 0, letterSpacing: '.4em' }, { opacity: 1, letterSpacing: '.17em' }], { at: c.start, dur: 800 });
    c.tw(c.qa('.qh .w > span'), [{ opacity: 0, filter: 'blur(8px)', transform: 'translateX(-24px)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { at: c.start + 150, dur: 620, stagger: 70 });
    c.draw(c.q('.ghost'), c.start + 300, { dur: 1100 });
    // how far the deal has come along the route at time t
    const far = (t) => {
      let l = 0;
      for (let k = 2; k <= n; k++) { const s = c.t(k) - 150; if (t >= s) l = at[k - 2] + (at[k - 1] - at[k - 2]) * U.outCubic(U.clamp((t - s) / 1100)); }
      return l;
    };
    route.style.strokeDasharray = `${len + 2}`;
    const tok = c.q('.tok');
    c.tick((_, t) => {
      const l = far(t);
      route.style.strokeDashoffset = `${len + 2 - l}`;
      const p = pt(l); tok.style.left = `${p.x}px`; tok.style.top = `${p.y}px`;
    });
    c.pop(tok, c.t(1) - 100);
    d.stops.forEach((_, i) => {
      const arrive = c.t(i + 1) + (i ? 900 : 0);
      c.pop(c.q(`.stn[data-i="${i}"]`), arrive - 150);
      c.tw(c.q(`.lab[data-i="${i}"]`), [{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0%)' }], { at: arrive, dur: 650 });
      c.ping(c.q(`.stn[data-i="${i}"] .dot`), arrive + 500, { period: 2800, reach: 16, stagger: i * 300 });
    });
    c.travel(route, c.t(n) + 1400, { n: 3, dur: 4200, r: 6 });
  },
});
```

With, in story.json:

```json
{ "id": "path", "type": "money-path", "cut": "cut",
  "data": { "kicker": "How it transacts", "title": "Bought on Marketplace,", "em": "run in their account",
    "stops": [{ "title": "Marketplace", "sub": "they buy, the commit draws down" }, { "title": "Their AWS account", "sub": "deployed in their own VPC" }] },
  "say": ["Follow the money.", "They buy on {Marketplace}.", "We deploy in {their AWS account}."] }
```

## Looking at it

`D scene <story> <id>` plays the scene on the voice's clock (its voiced
lines, or their estimate before they are voiced; `--deck` for the deck's
even builds) and shows it as its author needs to see it, in
`build/scenes/<id>/`:

- `build-<k>.jpg`: each build settled, full size, with the layout check;
- `motion-<k>.jpg`: frames at 0, 25, 50, 85 and 100% of each build's
  window and the build settled, the first strip from the moment the scene
  before starts to leave;
- `hold.jpg`: four frames across three seconds of the hold, the live
  motion;
- for each build, the word it lands on, its window and how long its motion
  takes, and an `overrun` issue when it does not finish inside its window.

At 0% nothing of the build shows yet; by 85% it has landed. A strip whose
25% frame already shows the end is too fast; one still moving at 85% lands
late; two frames far apart with nothing between are a jump. `D review`
holds the scene's checks to these files, so a scene changed after it was
looked at is looked at again.
