// Two to five points laid straight onto the page (no cards): side by side in columns, or one under another in rows.
// Each step brings in one point: its rule draws, its label, title and line follow.
UA.scene('points', {
  need: ['items'],
  max: { items: 5 },
  steps: (d) => d.items.length,
  labels: (d) => d.items.map((it) => `${it.title} ${it.text ?? ''}`),
  css: `
.sc-points .grid { display: grid; column-gap: 60px; }
.sc-points .pt .rl { height: 2px; background: var(--accent); transform-origin: 0 50%; margin-bottom: 26px; opacity: .8; }
.sc-points.gr-deep .pt .rl { background: var(--accent-on-deep); }
.sc-points .pt .no { margin-bottom: 18px; color: var(--accent); }
.sc-points.gr-deep .pt .no { color: var(--accent-on-deep); }
.sc-points .pt .ti { font: 500 36px/1.18 var(--serif); color: var(--ink); margin-bottom: 14px; }
.sc-points.gr-deep .pt .ti { color: var(--on-deep); }
.sc-points .pt .tx { font: 400 26px/1.45 var(--serif); color: var(--body); }
.sc-points.gr-deep .pt .tx { color: var(--on-deep-body); }
.sc-points .rows { width: 100%; display: grid; grid-template-columns: fit-content(380px) 1fr; column-gap: 30px; }
.sc-points .rows .pt { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; padding: 22px 0; position: relative; }
.sc-points .rows .pt .rl { position: absolute; left: 0; right: 0; top: 0; margin: 0; height: 1px; background: var(--rule); opacity: 1; }
.sc-points.gr-deep .rows .pt .rl { background: var(--on-deep-rule); }
.sc-points .rows .pt .no { font: 300 44px/1.05 var(--serif); letter-spacing: 0; margin: 4px 0 0; min-width: 110px; text-wrap: balance; }
.sc-points .rows .pt .ti { margin-bottom: 8px; }`,
  build(d, U) {
    const rows = d.layout === 'rows';
    const items = d.items.map((it, i) => `<div class="pt"><div class="rl"></div><div class="no ${rows ? '' : 'lbl'}">${U.esc(it.label ?? String(i + 1).padStart(2, '0'))}</div><div><div class="ti">${U.esc(it.title)}</div>${it.text ? `<div class="tx">${U.esc(it.text)}</div>` : ''}</div></div>`).join('');
    return `${U.head(d)}<div class="area"><div class="${rows ? 'rows' : 'grid'}" style="${rows ? '' : `grid-template-columns:repeat(${d.items.length},1fr)`}">${items}</div></div>`;
  },
  anim(c) {
    c.qa('.pt').forEach((pt, i) => {
      const at = c.t(i + 1);
      c.grow(pt.querySelector('.rl'), at, { dur: 800 });
      c.fade(pt.querySelector('.no'), at + 150);
      c.rise(pt.querySelector('.ti'), at + 220, { y: 20 });
      c.fadeUp(pt.querySelector('.tx'), at + 420, { y: 14 });
    });
  },
});
