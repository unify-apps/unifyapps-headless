// The UnifyApps engagement model, from the platform story: six stages on a track, from the intro session to production
// and scale. Build 1 brings the track in; builds 2 to 7 each slide the last stage's card out and the next one in (what
// happens, its exit gate, and what UnifyApps, the partner and the customer provide, and its outputs) while the track's
// current stage moves on; build 8 swaps the card for who leads delivery, deal by deal. Fixed content: data is {}.
UA.scene('ua-engagement', {
  need: [],
  covers: [/engagement model/i, /first meeting to production/i, /partner opens the door/i, /\b(intro session|discovery)\b[^.]*\b(poc|proof of concept)\b/i, /\b(exit|stage) gates?\b/i, /who leads delivery/i],
  stages: [
    { n: 'Intro session', dur: '60–90 min', lead: 'Partner hosts · UnifyApps presents', p: 'Open with the AI-native shift and the cost of code-first, show what comparable enterprises already run in production, and agree whether there is a problem worth a discovery.', ua: ['AI-native enterprise narrative and live demo', 'Production proof points from comparable enterprises', 'A short walk-through of relevant use case blueprints'], so: ['Secures the executive sponsor and the room', 'Frames the account context and relationships', 'Leads with AI fluency: "where is your time going?"'], cu: ['Executive sponsor and 2–3 business leaders', 'Honest view of current priorities'], out: ['Agreement to run discovery', 'Named sponsor and owner for discovery'], gate: 'Sponsor agrees a discovery and names who attends.' },
    { n: 'Discovery', dur: '1–2 weeks', lead: 'Joint', p: "Map the value chain with the business owners, measure today's manual effort and volumes, and see the systems, documents and data involved.", ua: ['Discovery workshop format and question bank', 'Architecture and integration view', 'Atomic-agent decomposition of candidate processes'], so: ['Co-facilitates workshops, captures process detail', 'Change and adoption lens', 'Builds the account plan with UnifyApps'], cu: ['Process owners and SMEs (2–4 hrs each)', 'Volumes, sample documents, system list'], out: ['Process heat map and baseline metrics', 'Long list of 8–12 candidate use cases'], gate: 'Baselines captured and sample data available.' },
    { n: 'Use case selection', dur: '1 week', lead: 'UnifyApps leads · partner co-presents', p: 'Score candidates on value, feasibility, data readiness and time to prove; pick one or two lighthouse use cases and write the business case.', ua: ['Value and feasibility scoring', 'Business case with industry benchmarks', 'Solution outline and effort estimate'], so: ['Validates priorities with stakeholders', 'Prepares the sponsor for internal approval', 'Shapes the change story'], cu: ['Sponsor decision on 1–2 use cases', 'Budget owner engaged'], out: ['Prioritised roadmap', 'PoC charter or a direct path to production'], gate: 'Sponsor signs the PoC charter, or skips straight to a production proposal.' },
    { n: 'PoC', dur: '4–6 weeks', lead: 'UnifyApps builds · partner shadows', opt: 1, p: "Only if it is needed. Prove the lighthouse use case on the customer's own documents and data, against the agreed success metrics, inside a fixed timebox.", ua: ['Builds on the UnifyApps platform', 'Weekly playback against success metrics', 'Security and architecture pack'], so: ['Shadows and pairs on the build', 'Runs stakeholder and change cadence', 'Prepares users for adoption'], cu: ['Clear scope, success metrics and data access', 'SME time each week, test data and environment'], out: ['Results against success metrics', 'Recommended production scope'], gate: 'Success metrics met and signed off by the sponsor.' },
    { n: 'Commercial & value alignment', dur: '1–2 weeks', lead: 'Joint · sponsor, finance and procurement', nw: 1, p: 'Turn proven results into an agreed value case and commercial model before scaling: what the business gains, how it is measured, and how the investment grows with the value delivered.', ua: ['Value case built from the baselines and PoC results', 'Commercial model: platform licence and usage tiers', 'Security, legal and procurement pack'], so: ['Delivery plan, resourcing and services proposal', 'Change and adoption plan with costs', 'Aligns stakeholders and procurement timelines'], cu: ['Sponsor, finance and procurement engaged', 'Agreed value KPIs and review cadence'], out: ['Signed value case with measurable KPIs', 'Commercial agreement and production plan'], gate: 'Value KPIs agreed and the commercial agreement signed.' },
    { n: 'Production & scale', dur: 'Ongoing', lead: 'Co-deliver → partner leads', p: 'Take the lighthouse to production, then reuse the same foundation for the next use cases on the roadmap: each one faster and cheaper than the last.', ua: ['Platform licence and expert support', 'Architecture and quality reviews', 'Product roadmap access'], so: ['Delivery, engineering and integration', 'Adoption, training and change management', 'Builds the next use cases from the roadmap'], cu: ['Programme owner and steering committee', 'Production integrations'], out: ['Live use cases and measured value', 'A roadmap of the next 3–5 use cases'], gate: 'Quarterly value review against the agreed KPIs.' },
  ],
  leads: [
    { l: 'Deals 1–2', s: 'Shadow', u: 80, o: 20, w: 'UnifyApps leads; the partner pairs on every workstream' },
    { l: 'Deals 3–4', s: 'Co-deliver', u: 50, o: 50, w: 'Shared delivery; the partner owns build workstreams' },
    { l: 'Deal 5 onwards', s: 'Partner leads', u: 20, o: 80, w: 'UnifyApps: platform, architecture and expert support' },
  ],
  steps: () => 8,
  labels() {
    return [
      `stages track journey ${this.stages.map((s) => s.n).join(' ')}`,
      ...this.stages.map((s) => `${s.n} ${s.dur} ${s.lead}`),
      'who leads delivery deal by deal handover partner shadow co-deliver',
    ];
  },
  css: `
.sc-ua-engagement { --ua-eg-top: 254px; --ua-eg-slot: 470px; }
.sc-ua-engagement .h2 { max-width: 1600px; }
#stage .sc-ua-engagement .rs .ua-current { stroke: color-mix(in srgb, var(--accent) 60%, transparent); stroke-width: 2.5; }
#stage .sc-ua-engagement.gr-deep .rs .ua-current { stroke: color-mix(in srgb, var(--accent-on-deep) 55%, transparent); }
.sc-ua-engagement .lede { position: absolute; left: var(--side); top: var(--ua-eg-top); max-width: 1420px; font: 400 27px/1.45 var(--sans); color: var(--body); }
.sc-ua-engagement.gr-deep .lede { color: var(--on-deep-body); }
.sc-ua-engagement .trk { position: absolute; left: var(--side); right: var(--side); top: var(--ua-eg-top); }
.sc-ua-engagement .rs { position: absolute; left: 0; top: 26px; width: 1696px; height: 8px; overflow: visible; }
.sc-ua-engagement .rs .base { fill: none; stroke: var(--rule); stroke-width: 3; stroke-linecap: round; }
.sc-ua-engagement.gr-deep .rs .base { stroke: var(--on-deep-rule); }
.sc-ua-engagement .fill { position: absolute; left: 141px; top: 28px; height: 4px; width: 0; border-radius: 3px; overflow: hidden; background: linear-gradient(90deg, var(--accent), var(--deep3)); }
.sc-ua-engagement.gr-deep .fill { background: linear-gradient(90deg, var(--accent-on-deep), var(--on-deep-body)); }
.sc-ua-engagement .js { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); }
.sc-ua-engagement .st { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 8px; }
.sc-ua-engagement .dot { position: relative; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; background: var(--card); border: 2px solid var(--rule); }
.sc-ua-engagement.gr-deep .dot { background: var(--deep-bg3); border-color: var(--on-deep-rule); }
.sc-ua-engagement .dot i { position: absolute; inset: -2px; border-radius: 50%; opacity: 0; }
.sc-ua-engagement .dot .dn { border: 2px solid var(--deep2); }
.sc-ua-engagement.gr-deep .dot .dn { border-color: var(--accent-on-deep); }
.sc-ua-engagement .dot .on { background: var(--deep2); box-shadow: 0 0 0 9px color-mix(in srgb, var(--deep2) 16%, transparent); }
.sc-ua-engagement.gr-deep .dot .on { background: var(--accent-on-deep); box-shadow: 0 0 0 9px color-mix(in srgb, var(--accent-on-deep) 17%, transparent); }
.sc-ua-engagement .dot .pg { border: 2px solid var(--deep2); }
.sc-ua-engagement.gr-deep .dot .pg { border-color: var(--accent-on-deep); }
.sc-ua-engagement .dot span { position: relative; font: 400 26px/1 var(--serif); color: var(--body); }
.sc-ua-engagement.gr-deep .dot span { color: var(--on-deep2); }
.sc-ua-engagement .st .tx { display: flex; flex-direction: column; align-items: center; }
.sc-ua-engagement .st b { margin-top: 12px; font: 600 23px/1.25 var(--sans); color: var(--ink); }
.sc-ua-engagement.gr-deep .st b { color: var(--on-deep); }
.sc-ua-engagement .st .du { margin-top: 4px; font: 400 20px/1.3 var(--sans); color: var(--muted); }
.sc-ua-engagement.gr-deep .st .du { color: var(--on-deep-body); }
.sc-ua-engagement .st .tg { margin-top: 4px; font: 600 18px/1.3 var(--sans); letter-spacing: .12em; text-transform: uppercase; }
.sc-ua-engagement .st .tg.opt { color: var(--alert); }
.sc-ua-engagement.gr-deep .st .tg.opt { color: color-mix(in srgb, var(--alert) 55%, var(--on-deep)); }
.sc-ua-engagement .st .tg.new { color: var(--deep3); }
.sc-ua-engagement.gr-deep .st .tg.new { color: color-mix(in srgb, var(--deep3) 30%, var(--on-deep)); }
.sc-ua-engagement .slot { position: absolute; left: var(--side); right: var(--side); top: var(--ua-eg-slot); bottom: 120px; }
.sc-ua-engagement .card, .sc-ua-engagement .ld { position: absolute; left: 0; right: 0; top: 0; }
.sc-ua-engagement .box { border-radius: 20px; border: 1px solid var(--rule); background: var(--card); }
.sc-ua-engagement.gr-deep .box { border-color: var(--on-deep-rule); background: color-mix(in srgb, var(--on-deep) 4%, transparent); }
.sc-ua-engagement .mn { display: grid; grid-template-columns: 1fr 540px; column-gap: 32px; padding: 20px 24px 22px; }
.sc-ua-engagement .nr { display: flex; align-items: center; gap: 18px; margin-top: 6px; }
.sc-ua-engagement .ey { font: 600 18px/1.2 var(--sans); letter-spacing: .16em; text-transform: uppercase; color: var(--accent); }
.sc-ua-engagement.gr-deep .ey { color: var(--accent-on-deep); }
.sc-ua-engagement .mn h3 { font: 500 40px/1.12 var(--serif); color: var(--ink); }
.sc-ua-engagement.gr-deep .mn h3 { color: var(--on-deep); }
.sc-ua-engagement .mn p { margin-top: 8px; font: 400 22px/1.42 var(--sans); color: var(--ink2); }
.sc-ua-engagement.gr-deep .mn p { color: var(--on-deep2); }
.sc-ua-engagement .pill { display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 99px; font: 500 20px/1.3 var(--sans); background: var(--paper2); color: var(--ink2); }
.sc-ua-engagement.gr-deep .pill { background: color-mix(in srgb, var(--on-deep) 8%, transparent); color: var(--on-deep2); }
.sc-ua-engagement .pill svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.sc-ua-engagement .gate { margin-top: 12px; padding: 12px 16px; border-radius: 14px; font: 400 22px/1.4 var(--sans); background: color-mix(in srgb, var(--accent) 9%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); color: var(--ink2); }
.sc-ua-engagement.gr-deep .gate { background: color-mix(in srgb, var(--accent-on-deep) 10%, transparent); border-color: color-mix(in srgb, var(--accent-on-deep) 30%, transparent); color: var(--on-deep2); }
.sc-ua-engagement .gate b { font-weight: 600; color: var(--accent); }
.sc-ua-engagement.gr-deep .gate b { color: var(--accent-on-deep); }
.sc-ua-engagement .cb { margin-top: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.sc-ua-engagement .col { padding: 16px 20px 18px; }
.sc-ua-engagement .col h4 { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; font: 600 18px/1.2 var(--sans); letter-spacing: .14em; text-transform: uppercase; }
.sc-ua-engagement .col h4 i { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.sc-ua-engagement .col.k0 h4 { color: var(--accent); } .sc-ua-engagement .col.k0 h4 i { background: var(--accent2); }
.sc-ua-engagement .col.k1 h4 { color: var(--deep3); } .sc-ua-engagement .col.k1 h4 i { background: var(--deep3); }
.sc-ua-engagement .col.k2 h4 { color: var(--muted); } .sc-ua-engagement .col.k2 h4 i { background: var(--muted); }
.sc-ua-engagement .col.k3 h4 { color: var(--muted); } .sc-ua-engagement .col.k3 h4 i { background: var(--accent-on-deep); }
.sc-ua-engagement.gr-deep .col.k0 h4 { color: var(--accent-on-deep); } .sc-ua-engagement.gr-deep .col.k0 h4 i { background: var(--accent-on-deep); }
.sc-ua-engagement.gr-deep .col.k1 h4 { color: color-mix(in srgb, var(--deep3) 30%, var(--on-deep)); } .sc-ua-engagement.gr-deep .col.k1 h4 i { background: var(--deep3); }
.sc-ua-engagement.gr-deep .col.k2 h4, .sc-ua-engagement.gr-deep .col.k3 h4 { color: var(--on-deep-body); }
.sc-ua-engagement.gr-deep .col.k2 h4 i { background: var(--on-deep-body); } .sc-ua-engagement.gr-deep .col.k3 h4 i { background: var(--on-deep3); }
.sc-ua-engagement .col ul { list-style: none; display: grid; gap: 7px; }
.sc-ua-engagement .col li { position: relative; padding-left: 20px; font: 400 22px/1.36 var(--sans); color: var(--ink2); }
.sc-ua-engagement.gr-deep .col li { color: color-mix(in srgb, var(--on-deep) 72%, var(--on-deep-body)); }
.sc-ua-engagement .col li::before { content: ''; position: absolute; left: 3px; top: .62em; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .7; }
.sc-ua-engagement .ld h3 { font: 500 40px/1.15 var(--serif); color: var(--ink); }
.sc-ua-engagement.gr-deep .ld h3 { color: var(--on-deep); }
.sc-ua-engagement .ld .nt { margin-top: 8px; font: 400 22px/1.42 var(--sans); color: var(--body); }
.sc-ua-engagement.gr-deep .ld .nt { color: var(--on-deep-body); }
.sc-ua-engagement .rows { margin-top: 18px; display: grid; gap: 18px; }
.sc-ua-engagement .row { display: grid; grid-template-columns: 230px 1fr 400px; column-gap: 24px; align-items: center; }
.sc-ua-engagement .row .lb b { display: block; font: 600 23px/1.25 var(--sans); color: var(--ink); }
.sc-ua-engagement.gr-deep .row .lb b { color: var(--on-deep2); }
.sc-ua-engagement .row .lb span { display: block; font: 400 20px/1.3 var(--sans); color: var(--muted); }
.sc-ua-engagement.gr-deep .row .lb span { color: var(--on-deep-body); }
.sc-ua-engagement .bar { position: relative; display: flex; height: 50px; border-radius: 12px; overflow: hidden; background: var(--paper3); }
.sc-ua-engagement.gr-deep .bar { background: color-mix(in srgb, var(--on-deep) 5%, transparent); }
.sc-ua-engagement .bar span { display: flex; align-items: center; justify-content: center; width: 0; overflow: hidden; white-space: nowrap; font: 600 20px/1 var(--sans); }
.sc-ua-engagement .bar .u { background: var(--accent-on-deep); color: var(--ink); }
.sc-ua-engagement.gr-deep .bar .u { color: var(--deep-edge); }
.sc-ua-engagement .bar .o { background: var(--deep3); color: var(--on-deep); }
.sc-ua-engagement .row .wt { font: 400 22px/1.36 var(--sans); color: var(--body); }
.sc-ua-engagement.gr-deep .row .wt { color: var(--on-deep-body); }`,
  build(d, U) {
    const S = this.stages, e = U.esc;
    const lede = '<p class="lede">The partner opens the door. UnifyApps supports the intro session, discovery, use case selection and the PoC if one is needed, then both align on commercials and value before scaling. Each stage ends at an agreed gate, so nobody spends weeks on an account that cannot buy.</p>';
    const steps = S.map((s, i) => `<div class="st"><div class="dot"><i class="dn"></i><i class="on"></i><i class="pg"></i><span>${i + 1}</span></div><div class="tx"><b>${e(s.n)}</b><span class="du">${e(s.dur)}</span>${s.opt ? '<span class="tg opt">If required</span>' : ''}${s.nw ? '<span class="tg new">Before scaling</span>' : ''}</div></div>`).join('');
    // the rail runs from the first stage's centre to the last's: 1696 / 12 in from each end
    const trk = `<div class="trk"><svg class="rs" viewBox="0 0 1696 8"><path class="base" d="M141.3 4 H1554.7"/></svg><div class="fill"></div><div class="js">${steps}</div></div>`;
    const li = (a) => `<ul>${a.map((x) => `<li>${e(x)}</li>`).join('')}</ul>`;
    const clock = '<svg viewBox="0 0 20 20"><circle cx="10" cy="11" r="7"/><path d="M10 7.5 V11 L12.5 12.5 M8 2.5 H12"/></svg>';
    const cards = S.map((s, i) => `<div class="card"><div class="box mn"><div><div class="ey">Stage ${i + 1}${s.opt ? ' · if required' : ''}</div><div class="nr"><h3>${e(s.n)}</h3><span class="pill">${clock}${e(s.dur)}</span></div><p>${e(s.p)}</p></div><div><span class="pill">${e(s.lead)}</span><div class="gate"><b>Exit gate:</b> ${e(s.gate)}</div></div></div><div class="cb">${[['UnifyApps provides', s.ua], ['Partner provides', s.so], ['Customer provides', s.cu], ['Outputs', s.out]].map(([h, a], k) => `<div class="box col k${k}"><h4><i></i>${h}</h4>${li(a)}</div>`).join('')}</div></div>`).join('');
    const rows = this.leads.map((l) => `<div class="row"><div class="lb"><b>${e(l.l)}</b><span>${e(l.s)}</span></div><div class="bar"><span class="u" data-w="${l.u}">${l.u >= 35 ? 'UnifyApps ' : ''}${l.u}%</span><span class="o" data-w="${l.o}">${l.o >= 35 ? 'Partner ' : ''}${l.o}%</span></div><div class="wt">${e(l.w)}</div></div>`).join('');
    const ld = `<div class="ld"><h3>Who leads delivery, deal by deal</h3><p class="nt">Proposed handover: UnifyApps leads the first deals while the partner shadows, then co-delivers, then leads with UnifyApps as platform and expert support.</p><div class="rows">${rows}</div></div>`;
    return `${U.head({ kicker: 'Engagement model', title: 'From first meeting to production,', em: 'UnifyApps alongside.' })}${lede}${trk}<div class="slot">${cards}${ld}</div>`;
  },
  // a colour from the theme, read where the scene sits, so a tween can run between two of them
  tone(c, paper, deep) { return getComputedStyle(c.el).getPropertyValue(c.ground === 'deep' ? deep : paper).trim(); },
  anim(c, d, U) {
    const T = (k) => c.t(k), n = this.stages.length;
    const lede = c.q('.lede'), cards = c.qa('.card'), ld = c.q('.ld'), fill = c.q('.fill'), base = c.q('.rs .base');
    const dots = c.qa('.dot'), nums = c.qa('.dot span'), on = c.qa('.dot .on'), dn = c.qa('.dot .dn'), pg = c.qa('.dot .pg');
    const shift = c.q('.slot').offsetTop - lede.offsetTop;
    const off = this.tone(c, '--body', '--on-deep2'), cur = this.tone(c, '--on-deep', '--deep-edge'), done = this.tone(c, '--deep2', '--accent-on-deep');
    // what leaves is gone before what replaces it arrives, so two states' words never cross
    const leave = (el, at) => c.tw(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-60px)' }], { at, dur: 320, ease: 'out' });

    // the lede under the heading; it drops to make room as the track arrives, and leaves when the first card comes in
    c.fadeUp(lede, c.start + 650, { y: 20 });
    c.tw(lede, [{ transform: 'none' }, { transform: `translateY(${shift}px)` }], { at: T(1), dur: 750, ease: 'glide' });
    c.tw(lede, [{ opacity: 1, transform: `translateY(${shift}px)` }, { opacity: 0, transform: `translate(-60px, ${shift}px)` }], { at: T(2), dur: 320, ease: 'out' });

    // build 1: the track draws, its stages drop into place, and a current runs along it
    c.draw(base, T(1) + 150, { dur: 1100 });
    c.snap(dots, T(1) + 200, { y: -36, stagger: 110 });
    c.fadeUp(c.qa('.st .tx'), T(1) + 380, { y: 12, stagger: 110 });
    c.current(base, T(1) + 1300, { dash: '3 10', speed: 22 });

    // builds 2 to 7: one stage each; the progress line reaches it and it lights, the stage before it turns done
    const W = 1696 - 2 * 141.3;
    cards.forEach((card, i) => {
      const at = T(i + 2);
      if (i > 0) {
        c.tw(fill, [{ width: `${(W * (i - 1)) / (n - 1)}px` }, { width: `${(W * i) / (n - 1)}px` }], { at, dur: 750, ease: 'ui' });
        c.tw(on[i - 1], [{ opacity: 1 }, { opacity: 0 }], { at: at + 300, dur: 350, ease: 'ui' });
        c.tw(dn[i - 1], [{ opacity: 0 }, { opacity: 1 }], { at: at + 300, dur: 350, ease: 'ui' });
        c.tw(nums[i - 1], [{ color: cur }, { color: done }], { at: at + 300, dur: 350, ease: 'ui' });
        leave(cards[i - 1], at);
      }
      c.tw(on[i], [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'none' }], { at: at + (i ? 550 : 100), dur: 450, ease: 'drop' });
      c.tw(nums[i], [{ color: off }, { color: cur }], { at: at + (i ? 550 : 100), dur: 300, ease: 'ui' });
      c.slide(card, at + 260, { x: 70, dur: 650 });
      c.fade(card.querySelectorAll('.box'), at + 260, { dur: 500, stagger: 60 });
    });

    // build 8: the last card leaves for who leads delivery; each deal's split grows
    const at = T(8);
    leave(cards[n - 1], at);
    c.slide(ld, at + 260, { x: 70, dur: 650 });
    c.fadeUp(c.qa('.ld h3, .ld .nt'), at + 300, { y: 14, stagger: 90 });
    c.qa('.row').forEach((r, k) => {
      c.fadeUp(r.querySelectorAll('.lb, .wt'), at + 450 + k * 120, { y: 12 });
      r.querySelectorAll('.bar span').forEach((b) => c.tw(b, [{ width: '0%' }, { width: `${b.dataset.w}%` }], { at: at + 550 + k * 120, dur: 1200, ease: 'cubic-bezier(.3,.7,.2,1)' }));
    });
    c.sheen(c.qa('.bar'), at + 2000, { period: 3600 });

    // the current stage pings while it is current
    c.live((k) => {
      let now = -1;
      for (let i = 0; i < n; i++) if (U.t >= T(i + 2) + 600) now = i;
      pg.forEach((x, i) => {
        if (i !== now || k < 0) { x.style.opacity = '0'; return; }
        const f = (k % 2600) / 2600;
        x.style.opacity = String(0.85 * (1 - f));
        x.style.transform = `scale(${1 + 0.55 * f})`;
      });
    }, T(2) + 600);
    // the progress line glints once it has grown
    c.sheen(fill, T(3) + 900, { period: 3000 });
  },
});
