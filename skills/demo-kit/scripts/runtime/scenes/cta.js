// The ask: two to four next steps along one path, each with a number, a title and a line. One step per step: its
// number drops into place on the path, and the step just reached pings while the scene holds.
UA.scene('cta', {
  need: ['items'],
  max: { items: 4 },
  steps: (d) => d.items.length,
  labels: (d) => d.items.map((it) => `${it.title} ${it.text ?? ''}`),
  css: `
.sc-cta .row { position: relative; display: grid; column-gap: 56px; }
.sc-cta .path { position: absolute; top: 37px; height: 0; border-top: 2.5px dotted var(--accent); transform-origin: 0 50%; }
.sc-cta.gr-deep .path { border-color: var(--accent-on-deep); }
.sc-cta .st .n { width: 76px; height: 76px; border-radius: 50%; border: 2.5px solid var(--accent); display: flex; align-items: center; justify-content: center; font: 300 38px/1 var(--serif); color: var(--accent); background: var(--paper); position: relative; }
.sc-cta.gr-deep .st .n { border-color: var(--accent-on-deep); color: var(--accent-on-deep); background: var(--deep-bg2); }
.sc-cta .st .ti { margin-top: 30px; font: 500 34px/1.2 var(--serif); color: var(--ink); }
.sc-cta.gr-deep .st .ti { color: var(--on-deep); }
.sc-cta .st .tx { margin-top: 12px; font: 400 25px/1.45 var(--serif); color: var(--body); }
.sc-cta.gr-deep .st .tx { color: var(--on-deep-body); }
.sc-cta .ct { margin-top: 72px; font: 400 30px/1.3 var(--serif); color: var(--ink); }
.sc-cta.gr-deep .ct { color: var(--on-deep); }`,
  build(d, U) {
    const n = d.items.length, colW = (1696 - 56 * (n - 1)) / n;
    const path = n > 1 ? `<div class="path" style="left:${38 + 50}px;width:${(n - 1) * (colW + 56) - 100}px"></div>` : '';
    const st = d.items.map((it, i) => `<div class="st"><div class="n">${i + 1}</div><div class="ti">${U.esc(it.title)}</div>${it.text ? `<div class="tx">${U.esc(it.text)}</div>` : ''}</div>`).join('');
    return `${U.head(d)}<div class="area"><div class="row" style="grid-template-columns:repeat(${n},1fr)">${path}${st}</div>${d.contact ? `<p class="ct">${U.esc(d.contact)}</p>` : ''}</div>`;
  },
  anim(c) {
    // the path runs on as each step arrives
    const path = c.q('.path');
    if (path) c.qa('.st').slice(1).forEach((_, i, all) => c.tw(path, [{ transform: `scaleX(${i / all.length})` }, { transform: `scaleX(${(i + 1) / all.length})` }], { at: c.t(i + 2) - 400, dur: 600, ease: 'cine' }));
    c.qa('.st').forEach((st, i) => {
      const at = c.t(i + 1);
      c.snap(st.querySelector('.n'), at, { y: -40 });
      c.ping(st.querySelector('.n'), at + 800, { period: 2600, stagger: i * 500 });
      c.rise(st.querySelector('.ti'), at + 250, { y: 16 });
      c.fadeUp(st.querySelector('.tx'), at + 450, { y: 12 });
    });
    c.fade(c.q('.ct'), c.t(c.steps) + 900);
  },
});
