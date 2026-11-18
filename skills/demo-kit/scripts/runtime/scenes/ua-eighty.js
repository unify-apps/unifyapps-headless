// The platform story's 80/20 of enterprise AI: the model is only the 20%, and everything else it takes to reach
// production is the 80%. Fixed content (data: {}). Build 1 brings the two blocks in, the 80% growing as it counts up;
// build 2 breaks the 80% into its six layers, with the sentence that names them; build 3 lands the closing line with its
// turning engine.
UA.scene('ua-eighty', {
  need: [],
  steps: () => 3,
  LAYERS: [
    ['Knowledge', 'the truth across every system'],
    ['Governance', 'who may act, and what they did'],
    ['Actionability', 'what needs to be done, in every system'],
    ['Workflows', 'orchestrating humans, systems and AI'],
    ['Apps', 'where people act and decide'],
    ['Agents', 'what AI does autonomously'],
  ],
  labels() {
    return [
      '20% the model 80% everything else it takes to reach production',
      `${this.LAYERS.map((l) => l[0]).join(' ')} six layers break down`,
      'plane engine Boeing Rolls-Royce whole game',
    ];
  },
  covers: [/\b80\s*\/\s*20\b/i, /\bmodel is (only|just) (the )?20\s*%/i, /\b(the )?other 80\s*%/i, /\beverything else is the 80\s*%/i, /\bboeing is not rolls[- ]royce\b/i],
  css: `
.sc-ua-eighty .ld { position: absolute; left: var(--side); top: 244px; max-width: 1320px; font: 400 25px/1.45 var(--sans); color: var(--body); }
.sc-ua-eighty.gr-deep .ld { color: var(--on-deep-body); }
.sc-ua-eighty .bar { position: absolute; left: var(--side); right: var(--side); top: 344px; height: 272px; display: flex; gap: 10px; }
.sc-ua-eighty .b20, .sc-ua-eighty .b80 { position: relative; flex: none; height: 100%; border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--on-deep); }
.sc-ua-eighty .b20 { width: 339px; background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 90%, var(--ink)), color-mix(in srgb, var(--accent) 68%, var(--ink))); }
.sc-ua-eighty .b80 { width: 1347px; background: linear-gradient(100deg, color-mix(in srgb, var(--muted) 88%, var(--deep3)), color-mix(in srgb, var(--deep3) 76%, var(--accent)) 70%, color-mix(in srgb, var(--deep3) 78%, var(--deep))); }
.sc-ua-eighty .lab { display: flex; flex-direction: column; align-items: center; }
.sc-ua-eighty .n { font: 600 86px/1 var(--sans); letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--on-deep); white-space: nowrap; }
.sc-ua-eighty .cap { margin-top: 14px; font: 500 19px/1.2 var(--sans); letter-spacing: .12em; text-transform: uppercase; white-space: nowrap; color: color-mix(in srgb, var(--on-deep) 90%, transparent); }
.sc-ua-eighty .lys { position: absolute; inset: 0; z-index: 2; display: grid; grid-template-columns: repeat(6, 1fr); gap: 7px; padding: 8px; }
.sc-ua-eighty .ly { position: relative; display: flex; flex-direction: column; justify-content: flex-end; padding: 18px 16px; border-radius: 14px; background: color-mix(in srgb, var(--deep-edge) 35%, transparent); border: 1px solid color-mix(in srgb, var(--on-deep) 13%, transparent); }
.sc-ua-eighty .ly .lit { position: absolute; inset: -1px; border-radius: inherit; opacity: 0; background: color-mix(in srgb, var(--deep-edge) 34%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-on-deep) 70%, transparent); }
.sc-ua-eighty .ly b { position: relative; display: block; font: 600 27px/1.15 var(--serif); color: var(--on-deep); }
.sc-ua-eighty .ly span { position: relative; display: block; margin-top: 8px; font: 400 22px/1.32 var(--sans); text-wrap: pretty; color: color-mix(in srgb, var(--on-deep) 88%, transparent); }
.sc-ua-eighty .cp { position: absolute; left: var(--side); top: 674px; max-width: 1180px; font: 400 27px/1.5 var(--sans); text-wrap: pretty; color: var(--body); }
.sc-ua-eighty .cp b { font-weight: 500; color: var(--ink); }
.sc-ua-eighty.gr-deep .cp { color: color-mix(in srgb, var(--on-deep) 50%, var(--on-deep-body)); }
.sc-ua-eighty.gr-deep .cp b { color: var(--on-deep3); }
.sc-ua-eighty .qt { position: absolute; left: var(--side); right: var(--side); top: 846px; display: flex; align-items: center; justify-content: center; gap: 16px; font: italic 400 36px/1.25 var(--serif); color: var(--accent); }
.sc-ua-eighty.gr-deep .qt { color: var(--accent-on-deep); }
.sc-ua-eighty .eng { flex: none; width: 58px; height: 58px; }
.sc-ua-eighty .eng .rg { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.sc-ua-eighty .eng .bl { fill: var(--accent); transform-origin: 23px 23px; }
.sc-ua-eighty .eng .hb { fill: var(--paper); }
.sc-ua-eighty.gr-deep .eng .bl { fill: var(--accent-on-deep); }
.sc-ua-eighty.gr-deep .eng .hb { fill: var(--deep-lo); }`,
  build(d, U) {
    const w = U.words;
    const head = `<header class="hd"><div class="kicker">The 80/20 of enterprise AI</div><h2 class="h2">${w('The model is only')} <em>${w('20%')}</em>${w('.')} ${w('Everything else is')} <em>${w('the 80%')}</em>${w('.')}</h2></header>`;
    const layers = this.LAYERS.map(([n, s]) => `<div class="ly"><i class="lit"></i><b>${U.esc(n)}</b><span>${U.esc(s)}</span></div>`).join('');
    const engine = '<svg class="eng" viewBox="0 0 46 46" aria-hidden="true"><circle class="rg" cx="23" cy="23" r="21"/><g class="bl"><path d="M23 23 L23 5 A18 18 0 0 1 35 10 Z" opacity=".9"/><path d="M23 23 L41 23 A18 18 0 0 1 36 35 Z" opacity=".7"/><path d="M23 23 L23 41 A18 18 0 0 1 11 36 Z" opacity=".9"/><path d="M23 23 L5 23 A18 18 0 0 1 10 11 Z" opacity=".7"/></g><circle class="hb" cx="23" cy="23" r="4"/></svg>';
    return `${head}<p class="ld">The model is the easy part, and it keeps getting better on its own.</p>`
      + `<div class="bar"><div class="b20"><b class="n">20%</b><span class="cap">The model</span></div>`
      + `<div class="b80"><div class="lab"><b class="n"><span class="v">0%</span></b><span class="cap">Everything else it takes to reach production</span></div><div class="lys">${layers}</div></div></div>`
      + `<p class="cp">The other 80% is <b>knowledge, governance, actionability, workflows, apps and agents</b>. That is what makes AI deliver in production, and it is exactly the part a code-first stack rebuilds for every use case.</p>`
      + `<p class="qt">${engine}<span>A plane needs a great engine, but Boeing is not Rolls-Royce. The 80% is the whole game.</span></p>`;
  },
  anim(c) {
    c.fadeUp(c.q('.ld'), c.start + 700, { y: 22, dur: 800, ease: 'glide' });

    // 1: the 20% block arrives, then the 80% grows out of it, counting up to 80% as it goes
    const t1 = c.t(1), b80 = c.q('.b80');
    c.fadeUp(c.q('.b20'), t1, { y: 22, dur: 800, ease: 'glide' });
    c.tw(b80, [{ width: '0px', opacity: 0 }, { width: '0px', opacity: 1, offset: 0.01 }, { width: '1347px', opacity: 1 }], { at: t1 + 150, dur: 1600, ease: 'cubic-bezier(.3,.7,.2,1)' });
    c.count(c.q('.b80 .v'), { from: 0, to: 80, at: t1 + 400, dur: 1600, suffix: '%' });
    c.fade(c.q('.b80 .cap'), t1 + 700, { dur: 700 });
    c.sheen(b80, t1 + 2200, { period: 4200 });

    // 2: the 80% breaks into its six layers; the sentence that names them follows
    const t2 = c.t(2), lys = c.qa('.ly');
    c.tw(c.q('.lab'), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { at: t2, dur: 280, ease: 'in' });
    c.tw(lys, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { at: t2 + 230, dur: 520, stagger: 80, ease: 'ui' });
    c.fadeUp(c.q('.cp'), t2 + 900, { y: 22, dur: 800, ease: 'glide' });
    // one layer lit at a time, walking across the six while the scene holds
    const lits = c.qa('.ly .lit'), P = 1100;
    c.live((k) => lits.forEach((x, i) => {
      if (k < 0) { x.style.opacity = '0'; return; }
      const f = (k / P) % lits.length, dist = Math.min(Math.abs(f - i - 0.5), lits.length - Math.abs(f - i - 0.5));
      x.style.opacity = String(Math.min(1, k / 600) * Math.max(0, 1 - dist / 1.1));
    }), t2 + 1200);

    // 3: the closing line, its engine turning
    const t3 = c.t(3);
    c.fadeUp(c.q('.qt'), t3, { y: 22, dur: 800, ease: 'glide' });
    c.spin(c.q('.eng .bl'), t3 + 300, { period: 3000 });
  },
});
