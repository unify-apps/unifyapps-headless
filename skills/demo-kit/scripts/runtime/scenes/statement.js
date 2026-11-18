// One sentence on its own, large; an optional line under it arrives on step 1.
UA.scene('statement', {
  need: ['text'],
  steps: (d) => (d.sub ? 1 : 0),
  labels: (d) => [d.sub ?? ''],
  settle: (d) => 200 + (String(d.text ?? '').split(/\s+/).length + String(d.em ?? '').split(/\s+/).length) * 70 + 900,
  css: `
.sc-statement .st { position: absolute; left: var(--side); top: 50%; transform: translateY(-50%); width: 1500px; }
.sc-statement .kicker { margin-bottom: 34px; }
.sc-statement .big { font: 300 84px/1.14 var(--serif); letter-spacing: -.016em; color: var(--ink); text-wrap: balance; }
.sc-statement.gr-deep .big { color: var(--on-deep); }
.sc-statement .big em { font-style: italic; color: var(--accent); }
.sc-statement.gr-deep .big em { color: var(--accent-on-deep); }
.sc-statement .sub { margin-top: 44px; font: 400 32px/1.45 var(--serif); color: var(--body); max-width: 1180px; }
.sc-statement.gr-deep .sub { color: var(--on-deep-body); }`,
  build: (d, U) => `<div class="st">${d.kicker ? `<div class="kicker">${U.esc(d.kicker)}</div>` : ''}<p class="big">${U.line(d.text, d.em)}</p>${d.sub ? `<p class="sub">${U.esc(d.sub)}</p>` : ''}</div>`,
  anim(c) {
    c.tw(c.q('.kicker'), [{ opacity: 0, letterSpacing: '.32em' }, { opacity: 1, letterSpacing: '.17em' }], { at: c.start, dur: 900 });
    c.words(c.q('.big'), c.start + 200, { stagger: 70, dur: 900 });
    c.fadeUp(c.q('.sub'), c.t(1));
  },
});
