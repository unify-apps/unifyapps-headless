// Layers stacked top to bottom, each a band with its name and what it holds. Each step brings in one band, gliding
// up; `accent: true` marks the band the story is about, which drops into its slot and keeps a sheen crossing it.
UA.scene('platform', {
  need: ['layers'],
  max: { layers: 5 },
  steps: (d) => d.layers.length,
  labels: (d) => d.layers.map((l) => `${l.name} ${(l.items ?? []).join(' ')}`),
  css: `
.sc-platform .stk { position: absolute; left: var(--side); right: var(--side); top: 360px; bottom: 150px; display: flex; flex-direction: column; gap: 14px; }
.sc-platform .band { flex: 1; display: grid; grid-template-columns: 480px 1fr; align-items: center; column-gap: 40px; padding: 0 36px; border-top: 2px solid var(--rule); position: relative; }
.sc-platform.gr-deep .band { border-color: var(--on-deep-rule); }
.sc-platform .band.ac { background: linear-gradient(100deg, var(--deep), var(--deep2)); border: 0; border-radius: 4px; }
.sc-platform.gr-deep .band.ac { background: linear-gradient(100deg, var(--on-deep), var(--on-deep2)); }
.sc-platform .nm { font: 500 36px/1.15 var(--serif); color: var(--ink); }
.sc-platform .band.ac .nm { color: var(--on-deep); }
.sc-platform.gr-deep .nm { color: var(--on-deep); }
.sc-platform.gr-deep .band.ac .nm { color: var(--deep); }
.sc-platform .its { font: 400 27px/1.4 var(--serif); color: var(--body); }
.sc-platform .its i { font-style: normal; color: var(--accent); margin: 0 16px; }
.sc-platform .band.ac .its { color: var(--on-deep-body); }
.sc-platform .band.ac .its i { color: var(--accent-on-deep); }
.sc-platform.gr-deep .its { color: var(--on-deep-body); }
.sc-platform.gr-deep .band.ac .its { color: var(--body); }`,
  build(d, U) {
    const bands = d.layers.map((l) => `<div class="band${l.accent ? ' ac' : ''}"><div class="nm">${U.esc(l.name)}</div><div class="its">${(l.items ?? []).map(U.esc).join('<i>·</i>')}</div></div>`).join('');
    return `${U.head(d)}<div class="stk">${bands}</div>`;
  },
  anim(c) {
    c.qa('.band').forEach((b, i) => {
      const at = c.t(i + 1);
      if (b.classList.contains('ac')) { c.snap(b, at, { y: -40 }); c.sheen(b, at + 900); } else c.rise(b, at, { y: 34, dur: 800 });
      c.fadeUp(b.querySelector('.its'), at + 350, { y: 10 });
    });
  },
});
