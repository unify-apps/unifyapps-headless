// The UnifyApps standard "what does it take to build the 80% on your own?": the five-layer stack (AI Agents,
// Application, Workflow, Data, Integration) with each layer's products, every layer wired on its own to the systems of
// record, activity and knowledge, and the cost of building it that way. Fixed content; `stack` picks whose products
// fill the layers: "best-of-breed" (default), "salesforce", "microsoft" or "google".
// Builds: 1 the stack, layer by layer; 2 the wires to the three system types, carrying current, and the counts;
// 3 the code-first panel, on its first point (built by hand: code over the layers); 4 cost before value (the year-one
// meter); 5 every connection an attack surface (the wiring turns red); 6 value stuck in pilots (the stamp).
UA.scene('ua-code-first', {
  need: [],
  covers: [/\bcode[- ]first (approach|stack|way|build)/i, /\bbest[- ]of[- ]breed (stack|tools|products)/i, /\bpoint[- ]to[- ]point integrations?/i, /\bbuild(ing)? (the|that) 80\s?% (on your own|yourself|in[- ]house)/i, /\b(five|5)[- ]layer (tech )?stack/i],
  stacks: {
    // each layer's products, in the layers' order
    'best-of-breed': { pre: 'A typical', name: 'best-of-breed', products: [
      ['Copilot', 'Kore.ai', 'Salesforce', 'Moveworks', 'Glean'], ['OutSystems', 'watsonx', 'Retool', 'Mendix'],
      ['Workato', 'MuleSoft', 'Power Automate', 'ServiceNow'], ['Snowflake', 'Informatica', 'Databricks'], ['Boomi', 'MuleSoft', 'Oracle Integration Cloud']] },
    salesforce: { pre: 'A', name: 'Salesforce', products: [
      ['Agentforce', 'MuleSoft Agent Fabric'], ['Salesforce Lightning', 'Salesforce Platform'], ['Salesforce Flow', 'MuleSoft Composer'],
      ['Data 360'], ['MuleSoft', 'Connectors']] },
    microsoft: { pre: 'A', name: 'Microsoft', products: [
      ['Copilot', 'Copilot Studio', 'Azure AI Foundry'], ['Power Apps'], ['Power Automate', 'Azure Logic Apps', 'Azure API Management'],
      ['Microsoft Fabric'], ['Power Apps connectors', 'Power Automate connectors', 'Logic Apps connectors']] },
    google: { pre: 'A', name: 'Google', products: [
      ['Google AI Studio', 'Dialogflow'], ['AppSheet', 'Looker'], ['Google Workflows', 'Workspace Studio'],
      ['Knowledge Catalog', 'BigQuery', 'Cloud SQL'], ['Application Integration', 'Apigee']] },
  },
  layers: [['AI Agents', 'ai-agents'], ['Application', 'application'], ['Workflow', 'workflow'], ['Data', 'data'], ['Integration', 'integration']],
  systems: [
    ['System of Records', 'systems-of-record', 'Salesforce, Workday, SAP and more'],
    ['System of Activity', 'systems-of-activity', 'Slack, Teams, Jira and more'],
    ['System of Knowledge', 'systems-of-knowledge', 'Drive, SharePoint, Notion and more'],
  ],
  counts: [[5, '', 'layers'], [3, '', 'system types'], [15, '', 'point-to-point integrations'], [5, '+', 'specialist skill sets']],
  points: [
    { id: 'build', k: 'Build', t: 'Hand-built, layer by layer', d: 'Each use case is engineered across five layers and several tools, each needing its own specialists. Months pass before anything ships, and the next use case starts the same way.', icon: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16"/>' },
    { id: 'roi', k: 'ROI', t: 'Costs land before value does', d: 'Licences stack per layer and per vendor, while integration, testing and upkeep take the budget long before the business sees a return.', icon: '<path d="M3 20h18M6 16v-3M10 16V9M14 16v-5M18 16V5"/>' },
    { id: 'vuln', k: 'Vulnerabilities', t: 'Every connection is an attack surface', d: 'Fifteen point-to-point integrations per stack scatter credentials, data copies and policies across tools. Each one is a place to breach, leak or drift out of compliance.', icon: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 8v5M12 16.5v.01"/>' },
    { id: 'value', k: 'Business value', t: 'Value stays stuck in pilots', d: 'Delivery waits on scarce engineering capacity, so most initiatives never leave the pilot: 95% of GenAI projects do not get past it.', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10a2.5 2 0 015 0c0 2.5-5 1.5-5 4a2.5 2 0 005 0"/>' },
  ],
  glyphs: ['{ }', '=>', '( )', ';', '[ ]', '</>', '&&', 'fn()', 'if', 'try{'],
  // the stack card, in its own pixels: side and top padding, the layer label column, the rows, the wiring gap and the
  // system boxes under it
  geo: { W: 940, PX: 24, PT: 22, LBW: 112, LG: 14, RW: 520, RG: 10, WG: 66, SH: 100, SG: 16, PB: 20 },
  problems(d) {
    return d.stack == null || this.stacks[d.stack] ? [] : [`data.stack is ${JSON.stringify(d.stack)}; it must be one of ${Object.keys(this.stacks).join(', ')}`];
  },
  steps() { return 6; },
  labels(d) {
    const s = this.stacks[d.stack] ?? this.stacks['best-of-breed'];
    return [
      `${s.name} stack layers ${this.layers.map((l) => l[0]).join(' ')}`,
      'wired wires every system records activity knowledge point-to-point integrations',
      'code-first approach hand-built hand-coded layer by layer',
      'costs cost value ROI year one budget',
      'connection attack surface surfaces vulnerabilities',
      'value stuck pilot pilots',
    ];
  },
  css: `
.sc-ua-code-first { --hot: var(--alert); --tx: var(--ink); --tx2: var(--body); --pcard: var(--card); --pline: var(--rule); --ictile: var(--paper2);
  --w0: var(--accent); --w1: var(--deep3); --w2: var(--accent-on-deep); --w3: color-mix(in srgb, var(--deep3) 72%, var(--accent-on-deep)); --w4: var(--deep2); }
.sc-ua-code-first.gr-deep { --hot: color-mix(in srgb, var(--alert) 55%, var(--on-deep)); --tx: var(--on-deep); --tx2: var(--on-deep-body); --pcard: color-mix(in srgb, var(--on-deep) 6%, transparent); --pline: var(--on-deep-rule); --ictile: color-mix(in srgb, var(--on-deep) 10%, transparent); }
.sc-ua-code-first .ttl { position: absolute; left: var(--side); top: 250px; font: 400 30px/1.25 var(--serif); color: var(--tx); white-space: nowrap; }
.sc-ua-code-first .ttl i { font-style: normal; color: var(--accent); }
.sc-ua-code-first.gr-deep .ttl i { color: var(--accent-on-deep); }
.sc-ua-code-first .vis { position: absolute; left: var(--side); top: 306px; background: var(--view); border: 1.5px solid var(--rule); border-radius: 28px; box-shadow: 0 24px 60px var(--edge); }
.sc-ua-code-first.gr-deep .vis { border-color: transparent; box-shadow: 0 30px 80px color-mix(in srgb, var(--deep-edge) 70%, transparent); }
.sc-ua-code-first .ly { position: absolute; display: flex; align-items: center; }
.sc-ua-code-first .ly p { flex: none; font: 600 20px/1.12 var(--serif); color: var(--ink2); text-align: right; }
.sc-ua-code-first .row { position: relative; flex: none; border-radius: 13px; overflow: hidden; background: var(--view); box-shadow: 0 0 0 1px var(--rule); }
.sc-ua-code-first .row .pr { display: flex; align-items: center; justify-content: space-evenly; gap: 10px; width: 100%; height: 100%; padding: 0 14px; font: 600 19px/1.15 var(--sans); color: var(--ink); text-align: center; }
.sc-ua-code-first .row .ring, .sc-ua-code-first .row .hl { position: absolute; inset: 0; border-radius: inherit; opacity: 0; }
.sc-ua-code-first .row .ring { box-shadow: inset 0 0 0 2.5px var(--alert); }
.sc-ua-code-first .row .hl { box-shadow: inset 0 0 0 2.5px var(--accent2); background: color-mix(in srgb, var(--accent) 6%, transparent); }
.sc-ua-code-first .sys { position: absolute; background: var(--view); border: 1.5px solid var(--rule); border-radius: 17px; text-align: center; padding-top: 12px; }
.sc-ua-code-first .sys b { display: block; font: 600 20px/1.2 var(--serif); color: var(--accent); }
.sc-ua-code-first .sys .ex { display: block; margin: 8px 12px 0; font: 500 18px/1.3 var(--sans); color: var(--ink2); }
.sc-ua-code-first svg.wr { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.sc-ua-code-first svg.wr path { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.sc-ua-code-first svg.wr path.b { opacity: .38; }
.sc-ua-code-first svg.wr .ua-dot { fill: currentColor; }
.sc-ua-code-first svg.wr .jn circle { fill: var(--view); stroke: var(--alert); stroke-width: 2; }
.sc-ua-code-first .code { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
.sc-ua-code-first .code i { position: absolute; font: 500 20px/1 var(--sans); font-style: normal; color: var(--alert); opacity: 0; white-space: nowrap; }
.sc-ua-code-first .tag { position: absolute; z-index: 4; white-space: nowrap; }
.sc-ua-code-first .tag span { display: block; font: 600 18px/1 var(--sans); min-height: 42px; letter-spacing: .1em; text-transform: uppercase; border-radius: 10px; padding: 12px 16px; }
.sc-ua-code-first .tag.bb { left: 50%; top: -19px; transform: translateX(-50%); }
.sc-ua-code-first .tag b { font-weight: 600; }
.sc-ua-code-first .tag.bb span { background: var(--alert-bg); color: var(--alert); box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--alert) 30%, transparent); }
.sc-ua-code-first .tag.bv span { background: var(--alert); color: var(--view); box-shadow: 0 10px 24px color-mix(in srgb, var(--alert) 30%, transparent); }
.sc-ua-code-first .roi { position: absolute; z-index: 4; width: 268px; padding: 16px 18px 18px; background: var(--view); border: 1.5px solid var(--rule); border-radius: 17px; box-shadow: 0 16px 36px var(--shadow); }
.sc-ua-code-first .roi p { font: 600 18px/1 var(--sans); letter-spacing: .13em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.sc-ua-code-first .roi .mb { display: grid; grid-template-columns: 68px 1fr; align-items: center; gap: 10px; margin-top: 8px; font: 400 20px/1.2 var(--sans); color: var(--body); }
.sc-ua-code-first .roi s { display: block; height: 11px; border-radius: 6px; background: var(--paper3); overflow: hidden; text-decoration: none; }
.sc-ua-code-first .roi u { display: block; height: 100%; border-radius: 6px; transform-origin: 0 50%; }
.sc-ua-code-first .roi u.c { width: 92%; background: var(--alert); }
.sc-ua-code-first .roi u.v { width: 18%; background: var(--w3); }
.sc-ua-code-first .stw { position: absolute; z-index: 4; left: 50%; transform: translateX(-50%) rotate(-6deg); }
.sc-ua-code-first .stamp { border: 3px solid var(--alert); color: var(--alert); font: 700 24px/1 var(--sans); letter-spacing: .18em; text-transform: uppercase; padding: 10px 20px; border-radius: 10px; background: color-mix(in srgb, var(--view) 88%, transparent); white-space: nowrap; }
.sc-ua-code-first .cnt { position: absolute; left: var(--side); top: 884px; display: flex; gap: 10px; }
.sc-ua-code-first .cnt span { font: 400 19px/1 var(--sans); color: var(--body); background: var(--paper3); border-radius: 99px; padding: 12px 16px; white-space: nowrap; }
.sc-ua-code-first .cnt b { font-weight: 600; color: var(--deep); font-variant-numeric: tabular-nums; }
.sc-ua-code-first.gr-deep .cnt span { color: var(--on-deep-body); background: color-mix(in srgb, var(--on-deep) 9%, transparent); }
.sc-ua-code-first.gr-deep .cnt b { color: var(--on-deep); }
.sc-ua-code-first .ld { position: absolute; left: 1112px; top: 318px; width: 696px; font: 400 32px/1.42 var(--serif); color: var(--tx2); }
.sc-ua-code-first .pn { position: absolute; left: 1112px; top: 248px; width: 696px; }
.sc-ua-code-first .pn .lbl { color: var(--accent); }
.sc-ua-code-first.gr-deep .pn .lbl { color: var(--accent-on-deep); }
.sc-ua-code-first .h3 { margin-top: 14px; font: 400 56px/1.12 var(--serif); letter-spacing: -.01em; color: var(--tx); white-space: nowrap; }
.sc-ua-code-first .cf { position: relative; display: inline-block; font-style: italic; color: var(--hot); }
.sc-ua-code-first .cf svg { position: absolute; left: -2%; bottom: -12px; width: 104%; height: 18px; overflow: visible; }
.sc-ua-code-first .cf path { fill: none; stroke: var(--hot); stroke-width: 3.5; stroke-linecap: round; }
.sc-ua-code-first .sub { margin-top: 22px; font: 400 23px/1.4 var(--serif); color: var(--tx2); text-wrap: balance; }
.sc-ua-code-first .pts { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
.sc-ua-code-first .pt { position: relative; display: grid; grid-template-columns: 48px 1fr; column-gap: 16px; align-items: start; padding: 14px 18px; background: var(--pcard); border: 1.5px solid var(--pline); border-radius: 18px; }
.sc-ua-code-first .pt .hi { position: absolute; inset: -1.5px; border: 2px solid var(--hot); border-radius: inherit; box-shadow: 0 14px 34px color-mix(in srgb, var(--alert) 14%, transparent); opacity: 0; }
.sc-ua-code-first .ic { position: relative; width: 48px; height: 48px; margin-top: 4px; border-radius: 13px; background: var(--ictile); color: var(--hot); display: grid; place-items: center; }
.sc-ua-code-first .ic svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.sc-ua-code-first .ic .on { position: absolute; inset: 0; border-radius: inherit; background: var(--alert); color: var(--view); display: grid; place-items: center; opacity: 0; }
.sc-ua-code-first.gr-deep .ic .on { color: var(--on-deep); }
.sc-ua-code-first .pt small { display: block; font: 600 18px/1.1 var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--hot); }
.sc-ua-code-first .pt b { display: block; margin-top: 4px; font: 500 28px/1.2 var(--serif); color: var(--tx); }
.sc-ua-code-first .pt .d { display: block; height: 0; overflow: hidden; opacity: 0; font: 400 22px/1.38 var(--serif); color: var(--tx2); text-wrap: pretty; }`,
  // the header's heading ends on a question mark set upright after the italic clause
  head(U) {
    return `<header class="hd"><div class="kicker">From tech stack to platform</div><h2 class="h2">${U.words('What does it take to build')} <em>${U.words('the 80% on your own')}</em><span class="w"><span>?</span></span></h2></header>`;
  },
  // the wiring, in the card's pixels: from each row's right end down its own lane to its own bus, then along to a drop
  // into each system (the reference's layoutWires)
  wires() {
    const g = this.geo, RH = (g.RW * 112) / 933, rowR = g.PX + g.LBW + g.LG + g.RW;
    const stackB = g.PT + 5 * RH + 4 * g.RG, sysT = stackB + g.WG, SW = (g.W - 2 * g.PX - 2 * g.SG) / 3;
    const rows = this.layers.map((_, i) => {
      const cy = g.PT + i * (RH + g.RG) + RH / 2, gx = rowR + 12 + i * ((g.W - rowR - 24) / 5), by = stackB + g.WG * 0.22 + i * ((g.WG * 0.6) / 5);
      const drops = [0, 1, 2].map((j) => g.PX + j * (SW + g.SG) + SW * (0.18 + i * 0.16));
      return { cy, gx, by, drops };
    });
    return { RH, rowR, stackB, sysT, SW, H: sysT + g.SH + g.PB, rows };
  },
  build(d, U) {
    const g = this.geo, s = this.stacks[d.stack] ?? this.stacks['best-of-breed'], w = this.wires();
    const f = (n) => +n.toFixed(1);
    const layers = this.layers.map(([name, file], i) => `<div class="ly" style="left:${g.PX}px;top:${f(g.PT + i * (w.RH + g.RG))}px;height:${f(w.RH)}px;gap:${g.LG}px"><p style="width:${g.LBW}px">${U.esc(name)}<br>Layer</p><div class="row" style="width:${g.RW}px;height:${f(w.RH)}px"><span class="pr">${s.products[i].map((x) => `<span>${U.esc(x)}</span>`).join('')}</span><i class="hl"></i><i class="ring"></i></div></div>`).join('');
    const sys = this.systems.map(([name, file, alt], j) => `<div class="sys" style="left:${f(g.PX + j * (w.SW + g.SG))}px;top:${f(w.sysT)}px;width:${f(w.SW)}px;height:${g.SH}px"><b>${U.esc(name)}</b><span class="ex">${U.esc(alt)}</span></div>`).join('');
    // each layer's wires in a group coloured by the layer (paths and the dots on them take currentColor)
    const groups = w.rows.map((r, i) => `<g class="r${i}" style="color:var(--w${i})">${r.drops.map((dx) => `<path class="b" style="stroke:currentColor" d="M${f(w.rowR)} ${f(r.cy)} H${f(r.gx)} V${f(r.by)} H${f(dx)} V${f(w.sysT)}"/>`).join('')}<circle cx="${f(w.rowR)}" cy="${f(r.cy)}" r="4.5" style="fill:currentColor"/></g>`).join('');
    const jn = w.rows.map((r) => `<circle cx="${f(r.gx)}" cy="${f(r.by)}" r="4.5"/>${r.drops.map((dx) => `<circle cx="${f(dx)}" cy="${f(w.sysT)}" r="4"/>`).join('')}`).join('');
    // the reference's scatter, kept off the layer names: across the rows and the wiring, down to the systems
    const gx0 = g.PX + g.LBW + g.LG, code = this.glyphs.map((x, i) => `<i style="left:${f(gx0 + (((8 + i * 9) % 92) / 92) * (g.W - gx0 - 60))}px;top:${12 + ((i * 37) % 70)}%">${U.esc(x)}</i>`).join('');
    const vis = `<div class="vis" style="width:${g.W}px;height:${f(w.H)}px"><svg class="wr" width="${g.W}" height="${f(w.H)}" viewBox="0 0 ${g.W} ${f(w.H)}">${groups}<g class="jn" opacity="0">${jn}</g></svg>${layers}${sys}<div class="code">${code}</div>`
      + `<div class="tag bb"><span><b>Hand-coded per layer</b></span></div>`
      + `<div class="roi" style="right:16px;top:-62px"><p>Year one</p><div class="mb">Cost<s><u class="c"></u></s></div><div class="mb">Value<s><u class="v"></u></s></div></div>`
      + `<div class="tag bv" style="right:14px;top:${f(w.stackB - 6)}px"><span><b class="v">0 attack surfaces</b></span></div>`
      + `<div class="stw" style="top:${f(w.sysT + 34)}px"><div class="stamp">Stuck in pilot</div></div></div>`;
    const cnt = `<div class="cnt">${this.counts.map(([n, suf, l]) => `<span><b class="v">0${suf}</b> ${U.esc(l)}</span>`).join('')}</div>`;
    const pts = this.points.map((p) => `<div class="pt"><i class="hi"></i><span class="ic"><svg viewBox="0 0 24 24">${p.icon}</svg><span class="on"><svg viewBox="0 0 24 24">${p.icon}</svg></span></span><span class="tx"><small>${U.esc(p.k)}</small><b>${U.esc(p.t)}</b><span class="d">${U.esc(p.d)}</span></span></div>`).join('');
    const pn = `<div class="pn"><div class="lbl eb">The approach</div><h3 class="h3">${U.words('This is a')} <span class="cf"><span class="w"><span>code-first</span></span><svg viewBox="0 0 300 16" preserveAspectRatio="none"><path d="M3 11 C60 3 120 14 180 7 S260 4 297 9"/></svg></span> ${U.words('approach')}</h3><p class="sub">Every layer is built, wired and secured by hand. Here is what that costs.</p><div class="pts">${pts}</div></div>`;
    return `${this.head(U)}<p class="ttl">${U.esc(s.pre)} <i>${U.esc(s.name)}</i> stack to every system</p>${vis}${cnt}<p class="ld">Pick any stack, best of breed or a single big vendor. Each layer still connects to every system of record, activity and knowledge on its own.</p>${pn}`;
  },
  anim(c, d, U) {
    const T = [1, 2, 3, 4, 5, 6].map((k) => c.t(k));
    const out = (el, at, dur = 380) => c.tw(el, [{ opacity: 1 }, { opacity: 0 }], { at, dur, ease: 'soft' });
    const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
    // the lede stands beside the stack until the panel takes its place
    c.fadeUp(c.q('.ld'), c.start + 700, { y: 16, dur: 800 });
    out(c.q('.ld'), T[2] - 100, 360);

    // 1: the card, its heading line, then the layers dropping into place one by one
    c.fadeUp(c.q('.ttl'), T[0], { y: 14 });
    c.rise(c.q('.vis'), T[0] + 80, { y: 22, dur: 700 });
    c.snap(c.qa('.ly'), T[0] + 380, { y: -34, dur: 640, stagger: 120 });
    // while only the stack shows, a light passes down it layer by layer
    const hls = c.qa('.row .hl'), t2 = T[1];
    c.live((k) => hls.forEach((h, i) => {
      if (k < 0 || U.t >= t2) { h.style.opacity = 0; return; }
      const f = ((k / 1100) % 6.5) - i, on = f > 0 && f < 1 ? Math.sin(Math.PI * f) : 0;
      h.style.opacity = String(on.toFixed(3));
    }), T[0] + 1500);

    // 2: the system boxes, every layer wired to every one, the counts
    c.rise(c.qa('.sys'), T[1], { y: 20, stagger: 110 });
    const rows = c.qa('svg.wr g[class^="r"]');
    rows.forEach((gr, i) => {
      c.fade(gr.querySelector('circle'), T[1] + 150 + i * 70, { dur: 300 });
      c.draw(gr.querySelectorAll('path.b'), T[1] + 300 + i * 110, { dur: 900, stagger: 60 });
    });
    const paths = c.qa('svg.wr path.b');
    c.current(paths, T[1] + 1300, { dash: '4 11', speed: 21, stagger: 25 });
    c.travel(paths.filter((_, k) => k % 2 === 0), T[1] + 1500, { dur: 6400, r: 4, stagger: 760 });
    c.rise(c.qa('.cnt span'), T[1] + 700, { y: 12, stagger: 110 });
    c.qa('.cnt b').forEach((b, i) => c.count(b, { from: 0, to: this.counts[i][0], suffix: this.counts[i][1], at: T[1] + 800 + i * 110, dur: 1300 }));

    // 3: the panel, then its first point: built by hand, code over every layer
    const pn = c.q('.pn');
    c.tw(pn.querySelector('.eb'), [{ opacity: 0, letterSpacing: '.3em' }, { opacity: 1, letterSpacing: '.15em' }], { at: T[2] + 150, dur: 800 });
    c.words(pn.querySelector('.h3'), T[2] + 250, { stagger: 60 });
    c.draw(pn.querySelector('.cf path'), T[2] + 800, { dur: 1300, ease: 'cubic-bezier(.4,.1,.2,1)' });
    c.fadeUp(pn.querySelector('.sub'), T[2] + 500, { y: 12 });
    c.rise(pn.querySelectorAll('.pt'), T[2] + 650, { y: 18, stagger: 140 });

    // each point in turn: its card lit and opened, its mark on the stack; the one before closes
    const F = [T[2] + 1300, T[3], T[4], T[5]];
    c.qa('.pt').forEach((p, i) => {
      const dsc = p.querySelector('.d'), h = dsc.scrollHeight, at = F[i], end = F[i + 1];
      c.fade(p.querySelector('.hi'), at, { dur: 400 });
      c.fade(p.querySelector('.ic .on'), at, { dur: 400 });
      c.tw(dsc, [{ height: '0px', opacity: 0, marginTop: '0px' }, { height: `${h}px`, opacity: 1, marginTop: '8px' }], { at, dur: 600, ease: 'ui' });
      if (end) {
        out(p.querySelector('.hi'), end);
        out(p.querySelector('.ic .on'), end);
        c.tw(dsc, [{ height: `${h}px`, opacity: 1, marginTop: '8px' }, { height: '0px', opacity: 0, marginTop: '0px' }], { at: end, dur: 500, ease: 'ui' });
      }
    });

    // Build: code drifting over the card, every layer ringed, the badge
    const code = c.q('.code'), glyphs = c.qa('.code i');
    c.fade(code, F[0], { dur: 300 }); out(code, F[1]);
    c.fade(c.qa('.row .ring'), F[0], { dur: 400, stagger: 60 }); out(c.qa('.row .ring'), F[1]);
    c.rise(c.q('.tag.bb span'), F[0] + 200, { y: 8 }); out(c.q('.tag.bb span'), F[1]);
    c.live((k) => glyphs.forEach((x, i) => {
      const q = k - i * 320, f = q < 0 ? 0 : (q % 3200) / 3200;
      const o = q < 0 ? 0 : f < 0.25 ? (f / 0.25) * 0.55 : f < 0.75 ? 0.55 - ((f - 0.25) / 0.5) * 0.1 : 0.45 * (1 - (f - 0.75) / 0.25);
      x.style.opacity = o.toFixed(3); x.style.transform = `translateY(${(10 - 36 * f).toFixed(1)}px)`;
    }), F[0] + 200);

    // ROI: the year-one meter, cost running far ahead of value
    const roi = c.q('.roi');
    c.fadeUp(roi, F[1] + 100, { y: -8, dur: 500 }); out(roi, F[2]);
    c.tw(roi.querySelectorAll('u'), [{ transform: 'scaleX(0)' }, { transform: 'none' }], { at: F[1] + 400, dur: 2200, ease: 'cubic-bezier(.3,.7,.2,1)' });

    // Vulnerabilities: every wire and its current turns to the alert colour, the joints pulse, the count of surfaces
    const hot = css(c.el, '--alert');
    rows.forEach((gr) => {
      const from = getComputedStyle(gr).color;
      c.tw(gr, [{ color: from }, { color: hot }], { at: F[2], dur: 500, ease: 'soft' });
      c.tw(gr, [{ color: hot }, { color: from }], { at: F[3], dur: 500, ease: 'soft' });
    });
    const jn = c.q('svg.wr .jn'), dots = [...jn.querySelectorAll('circle')], r0 = dots.map((x) => +x.getAttribute('r'));
    c.tw(jn, [{ opacity: 0 }, { opacity: 1 }], { at: F[2] + 200, dur: 400, ease: 'soft' }); out(jn, F[3]);
    c.live((k) => dots.forEach((x, i) => x.setAttribute('r', (r0[i] * (1 + (k < 0 ? 0 : Math.sin((Math.PI * (k % 1200)) / 1200) ** 2 * 0.9))).toFixed(2))), F[2] + 200);
    const bv = c.q('.tag.bv span');
    c.pop(bv, F[2] + 300); out(bv, F[3]);
    c.count(bv.firstChild, { from: 0, to: 15, suffix: ' attack surfaces', at: F[2] + 350, dur: 1100 });

    // Business value: the systems grey out and the work stays stamped in pilot
    c.tw(c.qa('.sys'), [{ opacity: 1, filter: 'grayscale(0)' }, { opacity: 0.45, filter: 'grayscale(1)' }], { at: F[3], dur: 600, ease: 'soft' });
    c.tw(c.qa('.row .pr'), [{ filter: 'grayscale(0)' }, { filter: 'grayscale(.6)' }], { at: F[3], dur: 600, ease: 'soft' });
    c.tw(c.q('.stamp'), [{ opacity: 0, transform: 'scale(1.3)' }, { opacity: 1, transform: 'none' }], { at: F[3] + 250, dur: 500, ease: 'cubic-bezier(.2,.9,.3,1.4)' });
  },
});
