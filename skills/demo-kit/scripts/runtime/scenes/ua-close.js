// The platform story's close: the UnifyApps mark turning above "Stop hand-building. Start assembling.", then the three
// things that make it so, Assemble, Ground and Govern. An ending a story may use before its end card. Fixed content: a
// story adds it with "data": {}. The mark is the kit's own (the logo's dots), placed above the heading by `mark`.
UA.scene('ua-close', {
  need: [],
  steps: () => 2,
  labels: () => ['Stop hand-building. Start assembling.', 'Assemble Ground Govern'],
  // the mark sits above the heading, as on the reference page, unless the story places it itself
  mark: { x: 960, y: 252, s: 96, a: 1, spin: 1 },
  covers: [
    /stop\s+hand[-\s]?building/i,
    /start\s+assembling/i,
    /assemble,?\s+ground,?\s+(and\s+)?govern/i,
    /every\s+use\s+case\s+after\s+the\s+first\s+ships\s+faster/i,
  ],
  css: `
.sc-ua-close .glow { position: absolute; inset: 0; background: radial-gradient(820px 420px at 50% 47%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%); }
.sc-ua-close.gr-deep .glow { background: radial-gradient(860px 460px at 50% 47%, color-mix(in srgb, var(--deep3) 42%, transparent), transparent 70%); }
.sc-ua-close .ttl { position: absolute; left: var(--side); right: var(--side); top: 368px; max-width: none; text-align: center; font-size: 80px; }
.sc-ua-close .ld { position: absolute; left: 50%; top: 492px; width: 1180px; margin-left: -590px; text-align: center; text-wrap: balance; font: 400 28px/1.45 var(--serif); color: var(--body); }
.sc-ua-close.gr-deep .ld { color: var(--on-deep-body); }
.sc-ua-close .cols { position: absolute; left: 50%; top: 636px; width: 1260px; margin-left: -630px; display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 24px; }
.sc-ua-close .col { position: relative; overflow: hidden; border-radius: 22px; padding: 30px 32px 34px; background: var(--card); border: 1px solid var(--rule); box-shadow: 0 18px 44px var(--edge); }
.sc-ua-close.gr-deep .col { background: color-mix(in srgb, var(--on-deep) 4%, transparent); border-color: var(--on-deep-rule); box-shadow: none; }
.sc-ua-close .col b { display: block; font: 500 34px/1.15 var(--serif); color: var(--ink); }
.sc-ua-close.gr-deep .col b { color: var(--on-deep); }
.sc-ua-close .col span { display: block; margin-top: 12px; font: 400 23px/1.45 var(--serif); color: var(--body); }
.sc-ua-close.gr-deep .col span { color: var(--on-deep-body); }
.sc-ua-close.gr-deep .col .ua-sheen { opacity: .5; }`,
  build(d, U) {
    const cols = [
      ['Assemble', 'Three builders on one canvas: workflows, agents and apps from reusable blocks.'],
      ['Ground', 'One enterprise brain with knowledge, governance and actionability context.'],
      ['Govern', 'A glass box over every layer, with cost and ROI tracked per agent.'],
    ].map(([b, s]) => `<div class="col"><b>${U.esc(b)}</b><span>${U.esc(s)}</span></div>`).join('');
    return `<div class="glow"></div><h2 class="h2 ttl">${U.line('Stop hand-building.', 'Start assembling.')}</h2>`
      + '<p class="ld">One platform, one context, one governance model, so every use case after the first ships faster than the last.</p>'
      + `<div class="cols">${cols}</div>`;
  },
  anim(c) {
    c.fade(c.q('.glow'), c.start, { dur: 1200 });
    const T1 = c.t(1), T2 = c.t(2), cols = c.qa('.col');
    c.headline(c.q('.ttl'), T1, 'rise');
    c.fadeUp(c.q('.ld'), T1 + 650, { y: 16, dur: 800 });
    c.rise(cols, T2, { y: 30, dur: 750, stagger: 140 });
    cols.forEach((el, i) => {
      c.fadeUp(el.querySelector('b'), T2 + 200 + i * 140, { y: 10, dur: 600 });
      c.fadeUp(el.querySelector('span'), T2 + 330 + i * 140, { y: 10, dur: 600 });
    });
    c.sheen(cols, T2 + 1400, { period: 5600 });
  },
});
