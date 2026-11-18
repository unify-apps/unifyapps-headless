// What the customer said, in their words, with a role (never a person's name) under it.
UA.scene('quote', {
  need: ['quote'],
  steps: () => 0,
  settle: (d) => 250 + String(d.quote ?? '').split(/\s+/).length * 60 + 900 + 900,
  css: `
.sc-quote .qb { position: absolute; left: var(--side); top: 50%; transform: translateY(-50%); width: 1480px; }
.sc-quote .mk { font: 300 220px/0.6 var(--serif); color: var(--accent); height: 110px; }
.sc-quote.gr-deep .mk { color: var(--accent-on-deep); }
.sc-quote .qt { font: italic 300 60px/1.25 var(--serif); color: var(--ink); letter-spacing: -.01em; text-wrap: balance; }
.sc-quote.gr-deep .qt { color: var(--on-deep); }
.sc-quote .who { margin-top: 44px; }`,
  build: (d, U) => `<div class="qb"><div class="mk">“</div><p class="qt">${U.words(d.quote)}</p>${d.who ? `<p class="lbl who">${U.esc(d.who)}</p>` : ''}</div>`,
  anim(c) {
    c.fadeUp(c.q('.mk'), c.start, { y: 14 });
    c.words(c.q('.qt'), c.start + 250, { stagger: 60, dur: 900 });
    c.fade(c.q('.who'), c.start + 1500);
  },
});
