// How it works today against how it works with UnifyApps, one row per step: the old way, an arrow, the new way
// sliding in across it; the arrows carry a current while the scene holds.
UA.scene('before-after', {
  need: ['rows'],
  max: { rows: 5 },
  steps: (d) => d.rows.length,
  labels: (d) => d.rows.map((r) => `${r.after} ${r.before}`),
  css: `
.sc-before-after .tb { width: 100%; }
.sc-before-after .heads, .sc-before-after .row { display: grid; grid-template-columns: 1fr 110px 1fr; column-gap: 24px; align-items: center; }
.sc-before-after .heads { padding-bottom: 20px; }
.sc-before-after .heads .a { color: var(--alert); }
.sc-before-after .heads .b { color: var(--deep2); }
.sc-before-after.gr-deep .heads .b { color: var(--accent-on-deep); }
.sc-before-after .row { position: relative; padding: 24px 0; }
.sc-before-after .row .rl { position: absolute; left: 0; right: 0; top: 0; height: 1px; background: var(--rule); transform-origin: 0 50%; }
.sc-before-after.gr-deep .row .rl { background: var(--on-deep-rule); }
.sc-before-after .bf, .sc-before-after .af { font: 400 30px/1.32 var(--serif); display: flex; gap: 18px; align-items: baseline; }
.sc-before-after .bf { color: var(--muted); }
.sc-before-after .af { color: var(--ink); font-weight: 500; }
.sc-before-after.gr-deep .bf { color: var(--on-deep-body); }
.sc-before-after.gr-deep .af { color: var(--on-deep); }
.sc-before-after .bf i, .sc-before-after .af i { font: 600 22px/1 var(--sans); font-style: normal; flex: none; width: 22px; }
.sc-before-after .bf i { color: var(--alert); }
.sc-before-after .af i { color: var(--deep3); }
.sc-before-after.gr-deep .af i { color: var(--accent-on-deep); }
.sc-before-after svg { width: 110px; height: 24px; overflow: visible; }
.sc-before-after svg path { fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.sc-before-after.gr-deep svg path { stroke: var(--accent-on-deep); }`,
  build(d, U) {
    const rows = d.rows.map((r) => `<div class="row"><div class="rl"></div><div class="bf"><i>✕</i><span>${U.esc(r.before)}</span></div><svg viewBox="0 0 110 24"><path d="M6 12 H100 M90 3 L101 12 L90 21"/></svg><div class="af"><i>✓</i><span>${U.esc(r.after)}</span></div></div>`).join('');
    return `${U.head(d)}<div class="area"><div class="tb"><div class="heads"><div class="lbl a">${U.esc(d.beforeLabel ?? 'Today')}</div><div></div><div class="lbl b">${U.esc(d.afterLabel ?? 'With UnifyApps')}</div></div>${rows}</div></div>`;
  },
  anim(c) {
    c.fade(c.qa('.heads .lbl'), c.start + 700, { stagger: 200 });
    c.qa('.row').forEach((row, i) => {
      const at = c.t(i + 1);
      c.grow(row.querySelector('.rl'), at, { dur: 700 });
      c.fadeUp(row.querySelector('.bf'), at + 80, { y: 14 });
      c.draw(row.querySelector('path'), at + 450, { dur: 650 });
      c.current(row.querySelector('path'), at + 1100, { dash: '2 8', speed: 20 });
      c.slide(row.querySelector('.af'), at + 850, { x: -36 });
    });
  },
});
