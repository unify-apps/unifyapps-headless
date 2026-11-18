// The UnifyApps standard "N, N+1, N+N problem": Agent 1 needs six layers of tools; every agent added needs them all
// again, so the tools to licence and run, the duplicated components and the app integrations to maintain climb with
// each one. Fixed content, no data.
// Builds: 1 Agent 1 and its six layers of tools; 2 Agent 2; 3 Agent 3 (each new agent slides in, the counters climb and
// it wires to every app); 4 the duplication of components and tools; 5 why it does not scale.
UA.scene('ua-n-plus-n', {
  need: [],
  covers: [/\bN\s*,?\s*N\s*\+\s*1\s*,?\s*(and\s+)?N\s*\+\s*N\b/i, /\bN\s*\+\s*N (problem|effect)/i, /\bduplicat(ed|ion of) (components|tools|stacks?)( and tools)? (across|for every|per) agents?/i, /\btool instances (per|for each|for every) agent/i, /\bevery (new |other )?agent (needs|rebuilds|repeats) (the |its own |all )?(six )?(layers|stack|tools)/i],
  layers: [
    ['Agent studios', ['Crew AI', 'Copilot', 'Google Agent Studio', 'Glean', 'AWS Agent Builder']],
    ['Automation & orchestration', ['Python', 'n8n', 'LangChain', 'Workato', 'MuleSoft']],
    ['User interface', ['React', 'Retool', 'OutSystems', 'Mendix', 'Lovable']],
    ['Business action', ['Python', 'n8n', 'LangChain', 'Workato', 'MuleSoft']],
    ['Model config', ['ChatGPT', 'Gemini', 'Claude', 'Mistral', 'Grok']],
    ['Data transformation', ['Fivetran', 'Informatica', 'Atlan', 'dbt', 'Python']],
  ],
  mini: ['Agent studios', 'Automations', 'User interface', 'Business action', 'Prompting', 'Data transformation'],
  apps: ['Gmail', 'Slack', 'Teams', 'Notion', 'Asana', 'Concur', 'Workday', 'Salesforce'],
  clouds: ['AWS', 'Google Cloud', 'Azure', 'Oracle Cloud'],
  // agents in production, tool instances to licence and run, duplicated components, app integrations to maintain, for
  // n agents (the reference's renderAgents)
  stats: [['agents in production', (n) => n], ['tool instances to licence and run', (n) => 30 * n], ['duplicated components', (n) => 30 * (n - 1)], ['app integrations to maintain', (n) => 6 * n]],
  agents: 3,
  // the board: its top and height, Agent 1's width, each further agent's card and the gap between them, where the
  // apps row sits and how wide each app is
  geo: { BT: 380, BH: 420, A1W: 826, GAP: 24, MW: 260, MG: 12, AT: 838, AW: 176, AH: 46, AG: 14 },
  steps() { return this.agents + 2; },
  // the counters, the apps and the clouds are in by then
  settle() { return 1900; },
  labels() {
    return ['Agent 1 six layers tools', 'Agent 2 again', 'Agent 3 again', 'duplication duplicated components tools', 'difficult scale skills manage maintain'];
  },
  css: `
.sc-ua-n-plus-n { --tx: var(--ink); --tx2: var(--body); --tx3: var(--ink2); --nc: var(--card); --nr: var(--paper); --nl: var(--rule); --hot: var(--alert); }
.sc-ua-n-plus-n.gr-deep { --tx: var(--on-deep); --tx2: var(--on-deep-body); --tx3: var(--on-deep2); --nc: color-mix(in srgb, var(--on-deep) 7%, transparent); --nr: color-mix(in srgb, var(--on-deep) 5%, transparent); --nl: var(--on-deep-rule); --hot: color-mix(in srgb, var(--alert) 55%, var(--on-deep)); }
.sc-ua-n-plus-n .h2 { white-space: nowrap; }
.sc-ua-n-plus-n .ld { position: absolute; left: var(--side); top: 230px; font: 400 23px/1.3 var(--serif); color: var(--tx2); white-space: nowrap; }
.sc-ua-n-plus-n .st { position: absolute; left: var(--side); right: var(--side); top: 290px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.sc-ua-n-plus-n .st > div { position: relative; display: flex; align-items: baseline; gap: 14px; padding: 12px 22px; background: var(--nc); border: 1.5px solid var(--nl); border-radius: 16px; }
.sc-ua-n-plus-n .st b { font: 500 42px/1 var(--serif); color: var(--deep2); font-variant-numeric: lining-nums tabular-nums; }
.sc-ua-n-plus-n.gr-deep .st b { color: var(--on-deep); }
.sc-ua-n-plus-n .st .bad b { color: var(--hot); }
.sc-ua-n-plus-n .st span { font: 400 20px/1.2 var(--sans); color: var(--tx2); }
.sc-ua-n-plus-n .card { position: absolute; display: flex; flex-direction: column; padding: 14px; background: var(--nc); border: 1.5px solid var(--nl); border-radius: 22px; }
.sc-ua-n-plus-n .card h4 { font: 500 22px/1.2 var(--sans); color: var(--tx3); margin: 0 0 10px; }
.sc-ua-n-plus-n .rws { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
.sc-ua-n-plus-n .nr { display: grid; grid-template-columns: 150px 1fr; align-items: center; column-gap: 10px; padding: 5px 12px; background: var(--nr); border: 1.5px solid var(--nl); border-radius: 13px; }
.sc-ua-n-plus-n .nr em { font: normal 600 19px/1.1 var(--sans); color: var(--tx3); }
.sc-ua-n-plus-n .tls { display: flex; flex-wrap: wrap; gap: 6px; }
.sc-ua-n-plus-n .tl { display: inline-flex; align-items: center; gap: 7px; padding: 3px 9px 3px 4px; background: var(--nc); border: 1px solid var(--nl); border-radius: 9px; font: 400 18px/1.2 var(--sans); color: var(--tx2); white-space: nowrap; }
.sc-ua-n-plus-n .lg { flex: none; width: 22px; height: 22px; border-radius: 5px; background: var(--view); object-fit: contain; }
.sc-ua-n-plus-n .mn { padding: 12px 10px; }
.sc-ua-n-plus-n .mn .mr { flex: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 7px; padding: 0 9px; border: 1.5px solid var(--nl); border-radius: 10px; font: 400 18px/1.1 var(--sans); color: var(--tx2); white-space: nowrap; }
.sc-ua-n-plus-n .mn h4 { margin-bottom: 2px; }
.sc-ua-n-plus-n .mr i { display: flex; gap: 3px; flex: none; }
.sc-ua-n-plus-n .mr u { width: 5px; height: 5px; border-radius: 50%; background: var(--nl); }
.sc-ua-n-plus-n.gr-deep .mr u { background: var(--on-deep-body); opacity: .45; }
.sc-ua-n-plus-n .dup { position: relative; align-self: flex-start; margin-top: 12px; padding: 7px 10px; border-radius: 8px; background: var(--alert-bg); color: var(--alert); font: 600 18px/1 var(--sans); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.sc-ua-n-plus-n.gr-deep .dup { background: color-mix(in srgb, var(--alert) 22%, transparent); color: var(--hot); }
.sc-ua-n-plus-n .note { position: absolute; display: flex; flex-direction: column; justify-content: center; gap: 26px; }
.sc-ua-n-plus-n .note p { font: 400 26px/1.36 var(--serif); color: var(--tx3); }
.sc-ua-n-plus-n .note b { font-weight: 600; color: var(--hot); }
.sc-ua-n-plus-n svg.wr { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; overflow: visible; pointer-events: none; }
.sc-ua-n-plus-n svg.wr g { opacity: .6; }
.sc-ua-n-plus-n svg.wr path { fill: none; stroke-width: 1.4; }
.sc-ua-n-plus-n .pr { position: absolute; border: 2px solid var(--hot); border-radius: inherit; opacity: 0; pointer-events: none; }
.sc-ua-n-plus-n .apps { position: absolute; display: flex; }
.sc-ua-n-plus-n .app { display: flex; align-items: center; gap: 9px; padding: 0 12px 0 8px; background: var(--nc); border: 1.5px solid var(--nl); border-radius: 13px; font: 400 19px/1 var(--sans); color: var(--tx3); white-space: nowrap; box-shadow: 0 4px 12px var(--edge); }
.sc-ua-n-plus-n .app .lg { width: 26px; height: 26px; border-radius: 6px; }
.sc-ua-n-plus-n .app em { margin-left: auto; font: normal 600 18px/1 var(--sans); color: var(--hot); opacity: 0; }
.sc-ua-n-plus-n .cl { position: absolute; left: var(--side); right: var(--side); top: 896px; height: 52px; display: flex; justify-content: space-around; align-items: center; background: var(--nc); border: 1.5px solid var(--nl); border-radius: 14px; }
.sc-ua-n-plus-n .cl span { display: flex; align-items: center; gap: 10px; font: 600 19px/1 var(--sans); color: var(--tx2); }
.sc-ua-n-plus-n .cl img { width: 44px; height: 32px; object-fit: contain; border-radius: 6px; background: var(--view); }`,
  // the header's heading ends on a full stop set upright after the italic clause
  head(U) {
    return `<header class="hd"><div class="kicker">Why code-first does not scale</div><h2 class="h2">${U.words('The N, N+1,')} <em>${U.words('N+N problem')}</em><span class="w"><span>.</span></span></h2></header>`;
  },
  // every agent's card: Agent 1 at the left, the others side by side after it
  cards() {
    const g = this.geo;
    return [{ l: 112, w: g.A1W }, ...Array.from({ length: this.agents - 1 }, (_, m) => ({ l: 112 + g.A1W + g.GAP + m * (g.MW + g.MG), w: g.MW }))];
  },
  build(d, U) {
    const g = this.geo, cards = this.cards(), f = (n) => +n.toFixed(1);
    const stats = this.stats.map(([label], i) => `<div class="${i ? 'bad' : ''}"><b class="v">0</b><span>${U.esc(label)}</span></div>`).join('');
    const a1 = `<div class="card a1" style="left:${cards[0].l}px;top:${g.BT}px;width:${cards[0].w}px;height:${g.BH}px"><h4>Agent 1</h4><div class="rws">${this.layers.map(([name, tools]) => `<div class="nr"><em>${U.esc(name)}</em><span class="tls">${tools.map((t) => `<span class="tl">${U.esc(t)}</span>`).join('')}</span></div>`).join('')}</div></div>`;
    const minis = cards.slice(1).map((c, m) => `<div class="card mn" style="left:${c.l}px;top:${g.BT}px;width:${c.w}px;height:${g.BH}px"><h4>Agent ${m + 2}</h4>${this.mini.map((x) => `<div class="mr">${U.esc(x)}<i><u></u><u></u><u></u><u></u><u></u></i></div>`).join('')}<span class="dup">×5 tools again</span></div>`).join('');
    const nl = cards.at(-1).l + cards.at(-1).w + g.GAP;
    const note = `<div class="note" style="left:${nl}px;top:${g.BT}px;width:${1808 - nl}px;height:${g.BH}px"><p class="n1"><b>Duplication</b> of components and tools across agents.</p><p class="n2"><b>Difficult to scale</b>, because it relies on skills in many tools, which makes agents impossible to manage and maintain.</p></div>`;
    // the apps every agent integrates with, at fixed places so each agent's wires to them are known here
    const n = this.apps.length, aw = n * g.AW + (n - 1) * g.AG, ax = 112 + (1696 - aw) / 2;
    const apps = `<div class="apps" style="left:${ax}px;top:${g.AT}px;gap:${g.AG}px">${this.apps.map((a) => `<span class="app" style="width:${g.AW}px;height:${g.AH}px">${U.esc(a)}<em class="x">×1</em></span>`).join('')}</div>`;
    const b = g.BT + g.BH;
    const wires = cards.map((c, k) => `<g class="ag${k}">${this.apps.map((_, ti) => { const x0 = c.l + c.w * (0.2 + (0.6 * ti) / (n - 1)), tx = ax + ti * (g.AW + g.AG) + g.AW / 2; return `<path style="stroke:var(--hot)" d="M${f(x0)} ${b} C${f(x0)} ${b + 22} ${f(tx)} ${g.AT - 22} ${f(tx)} ${g.AT}"/>`; }).join('')}</g>`).join('');
    const clouds = `<div class="cl">${this.clouds.map((x) => `<span>${U.esc(x)}</span>`).join('')}</div>`;
    return `${this.head(U)}<p class="ld">The anatomy of a typical enterprise AI programme. Agent 1 needs six layers of tools. Agent 2 needs them again. Add agents and watch what you end up maintaining.</p><div class="st">${stats}</div><svg class="wr" viewBox="0 0 1920 1080">${wires}</svg>${a1}${minis}${note}${apps}${clouds}`;
  },
  // a number that steps to a new value at each of `segs` ([at, value]), counting up each time like the fact it shows
  climb(c, U, el, from, segs, o = {}) {
    const dur = o.dur ?? 900, fmt = (v) => `${o.prefix ?? ''}${Math.round(v).toLocaleString('en-US')}`;
    segs.forEach(([at]) => U.extents.push([el, at, at + dur]));
    c.tick((_, t) => {
      let v = from;
      for (const [at, to] of segs) { if (t < at) break; v = v + (to - v) * U.outCubic(U.clamp((t - at) / dur)); }
      el.textContent = fmt(v);
    });
  },
  // a ring leaving the edge of each target and fading, once every `period` ms: the kit's ping, grown by a few pixels
  // from the target's own edge rather than scaled from its centre, so it never crosses the text inside
  ring(c, targets, from, o = {}) {
    const P = o.period ?? 2600, grow = o.grow ?? 10;
    targets.forEach((el, i) => {
      const x = document.createElement('i'); x.className = 'ua-fx pr'; el.append(x);
      c.live((k) => {
        const f = k < 0 ? 1 : ((k + P - i * (o.stagger ?? 0)) % P) / P;
        x.style.inset = `${(-2 - grow * f).toFixed(1)}px`; x.style.opacity = (k < 0 ? 0 : 0.85 * (1 - f)).toFixed(3);
      }, from);
    });
  },
  anim(c, d, U) {
    const T = Array.from({ length: this.steps() }, (_, k) => c.t(k + 1)), A = this.agents;
    const hot = getComputedStyle(c.el).getPropertyValue('--alert').trim();
    // the lede, the counters at nought and the apps and clouds every agent will reach for
    c.fadeUp(c.q('.ld'), c.start + 500, { y: 12 });
    c.rise(c.qa('.st > div'), c.start + 600, { y: 14, stagger: 80 });
    c.rise(c.qa('.app'), c.start + 800, { y: 10, stagger: 35 });
    c.fadeUp(c.q('.cl'), c.start + 1000, { y: 10 });

    // the counters climb with each agent, and flash as they land (the reference's bump)
    c.qa('.st b').forEach((b, i) => {
      const fn = this.stats[i][1];
      this.climb(c, U, b, 0, T.slice(0, A).map((at, k) => [at + 450, fn(k + 1)]));
      const base = getComputedStyle(b).color;
      T.slice(1, A).forEach((at) => c.tw(b, [{ color: base, opacity: 1 }, { color: hot, opacity: 0.6, offset: 0.3 }, { color: base, opacity: 1 }], { at: at + 450, dur: 600, ease: 'linear' }));
    });
    // each app's count of agents wired to it, from the second agent on
    c.qa('.app em').forEach((x) => {
      c.fade(x, T[1] + 500, { dur: 300 });
      this.climb(c, U, x, 1, T.slice(1, A).map((at, k) => [at + 500, k + 2]), { prefix: '×', dur: 500 });
    });

    // 1: Agent 1 and its six layers, each with its five tools
    const a1 = c.q('.a1');
    c.rise(a1, T[0], { y: 20, dur: 700 });
    c.fade(a1.querySelector('h4'), T[0] + 200);
    a1.querySelectorAll('.nr').forEach((r, i) => {
      c.rise(r, T[0] + 300 + i * 110, { y: 10, dur: 500 });
      c.fade(r.querySelectorAll('.tl'), T[0] + 420 + i * 110, { dur: 350, stagger: 35 });
    });

    // 2..A: each further agent slides in, its layers following, then its tools-again tag
    c.qa('.mn').forEach((m, k) => {
      const at = T[k + 1];
      c.slide(m, at, { x: 48, dur: 700 });
      c.tw(m.querySelectorAll('.mr'), [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'none' }], { at: at + 250, dur: 400, stagger: 60, ease: 'ui' });
      c.pop(m.querySelector('.dup'), at + 750);
    });

    // every agent wires to every app (the reference's wIn); the wires carry its traffic once in
    c.qa('svg.wr g').forEach((gr, k) => {
      const ps = gr.querySelectorAll('path'), at = T[k] + 500;
      c.fade(ps, at, { to: 0.45, dur: 800, stagger: 30, ease: 'out' });
      c.current(ps, at + 900, { dash: '3 8', speed: 18, stagger: 20 });
    });

    // the note: duplication first, its tags marked on every repeated stack, then why it cannot scale
    const n1 = c.q('.note .n1'), n2 = c.q('.note .n2');
    c.fadeUp(n1, T[A], { y: 18, dur: 700 });
    this.ring(c, c.qa('.dup'), T[A] + 700, { period: 2400, grow: 9, stagger: 400 });
    c.fadeUp(n2, T[A + 1], { y: 18, dur: 700 });
    this.ring(c, c.qa('.st .bad'), T[A + 1] + 700, { period: 2800, grow: 12, stagger: 500 });
  },
});
