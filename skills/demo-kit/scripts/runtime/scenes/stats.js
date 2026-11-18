// One to four figures that count up as they are spoken. Every figure needs its source (the plan check refuses one
// without), shown in the footnote. A figure that is not a number goes in `text` and rises instead of counting.
UA.scene('stats', {
  need: ['items'],
  max: { items: 4 },
  steps: (d) => d.items.length,
  labels: (d) => d.items.map((it) => `${it.value ?? it.text ?? ''} ${it.label ?? ''}`),
  css: `
.sc-stats .grid { display: grid; column-gap: 64px; }
.sc-stats .it .rl { height: 2px; background: var(--rule); margin-bottom: 34px; transform-origin: 0 50%; }
.sc-stats.gr-deep .it .rl { background: var(--on-deep-rule); }
.sc-stats .num { font: 300 128px/1 var(--serif); color: var(--deep2); letter-spacing: -.03em; font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; }
.sc-stats.gr-deep .num { color: var(--accent-on-deep); }
.sc-stats .num small { font-size: .46em; letter-spacing: 0; margin-left: 6px; }
.sc-stats .lb { margin-top: 26px; font: 500 32px/1.22 var(--serif); color: var(--ink); text-wrap: balance; }
.sc-stats.gr-deep .lb { color: var(--on-deep); }
.sc-stats .sb { margin-top: 12px; font: 400 25px/1.42 var(--serif); color: var(--body); }
.sc-stats.gr-deep .sb { color: var(--on-deep-body); }`,
  build(d, U) {
    const items = d.items.map((it) => {
      const unit = it.unit ? `<small>${U.esc(it.unit)}</small>` : '';
      const num = typeof it.value === 'number' ? `<span class="v">${U.esc(it.prefix ?? '')}${(it.from ?? 0).toLocaleString('en-US')}${U.esc(it.suffix ?? '')}</span>` : `<span>${U.esc(it.text ?? it.value)}</span>`;
      return `<div class="it"><div class="rl"></div><div class="num">${num}${unit}</div><div class="lb">${U.esc(it.label)}</div>${it.sub ? `<div class="sb">${U.esc(it.sub)}</div>` : ''}</div>`;
    }).join('');
    return `${U.head(d)}<div class="area"><div class="grid" style="grid-template-columns:repeat(${Math.max(2, d.items.length)},1fr)">${items}</div></div>`;
  },
  anim(c, d) {
    c.qa('.it').forEach((el, i) => {
      const it = d.items[i], at = c.t(i + 1);
      c.grow(el.querySelector('.rl'), at, { dur: 700 });
      c.rise(el.querySelector('.num'), at + 100, { y: 30, dur: 700 });
      if (typeof it.value === 'number') c.count(el.querySelector('.v'), { from: it.from ?? 0, to: it.value, at: at + 150, dur: 1500, decimals: it.decimals ?? 0, prefix: it.prefix, suffix: it.suffix });
      c.fadeUp(el.querySelector('.lb'), at + 450, { y: 16 });
      c.fadeUp(el.querySelector('.sb'), at + 650, { y: 12 });
    });
  },
});
