// The customer's systems around one centre. Step 1 brings the systems in. Step 2, in `connect` mode (the default),
// wires each one to UnifyApps in the centre, which glows, with data moving along the wires; in `tangle` mode it draws the
// point-to-point wiring they live with today, in the alert colour, and leaves the centre empty.
UA.scene('hub', {
  need: ['systems'],
  max: { systems: 12 },
  steps: () => 2,
  labels: (d) => [d.systems.map((s) => (typeof s === 'string' ? s : s.name)).join(' '), `${d.center?.title ?? 'UnifyApps'} wire connect tangle`],
  css: `
.sc-hub svg.wr { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: visible; }
.sc-hub .wire { stroke: var(--accent); stroke-width: 2.5; fill: none; opacity: .75; }
.sc-hub.gr-deep .wire { stroke: var(--accent-on-deep); }
.sc-hub .tangle { stroke: var(--alert); stroke-width: 2.5; fill: none; opacity: .7; }
.sc-hub .pk { fill: var(--deep2); }
.sc-hub .pk.by-hand { fill: var(--alert); }
.sc-hub.gr-deep .pk { fill: var(--on-deep); }
.sc-hub .sys { position: absolute; width: 300px; margin: -7px 0 0 -150px; text-align: center; }
.sc-hub .sys.l { width: 280px; margin: -17px 0 0 -273px; text-align: right; display: flex; flex-direction: row-reverse; gap: 16px; align-items: flex-start; }
.sc-hub .sys.r { width: 280px; margin: -17px 0 0 -7px; text-align: left; display: flex; gap: 16px; align-items: flex-start; }
.sc-hub .sys.l i, .sc-hub .sys.r i { margin: 10px 0 0; flex: none; }
.sc-hub .sys.t { margin: 0 0 -7px -150px; display: flex; flex-direction: column; }
.sc-hub .sys.t i { margin: 14px auto 0; order: 2; }
.sc-hub .sys i { display: block; width: 14px; height: 14px; margin: 0 auto 14px; border-radius: 50%; background: var(--accent); }
.sc-hub.gr-deep .sys i { background: var(--accent-on-deep); }
.sc-hub .sys b { display: block; font: 500 29px/1.2 var(--serif); color: var(--ink); }
.sc-hub.gr-deep .sys b { color: var(--on-deep); }
.sc-hub .sys span { display: block; margin-top: 8px; }
.sc-hub .core { position: absolute; width: 270px; height: 270px; margin: -135px 0 0 -135px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, var(--deep-glow), var(--deep-bg) 70%); box-shadow: 0 30px 80px var(--deep-shadow); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 30px; }
.sc-hub.gr-deep .core { background: radial-gradient(circle at 40% 35%, var(--on-deep), var(--on-deep3) 75%); }
.sc-hub .core b { font: 500 34px/1.15 var(--serif); color: var(--on-deep); }
.sc-hub.gr-deep .core b { color: var(--deep); }
.sc-hub .core span { margin-top: 10px; font: 600 18px/1.3 var(--sans); letter-spacing: .12em; text-transform: uppercase; color: var(--accent-on-deep); }
.sc-hub.gr-deep .core span { color: var(--accent); }`,
  build(d, U) {
    const cx = 960, cy = d.cy ?? 610, rx = d.rx ?? 600, ry = d.ry ?? 235, n = d.systems.length;
    const pts = d.systems.map((_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]; });
    const tangle = d.mode === 'tangle';
    let paths = '';
    if (tangle) {
      const r = U.rand(`${d.title}${n}`), seen = new Set();
      for (let i = 0; i < n; i++) for (const step of [2, 3, Math.ceil(n / 2)]) {
        const j = (i + step) % n, key = [i, j].sort().join('-'); if (i === j || seen.has(key)) continue; seen.add(key);
        const [x1, y1] = pts[i], [x2, y2] = pts[j], mx = (x1 + x2) / 2 + (r() - 0.5) * 260, my = (y1 + y2) / 2 + (r() - 0.5) * 200;
        paths += `<path class="tangle" d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}"/>`;
      }
      paths += Array.from({ length: Math.min(8, (paths.match(/class="tangle"/g) ?? []).length) }, () => '<circle class="pk by-hand" r="5"/>').join('');
    } else {
      paths = pts.map(([x, y]) => { const a = Math.atan2(y - cy, x - cx); return `<path class="wire" d="M${x - 16 * Math.cos(a)} ${y - 16 * Math.sin(a)} L${cx + 140 * Math.cos(a)} ${cy + 140 * Math.sin(a)}"/>`; }).join('');
    }
    // a system is a name, or {name, sub}; the dot sits on the ring and the name under it, clear of the wires
    // the name sits on the outer side of its dot (left, right, above or below), so no wire crosses it
    const side = ([x, y]) => (Math.abs(x - cx) > rx * 0.45 ? (x < cx ? 'l' : 'r') : y < cy ? 't' : 'b');
    // a label beside its dot is as wide as the room between the dot and the frame's margin, never wider, and wraps
    const room = (x, sd) => Math.min(280, sd === 'l' ? x - 112 + 7 : 1920 - 112 - x + 7);
    const fit = (x, sd) => (sd === 'l' ? `width:${room(x, sd)}px;margin-left:${7 - room(x, sd)}px;` : sd === 'r' ? `width:${room(x, sd)}px;` : '');
    const sys = d.systems.map((s, i) => { const o = typeof s === 'string' ? { name: s } : s; const sd = side(pts[i]); return `<div class="sys ${sd}" style="left:${pts[i][0]}px;${fit(pts[i][0], sd)}${sd === 't' ? `bottom:${1080 - pts[i][1]}px` : `top:${pts[i][1]}px`}"><i></i><span class="nm"><b>${U.esc(o.name)}</b>${o.sub ? `<span class="lbl">${U.esc(o.sub)}</span>` : ''}</span></div>`; }).join('');
    const core = tangle ? '' : `<div class="core" style="left:${cx}px;top:${cy}px"><b>${U.esc(d.center?.title ?? 'UnifyApps')}</b>${d.center?.sub ? `<span>${U.esc(d.center.sub)}</span>` : ''}</div>`;
    return `${U.head(d)}<svg class="wr" viewBox="0 0 1920 1080">${paths}</svg>${core}${sys}`;
  },
  anim(c, d) {
    c.fadeUp(c.qa('.sys'), c.t(1), { y: 16, stagger: 90 });
    if (d.mode === 'tangle') {
      c.draw(c.qa('.tangle'), c.t(2), { dur: 700, stagger: 70 });
      // work carried by hand: a slow, uneven crawl along the tangled wires, each at its own pace
      const lines = c.qa('.tangle'), carried = c.qa('.pk.by-hand'), from = c.t(2) + 900;
      c.live((k) => carried.forEach((p, i) => {
        if (k < i * 240) { p.setAttribute('opacity', '0'); return; }
        const w = lines[i % lines.length], len = w.getTotalLength(), ph = ((k / (2600 + i * 370) + i * 0.29) % 1 + 1) % 1;
        const pt = w.getPointAtLength(len * ph);
        p.setAttribute('cx', pt.x); p.setAttribute('cy', pt.y); p.setAttribute('opacity', String(0.85 * Math.sin(Math.PI * ph)));
      }), from);
      return;
    }
    c.pop(c.q('.core'), c.t(2) - 200, { dur: 800 });
    c.draw(c.qa('.wire'), c.t(2) + 300, { dur: 700, stagger: 60 });
    // data on every wire into the centre, and the centre glowing, for as long as the scene holds
    c.travel(c.qa('.wire'), c.t(2) + 1200, { dur: 1700, stagger: 60, r: 6 });
    c.halo(c.q('.core'), c.t(2) + 900);
  },
});
