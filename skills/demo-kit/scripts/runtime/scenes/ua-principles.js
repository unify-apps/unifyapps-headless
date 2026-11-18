// The platform story's three principles: start with the P&L, not the software. Fixed content (data: {}). The three
// habits arrive as cards; builds 1 to 3 strike each habit and bring in the principle that replaces it. Build 4 swaps the
// cards for Principle 1's P&L in the same place, at today's values; builds 5 to 7 pick the outcomes one by one (grow
// revenue, reduce cost, manage risk) and the bars move.
UA.scene('ua-principles', {
  need: [],
  steps: () => 7,
  PRIN: [
    ['Principle 1', 'Technology-first', 'Outcome-first', 'What business result are we changing, and how will we measure it?'],
    ['Principle 2', 'Entity-first', 'Workflow-first', 'What work is actually being done, end to end, across every system it touches?'],
    ['Principle 3', 'Code-first', 'Assembly-first', 'What have we already built that we can reuse, and what should become reusable?'],
  ],
  OUT: [['rev', 'Grow revenue'], ['cost', 'Reduce cost'], ['risk', 'Manage risk']],
  // the P&L's bars (% of the track) with no outcome picked, and with each one picked, as the platform story draws them
  pl(on) {
    const rev = on.rev ? 76 : 62, cost = on.cost ? 38 : 48, risk = on.risk ? 22 : 44;
    return { rev, cost, mar: Math.max(4, rev - cost), risk };
  },
  // a soft glow breathing around each target (a card or a picked outcome), drawn on a child of its own; the kit's halo
  // scales inside a large card and shows over its face, so this one only ever sits outside the edge
  breathe(c, targets, from, period) {
    targets.forEach((el, i) => {
      const g = document.createElement('i'); g.className = 'ua-fx gl'; el.prepend(g);
      c.live((k) => { g.style.opacity = k < 0 ? '0' : String(Math.min(1, k / 500) * (0.35 + 0.65 * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / period + i)))); }, from);
    });
  },
  labels() {
    return [
      ...this.PRIN.map(([, old, n, q]) => `${old} ${n} ${q}`),
      'Every business problem resolves to one of three things P&L revenue cost margin risk',
      ...this.OUT.map(([, n]) => n),
    ];
  },
  covers: [/\bstart with the p\s*&\s*l\b/i, /\boutcome[- ]first\b/i, /\bworkflow[- ]first\b/i, /\btechnology[- ]first\b/i, /\bentity[- ]first\b/i],
  css: `
.sc-ua-principles .ld { position: absolute; left: var(--side); top: 244px; max-width: 1240px; font: 400 24px/1.45 var(--sans); color: var(--body); }
.sc-ua-principles.gr-deep .ld { color: var(--on-deep-body); }
.sc-ua-principles .stg { position: absolute; left: var(--side); right: var(--side); top: 350px; bottom: 128px; }
.sc-ua-principles .cards { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; align-content: center; }
.sc-ua-principles .pf { position: relative; height: 320px; padding: 30px 34px; border-radius: 24px; background: var(--card); border: 1px solid var(--rule); }
.sc-ua-principles.gr-deep .pf { background: color-mix(in srgb, var(--on-deep) 5%, transparent); border-color: var(--on-deep-rule); }
.sc-ua-principles .gl { position: absolute; inset: -1px; border-radius: inherit; opacity: 0; box-shadow: 0 0 34px 4px color-mix(in srgb, var(--deep3) 30%, transparent); }
.sc-ua-principles .ob .gl { box-shadow: 0 0 30px 4px var(--accent-halo); }
.sc-ua-principles.gr-deep .gl { box-shadow: 0 0 36px 6px color-mix(in srgb, var(--accent-on-deep) 30%, transparent); }
.sc-ua-principles .pf .ring { position: absolute; inset: -1px; border-radius: inherit; border: 2px solid var(--deep3); opacity: 0; }
.sc-ua-principles.gr-deep .pf .ring { border-color: var(--accent-on-deep); }
.sc-ua-principles .k { font: 600 18px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.sc-ua-principles.gr-deep .k { color: var(--accent-on-deep); }
.sc-ua-principles .old { position: absolute; left: 34px; top: 68px; transform-origin: 0 0; font: 400 40px/1.2 var(--serif); color: var(--alert); white-space: nowrap; }
.sc-ua-principles.gr-deep .old { color: color-mix(in srgb, var(--alert) 58%, var(--on-deep)); }
.sc-ua-principles .old .st { position: absolute; left: -3px; right: -3px; top: 55%; height: 3px; background: currentColor; transform-origin: 0 50%; }
.sc-ua-principles .nw { position: absolute; left: 34px; right: 34px; top: 124px; }
.sc-ua-principles .nw b { display: block; font: 600 44px/1.1 var(--serif); color: var(--deep); }
.sc-ua-principles.gr-deep .nw b { color: var(--on-deep); }
.sc-ua-principles .nw span { display: block; margin-top: 14px; font: 400 24px/1.42 var(--sans); color: var(--body); text-wrap: pretty; }
.sc-ua-principles.gr-deep .nw span { color: var(--on-deep-body); }
.sc-ua-principles .pl { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
.sc-ua-principles .ey { font: 600 18px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.sc-ua-principles.gr-deep .ey { color: var(--accent-on-deep); }
.sc-ua-principles .h3 { margin-top: 14px; font: 400 48px/1.14 var(--serif); letter-spacing: -.01em; color: var(--ink); }
.sc-ua-principles .h3 em { font-style: italic; color: var(--accent); }
.sc-ua-principles.gr-deep .h3 { color: var(--on-deep); }
.sc-ua-principles.gr-deep .h3 em { color: var(--accent-on-deep); }
.sc-ua-principles .tx { margin-top: 18px; font: 400 23px/1.5 var(--sans); color: var(--body); text-wrap: pretty; }
.sc-ua-principles.gr-deep .tx { color: var(--on-deep-body); }
.sc-ua-principles .oc { margin-top: 30px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.sc-ua-principles .ob { position: relative; padding: 16px 18px 18px; border-radius: 14px; background: var(--card); border: 1px solid var(--rule); border-left: 5px solid var(--accent2); }
.sc-ua-principles.gr-deep .ob { background: color-mix(in srgb, var(--on-deep) 5%, transparent); border-color: var(--on-deep-rule); border-left-color: var(--accent-on-deep); }
.sc-ua-principles .ob .on { position: absolute; inset: -1px -1px -1px -5px; border-radius: inherit; background: var(--deep); border-left: 5px solid var(--accent-on-deep); box-shadow: 0 12px 26px var(--deep-shadow); opacity: 0; }
.sc-ua-principles.gr-deep .ob .on { background: var(--on-deep); border-left-color: var(--accent); }
.sc-ua-principles .ob small { position: relative; display: block; font: 600 18px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.sc-ua-principles .ob b { position: relative; display: block; margin-top: 4px; font: 600 28px/1.2 var(--serif); color: var(--deep); white-space: nowrap; }
.sc-ua-principles.gr-deep .ob small { color: var(--accent-on-deep); }
.sc-ua-principles.gr-deep .ob b { color: var(--on-deep); }
.sc-ua-principles .pn { position: relative; padding: 30px 34px 28px; border-radius: 26px; background: var(--card); border: 1px solid var(--rule); box-shadow: 0 24px 60px color-mix(in srgb, var(--shadow) 45%, transparent); }
.sc-ua-principles.gr-deep .pn { background: color-mix(in srgb, var(--on-deep) 6%, transparent); border-color: var(--on-deep-rule); box-shadow: none; }
.sc-ua-principles .ph { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.sc-ua-principles .ph b { font: 600 30px/1.2 var(--serif); color: var(--deep); }
.sc-ua-principles .ph span { font: 400 18px/1.2 var(--sans); color: var(--muted); }
.sc-ua-principles.gr-deep .ph b { color: var(--on-deep); }
.sc-ua-principles.gr-deep .ph span { color: var(--on-deep-body); }
.sc-ua-principles .pr { display: grid; grid-template-columns: 190px 1fr; gap: 16px; align-items: center; margin-top: 18px; }
.sc-ua-principles .pk { font: 500 22px/1.2 var(--sans); color: var(--ink2); }
.sc-ua-principles.gr-deep .pk { color: var(--on-deep); }
.sc-ua-principles .tr { position: relative; display: block; height: 32px; border-radius: 9px; overflow: hidden; background: var(--paper3); }
.sc-ua-principles.gr-deep .tr { background: color-mix(in srgb, var(--on-deep) 12%, transparent); }
.sc-ua-principles .tr .mk { position: absolute; top: 4px; bottom: 4px; width: 2px; margin-left: -1px; background: color-mix(in srgb, var(--body) 45%, transparent); }
.sc-ua-principles.gr-deep .tr .mk { background: color-mix(in srgb, var(--on-deep) 55%, transparent); }
.sc-ua-principles .tr .u { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 9px; transform-origin: 0 50%; }
.sc-ua-principles .rev .u { background: linear-gradient(90deg, color-mix(in srgb, var(--deep3) 70%, var(--paper)), var(--deep3)); }
.sc-ua-principles.gr-deep .rev .u { background: linear-gradient(90deg, color-mix(in srgb, var(--deep3) 50%, var(--on-deep)), color-mix(in srgb, var(--deep3) 78%, var(--on-deep))); }
.sc-ua-principles .cost .u { background: linear-gradient(90deg, color-mix(in srgb, var(--alert) 66%, var(--paper)), var(--alert)); }
.sc-ua-principles .mar .u { background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 62%, var(--paper)), var(--accent)); }
.sc-ua-principles .risk .u { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--alert) 55%, transparent) 0 7px, color-mix(in srgb, var(--alert) 32%, transparent) 7px 14px); }
.sc-ua-principles.gr-deep .risk .u { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--alert) 85%, transparent) 0 7px, color-mix(in srgb, var(--alert) 55%, transparent) 7px 14px); }
.sc-ua-principles .nts { display: grid; margin-top: 22px; }
.sc-ua-principles .nt { grid-area: 1 / 1; font: 400 19px/1.4 var(--sans); color: var(--muted); }
.sc-ua-principles.gr-deep .nt { color: var(--on-deep-body); }`,
  build(d, U) {
    const w = U.words, e = U.esc;
    const head = `<header class="hd"><div class="kicker">Three principles</div><h2 class="h2">${w('Start with the')} <em>${w('P&L')}</em>${w(', not the software.')}</h2></header>`;
    const cards = this.PRIN.map(([k, old, n, q]) => `<div class="pf"><i class="ring"></i><div class="k">${e(k)}</div><div class="old">${e(old)}<i class="st"></i></div><div class="nw"><b>${e(n)}</b><span>${e(q)}</span></div></div>`).join('');
    const today = this.pl({});
    const row = (cls, name, v) => `<div class="pr ${cls}"><span class="pk">${e(name)}</span><span class="tr"><i class="mk" style="left:${v}%"></i><i class="u" style="width:${v}%"></i></span></div>`;
    const notes = ['Today: the thin lines mark where you start.', ...this.OUT.map((_, j) => `With ${this.OUT.slice(0, j + 1).map(([, n]) => n.toLowerCase()).join(', ')}: more from what you already have.`)];
    const pl = `<div class="pl"><div class="pl-l"><div class="ey">Principle 1 · Outcome-first</div>`
      + `<h3 class="h3">Every business problem resolves to<br><em>one of three things</em>.</h3>`
      + `<p class="tx">Workflows and agents are means, not ends. The test of an AI initiative is whether it changed your revenue, your cost profile or your exposure: whether you can do more with what you already have.</p>`
      + `<div class="oc">${this.OUT.map(([, n]) => `<div class="ob"><i class="on"></i><small>Outcome</small><b>${e(n)}</b></div>`).join('')}</div></div>`
      + `<div class="pn"><div class="ph"><b>Your P&amp;L</b><span>Illustrative, not to scale</span></div>`
      + row('rev', 'Revenue', today.rev) + row('cost', 'Cost', today.cost) + row('mar', 'Margin', today.mar) + row('risk', 'Risk exposure', today.risk)
      + `<div class="nts">${notes.map((n) => `<p class="nt">${e(n)}</p>`).join('')}</div></div></div>`;
    return `${head}<p class="ld">Shared context is the foundation. Three principles decide what you build on it, and in what order. Each one replaces a habit inherited from the digital era.</p><div class="stg"><div class="cards">${cards}</div>${pl}</div>`;
  },
  anim(c) {
    const tok = (n) => getComputedStyle(c.el).getPropertyValue(n).trim(), deep = c.ground === 'deep';
    c.fadeUp(c.q('.ld'), c.start + 700, { y: 22, dur: 800, ease: 'glide' });
    const cards = c.qa('.pf');
    c.rise(cards, c.start + 950, { stagger: 120 });

    // 1-3: each habit is struck out and shrinks away; the principle that replaces it rises under it
    cards.forEach((card, i) => {
      const at = c.t(i + 1), old = card.querySelector('.old');
      c.tw(old, [{ opacity: 1, color: getComputedStyle(old).color, transform: 'none' }, { opacity: 0.55, color: tok(deep ? '--on-deep-body' : '--muted'), transform: 'scale(.62)' }], { at, dur: 600, ease: 'ui' });
      c.grow(old.querySelector('.st'), at + 60, { dur: 550, ease: 'cubic-bezier(.4,.1,.2,1)' });
      c.tw(card.querySelector('.nw'), [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { at: at + 250, dur: 600, ease: 'ui' });
      c.fade(card.querySelector('.ring'), at, { dur: 400 });
      this.breathe(c, [card], at + 900, 2600);
    });

    // 4: the cards give way to Principle 1's P&L, at today's values
    const t4 = c.t(4);
    c.tw(c.q('.cards'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-24px)' }], { at: t4, dur: 420, ease: 'in' });
    c.fadeUp(c.q('.ey'), t4 + 350, { y: 18, dur: 700, ease: 'glide' });
    c.fadeUp(c.q('.h3'), t4 + 450, { y: 22, dur: 800, ease: 'glide' });
    c.fadeUp(c.q('.tx'), t4 + 600, { y: 18, dur: 800, ease: 'glide' });
    c.rise(c.qa('.ob'), t4 + 800, { stagger: 100 });
    c.rise(c.q('.pn'), t4 + 500, { dur: 750 });
    c.grow(c.qa('.tr .u'), t4 + 950, { dur: 900, stagger: 90 });
    c.fade(c.qa('.tr .mk'), t4 + 1500, { dur: 500 });
    const notes = c.qa('.nt');
    c.fade(notes[0], t4 + 1400, { dur: 500 });
    c.sheen(c.qa('.tr'), t4 + 2100, { period: 3800 });

    // 5-7: each outcome picked in turn; the bars it moves slide to their new length
    const on = {}, obs = c.qa('.ob'), bars = { rev: c.q('.rev .u'), cost: c.q('.cost .u'), mar: c.q('.mar .u'), risk: c.q('.risk .u') };
    this.OUT.forEach(([id], j) => {
      const at = c.t(5 + j), was = this.pl(on);
      on[id] = true;
      const now = this.pl(on), ob = obs[j];
      c.fade(ob.querySelector('.on'), at, { dur: 380 });
      c.tw(ob.querySelector('small'), [{ color: tok(deep ? '--accent-on-deep' : '--accent') }, { color: tok(deep ? '--accent' : '--accent-on-deep') }], { at, dur: 380, ease: 'soft' });
      c.tw(ob.querySelector('b'), [{ color: tok(deep ? '--on-deep' : '--deep') }, { color: tok(deep ? '--deep' : '--on-deep') }], { at, dur: 380, ease: 'soft' });
      this.breathe(c, [ob], at + 700, 2400);
      for (const k of Object.keys(bars)) if (now[k] !== was[k]) c.tw(bars[k], [{ width: `${was[k]}%` }, { width: `${now[k]}%` }], { at: at + 150, dur: 1100, ease: 'cubic-bezier(.3,.7,.2,1)' });
      c.tw(notes[j], [{ opacity: 1 }, { opacity: 0 }], { at, dur: 240, ease: 'soft' });
      c.fade(notes[j + 1], at + 260, { dur: 420 });
    });
  },
});
