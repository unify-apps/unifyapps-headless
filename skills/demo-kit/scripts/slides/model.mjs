// One scene as a slide: from what slides/layout.js read at each build (where each piece sits and how it looks) and the
// page's own motion, the shapes of the slide, each with the build it comes in on, the effect that brings it, and any
// move, dim or exit on a later build. Pure: no page, no files.

const ENTER_DEFAULT = { effect: { name: 'fade' }, delay: 0, dur: 450 };
const clampDur = (ms) => Math.round(Math.min(1500, Math.max(250, ms || 500)));

/**
 * sources: [{ n, kind, foot, title }] from prepare(); frames: one per build, each the measure() of every source (null
 * when it is not on screen); anims: per source, the page's motion on it; clock: { start, end, cues, ground, id, type }.
 * Returns { id, type, ground, cut, builds, items: [{ kind, n, title, foot, from, at, m, opacity, enter, exit, dims, moves }] }:
 * `from` the build it comes in on, `at` the build `m` (how it is drawn) was read at.
 */
export function slideModel({ sources, frames, anims, clock }) {
  const builds = frames.length - 1;
  const items = [];
  sources.forEach((s, j) => {
    let cur = null;
    const close = (k) => { if (k != null) cur.exit = { build: k, ...leaving(anims[j], windowOf(clock, k), clock, k) }; items.push(cur); cur = null; };
    for (let k = 0; k <= builds; k++) {
      const m = frames[k][j];
      if (!m) { if (cur) close(k); continue; }
      if (cur) {
        if (same(s.kind, cur.last, m)) { cur.seen.push([k, m]); cur.last = m; continue; }
        if (moved(s.kind, cur.last, m)) { cur.moves.push({ build: k, dx: m.rect.x - cur.m.rect.x, dy: m.rect.y - cur.m.rect.y, ...moving(anims[j], windowOf(clock, k), clock, k) }); cur.seen.push([k, m]); cur.last = m; continue; }
        // it changed in place: the old one leaves as the new one comes in, on the same build
        close(k);
      }
      cur = { kind: s.kind, n: s.n, title: s.title, foot: s.foot, from: k, m, last: m, seen: [[k, m]], moves: [], dims: [], enter: entering(s, anims[j], windowOf(clock, k), clock, k, m), exit: null };
    }
    if (cur) close(null);
  });
  for (const it of items) {
    // drawn at its brightest; a build that dims it (or brings it back) is an emphasis to that much of it
    it.opacity = Math.max(...it.seen.map(([, m]) => m.opacity));
    // where it is drawn from: where it first sits when it moves, else where it shows best
    [it.at, it.m] = it.moves.length ? it.seen[0] : it.seen.find(([, m]) => m.opacity === it.opacity);
    let was = 1;
    for (const [k, m] of it.seen) {
      const to = Math.round((m.opacity / it.opacity) * 100) / 100;
      if (Math.abs(to - was) > 0.08) { it.dims.push({ build: k, to, ...dimming(anims[it.n], windowOf(clock, k), clock, k) }); was = to; }
    }
    it.states = it.seen.map(([k, m]) => ({ k, opacity: m.opacity }));
    delete it.seen; delete it.last;
  }
  return { id: clock.id, type: clock.type, ground: clock.ground, cut: clock.cut, builds, items };
}

/**
 * A scene as one slide or several: a build that takes something away (a stage card giving way to the next, a number
 * turning into another) starts a new slide, which morphs from the one before, so no slide holds two states on top of
 * each other. Each slide keeps the scene's builds from where it starts as its own clicks, and draws what is already
 * there as it stands then: dimmed, or moved, as it was.
 * Returns [{ ...scene, part, from, builds, items }]: `from` is the scene's build the slide starts at, and each item's
 * `unit` the unit it travels in (null for none).
 */
