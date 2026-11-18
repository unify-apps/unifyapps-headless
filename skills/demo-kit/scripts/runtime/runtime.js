/* UnifyApps story runtime.
 * Builds every scene of a planned story into one 1920x1080 page and draws any moment of it from the story clock.
 * Nothing moves on its own: seek(t) sets every Web Animation, counter and canvas from t, so a frame is the same
 * however slowly it is captured. In a browser without ?render, the output's player drives the clock: the video
 * preview plays it with the audio, the deck steps it build by build. */
(() => {
  const W = 1920, H = 1080;
  // extents: [el, from, to] of motion that is not a Web Animation (counters, the mark), so stops() can wait for it
  // sfx: the sounds a video's mix plays, each tied to something on screen: { kind, at, take }
  // live: the motion that keeps a built scene alive while it holds, run on the film clock plus the deck's hold time (drift)
  // film: the namespace a story's shared parts (scenes/_<name>.js) put their builders in
  const UA = (window.UA = { scenes: {}, anims: [], tickers: [], extents: [], sfx: [], list: [], live: [], t: 0, drift: 0, film: {} });
  // A scene is one file calling UA.scene('<type>', { need, max, steps(data), labels(data) (what each build shows, in
  // words, so the voice's word that names it can be found), settle(data), css, build(data, U), anim(ctx, data, U) }):
  // the kit's in scripts/runtime/scenes/<type>.js, a story's own in <story>/scenes/<type>.js, loaded after the kit's.
  // A scene may take over what the kit does for every scene: `camera: false` (the video's camera leaves it to its own
  // moves) and `pops: false` (no soft pop as each build lands; it lists its own sounds with ctx.sfx). A UnifyApps
  // standard diagram (ua-<name>) also lists `covers`, the phrases that mean a story shows it, and may name `mark` (where the
  // logo's mark sits on it). Its CSS is scoped
  // under .sc-<type>, colours only from the theme's variables (never a literal), and .gr-deep for the deep ground. It
  // animates only through ctx (tw, fadeUp, fade, pop, rise, snap, slide, grow, draw, words, count, tick, and the live
  // motion: live, current, travel, halo, ping, sheen, spin), at ctx.t(k) for build k, so every frame comes from the film
  // clock. No Math.random (use ctx.rand), no CSS transitions, no timers, and no transform on an element an animation
  // moves (place it with margins).
  UA.scene = (name, def) => { UA.scenes[name] = def; };

  // A damped spring sampled into a CSS linear() curve, so WAAPI plays real spring motion; zeta under 1 overshoots once.
  const spring = (zeta) => {
    const wd = Math.sqrt(1 - zeta * zeta), T = 7 / zeta, n = 40;
    const x = (t) => 1 - Math.exp(-zeta * t) * (Math.cos(wd * t) + (zeta / wd) * Math.sin(wd * t));
    return `linear(${Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : +x((i / n) * T).toFixed(4))).join(', ')})`;
  };
  // easing by role: arrivals decelerate long (expo out), camera moves ease both ways, exits accelerate away, pops spring
  UA.EASE = {
    out: 'cubic-bezier(.16,1,.3,1)', cine: 'cubic-bezier(.62,0,.2,1)', snap: 'cubic-bezier(.1,.92,.25,1)',
    in: 'cubic-bezier(.55,0,.8,.2)', back: spring(0.78), linear: 'linear', soft: 'cubic-bezier(.4,0,.2,1)',
    // the platform story's own: a card gliding up, a part dropping into place past its mark, a state change
    glide: 'cubic-bezier(.2,.7,.2,1)', drop: 'cubic-bezier(.2,.9,.3,1.2)', ui: 'cubic-bezier(.2,.8,.2,1)',
  };
  const ease = (name) => UA.EASE[name] ?? name;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (p) => p * p * (3 - 2 * p);
  const outCubic = (p) => 1 - Math.pow(1 - p, 3);
  UA.clamp = clamp; UA.outCubic = outCubic;

  // A seeded random source: the same film always draws the same scatter.
  // how a scene arrives and how the one before it leaves, for each kind of cut, timed from the arriving scene's start:
  // its `in` starts at start + inAt, the scene before's `out` at start + outAt. A fade is a clean swap: the scene before
  // clears in 180 ms just as this one's own entrance begins at its start, so the two are never seen together and the
  // frame does not blink. A dissolve is the slow one, chosen for time passing. A carry is the cut around an element both
  // scenes name: this scene is there at once, the rest of the one before clears, and the element moves to its place.
  const TRANSITIONS = {
    first: { in: [{ opacity: 0 }, { opacity: 1 }], inAt: -250, inDur: 600 },
    fade: { in: [{ opacity: 0 }, { opacity: 1 }], inAt: 40, inDur: 150, out: [{ opacity: 1 }, { opacity: 0 }], outAt: -60, outDur: 180, outEase: 'soft' },
    dissolve: { in: [{ opacity: 0 }, { opacity: 1 }], inAt: -250, inDur: 500, out: [{ opacity: 1 }, { opacity: 0 }], outAt: -250, outDur: 500, ease: 'soft', outEase: 'soft' },
    push: { in: [{ opacity: 0, transform: 'scale(1.035)' }, { opacity: 1, transform: 'none' }], inAt: -250, inDur: 720, out: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.07)' }], outAt: -380, outDur: 380, sound: true },
    whip: { in: [{ opacity: 0, transform: 'translateX(150px)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], inAt: -250, inDur: 560, out: [{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'translateX(-190px)', filter: 'blur(10px)' }], outAt: -380, outDur: 280, sound: true },
    blur: { in: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], inAt: -250, inDur: 300, out: [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)' }], outAt: -380, outDur: 200 },
    // a hard cut: the scene before is gone the frame this one is there, and this scene's own motion makes its entrance
    cut: { in: [{ opacity: 0 }, { opacity: 1 }], inAt: -250, inDur: 1, out: [{ opacity: 1 }, { opacity: 0 }], outAt: -250, outDur: 1 },
    carry: { in: [{ opacity: 0 }, { opacity: 1 }], inAt: -60, inDur: 1, out: [{ opacity: 1 }, { opacity: 0 }], outAt: -60, outDur: 180, outEase: 'soft' },
  };
  // a carried element travels for this long from where it was to where it is, fast at first and landing gently
  const CARRY = 450;
  // when a scene starts to leave: as the scene after it arrives, by that scene's cut
  const leaveAt = (next) => next.start + TRANSITIONS[next.join ?? next.cut].outAt;

  UA.rand = (seed) => {
    let a = (typeof seed === 'string' ? [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) : seed) >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  // ── markup helpers the scenes share ──
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // a no-break space (\u00a0) keeps two words on one line
  const words = (s) => esc(s).split(/[ \t\n\r]+/).filter(Boolean).map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
  UA.esc = esc; UA.words = words;
  UA.line = (title, em) => `${words(title)}${em ? ` <em>${words(em)}</em>` : ''}`;
  // a heading: `carry` names it for the next scene's heading to take over, so the words change in place across the cut
  UA.head = (d, o = {}) => (d.kicker || d.title ? `<header class="hd"${o.carry ? ` data-carry="${esc(o.carry)}"` : ''}>${d.kicker ? `<div class="kicker">${esc(d.kicker)}</div>` : ''}${d.title ? `<h2 class="h2">${UA.line(d.title, d.em)}</h2>` : ''}</header>` : '');
  UA.foot = (d) => (d.footnote ? `<p class="footnote">${esc(d.footnote)}</p>` : '');
  UA.asset = (src) => (/^(https?:|data:)/.test(src) ? src : window.FILM.inline?.[src] ?? `${window.FILM.assetBase ?? ''}${src}`);

  // ── animation context handed to each scene ──
  function context(s) {
    const root = s.root;
    const list = (x) => (x == null ? [] : typeof x === 'string' ? [...root.querySelectorAll(x)] : x instanceof Element ? [x] : [...x]);
    const ctx = {
      el: root, data: s.data, start: s.start, end: s.end, ground: s.ground, rand: UA.rand(s.id),
      // the absolute time (ms) of step k; step 0 is the scene's entrance
      t: (k) => s.cues[Math.min(k, s.cues.length - 1)] ?? s.start,
      steps: s.cues.length - 1,
      q: (sel) => root.querySelector(sel), qa: (sel) => [...root.querySelectorAll(sel)],
      tw(targets, frames, o = {}) {
        list(targets).forEach((el, i) => {
          const a = el.animate(frames, { duration: o.dur ?? 700, delay: Math.max(0, (o.at ?? s.start) + i * (o.stagger ?? 0)), easing: ease(o.ease ?? 'out'), fill: 'both' });
          a.pause();
          UA.anims.push({ a, el, start: a.effect.getTiming().delay });
        });
      },
      fadeUp(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0, transform: `translateY(${o.y ?? 26}px)` }, { opacity: 1, transform: 'none' }], { at, dur: o.dur ?? 750, stagger: o.stagger ?? 0, ease: o.ease ?? 'out' }); },
      fade(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0 }, { opacity: o.to ?? 1 }], { at, dur: o.dur ?? 600, stagger: o.stagger ?? 0, ease: o.ease ?? 'soft' }); },
      pop(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'none' }], { at, dur: o.dur ?? 650, stagger: o.stagger ?? 0, ease: 'back' }); },
      // a card gliding up as it settles to full size
      rise(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0, transform: `translateY(${o.y ?? 18}px) scale(.97)` }, { opacity: 1, transform: 'none' }], { at, dur: o.dur ?? 650, stagger: o.stagger ?? 0, ease: 'glide' }); },
      // a part dropping into its slot from above, a little past it and back
      snap(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0, transform: `translateY(${o.y ?? -60}px) scale(.8)` }, { opacity: 1, transform: 'none' }], { at, dur: o.dur ?? 700, stagger: o.stagger ?? 0, ease: 'drop' }); },
      // a new member of a row sliding in from its side
      slide(targets, at, o = {}) { ctx.tw(targets, [{ opacity: 0, transform: `translateX(${o.x ?? 40}px) scale(.9)` }, { opacity: 1, transform: 'none' }], { at, dur: o.dur ?? 600, stagger: o.stagger ?? 0, ease: 'glide' }); },
      // a rule or bar growing from its start edge
      grow(targets, at, o = {}) { ctx.tw(targets, [{ transform: o.y ? 'scaleY(0)' : 'scaleX(0)' }, { transform: 'none' }], { at, dur: o.dur ?? 900, stagger: o.stagger ?? 0, ease: o.ease ?? 'cine' }); },
      // an SVG stroke drawn along its length
      draw(targets, at, o = {}) {
        list(targets).forEach((p, i) => {
          const len = Math.ceil(p.getTotalLength?.() ?? 1000) + 2;
          p.style.strokeDasharray = `${len}`;
          ctx.tw(p, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { at: at + i * (o.stagger ?? 0), dur: o.dur ?? 900, ease: o.ease ?? 'cine' });
        });
      },
      // words of a heading or line rising one after another
      words(container, at, o = {}) { ctx.tw(list(container).flatMap((c) => [...c.querySelectorAll('.w > span')]), [{ transform: 'translateY(105%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { at, dur: o.dur ?? 800, stagger: o.stagger ?? 55, ease: 'out' }); },
      // a heading's entrance, one of three so no two scenes in a row arrive alike: words rising, words sharpening from a
      // blur, or words turning from grey to ink in place
      headline(container, at, style) {
        const ws = list(container).flatMap((c) => [...c.querySelectorAll('.w > span')]);
        if (style === 'blur') ctx.tw(ws, [{ filter: 'blur(6px)', opacity: 0 }, { filter: 'blur(0px)', opacity: 1 }], { at, dur: 260, stagger: 67, ease: 'out' });
        else if (style === 'ink') {
          ws.forEach((w, i) => {
            const to = getComputedStyle(w).color, from = getComputedStyle(root).getPropertyValue(s.ground === 'deep' ? '--on-deep-body' : '--muted').trim();
            ctx.tw(w, [{ color: from, opacity: 0.55 }, { color: to, opacity: 1 }], { at: at + i * 85, dur: 420, ease: 'soft' });
          });
        } else ctx.words(container, at);
      },
      // a number counting from `from` to `to`, formatted like the fact it shows; several counts on one number take
      // turns, the latest one started drawing it, and before the first starts, its `from`
      count(el, o) {
        const node = list(el)[0]; if (!node) return;
        const dec = o.decimals ?? 0, at = o.at ?? s.start, dur = o.dur ?? 1600;
        const fmt = (v) => `${o.prefix ?? ''}${v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${o.suffix ?? ''}`;
        UA.extents.push([node, at, at + dur]);
        const runs = node.uaCounts ?? (node.uaCounts = []);
        runs.push({ at, dur, from: o.from ?? 0, to: o.to ?? 0, fmt });
        runs.sort((x, y) => x.at - y.at);
        if (runs.length > 1) return;
        UA.tickers.push((t) => { const r = runs.findLast((x) => t >= x.at) ?? runs[0]; node.textContent = r.fmt(r.from + (r.to - r.from) * outCubic(clamp((t - r.at) / r.dur))); });
      },
      tick(fn) { UA.tickers.push((t) => fn(t - s.start, t)); },
      // GSAP on the film clock: the scene's own timeline, in seconds from the scene's start (c.at(k) is build k), played
      // only by setting the clock; c.loops holds endless motion, run on the film clock plus the deck's hold time
      get gs() { return ctx._gs ??= UA.gsTimeline(s, UA.gsm); },
      get loops() { return ctx._loops ??= UA.gsTimeline(s, UA.gsl); },
      at: (k, off = 0) => (ctx.t(k) - s.start) / 1000 + off,
      // a pointer a person moves: it glides on a slightly bowed path, presses on a click, and rests where it stopped
      pointer(o = {}) {
        const host = list(o.in ?? root.querySelector('.lens') ?? root)[0];
        const el = document.createElement('div');
        el.className = 'ua-cur';
        el.innerHTML = '<svg viewBox="0 0 24 31"><path d="M2 2 L2 25 L7.6 19.6 L11.6 28.6 L15.6 26.8 L11.7 18 L19.6 18 Z"/></svg>';
        host.appendChild(el);
        const moves = [], clicks = [];
        let pos = o.from ?? [W / 2, H / 2], last = o.show ?? null;
        const ease5 = (p) => p * p * p * (10 - 15 * p + 6 * p * p);
        const where = (t) => {
          let p = o.from ?? moves[0]?.from ?? pos;
          for (const mv of moves) {
            if (t < mv.t0) break;
            const u = clamp((t - mv.t0) / (mv.t1 - mv.t0)), e = ease5(u), dx = mv.to[0] - mv.from[0], dy = mv.to[1] - mv.from[1], bow = Math.sin(Math.PI * u) * 0.06;
            p = [mv.from[0] + dx * e - dy * bow, mv.from[1] + dy * e + dx * bow];
          }
          return p;
        };
        UA.tickers.push((t) => {
          const shown = last != null && t >= last - 200;
          el.style.opacity = shown ? String(clamp((t - last + 200) / 200)) : '0';
          if (!shown) return;
          const [x, y] = where(t);
          el.style.left = `${x}px`; el.style.top = `${y}px`;
          const hit = clicks.filter((h) => h <= t).at(-1), since = hit == null ? 1e9 : t - hit;
          el.firstChild.style.transform = since < 180 ? `scale(${0.82 + 0.18 * (since / 180)})` : 'none';
        });
        const api = {
          el,
          // glides to [x, y] (px in the element it lives in) starting at `at`; answers when it arrives
          to(to, at, mo = {}) {
            const from = pos, dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
            const dur = mo.dur ?? clamp(420 + dist * 0.55, 480, 1100);
            moves.push({ from, to, t0: at, t1: at + dur });
            moves.sort((a, b) => a.t0 - b.t0);
            if (last == null || at < last) last = at;
            UA.extents.push([el, at, at + dur]);
            pos = to;
            return at + dur;
          },
          click(at) { clicks.push(at); ctx.sfx('click', at); UA.extents.push([el, at, at + 200]); return at; },
        };
        return api;
      },
      // text typed key by key from `at`, the way a person types: 45 to 85 ms a key, a sound for each; answers when done
      type(target, text, o = {}) {
        const el = list(target)[0]; if (!el) return o.at ?? s.start;
        const at = o.at ?? s.start, str = String(text), times = [];
        let tt = at;
        for (let k = 0; k < str.length; k++) { tt += (o.key ?? 45) + ctx.rand() * (o.jitter ?? 40); times.push(tt); if (str[k] !== ' ' && o.sound !== false) ctx.sfx('key', tt, { take: k % 4 }); }
        const end = o.dur ? at + o.dur : tt;
        const scale = o.dur ? o.dur / Math.max(1, tt - at) : 1;
        UA.extents.push([el, at, end + 100]);
        UA.tickers.push((t) => {
          let n = 0;
          while (n < times.length && t >= at + (times[n] - at) * scale) n++;
          el.textContent = t < at ? (o.before ?? '') : str.slice(0, n);
        });
        return end;
      },
      // Live motion keeps a built scene alive while it holds: fn(k) gets the ms since `from` (negative before it), on
      // the film clock plus the deck's hold time. It never counts as a build's motion, so stops() does not wait for it.
      // Each effect draws on an element of its own (.ua-fx), never on one an animation already moves.
      live(fn, from) { UA.live.push((t) => fn(t - from)); },
      // wires carrying a current: a dashed copy of each path fades in at `from` and its dashes run along it
      current(paths, from, o = {}) {
        list(paths).forEach((p, i) => {
          const c = p.cloneNode(); c.removeAttribute('id'); c.classList.add('ua-fx', 'ua-current');
          c.style.strokeDasharray = o.dash ?? '3 9'; p.after(c);
          const at = from + i * (o.stagger ?? 0), v = ((o.speed ?? 24) / 1000) * (o.reverse ? 1 : -1);
          ctx.fade(c, at, { dur: 500 });
          ctx.live((k) => { c.style.strokeDashoffset = `${Math.max(0, k) * v}`; }, at);
        });
      },
      // dots travelling a path end to end, n of them evenly apart, one lap every `dur` ms
      travel(paths, from, o = {}) {
        list(paths).forEach((p, i) => {
          const n = o.n ?? 1, dur = o.dur ?? 2400, len = p.getTotalLength(), at = from + i * (o.stagger ?? 0);
          const dots = Array.from({ length: n }, () => {
            const d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            d.setAttribute('r', o.r ?? 5); d.setAttribute('class', 'ua-fx ua-dot'); p.parentNode.appendChild(d); return d;
          });
          ctx.fade(dots, at, { dur: 400 });
          ctx.live((k) => dots.forEach((d, j) => {
            const f = (((Math.max(0, k) / dur + j / n) % 1) + 1) % 1, pt = p.getPointAtLength((o.reverse ? 1 - f : f) * len);
            d.setAttribute('cx', pt.x); d.setAttribute('cy', pt.y);
          }), at);
        });
      },
      // an effect layer laid over or behind each target, which must be positioned (relative or absolute)
      fx(targets, cls, behind) {
        return list(targets).map((el) => { const x = document.createElement('i'); x.className = `ua-fx ${cls}`; behind ? el.prepend(x) : el.append(x); return x; });
      },
      // a soft glow behind each target, breathing in and out
      halo(targets, from, o = {}) {
        const P = o.period ?? 2400;
        ctx.fx(targets, 'ua-halo', true).forEach((x, i) => ctx.live((k) => {
          const w = k < 0 ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / P + i);
          x.style.opacity = k < 0 ? 0 : String(Math.min(1, k / 500) * (0.12 + 0.14 * w) / 0.26);
          // never smaller than its target, so the glow stays outside a card's face
          x.style.transform = `scale(${1 + 0.08 * w})`;
        }, from));
      },
      // a ring leaving each target's edge and fading, `reach` px out, once every `period` ms; it grows by the same
      // amount on every side, so on a wide card it never crosses the text inside
      ping(targets, from, o = {}) {
        const P = o.period ?? 2600, reach = o.reach ?? 18;
        ctx.fx(targets, 'ua-ping').forEach((x, i) => ctx.live((k) => {
          const f = k < 0 ? 1 : (((k + i * (o.stagger ?? 0)) % P) / P);
          x.style.opacity = String(1 - f); x.style.inset = `${-2 - reach * outCubic(f)}px`;
        }, from));
      },
      // a band of light crossing each target, once every `period` ms
      sheen(targets, from, o = {}) {
        const P = o.period ?? 3400;
        ctx.fx(targets, 'ua-sheen').forEach((x, i) => ctx.live((k) => {
          const f = k < 0 ? 0 : ((k + i * 400) % P) / P;
          x.style.backgroundPosition = `${200 - 400 * f}% 0`;
        }, from));
      },
      // a target turning, one turn every `period` ms (negative: the other way)
      spin(targets, from, o = {}) {
        const P = o.period ?? 16000;
        list(targets).forEach((el) => ctx.live((k) => { el.style.transform = `rotate(${(Math.max(0, k) / P) * 360}deg)`; }, from));
      },
      // a sound the video plays at `at` (ms): click, key, pop or whoosh
      sfx(kind, at, o = {}) { UA.sfx.push({ kind, at, ...o }); },
    };
    return ctx;
  }

  // Every element animated more than once keeps only its first animation filling backwards, so a later one
  // never paints its starting frame over an earlier one before its own time.
  function settleFills() {
    const byEl = new Map();
    for (const x of UA.anims) { if (!byEl.has(x.el)) byEl.set(x.el, []); byEl.get(x.el).push(x); }
    for (const xs of byEl.values()) {
      xs.sort((a, b) => a.start - b.start);
      xs.forEach((x, i) => x.a.effect.updateTiming({ fill: i === 0 ? 'both' : 'forwards' }));
    }
  }

  // ── the ambient mark: the dots of the logo's own mark, read from the logo SVG at boot and drawn from the film clock ──
  // On the title and end cards the mark is part of the logo, so it holds still (spin 0): no turn, no twinkle. An
  // opening that fills the right of the frame (a question's figures, the product) keeps it small in the corner.
  const SPIRAL = { title: { x: 1500, y: 540, s: 360, a: 1, spin: 0 }, 'title.question': { x: 1800, y: 150, s: 210, a: 0.11, spin: 1 }, 'title.product': { x: 1800, y: 120, s: 150, a: 0.08, spin: 1 }, end: { x: 960, y: 396, s: 150, a: 1, spin: 0 }, statement: { x: 1690, y: 880, s: 300, a: 0.1, spin: 1 }, quote: { x: 1690, y: 880, s: 300, a: 0.1, spin: 1 }, timeline: { x: 1810, y: 880, s: 170, a: 0.08, spin: 1 }, default: { x: 1800, y: 150, s: 210, a: 0.11, spin: 1 } };
  const TURN = 0.00006; // radians per ms: about 3.4 degrees a second, a slow orbit of the world behind
  // [dx, dy, r, opacity] per dot, centred on the mark and sorted from its eye outward (the grow reveals them in order).
  // getBBox and getCTM give each dot's true centre whatever transform or path shape the SVG drew it with.
  function markDots(svgText) {
    const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    // viewport units equal viewBox units at its own size
    svg.setAttribute('width', '1640'); svg.setAttribute('height', '500');
    svg.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden';
    document.body.appendChild(svg);
    const dots = [];
    for (const el of svg.querySelectorAll('circle, path')) {
      const b = el.getBBox(), c = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(el.getCTM());
      if (c.x < 462) dots.push([c.x, c.y, b.width / 2, +getComputedStyle(el).opacity]); // the wordmark starts at x 462
    }
    svg.remove();
    const mid = (k) => (Math.min(...dots.map((d) => d[k])) + Math.max(...dots.map((d) => d[k]))) / 2;
    const x0 = mid(0), y0 = mid(1);
    return dots.map(([x, y, r, o]) => [(x - x0) / 250, (y - y0) / 250, r / 250, o]).sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  }
  function ambient(canvas, dpr, dots, fill) {
    const cx = canvas.getContext('2d');
    // where the mark sits: the kit's place for the scene, else the scene's own `mark`, and the story's data.mark over it
    const keys = UA.list.map((s) => ({ s, p: { ...(SPIRAL[s.data.open ? `${s.type}.${s.data.open}` : s.type] ?? SPIRAL[s.type] ?? UA.scenes[s.type]?.mark ?? SPIRAL.default), ...(s.data.mark ?? {}) } }));
    const lerp = (a, b, p) => a + (b - a) * p;
    return (t) => {
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      let i = keys.findIndex((k) => t < k.s.end); if (i < 0) i = keys.length - 1;
      const cur = keys[i], prev = keys[i - 1] ?? cur;
      const p = smooth(clamp((t - cur.s.start + 400) / 1800));
      const at = { x: lerp(prev.p.x, cur.p.x, p), y: lerp(prev.p.y, cur.p.y, p), s: lerp(prev.p.s, cur.p.s, p), a: lerp(prev.p.a, cur.p.a, p), spin: lerp(prev.p.spin, cur.p.spin, p) };
      const first = keys[0];
      // the mark grows from its eye at the start of the film, and on the end card
      const grow = (k) => (k.s.type === 'title' || k.s.type === 'end' ? clamp((t - k.s.start + 200) / 2600) : 1);
      const rev = i === 0 ? grow(first) : cur.s.type === 'end' ? Math.max(0.15, grow(cur)) : 1;
      if (at.a <= 0.002) return;
      // whole turns taken off first, so a still card returns upright the short way, not by every turn the film has made
      const rot = ((t + UA.drift) * TURN - 2 * Math.PI * Math.round((cur.s.start * TURN) / (2 * Math.PI))) * at.spin;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      // each dot fades in over the 40 after it, so the count runs 40 past the last dot for the outer ring to finish
      const shown = rev * (dots.length + 40);
      cx.fillStyle = fill[(p > 0.5 ? cur : prev).s.ground];
      for (let k = 0; k < dots.length && k <= shown; k++) {
        const [dx, dy, r, o] = dots[k];
        const g = clamp((shown - k) / 40);
        const tw = 1 - (1 - (0.82 + 0.18 * Math.sin((t + UA.drift) / 950 + k * 0.7))) * at.spin;
        cx.globalAlpha = clamp(o * at.a * tw * g);
        const x = at.x + (dx * cs - dy * sn) * at.s, y = at.y + (dx * sn + dy * cs) * at.s;
        cx.beginPath(); cx.arc(x, y, Math.max(0.4, r * at.s * (0.6 + 0.4 * g)), 0, 6.2832); cx.fill();
      }
      cx.globalAlpha = 1;
    };
  }

  UA.seek = (t) => {
    UA.t = t;
    for (const x of UA.anims) x.a.currentTime = t;
    for (const s of UA.list) s.root.style.visibility = t >= s.start - 900 && t <= s.end + 700 ? 'visible' : 'hidden';
    UA.gsm?.time(t / 1000);
    UA.gsl?.time((t + UA.drift) / 1000);
    for (const f of UA.tickers) f(t);
    for (const f of UA.live) f(t + UA.drift);
    if (UA.progress) UA.progress(t);
  };
  // between builds of the deck, only the live motion and the mark move
  UA.hold = (t) => { UA.mark(t); UA.gsl?.time((t + UA.drift) / 1000); for (const f of UA.live) f(t + UA.drift); };

  // What a still check reads: text that leaves the frame or its margins, is cut off, is too small, sits on other text,
  // or spills out of its box; content taller than its space; and groups of boxes spaced, padded, centred or lined up
  // unevenly. A product screen shows the app's own pixels, so nothing inside one is judged but its frame.
  // A scene's text that shows now at more than `min` opacity (through every parent), with where it sits: what the
  // browser draws, so a style that keeps a scene up past its exit counts.
  const textOn = (x, min) => {
    const out = [];
    for (const el of x.root.querySelectorAll('*')) {
      const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!nodes.length || getComputedStyle(el).visibility === 'hidden') continue;
      let o = 1; for (let e = el; e && e !== document.body && o > min; e = e.parentElement) o *= +getComputedStyle(e).opacity;
      if (o <= min) continue;
      for (const n of nodes) { const r = document.createRange(); r.selectNodeContents(n); out.push({ r: r.getBoundingClientRect(), text: n.textContent.trim().slice(0, 30) }); }
    }
    return out;
  };
  // How clearly each scene's text shows now: whether any of it is above 15% opacity.
  UA.textShown = () => UA.list.map((x) => (textOn(x, 0.15).length ? 1 : 0));
  // Text of scene a lying on text of scene b, both visible (above 15%, where a faint copy still reads): the words of
  // each, or null.
  UA.textOnText = (a, b) => {
    const A = textOn(UA.list[a], 0.15), B = textOn(UA.list[b], 0.15);
    for (const p of A) for (const q of B) {
      const w = Math.min(p.r.right, q.r.right) - Math.max(p.r.left, q.r.left), h = Math.min(p.r.bottom, q.r.bottom) - Math.max(p.r.top, q.r.top);
      if (w > 2 && h > 2 && w * h > 0.2 * Math.min(p.r.width * p.r.height, q.r.width * q.r.height)) return `${p.text} / ${q.text}`;
    }
    return null;
  };

  UA.lint = () => {
    const s = UA.list.find((x) => UA.t >= x.start && UA.t < x.end) ?? UA.list.at(-1);
    const stage = document.getElementById('stage').getBoundingClientRect();
    const k = stage.width / W;
    const issues = [];
    const shown = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o > 0.6; };
    const leaves = [...s.root.querySelectorAll('*')].filter((el) => {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return shown(el);
    });
    // the text's own extent, not its element's box (a heading block spans the frame; its words do not)
    const textRect = (el) => {
      let r = null;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(n);
        const b = range.getBoundingClientRect();
        r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
      }
      return r ?? el.getBoundingClientRect();
    };
    // the block a piece of text belongs to (a heading, a paragraph): lines of one block may sit tight by design
    const blockOf = (el) => { let e = el; while (e.parentElement && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement; return e; };
    // a font's content area reaches past its line box; clip to the element and its block so stacked lines don't count
    // (vertically only: text running sideways out of its column is exactly what must be caught)
    const clip = (a, b) => ({ left: a.left, top: Math.max(a.top, b.top), right: a.right, bottom: Math.min(a.bottom, b.bottom) });
    const boxes = leaves.map((el) => { const block = blockOf(el); return { el, block, r: clip(clip(textRect(el), el.getBoundingClientRect()), block.getBoundingClientRect()), text: el.textContent.trim().slice(0, 40) }; });
    // a product rebuilt in HTML (.ua-app) fills the frame edge to edge with the product's own denser type: its text keeps
    // its frame and margins by the product's layout, and reads down to 16 px
    for (const { el, r, text } of boxes) {
      const x0 = (r.left - stage.left) / k, y0 = (r.top - stage.top) / k, x1 = (r.right - stage.left) / k, y1 = (r.bottom - stage.top) / k;
      const app = el.closest('.ua-app');
      if (!app && (x0 < 40 || y0 < 30 || x1 > W - 40 || y1 > H - 30)) issues.push({ kind: 'off-frame', text });
      const fs = parseFloat(getComputedStyle(el).fontSize) / 1;
      if (fs < (app ? 16 : 18) && !el.closest('.shot')) issues.push({ kind: 'small-text', text, px: Math.round(fs) });
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') issues.push({ kind: 'clipped', text });
    }
    // a glyph's ink can reach past its box (an italic d, a heavy f); a word mask that cuts it shows a letter sliced off
    const ink = document.createElement('canvas').getContext('2d');
    for (const w of s.root.querySelectorAll('.w')) {
      const span = w.firstElementChild, cs = span && getComputedStyle(span);
      if (!span || !span.textContent.trim() || !shown(span)) continue;
      ink.font = cs.font; ink.letterSpacing = cs.letterSpacing;
      const m = ink.measureText(span.textContent), box = w.getBoundingClientRect(), at = span.getBoundingClientRect();
      if (at.left - m.actualBoundingBoxLeft * k < box.left - 0.5 || at.left + m.actualBoundingBoxRight * k > box.right + 0.5) issues.push({ kind: 'cut-letter', text: span.textContent.trim().slice(0, 40) });
    }
    // a settled build shows one scene: text from any other still on screen sits over it
    UA.textShown().forEach((o, i) => { if (UA.list[i] !== s && o) issues.push({ kind: 'two-scenes', text: `${UA.list[i].id} still shows` }); });
    const side = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--side')) || 112;
    const at = (r) => ({ x0: (r.left - stage.left) / k, y0: (r.top - stage.top) / k, x1: (r.right - stage.left) / k, y1: (r.bottom - stage.top) / k });
    const clear = (c) => /^(transparent|rgba\(.*,\s*0\))$/.test(c);
    // a box: a card or panel the scene draws with a fill or a border, large enough to hold text
    const isBox = (el) => {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.display.startsWith('inline') || r.width < 40 * k || r.height < 40 * k) return false;
      return cs.backgroundImage !== 'none' || !clear(cs.backgroundColor) || ['Top', 'Right', 'Bottom', 'Left'].some((d) => parseFloat(cs[`border${d}Width`]) > 0 && !clear(cs[`border${d}Color`]));
    };
    const outside = (el) => el.closest('.shot') || el.closest('.footnote') || el.closest('.ua-app');
    for (const { el, block, r, text } of boxes) {
      if (outside(el)) continue;
      const p = at(r), v = at(block.getBoundingClientRect());
      // the side margins are the frame's padding: every scene keeps its text inside them
      if (p.x0 < side - 6 || p.x1 > W - side + 6) issues.push({ kind: 'gutter', text });
      for (let b = el.parentElement; b && b !== s.root; b = b.parentElement) {
        if (!isBox(b)) continue;
        const q = at(b.getBoundingClientRect());
        if (p.x0 < q.x0 - 2 || p.x1 > q.x1 + 2 || v.y0 < q.y0 - 2 || v.y1 > q.y1 + 2) issues.push({ kind: 'spill', text });
        break;
      }
    }
    // content taller than the space a scene gives it runs into the footnote and the captions
    for (const el of s.root.querySelectorAll('.area')) if (el.scrollHeight > el.clientHeight + 2) issues.push({ kind: 'overflow', text: el.textContent.trim().slice(0, 40) });
    for (const par of s.root.querySelectorAll('.lens, .lens *')) {
      if (outside(par)) continue;
      const kids = [...par.children].filter((c) => {
        const cs = getComputedStyle(c), r = c.getBoundingClientRect();
        return cs.display !== 'none' && !cs.display.startsWith('inline') && !c.matches('.shot, .cur, .ua-word, .ua-fx') && r.width >= 40 * k && r.height >= 16 * k && shown(c);
      });
      if (kids.length < 2) continue;
      const R = kids.map((c) => at(c.getBoundingClientRect()));
      const overlapY = (a, b) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0, overlapX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0;
      const row = R.every((r, i) => i === 0 || (r.x0 >= R[i - 1].x1 - 1 && overlapY(r, R[i - 1])));
      const col = !row && R.every((r, i) => i === 0 || (r.y0 >= R[i - 1].y1 - 1 && overlapX(r, R[i - 1])));
      if (!row && !col) continue;
      const name = par.textContent.trim().slice(0, 40);
      // repeated items (cards, columns, steps) share a tag and a class; a number over its label over a note is a
      // hierarchy, spaced unevenly by design
      const alike = kids.every((c) => c.tagName === kids[0].tagName && c.className === kids[0].className);
      // repeated items sit the same distance apart along a row or down a column
      if (alike && kids.length >= 3) {
        const gaps = R.slice(1).map((r, i) => (row ? r.x0 - R[i].x1 : r.y0 - R[i].y1));
        if (Math.max(...gaps) - Math.min(...gaps) > 8) issues.push({ kind: 'uneven-gap', text: name });
      }
      const cards = alike && kids.every(isBox);
      // a row of cards is centred in the space it has
      if (row && cards) {
        const cs = getComputedStyle(par), box = at(par.getBoundingClientRect());
        const left = R[0].x0 - box.x0 - parseFloat(cs.paddingLeft) / 1, right = box.x1 - parseFloat(cs.paddingRight) - R.at(-1).x1;
        if (Math.abs(left - right) > 24) issues.push({ kind: 'off-centre', text: name });
      }
      // cards side by side or stacked hold their text at the same inset from their left edge
      if (cards) {
        const insets = kids.flatMap((c, i) => {
          if (getComputedStyle(c).textAlign === 'center') return [];
          const xs = boxes.filter((b) => c.contains(b.el)).map((b) => at(b.r).x0);
          return xs.length ? [Math.min(...xs) - R[i].x0] : [];
        });
        if (insets.length >= 2 && Math.max(...insets) - Math.min(...insets) > 6) issues.push({ kind: 'uneven-padding', text: name });
      }
      // a column of blocks lines up on one left edge; a few pixels off is a mistake, more is a choice
      if (col && getComputedStyle(par).alignItems !== 'center' && getComputedStyle(par).textAlign !== 'center') {
        const lefts = R.map((r) => r.x0), d = Math.max(...lefts) - Math.min(...lefts);
        if (d > 2 && d <= 16) issues.push({ kind: 'misaligned', text: name });
      }
    }
    // a heading or a large line of five words or more ending on one word alone reads as a mistake; a short heading
    // cannot help it, and a one-word italic clause on its own line is the design
    for (const blk of s.root.querySelectorAll('.h2, .t1, .big, .qt')) {
      const ws = [...blk.querySelectorAll('.w')];
      if (ws.length < 5) continue;
      const tops = ws.map((w) => Math.round(w.getBoundingClientRect().top / k));
      const lines = [...new Set(tops)];
      const last = ws.filter((w, i) => tops[i] === lines.at(-1));
      const clause = last.length === 1 && last[0].closest('em') && blk.querySelectorAll('em .w').length === 1;
      if (lines.length > 1 && last.length === 1 && !clause) issues.push({ kind: 'orphan', text: blk.textContent.trim().slice(0, 40) });
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el) || a.block === b.block) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      // a line box reaches past its glyphs; count an overlap only when it covers a real share of the smaller text
      const small = Math.min((a.r.right - a.r.left) * (a.r.bottom - a.r.top), (b.r.right - b.r.left) * (b.r.bottom - b.r.top));
      if (w > 3 * k && h > 3 * k && w * h > 0.2 * small) issues.push({ kind: 'overlap', text: `${a.text} / ${b.text}` });
    }
    issues.push(...(UA.carryNotes?.[UA.list.indexOf(s)] ?? []));
    return { scene: s.id, t: UA.t, issues };
  };

  // GSAP's two film timelines: builds (UA.gsm) and endless motion (UA.gsl). Nothing plays on the wall clock; setting the
  // film clock sets them. Each scene adds its own timeline at its start.
  UA.gsScenes = [];
  UA.gsTimeline = (s, master) => {
    if (!master) throw new Error(`scene "${s.id}" draws with GSAP, which this page does not carry`);
    const tl = window.gsap.timeline();
    master.add(tl, s.start / 1000);
    if (master === UA.gsm) UA.gsScenes.push({ s, tl });
    return tl;
  };
  function gsapSetup() {
    const g = window.gsap;
    if (!g) return;
    g.registerPlugin(...['CustomEase', 'DrawSVGPlugin', 'MotionPathPlugin', 'MorphSVGPlugin', 'SplitText', 'ScrambleTextPlugin', 'TextPlugin', 'Physics2DPlugin'].map((n) => window[n]).filter(Boolean));
    // the kit's eases by name, so `ease: 'cine'` means the same in c.tw and in GSAP
    if (window.CustomEase) for (const [name, e] of Object.entries(UA.EASE)) { const m = /^cubic-bezier\(([^)]+)\)$/.exec(e); if (m) window.CustomEase.create(name, m[1]); }
    UA.gsm = g.timeline({ paused: true });
    UA.gsl = g.timeline({ paused: true });
  }
  // every GSAP tween of a build, as [el, start, end] in film ms, so the stills, the deck and the camera wait for it
  function gsapExtents() {
    UA.gsAnims = [];
    for (const { s, tl } of UA.gsScenes) {
      for (const tw of tl.getChildren(true, true, false)) {
        if (tw.repeat() === -1) continue;
        let t0 = tw.startTime();
        for (let p = tw.parent; p && p !== UA.gsm; p = p.parent) t0 += p.startTime();
        const start = t0 * 1000, end = start + tw.totalDuration() * 1000;
        for (const el of tw.targets()) if (el instanceof Element && s.root.contains(el)) UA.gsAnims.push({ el, start, end });
      }
    }
  }

  UA.boot = async () => {
    const F = window.FILM;
    const render = /[?&]render/.test(location.search);
    document.body.classList.toggle('render', render);
    document.body.classList.toggle('dark', F.ground === 'deep');
    if (F.look) document.body.classList.add(`look-${F.look}`);
    const stage = document.getElementById('stage');
    const css = [];
    for (const s of F.scenes) {
      const def = UA.scenes[s.type];
      if (!def) throw new Error(`no scene type "${s.type}"`);
      if (def.css && !css.includes(def.css)) css.push(def.css);
      const root = document.createElement('section');
      root.className = `scene sc-${s.type} gr-${s.ground}`;
      root.dataset.id = s.id;
      // the scene's content sits in a camera layer the video moves; the footnote stays put
      root.innerHTML = `<div class="lens">${def.build(s.data, UA)}</div>${UA.foot(s.data)}`;
      stage.appendChild(root);
      UA.list.push({ ...s, root });
    }
    const style = document.createElement('style'); style.textContent = css.join('\n'); document.head.appendChild(style);
    // footer and logos: the logo keeps its shapes, and its own fill (#847347) becomes the accent for the ground it sits on
    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const fill = { paper: cssVar('--accent'), deep: cssVar('--accent-on-deep') };
    const logo = (ground, box) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(window.ASSETS.logo.replaceAll('#847347', fill[ground]).replace(/viewBox="[^"]*"/, `viewBox="${box}"`))}`;
    UA.logo = { paper: logo('paper', '0 0 1640 500'), deep: logo('deep', '0 0 1640 500') };
    // the wordmark alone, for cards where the animated mark already stands beside it
    UA.word = { paper: logo('paper', '462 140 1180 270'), deep: logo('deep', '462 140 1180 270') };
    for (const img of document.querySelectorAll('img.ua-word')) img.src = img.closest('.gr-deep') ? UA.word.deep : UA.word.paper;
    const foot = document.getElementById('foot');
    foot.innerHTML = `<img class="fl-paper" src="${UA.logo.paper}" alt=""><img class="fl-deep" src="${UA.logo.deep}" alt=""><span>${esc(F.footer ?? '')}</span>`;
    // a story made for a customer carries their logo beside ours: in every footer, and in the title's and the end
    // card's lockup. One logo is turned white on the deep ground, unless the story gives one made for it.
    const cu = F.customer?.logo ? { name: F.customer.name ?? '', paper: UA.asset(F.customer.logo), deep: UA.asset(F.customer.logoOnDeep ?? F.customer.logo), white: !F.customer.logoOnDeep } : null;
    const coLogo = (ground) => `<img class="ua-co-logo${ground === 'deep' && cu.white ? ' white' : ''}" src="${esc(cu[ground])}" alt="${esc(cu.name)}">`;
    if (cu) {
      foot.insertAdjacentHTML('afterbegin', `<span class="fc"><i>×</i><span class="fcl"><b class="fc-paper">${coLogo('paper')}</b><b class="fc-deep">${coLogo('deep')}</b></span></span>`);
      for (const s of UA.list) for (const w of s.root.querySelectorAll('img.ua-word')) w.insertAdjacentHTML('afterend', `<span class="ua-co"><i>×</i>${coLogo(s.ground)}</span>`);
    }
    // wait for type and pictures, so every measurement below is final
    await document.fonts.ready;
    const serif = cssVar('--serif'), sans = cssVar('--sans');
    await Promise.all([`300 40px ${serif}`, `italic 300 40px ${serif}`, `400 40px ${serif}`, `italic 400 40px ${serif}`, `800 40px ${serif}`, `600 20px ${sans}`, `400 20px ${sans}`].map((f) => document.fonts.load(f).catch(() => null)));
    await Promise.all([...document.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));

    // the background: paper, with the deep ground faded in (or out) across the cut into a scene on the other ground, as
    // light changing while the two pictures cross
    const deep = document.getElementById('bg-deep');
    const bgCtx = { tw: (el, frames, o) => { const a = el.animate(frames, { duration: o.dur, delay: Math.max(0, o.at), easing: ease(o.ease ?? 'cine'), fill: 'both' }); a.pause(); UA.anims.push({ a, el, start: a.effect.getTiming().delay }); } };
    const LIGHT = 900;
    deep.style.opacity = UA.list[0]?.ground === 'deep' ? '1' : '0';
    UA.list.forEach((s, i) => {
      const prev = UA.list[i - 1];
      if (prev && prev.ground !== s.ground) bgCtx.tw(deep, [{ opacity: prev.ground === 'deep' ? 1 : 0 }, { opacity: s.ground === 'deep' ? 1 : 0 }], { at: s.start - LIGHT / 2, dur: LIGHT, ease: 'soft' });
    });

    // the cut into each scene: a fade unless the scene names another; and an element both scenes of a cut mark with the
    // same data-carry is carried across it (on a fade or a hard cut), so the picture runs on instead of starting again
    const marks = UA.list.map((s) => [...new Set([...s.root.querySelectorAll('[data-carry]')].map((el) => el.dataset.carry))]);
    UA.carryNotes = UA.list.map(() => []);
    UA.list.forEach((s, i) => {
      const prev = UA.list[i - 1];
      s.cut = s.cut ?? (prev ? 'fade' : 'first');
      s.carry = prev ? marks[i].filter((m) => marks[i - 1].includes(m)) : [];
      if (s.carry.length && !['fade', 'cut'].includes(s.cut)) {
        UA.carryNotes[i].push({ kind: 'carry', text: `${s.carry.join(', ')} is not carried: a ${s.cut} moves the whole picture; carry on a fade or a hard cut` });
        s.carry = [];
      }
      if (s.carry.length && s.cut === 'fade') s.join = 'carry';
      for (const m of marks[i]) if (!marks[i - 1]?.includes(m) && !marks[i + 1]?.includes(m)) UA.carryNotes[i].push({ kind: 'carry', text: `data-carry="${m}" is on no element of the scene before or after` });
    });
    gsapSetup();
    for (const s of UA.list) {
      const ctx = context(s);
      // the scene arrives by its cut and leaves by the next scene's; its own steps come from anim()
      const how = TRANSITIONS[s.join ?? s.cut];
      ctx.tw(s.root, how.in, { at: s.start + how.inAt, dur: how.inDur, ease: how.ease ?? 'out' });
      const i = UA.list.indexOf(s), next = UA.list[i + 1];
      if (next) { const nx = TRANSITIONS[next.join ?? next.cut]; ctx.tw(s.root, nx.out, { at: leaveAt(next), dur: nx.outDur, ease: nx.outEase ?? 'in' }); }
      if (how.sound) UA.sfx.push({ kind: 'whoosh', at: s.start - 200, take: i });
      const hd = s.root.querySelector('.hd');
      if (hd && s.carry.includes(hd.dataset.carry)) {
        // a heading carried from the scene before is already there: its words turn to ink in place, and a new kicker fades in
        const was = UA.list[i - 1].root.querySelector(`[data-carry="${CSS.escape(hd.dataset.carry)}"] .kicker`)?.textContent;
        if (hd.querySelector('.kicker')?.textContent !== was) ctx.fade(hd.querySelector('.kicker'), s.start + how.inAt, { dur: 400 });
        ctx.headline(hd.querySelector('.h2'), s.start + how.inAt, 'ink');
      } else if (hd) {
        // the heading comes in with the scene, so the frame is never left bare after the scene before has cleared
        ctx.tw(hd.querySelector('.kicker'), [{ opacity: 0, letterSpacing: '.32em' }, { opacity: 1, letterSpacing: '.17em' }], { at: s.start, dur: 900 });
        ctx.headline(hd.querySelector('.h2'), s.start, ['rise', 'blur', 'ink'][i % 3]);
      }
      const fn = s.root.querySelector('.footnote');
      if (fn) ctx.fade(fn, s.start + 900, { to: 1 });
      UA.scenes[s.type].anim?.(ctx, s.data, UA);
      // a soft pop as each build lands; a screen, and a scene that says so, makes its own sounds
      if (s.type !== 'screen' && UA.scenes[s.type].pops !== false) s.cues.slice(1).forEach((c, j) => UA.sfx.push({ kind: 'pop', at: c + 90, take: j % 3 }));
    }
    // the footer shows on content scenes, in the colour of the scene's ground
    const fctx = { tw: bgCtx.tw };
    const fp = foot.querySelectorAll('.fl-paper, .fc-paper'), fd = foot.querySelectorAll('.fl-deep, .fc-deep');
    UA.list.forEach((s) => {
      const on = !['title', 'end'].includes(s.type) && !s.data.noFooter ? 1 : 0, deep = s.ground === 'deep' ? 1 : 0;
      fctx.tw(foot, [{ opacity: on }, { opacity: on }], { at: s.start - 300, dur: 300, ease: 'soft' });
      for (const el of fp) fctx.tw(el, [{ opacity: 1 - deep }, { opacity: 1 - deep }], { at: s.start - 300, dur: 300, ease: 'soft' });
      for (const el of fd) fctx.tw(el, [{ opacity: deep }, { opacity: deep }], { at: s.start - 300, dur: 300, ease: 'soft' });
    });
    // a heading's key words get a highlighter swept behind them as they land (a look that draws one shows it)
    for (const s of UA.list) for (const em of s.root.querySelectorAll('.lens em')) {
      const starts = UA.anims.filter((a) => em.contains(a.el) && a.el !== em).map((a) => a.start);
      if (!starts.length) continue;
      const an = em.animate([{ backgroundSize: '0% 62%' }, { backgroundSize: '100% 62%' }], { duration: 520, delay: Math.max(...starts) + 260, easing: UA.EASE.out, fill: 'both' });
      an.pause();
      UA.anims.push({ a: an, el: em, start: Math.max(...starts) + 260 });
    }
    // the customer's half of a lockup arrives with our wordmark beside it
    for (const co of document.querySelectorAll('.ua-co')) {
      for (const x of UA.anims.filter((y) => y.el === co.previousElementSibling)) {
        const an = co.animate(x.a.effect.getKeyframes(), x.a.effect.getTiming()); an.pause();
        UA.anims.push({ a: an, el: co, start: x.start });
      }
    }
    settleFills();
    gsapExtents();

    const canvas = document.getElementById('amb');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    UA.mark = ambient(canvas, dpr, markDots(window.ASSETS.logo), fill);
    UA.tickers.push(UA.mark);
    // the mark moves to each scene's place, and grows on the title and end cards
    for (const s of UA.list) UA.extents.push([s.root, s.start, s.start + (['title', 'end'].includes(s.type) ? 2400 : 1400)]);
    // the progress hairline at the foot of the frame
    const bar = document.getElementById('bar');
    UA.tickers.push((t) => { bar.style.transform = `scaleX(${clamp(t / F.duration)})`; });

    if (F.clock === 'spoken') { spotlights(); cameras(); }
    carries();
    if (F.captions?.length) captions(F.captions);
    UA.duration = F.duration;
    UA.seek(0);
    if (!render) UA.player?.(F);
    UA.ready = true;
    return true;
  };

  // Where each build has settled: one stop per scene and build. `from` is when its motion starts (for a scene's
  // entrance, when the scene before it starts to leave), `to` when the last thing it moves comes to rest. The deck
  // plays from `from` to `to` on each click; stills and slides are taken at `to`.
  UA.stops = () => {
    const out = [];
    UA.list.forEach((s, i) => {
      const prev = UA.list[i - 1];
      const leave = (x, next) => (next === x ? x.end - 380 : leaveAt(next));
      s.cues.forEach((c, k) => {
        const lo = k === 0 ? s.start - 400 : c - 30;
        // the last build is taken as it stands, before the scene starts to leave
        const hi = (s.cues[k + 1] ?? leave(s, UA.list[i + 1] ?? s) + 30) - 30;
        // every motion that starts in this build's window, as [start, end]
        const moves = [];
        for (const x of UA.anims) {
          // the scene's own fade counts when it enters, never when it leaves
          // a carried element's move counts for the scene it arrives in, its hiding never for the one it leaves
          if (x.start < lo || x.start >= hi || !s.root.contains(x.el) || (x.el === s.root && x.start >= s.start) || x.seam === 'hide') continue;
          moves.push([x.start, x.a.effect.getComputedTiming().endTime]);
        }
        for (const x of UA.gsAnims ?? []) if (x.start >= lo && x.start < hi) moves.push([x.start, x.end]);
        // a scene has arrived once the one before has gone (on a fade it stays faintly for a moment)
        if (k === 0 && prev) { const how = TRANSITIONS[s.join ?? s.cut]; if (how.out) moves.push([leaveAt(s), leaveAt(s) + how.outDur]); }
        for (const [el, a, b] of UA.extents) if (a >= lo && a < hi && s.root.contains(el)) moves.push([a, b]);
        const end = Math.max(lo + 300, ...moves.map((m) => m[1]));
        const from = k > 0 ? c - 30 : prev ? leave(prev, s) - 20 : 0;
        // settles: when its own motion ends, even past the next build (where `to` stops), so a preview can say it overran;
        // a move starting in the last 0.4 s before the next build is that build's lead-in, not this one's
        const settles = Math.max(lo + 300, ...moves.filter((m) => k === s.cues.length - 1 || m[0] < hi - 400).map((m) => m[1]));
        out.push({ scene: i, id: s.id, step: k, last: k === s.cues.length - 1, from, to: Math.min(Math.round(end + 120), hi - 10), cue: c, next: s.cues[k + 1] ?? leave(s, UA.list[i + 1] ?? s), settles: Math.round(settles) });
      });
    });
    return out;
  };

  // ── the camera: in a video it reframes on what the voice names ──
  // Each build's own elements, measured where they settle, are the focus. As a build arrives the camera moves to it
  // (a punch-in a little closer each time, never far enough to push text off the frame), lands with it, and holds:
  // no creeping push in between. The title and end cards hold still, and a product screen moves its own camera.
  function cameras() {
    const stage = document.getElementById('stage').getBoundingClientRect(), k = stage.width / W;
    const box = (els) => {
      let r = null;
      for (const el of els) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
      }
      return r && { l: (r.l - stage.left) / k, t: (r.t - stage.top) / k, r: (r.r - stage.left) / k, b: (r.b - stage.top) / k };
    };
    const texts = (root) => [...root.querySelectorAll('*')].filter((el) => [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()));
    const stops = UA.stops();
    UA.list.forEach((s, i) => {
      if (['title', 'end', 'screen'].includes(s.type) || UA.scenes[s.type].camera === false) return;
      const cam = s.root.querySelector('.lens'), mine = stops.filter((x) => x.scene === i), n = s.cues.length - 1;
      const focus = [];
      for (const x of mine) {
        UA.seek(x.to);
        const lo = x.step ? s.cues[x.step] - 30 : s.start - 400, hi = (s.cues[x.step + 1] ?? s.end) - 30;
        const els = [...new Set([...UA.anims.filter((a) => !a.light), ...(UA.gsAnims ?? [])].filter((a) => a.start >= lo && a.start < hi && cam.contains(a.el) && a.el !== cam).map((a) => a.el))];
        focus[x.step] = box(els) ?? box([cam]);
      }
      const all = box(texts(cam));
      if (!all) return;
      // the closest the camera may come and still keep every word 44 px inside the frame
      const zMax = Math.min(1.045, (W - 88) / (all.r - all.l), (H - 68) / (all.b - all.t));
      if (zMax <= 1.005) return;
      const frame = (f, z) => {
        const cx = (f.l + f.r) / 2, cy = (f.t + f.b) / 2;
        const tx = clamp((1 - z) * cx + 0.3 * (W / 2 - cx), 44 - z * all.l, W - 44 - z * all.r);
        const ty = clamp((1 - z) * cy + 0.3 * (H / 2 - cy), 34 - z * all.t, H - 34 - z * all.b);
        return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${z.toFixed(4)})`;
      };
      if (!n) return;
      let from = 'translate(0px, 0px) scale(1)', first = true;
      for (let j = 1; j <= n; j++) {
        const to = frame(focus[j] ?? focus[0], 1 + (zMax - 1) * (j / n));
        const at = s.cues[j] - 150, dur = Math.min(1400, (s.cues[j + 1] ?? s.end - 400) - at - 100);
        if (dur < 400) continue;
        const an = cam.animate([{ transform: from }, { transform: to }], { duration: dur, delay: at, easing: UA.EASE.cine, fill: first ? 'both' : 'forwards' });
        an.pause();
        UA.anims.push({ a: an, el: cam, start: at });
        from = to;
        first = false;
      }
    });
  }

  // ── carried elements: what both scenes of a cut mark with the same data-carry travels from where the scene before
  // left it to where this scene has it, while the rest of the picture changes around it ──
  // Measured at the frames it moves between, so a camera, a parent's transform or the element's own origin are all
  // counted; the move adds to whatever the scene does to the element, and the one before hides as it starts.
  function carries() {
    const stage = document.getElementById('stage').getBoundingClientRect(), k = stage.width / W;
    const centre = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2 - stage.left) / k, y: (r.top + r.height / 2 - stage.top) / k, w: r.width / k, h: r.height / k }; };
    UA.list.forEach((s, i) => {
      // it moves from the moment this scene arrives
      const at = s.start + TRANSITIONS[s.join ?? s.cut].inAt;
      for (const name of s.carry ?? []) {
        const sel = `[data-carry="${CSS.escape(name)}"]`, a = UA.list[i - 1].root.querySelector(sel), b = s.root.querySelector(sel);
        UA.seek(at); const from = centre(a);
        UA.seek(at + CARRY); const to = centre(b);
        if (!from.w || !to.w) { UA.carryNotes[i].push({ kind: 'carry', text: `data-carry="${name}" is not on screen at the cut` }); continue; }
        // the same proportions, scaled to fit where it was
        const z = to.h && from.h ? Math.min(from.w / to.w, from.h / to.h) : from.w / to.w;
        const frames = (x, y) => [{ transform: `translate(${x}px, ${y}px) scale(${z})` }, { transform: 'translate(0px, 0px) scale(1)' }];
        const an = b.animate(frames(from.x - to.x, from.y - to.y), { duration: CARRY, delay: at, easing: UA.EASE.glide, fill: 'both', composite: 'add' });
        an.pause();
        // how far the element moves for each px of the move, measured, so the first frame lands it exactly where it was
        const probe = (x, y) => { an.effect.setKeyframes(frames(x, y)); UA.seek(at); an.currentTime = at; return centre(b); };
        const x0 = from.x - to.x, y0 = from.y - to.y, p0 = probe(x0, y0), p1 = probe(x0 + 100, y0 + 100);
        const fx = (p1.x - p0.x) / 100 || 1, fy = (p1.y - p0.y) / 100 || 1;
        an.effect.setKeyframes(frames(x0 + (from.x - p0.x) / fx, y0 + (from.y - p0.y) / fy));
        UA.anims.push({ a: an, el: b, start: at, seam: 'move' });
        const hide = a.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: 1, delay: at, fill: 'forwards' });
        hide.pause();
        UA.anims.push({ a: hide, el: a, start: at, seam: 'hide' });
      }
      // on a fade, the rest of this scene comes in as a fade brings a scene in, once the one before has cleared, so
      // only the carried elements cross the cut; a filter, so the scene's own opacity motion is left as it is
      if (s.join !== 'carry') return;
      const keep = s.carry.map((name) => s.root.querySelector(`[data-carry="${CSS.escape(name)}"]`)), fade = TRANSITIONS.fade;
      const walk = (el) => {
        for (const c of el.children) {
          if (keep.includes(c)) continue;
          if (keep.some((k) => c.contains(k))) { walk(c); continue; }
          const an = c.animate([{ filter: 'opacity(0)' }, { filter: 'opacity(1)' }], { duration: fade.inDur, delay: s.start + fade.inAt, easing: ease('out'), fill: 'both', composite: 'add' });
          an.pause();
          UA.anims.push({ a: an, el: c, start: s.start + fade.inAt, seam: 'in' });
        }
      };
      walk(s.root);
    });
  }

  // ── spotlights: when the voice names something already on screen, it lights in the accent for a moment ──
  // A word of four letters or more that shares its first five with a label's word, once the label is in, and once a
  // line; headings are left alone (they arrive with their own words).
  function spotlights() {
    const norm = (w) => String(w).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
    const STOP = new Set('this that with from your their they them have what when then than here there where which into over each every only more just like about after before today'.split(' '));
    const stems = (txt) => String(txt).split(/\s+/).map(norm).filter((w) => w.length >= 4 && !STOP.has(w));
    const same = (a, b) => a.slice(0, 5) === b.slice(0, 5) || a.startsWith(b) || b.startsWith(a);
    UA.list.forEach((s) => {
      const lens = s.root.querySelector('.lens');
      const labels = [...lens.querySelectorAll('*')].filter((el) => !el.children.length && el.textContent.trim() && !el.closest('.hd, .typed, .co')).map((el) => ({ el, keys: stems(el.textContent), in: Math.min(...UA.anims.filter((a) => a.el === el || a.el.contains(el)).map((a) => a.start), s.start) }));
      const lit = getComputedStyle(s.root).getPropertyValue(s.ground === 'deep' ? '--accent-on-deep' : '--accent').trim();
      for (const line of s.lines ?? []) {
        const used = new Set();
        for (const w of line.words ?? []) {
          const k = norm(w.w);
          if (k.length < 4 || STOP.has(k)) continue;
          const hit = labels.find((l) => !used.has(l) && l.keys.some((x) => same(k, x)) && w.at >= l.in + 600);
          if (!hit) continue;
          used.add(hit);
          const base = getComputedStyle(hit.el).color;
          const an = hit.el.animate([{ color: base }, { color: lit, offset: 0.2 }, { color: lit, offset: 0.65 }, { color: base }], { duration: 1200, delay: w.at - 60, easing: 'ease-in-out', fill: 'none' });
          an.pause();
          UA.anims.push({ a: an, el: hit.el, start: w.at - 60, light: true });
        }
      }
    });
  }

  // ── captions: the spoken words in a quiet strip at the foot of the frame, each lit as it is said ──
  function captions(pages) {
    document.body.classList.add('captions');
    const cap = document.createElement('div');
    cap.id = 'cap';
    document.getElementById('stage').appendChild(cap);
    let shown = -1;
    UA.tickers.push((t) => {
      const i = pages.findIndex((p) => t >= p.from - 150 && t < p.to + 250);
      if (i !== shown) { shown = i; cap.innerHTML = i < 0 ? '' : pages[i].words.map((w) => `<span>${esc(w.w)}</span>`).join(' '); }
      if (i < 0) { cap.style.opacity = '0'; return; }
      const p = pages[i];
      cap.style.opacity = String(clamp(Math.min((t - p.from + 150) / 150, (p.to + 250 - t) / 150)));
      [...cap.children].forEach((el, j) => {
        const w = p.words[j], until = p.words[j + 1]?.at ?? w.end + 200;
        el.className = t >= w.at && t < until ? 'now' : t >= w.at ? 'said' : '';
      });
    });
  }

  /** The words a scene shows, for alt text and search: each piece of text apart, so a figure and its unit stay two words. */
  UA.text = (i) => {
    const out = [], walk = document.createTreeWalker(UA.list[i].root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) out.push(walk.currentNode.textContent);
    return out.join(' ').replace(/\s+/g, ' ').trim();
  };
})();
