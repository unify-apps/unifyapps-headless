// Milestones on one axis (weeks, days, months). Each step grows the progress line to the next milestone and brings
// in its label, above and below the axis in turn; a reached milestone pings and the line shimmers while it holds. With `counter`, the unit counts up in the corner as the line grows.
UA.scene('timeline', {
  need: ['items'],
  max: { items: 6 },
  steps: (d) => d.items.length,
  labels: (d) => d.items.map((it) => `${it.title} ${it.when ?? ''}`),
  css: `
.sc-timeline .ax { position: absolute; left: var(--side); right: var(--side); height: 2px; background: var(--rule); }
.sc-timeline.gr-deep .ax { background: var(--on-deep-rule); }
.sc-timeline .pr { position: absolute; left: var(--side); height: 5px; background: var(--deep2); transform-origin: 0 50%; border-radius: 3px; }
.sc-timeline.gr-deep .pr { background: var(--accent-on-deep); }
.sc-timeline .mk { position: absolute; width: 26px; height: 26px; border-radius: 50%; background: var(--deep2); border: 5px solid var(--paper); box-shadow: 0 0 0 2px var(--deep2); margin: -13px 0 0 -13px; }
.sc-timeline.gr-deep .mk { background: var(--accent-on-deep); border-color: var(--deep-bg); box-shadow: 0 0 0 2px var(--accent-on-deep); }
.sc-timeline .lb { position: absolute; width: 330px; }
.sc-timeline .lb .when { color: var(--accent); margin-bottom: 10px; }
.sc-timeline.gr-deep .lb .when { color: var(--accent-on-deep); }
.sc-timeline .lb .ti { font: 500 30px/1.2 var(--serif); color: var(--ink); }
.sc-timeline.gr-deep .lb .ti { color: var(--on-deep); }
.sc-timeline .lb .tx { margin-top: 8px; font: 400 23px/1.4 var(--serif); color: var(--body); }
.sc-timeline.gr-deep .lb .tx { color: var(--on-deep-body); }
.sc-timeline .ctr { position: absolute; right: var(--side); top: 96px; text-align: right; }
.sc-timeline .ctr b { display: block; font: 300 96px/1 var(--serif); color: var(--deep2); font-variant-numeric: tabular-nums; }
.sc-timeline.gr-deep .ctr b { color: var(--accent-on-deep); }`,
  build(d, U) {
    const y = d.y ?? 630, x0 = 112 + 40, x1 = 1920 - 112 - 40;
    const max = d.max ?? Math.max(...d.items.map((it) => it.at));
    const min = d.min ?? 0;
    const xs = d.items.map((it) => x0 + ((x1 - x0) * (it.at - min)) / (max - min || 1));
    const unit = d.unit ? `${d.unit} ` : '';
    const lbs = d.items.map((it, i) => {
      // a label starts at its marker, or ends at it when it would run off the right edge
      const up = i % 2 === 0, right = xs[i] + 330 > 1920 - 112;
      const pos = right ? `right:${1920 - xs[i] - 13}px;text-align:right` : `left:${xs[i] - 13}px`;
      return `<div class="lb" style="${pos};${up ? `bottom:${1080 - y + 44}px` : `top:${y + 44}px`}"><div class="lbl when">${U.esc(it.when ?? `${unit}${it.at}`)}</div><div class="ti">${U.esc(it.title)}</div>${it.text ? `<div class="tx">${U.esc(it.text)}</div>` : ''}</div>`;
    }).join('');
    const mks = xs.map((x) => `<div class="mk" style="left:${x}px;top:${y}px"></div>`).join('');
    const ctr = d.counter && d.unit ? `<div class="ctr"><span class="lbl">${U.esc(d.unit)}</span><b>${min}</b></div>` : '';
    return `${U.head(d)}${ctr}<div class="ax" style="top:${y - 1}px"></div><div class="pr" style="top:${y - 2.5}px;width:${x1 - 112}px" data-xs="${xs.map((x) => x - 112).join(',')}" data-w="${x1 - 112}"></div>${mks}${lbs}`;
  },
  anim(c, d, U) {
    const pr = c.q('.pr'), xs = pr.dataset.xs.split(',').map(Number), w = +pr.dataset.w;
    c.grow(c.q('.ax'), c.start + 300, { dur: 1200 });
    let prev = 0;
    xs.forEach((x, i) => {
      const at = c.t(i + 1);
      c.tw(pr, [{ transform: `scaleX(${prev / w})` }, { transform: `scaleX(${x / w})` }], { at, dur: 1000, ease: 'cine' });
      prev = x;
      c.pop(c.qa('.mk')[i], at + 800);
      c.ping(c.qa('.mk')[i], at + 1300, { period: 2800 });
      c.fadeUp(c.qa('.lb')[i], at + 850, { y: i % 2 ? -14 : 14 });
    });
    c.sheen(pr, c.t(1) + 1200, { period: 3400 });
    const b = c.q('.ctr b');
    if (b) {
      const min = d.min ?? 0;
      c.fade(c.q('.ctr'), c.start + 600);
      c.tick((_, t) => {
        let v = min;
        d.items.forEach((it, i) => { const at = c.t(i + 1), from = i ? d.items[i - 1].at : min; if (t >= at) v = from + (it.at - from) * U.outCubic(U.clamp((t - at) / 1000)); });
        b.textContent = String(Math.round(v));
      });
    }
  },
});