export function slidesOf(scene) {
  const unit = unitsOf(scene.items);
  // a build cuts to a new slide when what it takes away shows through what comes in after it; anything else that
  // leaves (a highlight moving on, a label giving way, a bar under the longer one that replaces it) leaves by its exit
  const order = new Map(scene.items.map((it, i) => [it, i]));
  const hides = (y, x) => order.get(y) > order.get(x) && y.kind === x.kind && contains(y.m.rect, x.m.rect) && (!/text/.test(x.kind) || y.m.text === x.m.text);
  // (or moves away from under what comes in, which the next slide's morph then carries)
  const leaves = scene.items.flatMap((x) => [...(x.exit ? [[x, x.exit.build, x.m.rect]] : []), ...x.moves.map((mv, i) => [x, mv.build, shift(x.m, x.moves[i - 1]?.dx ?? 0, x.moves[i - 1]?.dy ?? 0).rect])]);
  const cuts = [...new Set(leaves.filter(([x, k, r]) => scene.items.some((y) => y !== x && y.from >= k && overlap(r, y.m.rect) && !hides(y, x))).map(([, k]) => k))]
    .filter((k) => k > 0 && k <= scene.builds).sort((a, b) => a - b);
  const starts = [0, ...cuts];
  return starts.map((a, part) => {
    const b = starts[part + 1] ?? scene.builds + 1;
    const items = scene.items.filter((it) => it.from < b && (!it.exit || it.exit.build > a)).map((it) => {
      const shown = it.states.filter((x) => x.k <= a).at(-1);
      const was = it.dims.filter((d) => d.build <= a).at(-1)?.to ?? 1;
      const at = it.moves.filter((mv) => mv.build <= a).at(-1);
      const [x0, y0] = at ? [at.dx, at.dy] : [0, 0];
      return {
        ...it,
        m: at ? shift(it.m, x0, y0) : it.m,
        opacity: it.from < a && shown ? Math.round(it.opacity * was * 1000) / 1000 : it.opacity,
        from: Math.max(0, it.from - a),
        // what was already on screen stands still; what this build brings comes in as the slide arrives
        enter: it.from < a ? null : it.enter,
        exit: it.exit && it.exit.build < b ? { ...it.exit, build: it.exit.build - a } : null,
        dims: it.dims.filter((d) => d.build > a && d.build < b).map((d) => ({ ...d, build: d.build - a, to: Math.min(1, Math.round((d.to / was) * 100) / 100) })),
        moves: it.moves.filter((mv) => mv.build > a && mv.build < b).map((mv) => ({ ...mv, build: mv.build - a, dx: mv.dx - x0, dy: mv.dy - y0 })),
        unit: unit.get(it) ?? null,
      };
    });
    return { ...scene, part, from: a, builds: b - 1 - a, items };
  });
}

/** Effects that start within this many milliseconds of each other in a build play together. */
export const TOGETHER = 150;

/**
 * Pieces side by side in the page that come in on the same build, the same way and together, and never change after
 * (a card's box, title and line), as one unit: each named by its first piece's number. A unit is one group on every
 * slide of its scene and one effect, so a click is a few effects, not one per piece, and Morph carries the group.
 */
function unitsOf(items) {
  const out = new Map();
  let run = [];
  const close = () => { if (run.length > 1) for (const it of run) out.set(it, run[0].n); run = []; };
  for (const it of items) {
    const still = it.enter && it.kind !== 'path' && !it.title && !it.exit && !it.dims.length && !it.moves.length && it.enter.effect?.by !== 'word';
    const head = run[0];
    if (still && head && it.from === head.from && JSON.stringify(it.enter.effect) === JSON.stringify(head.enter.effect) && it.enter.delay - head.enter.delay <= TOGETHER) { run.push(it); continue; }
    close();
    if (still) run.push(it);
  }
  close();
  return out;
}

/** Whether two boxes share more than a sixth of the smaller one. */
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 && w * h > Math.min(a.w * a.h, b.w * b.h) / 6;
}

/** Whether box a holds box b, give or take two pixels. */
const contains = (a, b) => a.x <= b.x + 2 && a.y <= b.y + 2 && a.x + a.w >= b.x + b.w - 2 && a.y + a.h >= b.y + b.h - 2;

/** A measured piece moved by dx, dy pixels. */
function shift(m, dx, dy) {
  const move = (r) => r && { ...r, x: r.x + dx, y: r.y + dy };
  return {
    ...m, rect: move(m.rect), content: move(m.content),
    lines: m.lines?.map((l) => ({ ...l, top: l.top + dy, bottom: l.bottom + dy, left: l.left + dx, right: l.right + dx })),
    d: m.d?.map(([c, ...v]) => [c, ...v.map((n, i) => n + (i % 2 ? dy : dx))]),
    from: m.from && [m.from[0] + dx, m.from[1] + dy], to: m.to && [m.to[0] + dx, m.to[1] + dy],
  };
}

// a build's motion may start a little before its cue (a line starts drawing as the dot before it lands)
const EARLY = 200;

/** The page time a build's motion starts from, and the window its motion starts in. */
export function windowOf(clock, k) {
  const { start, end, cues } = clock;
  return { base: k === 0 ? start : cues[k], lo: k === 0 ? start - 400 : cues[k] - EARLY, hi: k + 1 < cues.length ? cues[k + 1] - EARLY : end };
}

const near = (a, b, d = 1.5) => Math.abs(a - b) <= d;
const sameSize = (a, b) => near(a.rect.w, b.rect.w, 2) && near(a.rect.h, b.rect.h, 2);
const samePlace = (a, b) => near(a.rect.x, b.rect.x, 2) && near(a.rect.y, b.rect.y, 2);
const sameLook = (kind, a, b) => (kind === 'text' || kind === 'svgtext' ? a.text === b.text && JSON.stringify(a.lines.map((l) => l.runs.map((r) => r.color))) === JSON.stringify(b.lines.map((l) => l.runs.map((r) => r.color)))
  : kind === 'box' ? JSON.stringify([a.fill, a.sides]) === JSON.stringify([b.fill, b.sides])
    : kind === 'path' ? JSON.stringify([a.fill?.color, a.stroke?.color, a.d.length]) === JSON.stringify([b.fill?.color, b.stroke?.color, b.d.length])
      // a picture its camera moves in on shows another part of itself
      : kind === 'pic' ? ['l', 't', 'r', 'b'].every((k) => Math.abs((a.crop?.[k] ?? 0) - (b.crop?.[k] ?? 0)) < 0.004)
        : true);
