// A product screen in a browser frame, used the way a person uses it. Each step is one shot: the cursor glides to
// what it clicks (`click`, a point in the screenshot's own pixels) on a human, minimum-jerk path, presses, and the
// next screenshot (`image`) answers the click by arriving a touch large and settling; `type` writes text into a field key by key; the camera
// moves to a part of the screen (`zoom`, a rectangle) and a callout points at what matters. A screenshot named
// <name>@2x.png is twice the pixels for the same layout, so zooms stay sharp. Screens come from the live app or are
// built for the story.
UA.scene('screen', {
  need: ['image', 'shots'],
  max: { shots: 8 },
  steps: (d) => d.shots.length,
  labels: (d) => d.shots.map((s) => s.label ?? s.callout?.text ?? ''),
  css: `
.sc-screen .shot { position: absolute; border-radius: 14px; overflow: hidden; background: var(--view); box-shadow: 0 40px 90px var(--shadow), 0 0 0 1px var(--edge); }
.sc-screen.gr-deep .shot { box-shadow: 0 40px 90px rgba(0, 0, 0, .45); }
.sc-screen .bar { height: 46px; background: var(--frame-bar); display: flex; align-items: center; gap: 9px; padding: 0 18px; border-bottom: 1px solid var(--frame-line); }
.sc-screen .bar i { width: 13px; height: 13px; border-radius: 50%; background: var(--frame-dot); }
.sc-screen .bar span { margin-left: 18px; flex: 1; max-width: 640px; height: 28px; border-radius: 7px; background: var(--card); font: 400 15px/28px var(--sans); color: var(--frame-text); padding: 0 14px; white-space: nowrap; overflow: hidden; }
.sc-screen .view { position: absolute; left: 0; right: 0; bottom: 0; overflow: hidden; }
.sc-screen .cam { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.sc-screen .cam img { position: absolute; left: 0; top: 0; display: block; }
.sc-screen .co { position: absolute; display: flex; align-items: flex-start; gap: 18px; pointer-events: none; }
.sc-screen .co .ring { flex: none; width: 34px; height: 34px; margin-top: -17px; margin-left: -17px; border-radius: 50%; border: 4px solid var(--accent); box-shadow: 0 0 0 8px var(--accent-halo); }
.sc-screen .co .tx { margin-top: -30px; max-width: 460px; padding: 16px 22px; background: var(--ink); color: var(--on-deep); font: 500 25px/1.32 var(--serif); border-left: 4px solid var(--accent-on-deep); box-shadow: 0 18px 40px rgba(0, 0, 0, .22); }
.sc-screen .co.left { flex-direction: row-reverse; }
.sc-screen .co.left .ring { margin-left: 0; margin-right: -17px; }
.sc-screen .cur { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 3; pointer-events: none; opacity: 0; }
.sc-screen .cur svg { position: absolute; left: -3px; top: -2px; width: 34px; height: 44px; filter: drop-shadow(0 4px 8px var(--shadow)); }
.sc-screen .cur svg path { fill: var(--ink); stroke: var(--view); stroke-width: 2; stroke-linejoin: round; }
.sc-screen .typed { position: absolute; white-space: pre; color: var(--ink); font-family: var(--sans); }
.sc-screen .typed b { display: inline-block; width: 2px; margin-left: 1px; vertical-align: -10%; background: var(--accent); }`,
  build(d, U) {
    const imgs = [d.image, ...d.shots.map((s) => s.image).filter(Boolean)];
    const uniq = [...new Set(imgs)];
    const cos = d.shots.map((s) => (s.callout ? `<div class="co"><div class="ring"></div><div class="tx">${U.esc(s.callout.text)}</div></div>` : '<div class="co" hidden></div>')).join('');
    const typed = d.shots.map((s) => (s.type ? '<div class="typed"><span></span><b></b></div>' : '')).join('');
    const cursor = d.shots.some((s) => s.click) ? '<div class="cur"><svg viewBox="0 0 24 31"><path d="M2 2 L2 25 L7.6 19.6 L11.6 28.6 L15.6 26.8 L11.7 18 L19.6 18 Z"/></svg></div>' : '';
    return `${U.head(d)}<div class="shot"${d.frame === 'plain' ? ' data-plain="1"' : ''}>${d.frame === 'plain' ? '' : `<div class="bar"><i></i><i></i><i></i><span>${U.esc(d.url ?? '')}</span></div>`}<div class="view"><div class="cam">${uniq.map((src) => `<img data-src="${U.esc(src)}" src="${U.esc(U.asset(src))}" alt="">`).join('')}${typed}</div>${cos}${cursor}</div></div>`;
  },
  anim(c, d, U) {
    const shot = c.q('.shot'), view = c.q('.view'), cam = c.q('.cam');
    const imgs = c.qa('.cam img'), byName = Object.fromEntries(imgs.map((im) => [im.dataset.src, im]));
    const base = byName[d.image];
    // a @2x screenshot has twice the pixels for the same layout: every coordinate stays in the 1x layout
    const dens = Number(/@([23])x\.[a-z]+$/i.exec(d.image)?.[1] ?? 1);
    const iw = (base.naturalWidth || 1440 * dens) / dens, ih = (base.naturalHeight || 900 * dens) / dens;
    const plain = shot.dataset.plain === '1', barH = plain ? 0 : 46;
    // the frame: as large as the space under the heading allows, at the screenshot's own proportions; the product is
    // the point of the scene, so it takes the frame down to the captions
    const top = d.title ? 236 : 90, bottom = 64, maxW = 1920 - 2 * 112, maxH = 1080 - top - bottom - barH;
    const vw = Math.min(maxW, maxH * (iw / ih)), vh = vw * (ih / iw);
    Object.assign(shot.style, { left: `${(1920 - vw) / 2}px`, top: `${top}px`, width: `${vw}px`, height: `${vh + barH}px` });
    Object.assign(view.style, { top: `${barH}px`, height: `${vh}px` });
    const k0 = vw / iw;
    imgs.forEach((im) => { im.style.width = `${iw}px`; im.style.height = `${ih}px`; });
    // the camera for one shot: scale and offset that frame the zoom rectangle in the view
    const camFor = (z) => {
      if (!z) return { s: k0, x: 0, y: 0 };
      const [zx, zy, zw, zh] = z;
      const s = Math.min(vw / zw, vh / zh, k0 * 3.2);
      const x = U.clamp(vw / 2 - (zx + zw / 2) * s, vw - iw * s, 0), y = U.clamp(vh / 2 - (zy + zh / 2) * s, vh - ih * s, 0);
      return { s, x, y };
    };
    const tf = (m) => `translate(${m.x}px, ${m.y}px) scale(${m.s})`;
    c.fadeUp(shot, c.start + 350, { y: 40, dur: 900 });
    imgs.forEach((im) => { if (im !== base) c.tw(im, [{ opacity: 0 }, { opacity: 0 }], { at: 0, dur: 1 }); });
    let prev = camFor(null), shown = base;
    cam.style.transform = tf(prev);
    const cos = c.qa('.co'), typedEls = c.qa('.typed');
    // the cursor's path: glides between click points, then rests; a click ripples and presses
    const moves = [], clicks = [], typedShown = [];
    let pos = null, ti = 0;
    // a new screenshot carries whatever was typed into it, so the typed overlay leaves as the screen changes
    const clearTyped = (at) => { while (typedShown.length) c.tw(typedShown.pop(), [{ opacity: 1 }, { opacity: 0 }], { at, dur: 140, ease: 'soft' }); };
    const rand = c.rand;
    d.shots.forEach((s, i) => {
      const at = c.t(i + 1);
      let camAt = at;
      if (s.click) {
        const to = s.click, from = pos ?? [U.clamp(to[0] - 260, 0, iw), U.clamp(to[1] + 170, 0, ih)];
        const dist = Math.hypot(to[0] - from[0], to[1] - from[1]), dur = U.clamp(420 + dist * 0.55, 520, 900);
        moves.push({ from, to, t0: at, t1: at + dur });
        const hit = at + dur + 70;
        clicks.push(hit);
        c.sfx('click', hit);
        UA.extents.push([shot, at, hit + 520]);
        pos = to;
        if (s.image && byName[s.image] !== shown) {
          const next = byName[s.image];
          // the new screen answers the click: it arrives a touch large and settles, the old one leaves under it
          c.tw(next, [{ opacity: 0, transform: 'scale(1.012)' }, { opacity: 1, transform: 'none' }], { at: hit + 60, dur: 520, ease: 'out' });
          clearTyped(hit + 60);
          c.tw(shown, [{ opacity: 1 }, { opacity: 0 }], { at: hit + 260, dur: 160, ease: 'soft' });
          shown = next;
        }
        camAt = hit + 160;
      } else if (s.image && byName[s.image] !== shown) {
        clearTyped(at);
        c.fade(byName[s.image], at, { dur: 500 });
        c.tw(shown, [{ opacity: 1 }, { opacity: 0 }], { at: at + 450, dur: 200 });
        shown = byName[s.image];
      }
      const m = camFor(s.zoom);
      c.tw(cam, [{ transform: tf(prev) }, { transform: tf(m) }], { at: camAt, dur: 1150, ease: 'cine' });
      prev = m;
      let calloutAt = camAt + 1100;
      if (s.type) {
        const el = typedEls[ti++], [x, y] = s.type.at, size = s.type.size ?? 15;
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, fontSize: `${size}px`, lineHeight: `${Math.round(size * 1.4)}px` });
        const t0 = camAt + 450, text = String(s.type.text);
        // a person types in bursts: 45 to 85 ms a key
        const times = [];
        let tt = t0;
        for (let k = 0; k < text.length; k++) { tt += 45 + rand() * 40; times.push(tt); if (text[k] !== ' ') c.sfx('key', tt, { take: k % 4 }); }
        UA.extents.push([el, t0, tt + 200]);
        c.fade(el, t0 - 120, { dur: 120 });
        typedShown.push(el);
        const span = el.querySelector('span'), caret = el.querySelector('b');
        caret.style.height = `${Math.round(size * 1.15)}px`;
        c.tick((_, t) => {
          let n = 0;
          while (n < times.length && t >= times[n]) n++;
          span.textContent = text.slice(0, n);
          caret.style.opacity = t < t0 || (t > tt + 400 && Math.floor((t - tt) / 530) % 2) ? '0' : '1';
        });
        calloutAt = Math.max(calloutAt, tt + 300);
      }
      if (i > 0 && !cos[i - 1].hidden) c.tw(cos[i - 1], [{ opacity: 1 }, { opacity: 0 }], { at: at - 50, dur: 300, ease: 'soft' });
      if (s.callout) {
        const px = s.callout.x * m.s + m.x, py = s.callout.y * m.s + m.y, left = px > vw * 0.6;
        Object.assign(cos[i].style, left ? { right: `${vw - px}px`, top: `${py}px` } : { left: `${px}px`, top: `${py}px` });
        if (left) cos[i].classList.add('left');
        c.pop(cos[i].querySelector('.ring'), calloutAt);
        c.fadeUp(cos[i].querySelector('.tx'), calloutAt + 150, { y: 10 });
        c.tw(cos[i], [{ opacity: 1 }, { opacity: 1 }], { at: calloutAt, dur: 1 });
        c.sfx('pop', calloutAt + 60, { take: i % 3 });
      }
    });
    const cur = c.q('.cur');
    if (!cur) return;
    const arrow = cur.querySelector('svg');
    const ease = (p) => p * p * p * (10 - 15 * p + 6 * p * p);
    const at = (t) => {
      if (!moves.length || t < moves[0].t0 - 200) return null;
      let p = moves[0].from;
      for (const mv of moves) {
        if (t < mv.t0) break;
        const u = U.clamp((t - mv.t0) / (mv.t1 - mv.t0)), e = ease(u);
        // a hand's path bows a little: an arc of 6% of the distance, largest midway
        const dx = mv.to[0] - mv.from[0], dy = mv.to[1] - mv.from[1], bow = Math.sin(Math.PI * u) * 0.06;
        p = [mv.from[0] + dx * e - dy * bow, mv.from[1] + dy * e + dx * bow];
      }
      return p;
    };
    c.tick((_, t) => {
      const p = at(t);
      if (!p) { cur.style.opacity = '0'; return; }
      const mtx = new DOMMatrix(getComputedStyle(cam).transform);
      cur.style.left = `${mtx.a * p[0] + mtx.e}px`;
      cur.style.top = `${mtx.d * p[1] + mtx.f}px`;
      cur.style.opacity = String(U.clamp((t - moves[0].t0 + 200) / 200));
      const last = clicks.filter((h) => h <= t).at(-1);
      const since = last == null ? 1e9 : t - last;
      // the press: the arrow dips as the button goes down and comes back up
      arrow.style.transform = since < 180 ? `scale(${0.82 + 0.18 * (since / 180)})` : 'none';
    });
  },
});
