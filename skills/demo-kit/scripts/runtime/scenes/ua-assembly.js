// The UnifyApps standard: an assembly-first architecture. Governance, actionability and knowledge contexts make a U
// (fed by AI models, compliance and identity on the left, acting through Slack, CRM and agent-to-agent on the right,
// and by structured, unstructured and agentic sources below). Agent 1 snaps together inside it from reusable apps,
// atomic agents and atomic workflows; then each "ship the next use case" adds an agent that reuses all of it, while
// the counters show more use cases live, fewer weeks for the latest one and more of it built from reused blocks.
// Fixed content: a story adds it with "data": {}.
UA.scene('ua-assembly', {
  need: [],
  covers: [/assembly[- ]first/i, /universal (governance|knowledge|actionability) context/i, /build(ing)? the context once/i, /ship the next use case/i, /reusable (atomic )?(agents|workflows|blocks)/i],
  // weeks to ship each use case, as the reference counts them; the reused share is 40 + 9 per use case after the first
  WEEKS: [12, 6, 4, 3],
  steps: () => 5,
  labels: () => [
    'universal governance knowledge actionability context frame',
    'Agent 1 snaps reusable apps atomic agents workflows',
    'ship next use case Agent 2 weeks reused',
    'ship next use case Agent 3 weeks reused',
    'ship next use case Agent 4 weeks reused',
  ],
  css: `
.sc-ua-assembly .fr { position: absolute; left: var(--side); top: 262px; width: 1248px; height: 690px; }
.sc-ua-assembly svg.wr { position: absolute; left: 0; top: 0; width: 1248px; height: 690px; overflow: visible; }
.sc-ua-assembly .wire { fill: none; stroke: var(--accent); stroke-width: 2; opacity: .55; }
.sc-ua-assembly.gr-deep .wire { stroke: var(--accent-on-deep); }
.sc-ua-assembly .col { position: absolute; top: 0; width: 164px; height: 416px; display: flex; flex-direction: column; justify-content: space-around; align-items: center; }
.sc-ua-assembly .col.in { left: 0; }
.sc-ua-assembly .col.out { left: 1084px; }
.sc-ua-assembly .io { height: 96px; width: 164px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.sc-ua-assembly .lg { display: inline-flex; padding: 4px 7px; border-radius: 8px; background: var(--view); box-shadow: 0 2px 10px var(--edge); }
.sc-ua-assembly .lg { max-width: 164px; font: 600 18px/1.25 var(--sans); color: var(--ink); }
.sc-ua-assembly .io .lg { margin-bottom: 10px; }
.sc-ua-assembly .io b { display: block; font: 500 19px/1.25 var(--sans); color: var(--ink2); }
.sc-ua-assembly.gr-deep .io b { color: var(--on-deep3); }
.sc-ua-assembly .io span { display: block; margin-top: 3px; font: 400 18px/1.25 var(--sans); color: var(--muted); }
.sc-ua-assembly.gr-deep .io span { color: var(--on-deep-body); }
.sc-ua-assembly .pil, .sc-ua-assembly .kb { position: absolute; overflow: hidden; display: flex; align-items: center; justify-content: center;
  font: 600 18px/1 var(--sans); letter-spacing: .09em; text-transform: uppercase; color: var(--on-deep); }
.sc-ua-assembly .pil { top: 0; width: 58px; height: 476px; border-radius: 18px; padding-bottom: 60px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 42%, var(--deep2)), color-mix(in srgb, var(--accent) 34%, var(--deep))); transform-origin: 50% 100%; }
.sc-ua-assembly .pil.l { left: 194px; }
.sc-ua-assembly .pil.r { left: 996px; }
.sc-ua-assembly .pil .vt { writing-mode: vertical-rl; white-space: nowrap; }
.sc-ua-assembly .pil.l .vt { transform: rotate(180deg); }
.sc-ua-assembly .kb { left: 194px; top: 416px; width: 860px; height: 60px; border-radius: 0 0 18px 18px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 34%, var(--deep)), color-mix(in srgb, var(--accent) 42%, var(--deep2)), color-mix(in srgb, var(--accent) 34%, var(--deep))); }
.sc-ua-assembly .shv { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 42%, color-mix(in srgb, var(--paper) 26%, transparent) 50%, transparent 58%) no-repeat; background-size: 100% 250%; background-position: 0 200%; }
.sc-ua-assembly .mid { position: absolute; left: 264px; top: 0; width: 720px; height: 416px; }
.sc-ua-assembly .arw { position: absolute; left: 0; right: 0; top: 0; height: 32px; display: flex; align-items: center; justify-content: center; gap: 14px;
  font: italic 400 22px/1 var(--serif); color: var(--ink2); white-space: nowrap; }
.sc-ua-assembly.gr-deep .arw { color: var(--on-deep3); }
.sc-ua-assembly .arw i { flex: 0 1 150px; height: 2px; background: linear-gradient(90deg, transparent, var(--accent)); transform-origin: 100% 50%; }
.sc-ua-assembly .arw i:last-child { background: linear-gradient(90deg, var(--accent), transparent); transform-origin: 0 50%; }
.sc-ua-assembly.gr-deep .arw i { background: linear-gradient(90deg, transparent, var(--accent-on-deep)); }
.sc-ua-assembly.gr-deep .arw i:last-child { background: linear-gradient(90deg, var(--accent-on-deep), transparent); }
.sc-ua-assembly .ags { position: absolute; left: 0; right: 0; top: 44px; height: 358px; display: flex; }
.sc-ua-assembly .slot { position: relative; flex: 0 0 0; min-width: 0; border-radius: 18px; }
.sc-ua-assembly .slot.s1 { flex-grow: 1.7; }
.sc-ua-assembly .slot.s2 { flex-grow: 1; margin-left: 12px; }
.sc-ua-assembly .gw, .sc-ua-assembly .gl { position: absolute; inset: 0; border-radius: inherit; }
.sc-ua-assembly .gl { opacity: 0; box-shadow: 0 0 0 2px var(--accent), 0 0 44px 8px var(--accent-halo); }
.sc-ua-assembly.gr-deep .gl { box-shadow: 0 0 0 2px var(--accent-on-deep), 0 0 44px 8px color-mix(in srgb, var(--accent-on-deep) 30%, transparent); }
.sc-ua-assembly .ag { position: absolute; inset: 0; overflow: hidden; border-radius: 18px; padding: 14px 10px; display: flex; flex-direction: column; gap: 10px;
  background: var(--card); border: 1.5px solid var(--rule); }
.sc-ua-assembly.gr-deep .ag { background: color-mix(in srgb, var(--on-deep) 5%, transparent); border-color: color-mix(in srgb, var(--on-deep) 24%, transparent); }
.sc-ua-assembly .ag.first { padding: 14px 14px; background: color-mix(in srgb, var(--deep3) 12%, var(--card)); border-color: color-mix(in srgb, var(--deep3) 40%, transparent); }
.sc-ua-assembly.gr-deep .ag.first { background: color-mix(in srgb, var(--on-deep-body) 16%, transparent); border-color: color-mix(in srgb, var(--on-deep-body) 50%, transparent); }
.sc-ua-assembly .ag h4 { font: 500 20px/1.15 var(--sans); color: var(--ink2); white-space: nowrap; }
.sc-ua-assembly.gr-deep .ag h4 { color: var(--on-deep3); }
.sc-ua-assembly .ag h4 small { display: block; margin-top: 3px; font: 400 18px/1.1 var(--sans); color: var(--accent); }
.sc-ua-assembly.gr-deep .ag h4 small { color: var(--accent-on-deep); }
.sc-ua-assembly .blk { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; text-align: center; border-radius: 12px; padding: 6px 4px;
  font: 400 18px/1.2 var(--sans); color: var(--ink2); background: var(--paper2); border: 1.5px solid var(--rule); }
.sc-ua-assembly.gr-deep .blk { color: var(--on-deep2); background: color-mix(in srgb, var(--deep-lo) 60%, transparent); border-color: color-mix(in srgb, var(--on-deep-body) 45%, transparent); }
.sc-ua-assembly .ag.first .blk { justify-content: flex-start; text-align: left; padding: 8px 18px; font-size: 22px; line-height: 1.25; color: var(--on-deep); background: var(--deep); border-color: transparent; }
.sc-ua-assembly.gr-deep .ag.first .blk { color: var(--ink); background: var(--paper); }
.sc-ua-assembly .ph { position: absolute; inset: 0; border-radius: 18px; border: 1.5px dashed var(--rule); display: flex; align-items: center; justify-content: center; text-align: center; padding: 30px;
  font: 400 20px/1.4 var(--sans); color: var(--muted); }
.sc-ua-assembly.gr-deep .ph { border-color: color-mix(in srgb, var(--on-deep) 26%, transparent); color: var(--on-deep-body); }
.sc-ua-assembly .srcs { position: absolute; left: 194px; top: 520px; width: 860px; height: 170px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.sc-ua-assembly .src { border-radius: 18px; padding: 14px 14px 12px; text-align: center; background: var(--card); border: 1.5px solid var(--rule); }
.sc-ua-assembly.gr-deep .src { background: color-mix(in srgb, var(--on-deep) 4%, transparent); border-color: var(--on-deep-rule); }
.sc-ua-assembly .src b { display: block; font: 500 24px/1.2 var(--serif); color: var(--ink); margin-bottom: 10px; }
.sc-ua-assembly.gr-deep .src b { color: var(--on-deep); }
.sc-ua-assembly .src .lg { max-width: none; }
.sc-ua-assembly .src .ds { display: block; margin-top: 10px; font: 400 18px/1.3 var(--sans); color: var(--muted); }
.sc-ua-assembly.gr-deep .src .ds { color: var(--on-deep-body); }
.sc-ua-assembly .side { position: absolute; left: 1408px; top: 262px; width: 400px; }
.sc-ua-assembly .side h3 { font: 400 33px/1.24 var(--serif); color: var(--ink); }
.sc-ua-assembly.gr-deep .side h3 { color: var(--on-deep); }
.sc-ua-assembly .side h3 em { color: var(--accent); }
.sc-ua-assembly.gr-deep .side h3 em { color: var(--accent-on-deep); }
.sc-ua-assembly .side p { margin-top: 20px; font: 400 22px/1.45 var(--sans); color: var(--body); }
.sc-ua-assembly.gr-deep .side p { color: var(--on-deep-body); }
.sc-ua-assembly .side p b { font-weight: 500; color: var(--ink2); }
.sc-ua-assembly.gr-deep .side p b { color: var(--on-deep3); }
.sc-ua-assembly .ship { margin-top: 26px; padding: 22px; border-radius: 20px; border: 1.5px solid var(--rule); background: var(--card); }
.sc-ua-assembly.gr-deep .ship { border-color: var(--on-deep-rule); background: color-mix(in srgb, var(--on-deep) 4%, transparent); }
.sc-ua-assembly .btn { position: relative; display: inline-block; padding: 14px 26px; border-radius: 99px; font: 600 20px/1.2 var(--sans); color: var(--on-deep2); background: var(--deep); }
.sc-ua-assembly.gr-deep .btn { color: var(--deep-lo); background: var(--accent-on-deep); }
.sc-ua-assembly .rg { position: absolute; inset: -2px; border-radius: inherit; border: 2px solid var(--accent); opacity: 0; }
.sc-ua-assembly.gr-deep .rg { border-color: var(--accent-on-deep); }
.sc-ua-assembly .row { display: flex; gap: 14px; margin-top: 22px; }
.sc-ua-assembly .row > div { flex: 1; }
.sc-ua-assembly .row b { display: block; white-space: nowrap; font: 500 38px/1 var(--serif); color: var(--ink); }
.sc-ua-assembly.gr-deep .row b { color: var(--on-deep); }
.sc-ua-assembly .row span { display: block; margin-top: 8px; font: 400 18px/1.3 var(--sans); color: var(--muted); }
.sc-ua-assembly.gr-deep .row span { color: var(--on-deep-body); }
.sc-ua-assembly .tl { display: flex; align-items: flex-end; height: 84px; margin-top: 20px; }
.sc-ua-assembly .tl > b { position: relative; flex: 0 0 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
.sc-ua-assembly .tl > b.b1 { flex-grow: 1; }
.sc-ua-assembly .tl i { position: relative; overflow: hidden; display: block; width: 100%; border-radius: 5px 5px 0 0; transform-origin: 50% 100%;
  background: linear-gradient(180deg, var(--accent), var(--deep3)); }
.sc-ua-assembly.gr-deep .tl i { background: linear-gradient(180deg, var(--accent-on-deep), var(--deep3)); }`,
  build(d, U) {
    const img = (alt) => `<span class="lg">${U.esc(alt)}</span>`;
    const ins = [['OpenAI GPT, Claude and Gemini', 'AI models'], ['Compliance tool', 'Compliance tools'], ['Microsoft, Okta and Salesforce', 'Identity &amp; access']]
      .map(([alt, b]) => `<div class="io">${img(alt)}<b>${b}</b></div>`).join('');
    const outs = [['Slack, email, calendar', 'notify &amp; act'], ['CRM, ERP and more', 'write back'], ['Agent to agent', 'interface for action']]
      .map(([b, s]) => `<div class="io"><b>${b}</b><span>${s}</span></div>`).join('');
    const srcs = [['Structured', 'SAP, Oracle, Concur, Workday, NetSuite', 'Plug in CRM, ERP, CX and other systems'], ['Unstructured', 'Gmail, Slack, Teams, SharePoint, PDF, DocuSign', 'Intranet, Slack and Teams, email and documents'], ['Agentic', 'Agent tools such as Trello, Asana, monday.com, Notion', 'Agent-to-agent interface for data']]
      .map(([b, alt, s]) => `<div class="src"><b>${b}</b>${img(alt)}<span class="ds">${s}</span></div>`).join('');
    // the wires: each input into the governance bar, the actionability bar out to each output, each source up into the base
    const ys = [416 / 6, 416 / 2, (416 * 5) / 6];
    const wires = [...ys.map((y) => `<path class="wire w-in" d="M166 ${y} H192"/>`), ...ys.map((y) => `<path class="wire w-out" d="M1056 ${y} H1082"/>`), ...[332, 624, 916].map((x) => `<path class="wire w-up" d="M${x} 518 V478"/>`)].join('');
    const blocks = '<div class="blk">Reusable mobile, web &amp; chat apps</div><div class="blk">Reusable atomic agents</div><div class="blk">Reusable atomic workflows</div>';
    const agent = (n) => `<div class="ag${n === 1 ? ' first' : ''}"><h4>Agent ${n}${n === 1 ? '' : `<small>${this.WEEKS[n - 1]} wks</small>`}</h4>${blocks}</div>`;
    const slots = [1, 2, 3, 4].map((n) => `<div class="slot s${n}"><i class="gw"></i>${n === 2 ? '<div class="ph">Agent 2 reuses everything Agent 1 built</div>' : ''}${agent(n)}</div>`).join('');
    const bars = this.WEEKS.map((w, i) => `<b class="b${i + 1}"><i style="height:${(w / 12) * 100}%"></i></b>`).join('');
    const head = `<header class="hd"><div class="kicker">The way out</div><h2 class="h2">${U.words('An')} <em>${U.words('assembly-first')}</em> ${U.words('architecture to scaling AI.')}</h2></header>`;
    return `${head}<div class="fr"><svg class="wr" viewBox="0 0 1248 690">${wires}</svg>
<div class="col in">${ins}</div><div class="pil l"><span class="vt">Universal governance context</span></div>
<div class="mid"><div class="arw"><i></i><span>quicker, cheaper and easier to maintain</span><i></i></div><div class="ags">${slots}</div></div>
<div class="pil r"><span class="vt">Universal actionability context</span></div><div class="col out">${outs}</div>
<div class="kb"><span>Universal knowledge context</span></div><div class="srcs">${srcs}</div></div>
<div class="side"><h3>Build the <em>context once</em> at the enterprise level. Modular, reusable components every team can pull on.</h3>
<p>Then it is a simple question: <b>how fast can we ship use cases to drive business value?</b></p>
<div class="ship"><span class="btn">Ship the next use case →</span>
<div class="row"><div><b class="cn">1</b><span>use cases live</span></div><div><b class="cw">12 wks</b><span>to ship the latest one</span></div><div><b class="cr">0%</b><span>built from reused blocks</span></div></div>
<div class="tl">${bars}</div></div></div>`;
  },
  // the share of a use case built from reused blocks, as the reference counts it
  reused: (n) => (n === 1 ? 0 : Math.min(90, 40 + n * 9)),
  anim(c, d, U) {
    // 1 · the contexts: the two bars rise, the base joins them, what feeds and what they act on come in, then the sources
    let at = c.t(1);
    const pils = c.qa('.pil'), kb = c.q('.kb');
    c.grow(pils, at, { y: true, dur: 800, stagger: 120 });
    c.grow(kb, at + 450, { dur: 700 });
    c.fade(c.qa('.pil .vt, .kb span'), at + 800, { dur: 500 });
    c.slide(c.qa('.col.in .io'), at + 450, { x: -40, stagger: 110 });
    c.slide(c.qa('.col.out .io'), at + 450, { x: 40, stagger: 110 });
    c.draw(c.qa('.w-in, .w-out'), at + 850, { dur: 400, stagger: 60 });
    c.rise(c.qa('.src'), at + 650, { stagger: 110 });
    c.draw(c.qa('.w-up'), at + 1000, { dur: 400, stagger: 80 });
    c.fadeUp(c.q('.side h3'), at + 350, { y: 18 });
    // live: the bars shine along their length, current runs in and out, knowledge rises from every source into the base
    const shv = c.fx(pils, 'shv');
    shv.forEach((x, i) => c.live((k) => { const f = k < 0 ? 0 : ((k + i * 700) % 3400) / 3400; x.style.backgroundPosition = `0 ${200 - 400 * f}%`; }, at + 1400));
    c.sheen(kb, at + 1600);
    c.current(c.qa('.w-in, .w-out'), at + 1400, { dash: '3 7', speed: 18 });
    c.travel(c.qa('.w-up'), at + 1400, { dur: 1800, r: 4, stagger: 300 });

    // 2 · Agent 1 snaps together inside the contexts; the counters start at one use case in twelve weeks
    at = c.t(2);
    c.grow(c.qa('.arw i'), at, { dur: 700 });
    c.fade(c.q('.arw span'), at + 150);
    c.rise(c.q('.s1 .ag'), at, { y: 24 });
    c.snap(c.qa('.s1 .blk'), at + 250, { stagger: 130 });
    c.fade(c.q('.ph'), at + 800);
    c.fadeUp(c.q('.side p'), at + 200, { y: 16 });
    c.rise(c.q('.ship'), at + 450, { y: 20 });
    c.grow(c.q('.b1 i'), at + 900, { y: true, dur: 700, ease: 'drop' });
    // the button calls for the next use case: a ring leaves its edge and fades, every 2.4 s
    const ring = c.fx(c.q('.btn'), 'rg')[0];
    c.live((k) => { const f = k < 0 ? 1 : (k % 2400) / 2400; ring.style.opacity = String(1 - f); ring.style.transform = `scale(${1 + 0.07 * f}, ${1 + 0.4 * f})`; }, at + 1500);
    // the newest agent glows until the next one lands (its glow sits in a layer of its own, faded out then)
    const glow = (n, from) => {
      const g = c.q(`.s${n} .gw`), x = c.fx(g, 'gl', true)[0];
      c.live((k) => { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, k)) / 3000); x.style.opacity = k < 0 ? '0' : String(Math.min(1, k / 500) * (0.4 + 0.6 * w)); }, from);
      if (n < 4) c.tw(g, [{ opacity: 1 }, { opacity: 0 }], { at: c.t(n + 2), dur: 400, ease: 'soft' });
    };
    glow(1, at + 1300);

    // 3, 4, 5 · ship the next use case: the next agent reuses every block, sooner than the last, and the counters move
    for (let n = 2; n <= 4; n++) {
      const a = c.t(n + 1), slot = c.q(`.s${n}`), ag = slot.querySelector('.ag');
      c.tw(c.q('.btn'), [{ transform: 'none' }, { transform: 'scale(.93)' }, { transform: 'none' }], { at: a, dur: 320, ease: 'soft' });
      if (n === 2) c.tw(c.q('.ph'), [{ opacity: 1 }, { opacity: 0 }], { at: a + 100, dur: 300, ease: 'soft' });
      else c.tw(slot, [{ flexGrow: 0, marginLeft: '0px' }, { flexGrow: 1, marginLeft: '12px' }], { at: a + 100, dur: 650, ease: 'ui' });
      c.slide(ag, a + 300, { x: 40, dur: 500 });
      c.snap(ag.querySelectorAll('.blk'), a + 480, { stagger: 120 });
      c.tw(c.q(`.b${n}`), [{ flexGrow: 0, marginLeft: '0px' }, { flexGrow: 1, marginLeft: '6px' }], { at: a + 300, dur: 600, ease: 'ui' });
      c.grow(c.q(`.b${n} i`), a + 600, { y: true, dur: 600, ease: 'drop' });
      glow(n, a + 1200);
    }
    // the counters, one ticker for all three ships (separate counters on one element would each write their own
    // start value before their time): use cases live, weeks for the latest one and the reused share count to the
    // use case just shipped
    const cn = c.q('.cn'), cw = c.q('.cw'), cr = c.q('.cr'), val = (n) => [n, this.WEEKS[n - 1], this.reused(n)];
    c.tick((_, t) => {
      let n = 1, p = 1;
      for (let m = 2; m <= 4; m++) { const f = c.t(m + 1) + 300; if (t >= f) { n = m; p = U.outCubic(U.clamp((t - f) / 1000)); } }
      const a = val(Math.max(1, n - 1)), b = val(n), v = (i) => Math.round(a[i] + (b[i] - a[i]) * p);
      cn.textContent = v(0); cw.textContent = `${v(1)} wks`; cr.textContent = `${v(2)}%`;
    });
  },
});
