// The UnifyApps standard: one platform, every builder on the same brain. A deep panel holds the three builders
// (Workflow, Agent and Application Builder) over the Enterprise Context Graph at its centre, wired to them and to the
// three contexts under it (Context Graph, Agent Governance, Integrations), with the governance band along its foot;
// the customer's systems plug in below, and a closing line reads the whole platform from systems to governance.
// Fixed content: a story adds it with "data": {}.
UA.scene('ua-platform', {
  need: [],
  covers: [/enterprise context graph/i, /enterprise brain/i, /(every|each) builder on the same brain/i, /three builders.{0,40}three contexts/i, /one platform,? one login/i, /one login\W+one tenant/i],
  BUILD: [
    { n: 'Workflow Builder', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="16" width="7" height="5" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><path d="M10 5.5h4M6.5 8v6a2 2 0 002 2H14"/></svg>', l: ['Workflow automation builder', 'Decision tables', 'Lifecycle management'] },
    { n: 'Agent Builder', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9.5 15h5"/></svg>', l: ['No-code agent builder(s)', 'Teams of agents', 'Lifecycle management'] },
    { n: 'Application Builder', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="13" height="10" rx="1.5"/><rect x="15" y="9" width="6" height="11" rx="1.5"/><path d="M6 18h7"/></svg>', l: ['Low-code app builder', 'Web and mobile apps', 'Lifecycle management'] },
  ],
  CTX: [
    { n: 'Context Graph', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7 7l3 3M17 7l-3 3M7.5 17.5l2.5-3M16.5 16.5l-2.5-2.5"/></svg>', l: ['Knowledge graph', 'Memory sets', 'ETL / reverse ETL', 'MDM and data catalogue'] },
    { n: 'Agent Governance', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>', // the reference lists Discovery, Cost and ROI, Evaluations, Guardrails; paired so they fit two rows at 18 px
      l: ['Discovery and observability', 'Evaluations', 'Cost and ROI (agentic FinOps)', 'Guardrails and policies'] },
    { n: 'Integrations', i: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0zM12 16v5"/></svg>', l: ['1,000+ connectors', 'MCP server', 'A2A server', 'API management'] },
  ],
  SYS: [
    ['CRM · ERP · HCM', 'Salesforce, Workday, SAP, Oracle and other systems of record'],
    ['Slack · Email · Docs', 'Slack, Teams, Outlook, Gmail and other collaboration tools'],
    ['LLM-agnostic', 'Claude, Meta Llama, OpenAI, Gemini, or a custom bring-your-own model'],
    ['Deploy anywhere', 'SaaS or private cloud on Google Cloud, Azure or AWS, or on-premise'],
    ['Identity, access &amp; compliance', 'OneTrust, Okta, Microsoft and other identity and compliance tools'],
  ],
  // the panel's geometry (its own coordinates): where the tiers and the core sit, so the wires can be drawn in build()
  G: { left: 112, top: 236, w: 1696, pad: 28, gap: 18, bTop: 102, tierH: 136, bandH: 96, coreH: 72, govGap: 16 },
  steps: () => 5,
  labels: () => [
    'three builders workflow agent application',
    'Enterprise Context Graph brain ontology knowledge',
    'three contexts governance integrations',
    'trace Context Graph truth builder built once',
    'governance observability audit security compliance systems plugged',
  ],
  css: `
.sc-ua-platform .slab { position: absolute; border-radius: 32px; color: var(--on-deep);
  background: radial-gradient(900px 300px at 50% 52%, color-mix(in srgb, var(--deep3) 42%, transparent), transparent 70%), linear-gradient(180deg, var(--deep-edge) 0%, var(--deep-bg) 48%, var(--deep-lo) 100%);
  box-shadow: 0 30px 80px var(--deep-shadow); }
.sc-ua-platform.gr-deep .slab { box-shadow: 0 0 0 1px var(--on-deep-rule), 0 30px 80px color-mix(in srgb, var(--deep-edge) 70%, transparent); }
.sc-ua-platform .edge { position: absolute; inset: -2px; border-radius: 34px; padding: 2px; pointer-events: none; z-index: 3;
  background: conic-gradient(from var(--ang, 0deg), color-mix(in srgb, var(--on-deep3) 10%, transparent), var(--accent-on-deep), color-mix(in srgb, var(--on-deep3) 10%, transparent) 30%, color-mix(in srgb, var(--on-deep-body) 60%, transparent) 60%, color-mix(in srgb, var(--on-deep3) 10%, transparent));
  -webkit-mask: linear-gradient(var(--ink) 0 0) content-box, linear-gradient(var(--ink) 0 0); -webkit-mask-composite: xor; mask: linear-gradient(var(--ink) 0 0) content-box exclude, linear-gradient(var(--ink) 0 0); }
.sc-ua-platform .mk { display: block; background: var(--accent-on-deep); -webkit-mask: var(--mk) center / contain no-repeat; mask: var(--mk) center / contain no-repeat; }
.sc-ua-platform .ph { position: absolute; top: 16px; height: 48px; display: flex; align-items: center; justify-content: space-between; z-index: 2; }
.sc-ua-platform .ph h3 { display: flex; align-items: center; gap: 14px; font: italic 400 40px/1 var(--serif); color: var(--on-deep3); }
.sc-ua-platform .ph h3 .mk { width: 44px; height: 44px; opacity: .85; }
.sc-ua-platform .login { display: flex; align-items: center; gap: 12px; padding: 7px 18px 7px 8px; border-radius: 99px; border: 1.5px solid color-mix(in srgb, var(--on-deep3) 30%, transparent);
  background: color-mix(in srgb, var(--on-deep) 4%, transparent); font: 400 18px/1.2 var(--sans); color: var(--on-deep2); }
.sc-ua-platform .login i { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-on-deep); color: var(--deep-edge); }
.sc-ua-platform .login i svg { width: 17px; height: 17px; }
.sc-ua-platform .k { position: absolute; z-index: 2; font: 600 18px/1.2 var(--sans); letter-spacing: .18em; text-transform: uppercase; color: var(--accent-on-deep); }
.sc-ua-platform .tier { position: absolute; z-index: 2; display: grid; grid-template-columns: repeat(3, 1fr); }
.sc-ua-platform .pn { position: relative; border-radius: 20px; padding: 14px 15px; display: flex; flex-direction: column; gap: 10px; }
.sc-ua-platform .pn h4 { display: flex; align-items: center; gap: 12px; font: 500 28px/1.1 var(--serif); }
.sc-ua-platform .pn h4 svg { width: 26px; height: 26px; flex: none; }
.sc-ua-platform .pn ul { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.sc-ua-platform .pn li { padding: 4px 9px; border-radius: 99px; font: 400 18px/1.25 var(--sans); white-space: nowrap; }
.sc-ua-platform .pn.b { background: color-mix(in srgb, var(--deep-edge) 55%, transparent); border: 1.5px solid color-mix(in srgb, var(--on-deep3) 22%, transparent); }
.sc-ua-platform .pn.b h4 { color: var(--on-deep); }
.sc-ua-platform .pn.b h4 svg { color: var(--accent-on-deep); }
.sc-ua-platform .pn.b li { background: color-mix(in srgb, var(--on-deep3) 11%, transparent); color: var(--on-deep3); }
.sc-ua-platform .pn.c { background: color-mix(in srgb, var(--on-deep) 95%, transparent); border: 1.5px solid color-mix(in srgb, var(--on-deep3) 60%, transparent); }
.sc-ua-platform .pn.c h4 { color: var(--deep); }
.sc-ua-platform .pn.c h4 svg { color: var(--accent); }
.sc-ua-platform .pn.c li { background: color-mix(in srgb, var(--accent) 13%, var(--on-deep)); color: var(--body); }
.sc-ua-platform .band { position: absolute; z-index: 2; display: flex; align-items: center; justify-content: center; }
.sc-ua-platform .core { position: relative; display: flex; align-items: center; gap: 16px; padding: 10px 30px 10px 12px; border-radius: 99px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--deep-edge) 88%, transparent), color-mix(in srgb, var(--deep) 92%, transparent));
  border: 1.5px solid color-mix(in srgb, var(--accent-on-deep) 55%, transparent); box-shadow: 0 0 0 7px color-mix(in srgb, var(--accent-on-deep) 8%, transparent), 0 0 64px color-mix(in srgb, var(--on-deep-body) 25%, transparent); }
.sc-ua-platform .cg { position: absolute; inset: 0; border-radius: inherit; opacity: 0; box-shadow: 0 0 0 9px color-mix(in srgb, var(--accent-on-deep) 12%, transparent), 0 0 80px 14px color-mix(in srgb, var(--accent-on-deep) 30%, transparent); }
.sc-ua-platform .orb { position: relative; width: 52px; height: 52px; flex: none; border-radius: 50%; }
.sc-ua-platform .orb .mk { position: absolute; inset: 0; }
.sc-ua-platform .core b { display: block; font: 500 27px/1.15 var(--serif); color: var(--on-deep); white-space: nowrap; }
.sc-ua-platform .core span { display: block; margin-top: 3px; font: 400 18px/1.25 var(--sans); color: var(--on-deep3); white-space: nowrap; }
.sc-ua-platform svg.lk { position: absolute; left: 0; top: 0; overflow: visible; z-index: 1; pointer-events: none; }
.sc-ua-platform .mesh { fill: none; stroke: color-mix(in srgb, var(--accent-on-deep) 26%, transparent); stroke-width: 1.5; }
.sc-ua-platform .spine { fill: none; stroke: color-mix(in srgb, var(--accent-on-deep) 50%, transparent); stroke-width: 2; }
#stage .sc-ua-platform .ua-current { stroke: var(--accent-on-deep); stroke-width: 2.4; }
.sc-ua-platform .gov { position: absolute; z-index: 2; text-align: center; font: 500 18px/1.2 var(--sans); letter-spacing: .15em; text-transform: uppercase; color: var(--accent-on-deep); white-space: nowrap; }
.sc-ua-platform .gov span { display: inline-block; padding: 0 8px; }
.sc-ua-platform .gov i { font-style: normal; opacity: .7; }
.sc-ua-platform svg.up { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: visible; pointer-events: none; }
.sc-ua-platform .upw { fill: none; stroke: var(--accent); stroke-width: 1.8; opacity: .45; }
.sc-ua-platform.gr-deep .upw { stroke: var(--accent-on-deep); }
#stage .sc-ua-platform .up .ua-current { stroke: var(--accent); stroke-width: 2; }
#stage .sc-ua-platform.gr-deep .up .ua-current { stroke: var(--accent-on-deep); }
.sc-ua-platform .sl { position: absolute; left: 50%; z-index: 2; padding: 4px 16px; border-radius: 99px; white-space: nowrap; font: 600 18px/1.2 var(--sans); letter-spacing: .14em; text-transform: uppercase;
  color: var(--accent); background: var(--card); border: 1.5px solid var(--rule); }
.sc-ua-platform.gr-deep .sl { color: var(--accent-on-deep); background: var(--deep-bg2); border-color: var(--on-deep-rule); }
.sc-ua-platform .sys { position: absolute; display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
.sc-ua-platform .ys { border-radius: 18px; padding: 12px 12px 14px; text-align: center; background: var(--view); border: 1.5px solid var(--rule); }
.sc-ua-platform.gr-deep .ys { border-color: transparent; }
.sc-ua-platform .ys b { display: block; font: 600 21px/1.2 var(--serif); color: var(--deep); margin-bottom: 8px; white-space: nowrap; }
.sc-ua-platform .ys span { display: block; font: 500 18px/1.3 var(--sans); color: var(--ink2); }
.sc-ua-platform .sw { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.sc-ua-platform .ring { position: absolute; inset: -1.5px; border-radius: inherit; box-shadow: 0 0 0 2.5px var(--accent-on-deep), 0 0 34px color-mix(in srgb, var(--accent-on-deep) 40%, transparent); }
.sc-ua-platform .dt { position: absolute; left: var(--side); right: var(--side); text-align: center; font: 400 23px/1.3 var(--sans); color: var(--body); }
.sc-ua-platform.gr-deep .dt { color: var(--on-deep-body); }
.sc-ua-platform .dt b { font-weight: 600; color: var(--deep); }
.sc-ua-platform.gr-deep .dt b { color: var(--accent-on-deep); }
.sc-ua-platform .ft { position: absolute; left: var(--side); right: var(--side); text-align: center; font: 400 22px/1.3 var(--serif); color: var(--body); }
.sc-ua-platform.gr-deep .ft { color: var(--on-deep-body); }
.sc-ua-platform .ft em { color: var(--accent); }
.sc-ua-platform.gr-deep .ft em { color: var(--accent-on-deep); }
.sc-ua-platform .ft i { font-style: normal; color: var(--accent); margin: 0 8px; }
.sc-ua-platform.gr-deep .ft i { color: var(--accent-on-deep); }`,
  build(d, U) {
    const G = this.G, iw = G.w - 2 * G.pad, cw = (iw - 2 * G.gap) / 3;
    const cTop = G.bTop + G.tierH + G.bandH, govTop = cTop + G.tierH + G.govGap, H = govTop + 22 + 20;
    // the mark of the UnifyApps logo, from the kit's own logo file (cropped to the mark), as a mask the theme colours
    const mk = `data:image/svg+xml;charset=utf-8,${encodeURIComponent((window.ASSETS?.logo ?? '').replace(/viewBox="[^"]*"/, 'viewBox="8 50 400 400"')).replace(/'/g, '%27')}`;
    // a block as the reference draws it; the one it traces carries a selection ring, lit in its own build
    const node = (x, cls, sel) => `<div class="pn ${cls}">${sel ? '<i class="sw"><i class="ring"></i></i>' : ''}<h4>${x.i}${U.esc(x.n)}</h4><ul>${x.l.map((s) => `<li>${U.esc(s)}</li>`).join('')}</ul></div>`;
    // wires: each builder down into the graph, the graph down into each context, and every builder to every context
    const xs = [0, 1, 2].map((i) => G.pad + cw / 2 + i * (cw + G.gap)), kx = G.w / 2;
    const bB = G.bTop + G.tierH, kT = bB + (G.bandH - G.coreH) / 2, kB = kT + G.coreH, m = (bB + cTop) / 2;
    const mesh = xs.flatMap((x, i) => xs.map((y, j) => `<path class="mesh m-b${i} m-c${j}" d="M${x} ${bB} C${x} ${m} ${y} ${m} ${y} ${cTop}"/>`)).join('');
    const sb = xs.map((x) => `<path class="spine s-b" d="M${x} ${bB} C${x} ${bB + 30} ${kx} ${kT - 30} ${kx} ${kT}"/>`).join('');
    const sc = xs.map((x) => `<path class="spine s-c" d="M${kx} ${kB} C${kx} ${kB + 30} ${x} ${cTop - 30} ${x} ${cTop}"/>`).join('');
    const at = (top, h) => `left:${G.pad}px;width:${iw}px;top:${top}px${h ? `;height:${h}px` : ''}`;
    const gov = ['Universal governance', 'Observability', 'Audit', 'Security', 'Compliance', 'End to end'].map((s) => `<span>${s}</span>`).join('<i>·</i>');
    const lock = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';
    const slab = `<div class="slab" style="left:${G.left}px;top:${G.top}px;width:${G.w}px;height:${H}px;--mk:url('${mk}')"><i class="edge"></i>
<svg class="lk" width="${G.w}" height="${H}" viewBox="0 0 ${G.w} ${H}">${mesh}${sb}${sc}</svg>
<div class="ph" style="${at(16)}"><h3><i class="mk"></i>UnifyApps Platform</h3><span class="login"><i>${lock}</i>One login · one tenant · one governance model</span></div>
<p class="k kb" style="left:${G.pad}px;top:${G.bTop - 30}px">Three builders</p>
<div class="tier tb" style="${at(G.bTop, G.tierH)};column-gap:${G.gap}px">${this.BUILD.map((x) => node(x, 'b')).join('')}</div>
<div class="band" style="${at(bB, G.bandH)}"><div class="core"><span class="orb"><i class="mk"></i></span><div><b>Enterprise Context Graph</b><span>ontology + knowledge graph shared by every builder</span></div></div></div>
<p class="k kc" style="left:${G.pad}px;top:${cTop - 30}px">Three contexts</p>
<div class="tier tc" style="${at(cTop, G.tierH)};column-gap:${G.gap}px">${this.CTX.map((x, i) => node(x, 'c', i === 0)).join('')}</div>
<p class="gov" style="${at(govTop)}">${gov}</p></div>`;
    // the systems plugged in under the panel, each wired up into it
    const sTop = G.top + H + 46, sw = (G.w - 4 * 14) / 5;
    const ups = this.SYS.map((_, i) => { const x = G.left + sw / 2 + i * (sw + 14); return `<path class="upw" d="M${x} ${sTop - 2} V${G.top + H + 2}"/>`; }).join('');
    const sys = this.SYS.map(([b, alt]) => `<div class="ys"><b>${b}</b><span>${U.esc(alt)}</span></div>`).join('');
    return `${U.head({ kicker: 'One login, unified access', title: 'One platform.', em: 'Every builder on the same brain.' })}${slab}
<svg class="up" viewBox="0 0 1920 1080">${ups}</svg>
<p class="sl" style="top:${G.top + H + 8}px;transform:translateX(-50%)">Your systems &amp; infrastructure, plugged in. Additive, no rip and replace</p>
<div class="sys" style="left:${G.left}px;width:${G.w}px;top:${sTop}px">${sys}</div>
<p class="dt" style="top:${G.top + H + 22}px"><b>Context Graph</b>. Knowledge: the truth across the systems. Every builder uses it, so it is built once.</p>
<p class="ft" style="top:${sTop + 140}px">The whole platform on one page: <em>systems in</em><i>→</i><em>contexts synthesised into the enterprise brain</em><i>→</i><em>builders on top</em><i>→</i><em>governance around all of it</em>.</p>`;
  },
  anim(c) {
    // the entrance: the panel and its name; its edge keeps turning while the scene holds
    c.rise(c.q('.slab'), c.start + 500, { y: 30, dur: 800 });
    c.fade(c.q('.ph'), c.start + 900);
    const edge = c.q('.edge');
    c.live((k) => { edge.style.setProperty('--ang', `${(Math.max(0, k) / 9000) * 360}deg`); }, c.start + 1300);

    // 1 · the three builders
    let at = c.t(1);
    c.fade(c.q('.kb'), at);
    c.rise(c.qa('.tb .pn'), at, { stagger: 140 });
    c.fade(c.qa('.tb li'), at + 450, { stagger: 40 });

    // 2 · the Enterprise Context Graph lights, and the builders' wires draw into it and carry current
    at = c.t(2);
    c.pop(c.q('.core'), at, { dur: 800 });
    c.draw(c.qa('.s-b'), at + 350, { dur: 600, stagger: 90 });
    c.current(c.qa('.s-b'), at + 1000, { dash: '4 10', speed: 15 });
    c.spin(c.q('.orb .mk'), at + 700, { period: 16000 });
    c.ping(c.q('.orb'), at + 1100, { period: 2600 });
    // the graph breathes: a glow of its own around the pill, brightening and fading (no scale, so nothing shows through it)
    const glow = c.fx(c.q('.core'), 'cg', true)[0];
    c.live((k) => { glow.style.opacity = k < 0 ? '0' : String(Math.min(1, k / 500) * (0.55 + 0.45 * Math.sin((2 * Math.PI * k) / 3200))); }, at + 1200);

    // 3 · the three contexts, wired from the graph and to every builder
    at = c.t(3);
    c.fade(c.q('.kc'), at);
    c.rise(c.qa('.tc .pn'), at, { stagger: 140 });
    c.fade(c.qa('.tc li'), at + 450, { stagger: 30 });
    c.draw(c.qa('.s-c'), at + 300, { dur: 600, stagger: 90 });
    c.draw(c.qa('.mesh'), at + 700, { dur: 800, stagger: 40 });
    c.current(c.qa('.s-c'), at + 1000, { dash: '4 10', speed: 15 });

    // 4 · a click on Context Graph traces it: every builder's wire into it lights and carries current, and the line
    // under the panel says what it holds; both clear for the next build
    at = c.t(4);
    const tr = c.qa('.mesh.m-c0'), sw = c.q('.sw'), dt = c.q('.dt');
    c.current(tr, at, { dash: '5 7', speed: 26 });
    const lit = c.qa('.mesh.m-c0.ua-current');
    c.fade(sw, at, { dur: 400 });
    c.halo(sw, at + 500, { period: 2600 });
    c.fadeUp(dt, at + 250, { y: 12 });
    c.tw([sw, dt, ...lit], [{ opacity: 1 }, { opacity: 0 }], { at: c.t(5), dur: 300, ease: 'soft' });

    // 5 · governance around all of it, and the systems plugged in below, their wires running up into the panel
    at = c.t(5);
    c.fade(c.qa('.gov span, .gov i'), at, { stagger: 70, dur: 500 });
    c.draw(c.qa('.upw'), at + 300, { dur: 500, stagger: 70 });
    c.fade(c.q('.sl'), at + 350);
    c.rise(c.qa('.ys'), at + 350, { stagger: 80 });
    c.fadeUp(c.q('.ft'), at + 900, { y: 14 });
    c.current(c.qa('.upw'), at + 1100, { dash: '4 8', speed: 18 });
  },
});
