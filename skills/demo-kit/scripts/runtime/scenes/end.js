// The end card: the mark grows in the middle, the wordmark and a closing line under it.
UA.scene('end', {
  need: [],
  steps: () => 0,
  settle: () => 3400,
  css: `
.sc-end .ec { position: absolute; left: 0; right: 0; top: 590px; text-align: center; }
.sc-end .ua-word { height: 92px; }
.sc-end .ln { margin-top: 44px; font: 300 46px/1.25 var(--serif); color: var(--ink); }
.sc-end.gr-deep .ln { color: var(--on-deep); }
.sc-end .ln em { font-style: italic; color: var(--accent); }
.sc-end.gr-deep .ln em { color: var(--accent-on-deep); }
.sc-end .sub { margin-top: 22px; font: 600 19px/1 var(--sans); letter-spacing: .17em; text-transform: uppercase; color: var(--muted); }
.sc-end.gr-deep .sub { color: var(--on-deep-body); }`,
  build: (d, U) => `<div class="ec"><img class="ua-word" alt="UnifyApps">${d.title ? `<p class="ln">${U.line(d.title, d.em)}</p>` : ''}${d.sub ? `<p class="sub">${U.esc(d.sub)}</p>` : ''}</div>`,
  anim(c) {
    c.fadeUp(c.q('.ua-word'), c.start + 1300, { y: 18, dur: 900 });
    c.words(c.q('.ln'), c.start + 1900, { stagger: 70 });
    c.fade(c.q('.sub'), c.start + 2700);
  },
});
