// The platform story's four ideas behind the AI-native enterprise. Four numbered rings wait in a row; each build opens
// one into its card (Context, Workflow by design, Assembly first, Governance at every layer), its number gliding to
// the corner, and starts its drawing's own loop, which keeps moving while the scene holds. The last build lays the
// ribbon that names all four: from renting brains to owning the mind. Fixed content: a story adds it with "data": {}.
// The drawings are the reference's, redrawn at the frame's own scale so every label reads at 18px.
UA.scene('ua-four-ideas', {
  need: [],
  steps: () => 5,
  // the heading, its lede and the four rings arrive before the first idea opens
  settle: () => 1900,
  labels: () => [
    'Context The Enterprise Brain',
    'Workflow by design Decompose to the atom',
    'Assembly first vs code first Assemble, don’t hand-build',
    'Governance at every layer The glass box',
    'From renting brains to owning the mind Context Workflow by design Assembly first Governance everywhere',
  ],
  covers: [
    /four ideas behind the ai[-\s]?native enterprise/i,
    /renting\s+brains/i,
    /owning\s+the\s+mind/i,
    /glass\s+box,?\s+not\s+(a\s+)?black\s+box|\bthe\s+glass\s+box\b/i,
    /workflow\s+by\s+design/i,
    /decompose\s+(it\s+)?to\s+the\s+atom/i,
  ],
  // the row of cards: where it sits, and each card's width (four across the frame's inner width, 20px apart)
  G: { top: 304, h: 560, w: 409, gap: 20, ring: 110, badge: 40, bx: 16, by: 14 },
  css: `
.sc-ua-four-ideas { --fi-f400: color-mix(in srgb, var(--deep3) 75%, var(--paper)); --fi-f300: color-mix(in srgb, var(--deep3) 45%, var(--paper)); --fi-f100: color-mix(in srgb, var(--deep3) 9%, var(--paper)); --fi-g500: color-mix(in srgb, var(--accent-on-deep) 72%, var(--accent)); --fi-code: color-mix(in srgb, var(--alert) 82%, var(--ink)); }
.sc-ua-four-ideas .row { position: absolute; left: var(--side); right: var(--side); display: grid; grid-template-columns: repeat(4, 1fr); column-gap: 20px; }
.sc-ua-four-ideas .slot { position: relative; }
.sc-ua-four-ideas .cd { position: absolute; inset: 0; border-radius: 26px; overflow: hidden; background: linear-gradient(180deg, var(--paper2), var(--card) 250px); border: 1px solid var(--rule); box-shadow: 0 18px 44px var(--edge); }
.sc-ua-four-ideas.gr-deep .cd { background: linear-gradient(180deg, var(--paper2), var(--paper) 250px); border-color: color-mix(in srgb, var(--rule) 40%, transparent); box-shadow: 0 26px 60px color-mix(in srgb, var(--deep-edge) 70%, transparent); }
.sc-ua-four-ideas .cd.gl, .sc-ua-four-ideas.gr-deep .cd.gl { box-shadow: 0 0 0 2px var(--fi-f400), 0 0 44px color-mix(in srgb, var(--deep3) 45%, transparent); }
.sc-ua-four-ideas .nb { position: absolute; left: 16px; top: 14px; z-index: 1; width: 40px; height: 40px; border-radius: 50%; background: var(--deep); color: var(--on-deep); font: 500 20px/40px var(--serif); text-align: center; }
.sc-ua-four-ideas .il { display: block; width: 384px; height: 224px; margin: 18px auto 0; overflow: visible; }
.sc-ua-four-ideas .tx { padding: 16px 24px 0; }
.sc-ua-four-ideas .k { font: 600 18px/1.2 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
.sc-ua-four-ideas .h { margin-top: 8px; font: 500 32px/1.12 var(--serif); letter-spacing: -.005em; color: var(--deep); }
.sc-ua-four-ideas .p { margin-top: 12px; font: 400 22px/1.42 var(--serif); color: var(--body); }
.sc-ua-four-ideas .ld { position: absolute; left: var(--side); right: var(--side); top: 236px; font: 400 26px/1.4 var(--serif); color: var(--body); }
.sc-ua-four-ideas.gr-deep .ld { color: var(--on-deep-body); }
/* the shut state: a ring holding the idea's number, centred where its card will open */
.sc-ua-four-ideas .rings { position: absolute; left: var(--side); right: var(--side); }
.sc-ua-four-ideas .rw { position: absolute; width: 110px; height: 110px; }
.sc-ua-four-ideas .ring { position: absolute; inset: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font: 400 54px/1 var(--serif); color: var(--accent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 55%, transparent); }
.sc-ua-four-ideas.gr-deep .ring { color: var(--on-deep2); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent-on-deep) 55%, transparent); }
/* the drawings: the reference's own colours, mixed from the theme */
.sc-ua-four-ideas .il text { font: 600 18px var(--serif); text-anchor: middle; }
.sc-ua-four-ideas .ln { fill: none; stroke: var(--fi-f300); stroke-width: 1.8; }
.sc-ua-four-ideas .ln .dsh { stroke-dasharray: 3 5; }
.sc-ua-four-ideas .pl { fill: none; stroke: none; stroke-width: 3; stroke-linecap: round; }
#stage .sc-ua-four-ideas .cd .ua-current { stroke: var(--deep3); }
.sc-ua-four-ideas .sb rect { fill: var(--card); stroke: var(--fi-f400); stroke-width: 1.8; }
.sc-ua-four-ideas .sb text { fill: var(--deep3); }
.sc-ua-four-ideas .hl { fill: var(--fi-f400); }
.sc-ua-four-ideas .g0 { stop-color: var(--accent-on-deep); }
.sc-ua-four-ideas .g1 { stop-color: var(--fi-f400); }
.sc-ua-four-ideas .g2 { stop-color: var(--deep2); }
.sc-ua-four-ideas .brain { fill: none; stroke: var(--on-deep); stroke-width: 1.4; stroke-linecap: round; opacity: .95; }
.sc-ua-four-ideas .tr { fill: none; stroke: var(--fi-f300); stroke-width: 1.8; }
.sc-ua-four-ideas .n0 rect { fill: var(--deep); }
.sc-ua-four-ideas .n1 rect { fill: var(--deep3); }
.sc-ua-four-ideas .n0 text, .sc-ua-four-ideas .n1 text { fill: var(--on-deep); }
.sc-ua-four-ideas .n2 rect { fill: var(--fi-f300); }
.sc-ua-four-ideas .n2 text { fill: var(--deep); }
.sc-ua-four-ideas .n3 .at { fill: var(--card); stroke: var(--accent); stroke-width: 1.8; }
.sc-ua-four-ideas .n3 .ey { fill: var(--fi-g500); }
.sc-ua-four-ideas .base { stroke: var(--rule); stroke-width: 1.6; stroke-dasharray: 2 4; }
.sc-ua-four-ideas .il text.cap { font: italic 500 18px var(--serif); fill: var(--accent); }
.sc-ua-four-ideas .il text.cf, .sc-ua-four-ideas .il text.af { letter-spacing: .5px; }
.sc-ua-four-ideas .cf { fill: var(--fi-code); }
.sc-ua-four-ideas .af { fill: var(--deep2); }
.sc-ua-four-ideas .tg path { fill: none; stroke: var(--alert); stroke-width: 1.9; stroke-linecap: round; }
.sc-ua-four-ideas .tg { opacity: .85; }
.sc-ua-four-ideas .il text.gy { font: 500 18px var(--sans); fill: var(--fi-code); }
.sc-ua-four-ideas .arw { fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.sc-ua-four-ideas .bk text { fill: var(--on-deep); }
.sc-ua-four-ideas .b1 rect { fill: var(--deep); }
.sc-ua-four-ideas .b2 rect { fill: var(--deep2); }
.sc-ua-four-ideas .b3 rect { fill: var(--deep3); }
.sc-ua-four-ideas .b4 rect { fill: var(--fi-f400); }
.sc-ua-four-ideas .b5 rect { fill: var(--fi-g500); }
.sc-ua-four-ideas .b5 text { fill: var(--deep); }
.sc-ua-four-ideas .gb { fill: none; stroke: var(--fi-f300); stroke-width: 1.5; stroke-dasharray: 3 4; }
.sc-ua-four-ideas .ly1 { fill: var(--fi-g500); opacity: .8; }
.sc-ua-four-ideas .ly2 { fill: var(--fi-f400); opacity: .8; }
.sc-ua-four-ideas .ly3 { fill: var(--deep3); opacity: .85; }
.sc-ua-four-ideas .ly4 { fill: var(--deep); opacity: .9; }
.sc-ua-four-ideas .il text.lyn { fill: var(--body); text-anchor: start; }
.sc-ua-four-ideas .gf { fill: var(--card); stroke: var(--deep3); stroke-width: 1.8; opacity: .55; }
.sc-ua-four-ideas .gs { fill: var(--fi-f100); stroke: var(--deep3); stroke-width: 1.8; opacity: .35; }
.sc-ua-four-ideas .go { fill: none; stroke: var(--deep3); stroke-width: 1.8; }
.sc-ua-four-ideas .scan { stroke: var(--accent-on-deep); stroke-width: 3; }
.sc-ua-four-ideas .eye circle.o { fill: var(--card); stroke: var(--accent); stroke-width: 1.8; }
.sc-ua-four-ideas .eye path { fill: none; stroke: var(--deep2); stroke-width: 2; }
.sc-ua-four-ideas .eye circle.i { fill: var(--deep2); }
.sc-ua-four-ideas .oac { fill: var(--accent); }
/* the ribbon that names the four */
.sc-ua-four-ideas .rb { position: absolute; left: var(--side); right: var(--side); top: 884px; height: 66px; border-radius: 33px; overflow: hidden; display: flex; align-items: center; gap: 16px; padding: 0 34px; background: linear-gradient(90deg, var(--deep), var(--deep2)); }
.sc-ua-four-ideas.gr-deep .rb { background: linear-gradient(90deg, var(--deep-bg3), var(--deep)); box-shadow: inset 0 0 0 1px var(--on-deep-rule); }
.sc-ua-four-ideas .rb span { font: 600 18px/1 var(--sans); letter-spacing: .12em; text-transform: uppercase; color: var(--accent-on-deep); white-space: nowrap; }
.sc-ua-four-ideas .rb .dl { flex: none; width: 22px; height: 2px; background: var(--accent2); }
.sc-ua-four-ideas .rb b { margin-left: auto; font: 400 30px/1 var(--serif); color: var(--on-deep); white-space: nowrap; }
.sc-ua-four-ideas .rb b em { font-style: italic; color: var(--accent-on-deep); }`,
  // 1 Context: the systems feeding one context, the enterprise brain at its centre
  ill1(id) {
    const C = [192, 116];
    const sys = [['CRM', 192, 30], ['ERP', 80, 56], ['HR', 304, 56], ['Docs', 52, 132], ['Mail', 332, 132], ['Data', 104, 198], ['Apps', 280, 198]];
    const spokes = [...sys.map(([, x, y]) => `<path d="M${C[0]} ${C[1]} L${x} ${y}"/>`), `<path d="M${C[0]} ${C[1]} L192 212"/>`].join('');
    const pulse = [[80, 56], [332, 132], [104, 198], [304, 56]].map(([x, y]) => `<path d="M${x} ${y} L${C[0]} ${C[1]}"/>`).join('');
    const boxes = sys.map(([n, x, y]) => `<rect x="${x - 30}" y="${y - 17}" width="60" height="34" rx="8"/><text x="${x}" y="${y + 6}">${n}</text>`).join('');
    return `<svg class="il" viewBox="0 0 384 224" aria-hidden="true">
<defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" class="g0"/><stop offset=".55" class="g1"/><stop offset="1" class="g2"/></radialGradient></defs>
<g class="ln">${spokes}<path class="dsh" d="M80 56 L192 30 L304 56"/><path class="dsh" d="M52 132 L104 198 L192 212 L280 198 L332 132"/></g>
<g class="pl">${pulse}</g>
<g class="sb">${boxes}</g>
<circle class="hl" cx="192" cy="116" r="41" opacity=".12"/>
<circle cx="192" cy="116" r="36" fill="url(#${id})"/>
<g transform="translate(192 116) scale(1.18) translate(-156 -100)"><path class="brain" d="M146 88 C138 90 138 102 144 104 C138 110 146 118 152 114 M166 88 C174 90 174 102 168 104 C174 110 166 118 160 114 M156 84 L156 118 M146 96 L152 98 M166 96 L160 98 M147 108 L153 106 M165 108 L159 106"/></g>
</svg>`;
  },
  // 2 Workflow by design: one workflow splitting into sub-workflows, and those into steps, until each is an atom
  ill2() {
    const sw = [100, 284], sub = [54, 146, 238, 330], at = [32, 76, 124, 168, 216, 260, 308, 352];
    return `<svg class="il" viewBox="0 0 384 224" aria-hidden="true">
<g class="tr"><path d="M192 38 V52 H100 V66 M192 52 H284 V66"/><path d="M100 96 V110 H54 V124 M100 110 H146 V124 M284 96 V110 H238 V124 M284 110 H330 V124"/><path d="${sub.map((x) => `M${x} 150 V160 H${x - 22} V168 M${x} 160 H${x + 22} V168`).join(' ')}"/></g>
<g class="n0"><rect x="130" y="6" width="124" height="32" rx="7"/><text x="192" y="28">Workflow</text></g>
<g class="n1">${sw.map((x) => `<rect x="${x - 68}" y="66" width="136" height="30" rx="6"/><text x="${x}" y="87">Sub-workflow</text>`).join('')}</g>
<g class="n2">${sub.map((x) => `<rect x="${x - 26}" y="124" width="52" height="26" rx="5"/><text x="${x}" y="143">Sub</text>`).join('')}</g>
<g class="n3">${at.map((x) => `<circle class="at" cx="${x}" cy="176" r="8"/>`).join('')}${at.map((x) => `<circle class="ey" cx="${x}" cy="176" r="3"/>`).join('')}</g>
<path class="base" d="M24 197 H360"/>
<text class="cap" x="192" y="219">…until every step is atomic</text>
</svg>`;
  },
  // 3 Assembly first vs code first: code tangling on the left, governed blocks snapping into a stack on the right
  ill3() {
    const bl = [['b1', 'Connectors', 182], ['b2', 'Data', 147], ['b3', 'Workflow', 112], ['b4', 'Apps', 77], ['b5', 'Agents', 42]];
    const gy = [['{ }', 80], ['=&gt;', 116], ['( )', 150], ['&amp;&amp;', 184]];
    return `<svg class="il" viewBox="0 0 384 224" aria-hidden="true">
<text class="cf" x="112" y="24">CODE FIRST</text><text class="af" x="296" y="24">ASSEMBLY FIRST</text>
<g class="tg" transform="translate(26 8) scale(1.04)"><path d="M22 60 C60 30 90 110 50 120 C10 130 40 50 100 70 C140 84 90 150 60 150 C30 150 30 90 80 96 C120 100 128 150 110 170"/><path opacity=".6" d="M30 170 C40 130 120 140 120 110 C120 80 60 90 70 60 C80 36 120 50 126 40"/></g>
${gy.map(([g, x]) => `<text class="gy" x="${x}" y="206" opacity="0">${g}</text>`).join('')}
<path class="arw" d="M184 108 H210 M202 100 L212 108 L202 116"/>
${bl.map(([c, n, y]) => `<g class="bk ${c}"><rect x="220" y="${y}" width="152" height="30" rx="5"/><text x="296" y="${y + 21}">${n}</text></g>`).join('')}
</svg>`;
  },
  // 4 Governance at every layer: the glass box, agents, apps, workflows and data seen through it, a scan passing down
  ill4() {
    const ly = [['ly1', 'Agents', 66], ['ly2', 'Apps', 102], ['ly3', 'Workflows', 138], ['ly4', 'Data', 174]];
    return `<svg class="il" viewBox="0 0 384 224" aria-hidden="true">
<path class="gb" d="M112 44 H232 L276 22 M112 44 L156 22 H276 V166"/>
${ly.map(([c, , y]) => `<path class="${c}" d="M112 ${y} H232 L276 ${y - 22} H156 Z"/>`).join('')}
${ly.map(([, n, y]) => `<text class="lyn" x="286" y="${y - 10}">${n}</text>`).join('')}
<path class="gf" d="M112 44 H232 V188 H112 Z"/><path class="gs" d="M232 44 L276 22 V166 L232 188 Z"/>
<path class="go" d="M112 44 H232 V188 H112 Z M232 44 L276 22 V166 L232 188"/>
<line class="scan" x1="112" y1="48" x2="232" y2="48" opacity="0"/>
<g class="eye" transform="translate(52 88)"><circle class="o" r="28"/><path d="M-15.6 0 C-8.4 -10.8 8.4 -10.8 15.6 0 C8.4 10.8 -8.4 10.8 -15.6 0 Z"/><circle class="i" r="5"/></g>
<text class="oac" x="52" y="142">OBSERVE</text><text class="oac" x="52" y="166">AUDIT</text><text class="oac" x="52" y="190">CONTROL</text>
<text class="cap" x="194" y="216">glass box, not black box</text>
</svg>`;
  },
  build(d, U) {
    const G = this.G;
    this.n = (this.n ?? 0) + 1;
    const ideas = [
      { k: 'Context', h: 'The Enterprise Brain', p: 'One governed layer of context, an ontology and knowledge graph over every system, so every agent and workflow reasons on the same truth.', ill: this.ill1(`uaFiCore${this.n}`) },
      { k: 'Workflow by Design', h: 'Decompose to the atom', p: 'Break each process into sub-workflows, and those into sub-workflows, until every step is atomic: one action, one owner, testable on its own.', ill: this.ill2() },
      { k: 'Assembly First vs Code First', h: 'Assemble, don’t hand‑build', p: 'Assemble governed, reusable blocks (connectors, data, workflows, apps and agents) instead of writing and maintaining bespoke code for every use case.', ill: this.ill3() },
      { k: 'Governance at Every Layer', h: 'The Glass Box', p: 'Data, workflows, apps and agents are observable, auditable and controlled at every layer, so you can see how each answer and action came to be, and track outcomes and ROI.', ill: this.ill4(), glass: true },
    ];
    const cards = ideas.map((it, i) => `<div class="slot"><article class="cd${it.glass ? ' gl' : ''}"><span class="nb">${i + 1}</span>${it.ill}<div class="tx"><p class="k">${U.esc(it.k)}</p><h3 class="h">${U.esc(it.h)}</h3><p class="p">${U.esc(it.p)}</p></div></article></div>`).join('');
    const rings = ideas.map((_, i) => `<div class="rw" style="left:${i * (G.w + G.gap) + G.w / 2 - G.ring / 2}px;top:${G.h / 2 - G.ring / 2}px"><div class="ring">${i + 1}</div></div>`).join('');
    const rb = ['Context', 'Workflow by design', 'Assembly first', 'Governance everywhere'].map((s) => `<span>${s}</span>`).join('<i class="dl"></i>');
    return `${U.head({ kicker: 'Recap', title: 'Four ideas behind the', em: 'AI-native enterprise.' })}`
      + '<p class="ld">The way out of the code-first trap rests on four ideas, and each one is built into the platform.</p>'
      + `<div class="row" style="top:${G.top}px;height:${G.h}px">${cards}</div>`
      + `<div class="rings" style="top:${G.top}px;height:${G.h}px">${rings}</div>`
      + `<div class="rb">${rb}<b>From renting brains to <em>owning the mind</em></b></div>`;
  },
  anim(c, d, U) {
    const G = this.G, rings = c.qa('.ring'), cards = c.qa('.cd');
    // the rings arrive as the heading lands, and ping while they wait
    c.fadeUp(c.q('.ld'), c.start + 600, { y: 14, dur: 700 });
    c.rise(c.qa('.rw'), c.start + 380, { y: 40, dur: 700, stagger: 100 });
    c.ping(rings, c.start + 1400, { period: 2800, stagger: 350 });
    // each opening: the number glides to the card's corner as the card rises, then the drawing starts its loop
    const to = `translate(${G.bx + G.badge / 2 - G.w / 2}px, ${G.by + G.badge / 2 - G.h / 2}px) scale(${G.badge / G.ring})`;
    cards.forEach((cd, i) => {
      const T = c.t(i + 1);
      c.tw(rings[i], [{ transform: 'none' }, { transform: to }], { at: T, dur: 650, ease: 'ui' });
      c.tw(rings[i], [{ opacity: 1 }, { opacity: 0 }], { at: T + 300, dur: 260, ease: 'soft' });
      c.rise(cd, T + 120, { y: 22, dur: 700 });
      c.fade(cd.querySelector('.nb'), T + 420, { dur: 260 });
      c.fadeUp(cd.querySelector('.il'), T + 250, { y: 16, dur: 700, ease: 'ui' });
      c.fadeUp(cd.querySelector('.tx'), T + 400, { y: 16, dur: 700, ease: 'ui' });
      this[`live${i + 1}`](c, cd, T, U);
    });
    // the ribbon naming the four
    const T5 = c.t(5), rb = c.q('.rb');
    c.rise(rb, T5, { y: 24, dur: 700 });
    c.fadeUp(rb.querySelectorAll('span, b'), T5 + 220, { y: 10, dur: 600, stagger: 110 });
    c.grow(rb.querySelectorAll('.dl'), T5 + 330, { dur: 500, stagger: 110 });
    c.sheen(rb, T5 + 1400, { period: 5200 });
  },
  inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)),
  // context flowing in from the systems along four wires, the brain's halo breathing
  live1(c, cd, T) {
    c.current(cd.querySelectorAll('.pl path'), T + 800, { dash: '14 150', speed: 62, stagger: 350 });
    const hl = cd.querySelector('.hl');
    c.live((k) => {
      const w = k < 0 ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / 2400);
      hl.setAttribute('r', (46 * (0.9 + 0.25 * w)).toFixed(2));
      hl.setAttribute('opacity', (0.12 + 0.14 * w).toFixed(3));
    }, T + 700);
  },
  // the tree drawn level by level, each level's parts arriving as its lines reach them; then the atoms pulse
  live2(c, cd, T) {
    c.draw(cd.querySelectorAll('.tr path'), T + 300, { dur: 800, stagger: 380, ease: 'out' });
    c.fade(cd.querySelector('.n1'), T + 700, { dur: 400 });
    c.fade(cd.querySelector('.n2'), T + 1080, { dur: 400 });
    c.fade(cd.querySelector('.n3'), T + 1460, { dur: 400 });
    const atoms = [...cd.querySelectorAll('.n3 .at')];
    c.live((k) => atoms.forEach((a, j) => {
      const q = k - (j % 2) * 700, w = q < 0 ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * q) / 2800);
      a.setAttribute('r', (8 * (1 + 0.25 * w)).toFixed(2));
    }), T + 1900);
  },
  // the code drawing itself into a tangle and back, glyphs rising off it; the blocks sliding into their stack
  live3(c, cd, T, U) {
    const tg = [...cd.querySelectorAll('.tg path')], len = tg.map((p) => Math.ceil(p.getTotalLength()) + 2);
    tg.forEach((p, i) => { p.style.strokeDasharray = `${len[i]}`; p.style.strokeDashoffset = `${len[i]}`; });
    c.live((k) => {
      // the first pass draws as the card opens; after it, the reference's slow draw and undraw, back and forth
      const k0 = Math.max(0, k);
      let u = (k0 / 5000) % 2; if (u > 1) u = 2 - u;
      const e = k0 < 5000 ? U.outCubic(u) : this.inOut(u);
      tg.forEach((p, i) => { p.style.strokeDashoffset = `${(len[i] * (1 - e)).toFixed(1)}`; });
    }, T + 300);
    const gy = [...cd.querySelectorAll('.gy')];
    c.live((k) => gy.forEach((g, j) => {
      const q = k - j * 320;
      if (q < 0) { g.setAttribute('opacity', '0'); return; }
      const p = (q % 3200) / 3200, s = (a, b, x) => a + (b - a) * this.inOut(x);
      const o = p < 0.25 ? s(0, 0.75, p / 0.25) : p < 0.75 ? s(0.75, 0.6, (p - 0.25) / 0.5) : s(0.6, 0, (p - 0.75) / 0.25);
      g.setAttribute('opacity', o.toFixed(3));
      g.setAttribute('transform', `translate(0 ${(10 - 36 * this.inOut(p)).toFixed(2)})`);
    }), T + 600);
    const bk = [...cd.querySelectorAll('.bk')];
    c.live((k) => bk.forEach((g, j) => {
      const q = k - j * 150;
      if (q < 0) { g.setAttribute('opacity', '0'); return; }
      const p = (q % 4000) / 4000, e = p < 0.18 ? U.outCubic(p / 0.18) : 1;
      g.setAttribute('opacity', e.toFixed(3));
      g.setAttribute('transform', `translate(${(40 * (1 - e)).toFixed(2)} 0)`);
    }), T);
  },
  // a scan passing down through every layer of the glass box
  live4(c, cd, T) {
    const sc = cd.querySelector('.scan');
    c.live((k) => {
      if (k < 0) { sc.setAttribute('opacity', '0'); return; }
      const p = (k % 3200) / 3200;
      sc.setAttribute('opacity', (p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1).toFixed(3));
      sc.setAttribute('transform', `translate(0 ${(132 * this.inOut(p)).toFixed(2)})`);
    }, T + 400);
  },
});
