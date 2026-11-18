// A process from left to right: three to six steps on one line. Each step lights the next node and draws the line to
// it, which then carries a current; each lit node pings while the scene holds. An optional token (a document, a
// request) rides along to the node just lit.
UA.scene('flow', {
  need: ['nodes'],
  max: { nodes: 6 },
  steps: (d) => d.nodes.length,
  labels: (d) => d.nodes.map((nd) => `${nd.title} ${nd.sub ?? ''}`),
  css: `
.sc-flow .fl { position: absolute; inset: 0; }
.sc-flow svg.ln { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: visible; }
.sc-flow .base { stroke: var(--rule); stroke-width: 2; stroke-dasharray: 3 9; fill: none; }
.sc-flow.gr-deep .base { stroke: var(--on-deep-rule); }
.sc-flow .seg { stroke: var(--deep2); stroke-width: 4; fill: none; stroke-linecap: round; }
.sc-flow.gr-deep .seg { stroke: var(--accent-on-deep); }
.sc-flow .nd { position: absolute; transform: translateX(-50%); text-align: center; }
.sc-flow .dot { width: 34px; height: 34px; margin: 0 auto; border-radius: 50%; border: 3px solid var(--accent); background: var(--paper); position: relative; }
.sc-flow.gr-deep .dot { border-color: var(--accent-on-deep); background: var(--deep-bg3); }
.sc-flow .dot b { position: absolute; inset: 5px; border-radius: 50%; background: var(--deep2); }
.sc-flow.gr-deep .dot b { background: var(--accent-on-deep); }
.sc-flow .tag { position: absolute; left: 0; right: 0; bottom: calc(100% + 18px); color: var(--accent); }
.sc-flow.gr-deep .tag { color: var(--accent-on-deep); }
.sc-flow .ti { margin-top: 30px; font: 500 31px/1.2 var(--serif); color: var(--ink); }
.sc-flow.gr-deep .ti { color: var(--on-deep); }
.sc-flow .sb { margin-top: 10px; font: 400 23px/1.4 var(--serif); color: var(--body); }
.sc-flow.gr-deep .sb { color: var(--on-deep-body); }
.sc-flow .tok { position: absolute; top: 0; left: 0; padding: 10px 18px; border: 2px solid var(--accent); border-radius: 999px; background: var(--card); font: 600 19px/1 var(--sans); letter-spacing: .06em; color: var(--ink2); white-space: nowrap; transform: translate(-50%, 0); }
.sc-flow.gr-deep .tok { background: var(--deep-bg); color: var(--on-deep); border-color: var(--accent-on-deep); }`,
  build(d, U) {
    const n = d.nodes.length, y = d.y ?? 600, x0 = 112 + 170, x1 = 1920 - 112 - 170;
    const xs = d.nodes.map((_, i) => (n === 1 ? 960 : x0 + ((x1 - x0) * i) / (n - 1)));
    const w = n === 1 ? 600 : Math.min(340, (x1 - x0) / (n - 1) - 28);
    const segs = xs.slice(1).map((x, i) => `<path class="seg" d="M${xs[i] + 17} ${y} H${x - 17}"/>`).join('');
    const nodes = d.nodes.map((nd, i) => `<div class="nd" style="left:${xs[i]}px;top:${y - 17}px;width:${w}px">${nd.tag ? `<div class="lbl tag">${U.esc(nd.tag)}</div>` : ''}<div class="dot"><b></b></div><div class="ti">${U.esc(nd.title)}</div>${nd.sub ? `<div class="sb">${U.esc(nd.sub)}</div>` : ''}</div>`).join('');
    const tok = d.token ? `<div class="tok" style="top:${y - 112}px">${U.esc(d.token)}</div>` : '';
    return `${U.head(d)}<div class="fl" data-xs="${xs.join(',')}"><svg class="ln" viewBox="0 0 1920 1080"><path class="base" d="M${xs[0]} ${y} H${xs.at(-1)}"/>${segs}</svg>${nodes}${tok}</div>`;
  },
  anim(c, d, U) {
    const xs = c.q('.fl').dataset.xs.split(',').map(Number);
    c.fade(c.q('.base'), c.start + 500, { dur: 900 });
    // read once: each current adds a copy of its line beside it
    const segs = c.qa('.seg');
    c.qa('.nd').forEach((nd, i) => {
      const at = c.t(i + 1);
      if (i > 0) { c.draw(segs[i - 1], at - 100, { dur: 700 }); c.current(segs[i - 1], at + 600, { speed: 30 }); }
      c.pop(nd.querySelector('.dot'), at + (i ? 450 : 0));
      c.tw(nd.querySelector('.dot b'), [{ transform: 'scale(0)' }, { transform: 'none' }], { at: at + (i ? 650 : 200), dur: 500, ease: 'back' });
      c.fade(nd.querySelector('.tag'), at + 500);
      c.fadeUp(nd.querySelector('.ti'), at + 550, { y: 14 });
      c.fadeUp(nd.querySelector('.sb'), at + 750, { y: 10 });
      c.ping(nd.querySelector('.dot'), at + 1100, { period: 2800, stagger: i * 350 });
    });
    const tok = c.q('.tok');
    if (tok) {
      c.fade(tok, c.t(1) + 300);
      c.tick((_, t) => {
        let x = xs[0];
        for (let k = 1; k < xs.length; k++) { const at = c.t(k + 1); if (t >= at - 150) x = xs[k - 1] + (xs[k] - xs[k - 1]) * U.outCubic(U.clamp((t - at + 150) / 850)); }
        tok.style.left = `${x}px`;
      });
    }
  },
});