function same(kind, a, b) { return sameSize(a, b) && samePlace(a, b) && sameLook(kind, a, b); }
function moved(kind, a, b) { return sameSize(a, b) && !samePlace(a, b) && sameLook(kind, a, b); }

const hides = (f) => f.opacity === '0' || /scale[XY]?\(0\)/.test(f.transform ?? '') || (f.strokeDashoffset != null && parseFloat(f.strokeDashoffset) > 0) || /^0(px|%)?$/.test(f.width ?? '') || /^0(px|%)?$/.test(f.height ?? '');
const inWindow = (a, w) => a.start >= w.lo && a.start < w.hi;

/** How a piece comes in on build k: the page's motion that reveals it, as one of PowerPoint's entrance effects. */
export function entering(s, anims, w, clock, k, m) {
  const mine = anims.filter((a) => inWindow(a, w) && hides(a.first));
  const words = mine.filter((a) => a.rel === 'down');
  if (s.kind === 'text' && words.length) {
    const starts = words.map((a) => a.start).sort((x, y) => x - y);
    const gaps = starts.slice(1).map((t, i) => t - starts[i]).sort((x, y) => x - y);
    const rise = /translate/.test(words[0].first.transform ?? '');
    const effect = { name: rise ? 'rise' : 'fade', y: rise ? Math.min(40, m.lineHeight * 0.5) : 0, ...(words.length > 1 && { by: 'word', gap: gaps[gaps.length >> 1] }) };
    return { effect, delay: Math.max(0, starts[0] - w.base), dur: clampDur(words[0].dur) };
  }
  const own = mine.filter((a) => a.rel !== 'down');
  if (!own.length) return k === 0 ? null : { ...ENTER_DEFAULT };
  const a = own.reduce((x, y) => (y.start > x.start || (y.start === x.start && y.rel === 'self') ? y : x));
  return { effect: effectOf(a, m), delay: Math.max(0, a.start - w.base), dur: clampDur(a.dur) };
}

/** A Web Animation's first frame, read as the entrance PowerPoint has for it. */
export function effectOf(a, m) {
  const f = a.first, t = f.transform ?? '';
  if (f.strokeDashoffset != null && m?.from) {
    const dx = m.to[0] - m.from[0], dy = m.to[1] - m.from[1];
    return { name: 'wipe', from: Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom' };
  }
  if (/^0(px|%)?$/.test(f.width ?? '')) return { name: 'wipe', from: 'left' };
  if (/^0(px|%)?$/.test(f.height ?? '')) return { name: 'wipe', from: 'bottom' };
  const origin = (a.origin ?? '').split(' ').map(parseFloat);
  if (/scaleX\(0\)/.test(t)) return { name: 'wipe', from: m && origin[0] > m.rect.w * 0.6 ? 'right' : 'left' };
  if (/scaleY\(0\)/.test(t)) return { name: 'wipe', from: m && origin[1] < m.rect.h * 0.4 ? 'top' : 'bottom' };
  const px = (v, size) => (v.endsWith('%') ? (parseFloat(v) / 100) * (size ?? 0) : parseFloat(v));
  const ty = t.match(/translateY\(([-\d.]+(?:px|%)?)\)/), tx = t.match(/translateX\(([-\d.]+(?:px|%)?)\)/), sc = t.match(/scale\(([\d.]+)\)/);
  const y = ty ? px(ty[1], m?.rect.h) : 0, x = tx ? px(tx[1], m?.rect.w) : 0, s = sc ? +sc[1] : 1;
  if (Math.abs(y) >= 4 && Math.abs(y) >= Math.abs(x)) return { name: y > 0 ? 'rise' : 'drop', y: Math.abs(y) };
  if (Math.abs(x) >= 4) return { name: 'slide', from: x > 0 ? 'right' : 'left', x: Math.abs(x) };
  if (s < 0.9) return { name: 'zoom', scale: s };
  return { name: 'fade' };
}

function leaving(anims, w) {
  const a = anims.filter((x) => inWindow(x, w) && x.last.opacity === '0').at(-1);
  return a ? { delay: Math.max(0, a.start - w.base), dur: clampDur(a.dur) } : { delay: 0, dur: 400 };
}

function dimming(anims, w) {
  const a = anims.filter((x) => inWindow(x, w) && x.last.opacity != null && x.last.opacity !== x.first.opacity).at(-1);
  return a ? { delay: Math.max(0, a.start - w.base), dur: clampDur(a.dur) } : { delay: 0, dur: 500 };
}

function moving(anims, w) {
  const a = anims.filter((x) => inWindow(x, w) && (x.first.left != null || x.first.top != null || /translate/.test(x.first.transform ?? ''))).at(-1);
  return a ? { delay: Math.max(0, a.start - w.base), dur: clampDur(a.dur) } : { delay: 100, dur: 850 };
}
