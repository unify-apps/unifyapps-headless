// The opening card: kicker, a title with its accent clause, an optional line under it; the mark grows on the right.
// `open` picks another way in. "question": the title is typed out key by key as a question, and its figures (`items`,
// one to three, shaped as a stats scene's) count in on its lines. "product": the product sits beside the title, tilted
// in, and on its line the cursor clicks (`click`, a point in the screenshot's own pixels) and a `flag` card comes up.
UA.scene('title', {
  need: ['title'],
  max: { items: 3 },
  problems(d) {
    if (d.open == null) return [];
    if (!['question', 'product'].includes(d.open)) return [`data.open is ${JSON.stringify(d.open)}; it must be "question" or "product"`];
    if (d.open === 'question' && !d.items?.length) return ['data.items is required to open with a question'];
    if (d.open === 'product' && !d.image) return ['data.image is required to open with the product'];
    return [];
  },
  steps: (d) => (d.open === 'question' ? d.items?.length ?? 0 : d.open === 'product' && (d.click || d.flag) ? 1 : 0),
  labels: (d) => (d.open === 'question' ? d.items.map((it) => `${it.value ?? it.text ?? ''} ${it.label ?? ''}`) : d.open === 'product' && (d.click || d.flag) ? [d.flag?.text ?? ''] : []),
  // when the entrance has finished: the title's words (or its keys, typed), then the line under it
  settle(d) {
    if (d.open === 'question') return 500 + `${d.title ?? ''}${d.em ?? ''}`.replace(/\s+/g, '').length * 50 + 600;
    const words = String(d.title ?? '').split(/\s+/).length + String(d.em ?? '').split(/\s+/).length;
    return Math.max(550 + words * 80 + 950 + (d.sub ? 1300 : 0), d.open === 'product' ? 1700 : 0);
  },
  css: `
.sc-title .ua-word { position: absolute; left: var(--side); top: 96px; height: 54px; }
.sc-title .tt { position: absolute; left: var(--side); top: 50%; transform: translateY(-46%); width: 980px; }
.sc-title .kicker { margin-bottom: 36px; }
.sc-title .t1 { font: 300 118px/1.03 var(--serif); letter-spacing: -.02em; color: var(--ink); text-wrap: balance; }
.sc-title.gr-deep .t1, .sc-title.gr-deep .q { color: var(--on-deep); }
.sc-title .t1 em, .sc-title .q em { font-style: italic; color: var(--accent); }
.sc-title.gr-deep .t1 em, .sc-title.gr-deep .q em { color: var(--accent-on-deep); }
.sc-title .sub { margin-top: 44px; font: 400 32px/1.42 var(--serif); color: var(--body); max-width: 900px; }
.sc-title.gr-deep .sub { color: var(--on-deep-body); }
.sc-title .q { position: absolute; left: var(--side); top: 236px; width: 1560px; margin: 0; font: 300 104px/1.08 var(--serif); letter-spacing: -.02em; color: var(--ink); text-wrap: balance; }
.sc-title .q .qw { white-space: nowrap; }
.sc-title .q .caret { position: absolute; left: 0; top: 0; width: 5px; height: .86em; margin-top: .14em; background: var(--accent); opacity: 0; }
.sc-title.gr-deep .q .caret { background: var(--accent-on-deep); }
.sc-title .qs { position: absolute; left: var(--side); right: var(--side); top: 640px; display: grid; column-gap: 64px; }
.sc-title .qs .rl { height: 2px; background: var(--rule); margin-bottom: 30px; transform-origin: 0 50%; }
.sc-title.gr-deep .qs .rl { background: var(--on-deep-rule); }
.sc-title .qs .num { font: 300 112px/1 var(--serif); color: var(--deep2); letter-spacing: -.03em; font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; }
.sc-title.gr-deep .qs .num { color: var(--accent-on-deep); }
.sc-title .qs .num small { font-size: .42em; letter-spacing: 0; margin-left: 8px; }
.sc-title .qs .lb { margin-top: 22px; font: 500 30px/1.25 var(--serif); color: var(--ink); text-wrap: balance; }
.sc-title.gr-deep .qs .lb { color: var(--on-deep); }
.sc-title .pt { position: absolute; left: var(--side); top: 250px; width: 720px; }
.sc-title .pt .t1 { font-size: 84px; line-height: 1.05; }
.sc-title .pt .sub { margin-top: 36px; font-size: 29px; }
.sc-title .shot { position: absolute; left: 900px; width: 960px; border-radius: 14px; overflow: hidden; background: var(--view); transform-origin: 0 50%; box-shadow: 0 50px 110px var(--shadow), 0 0 0 1px var(--edge); }
.sc-title.gr-deep .shot { box-shadow: 0 50px 110px rgba(0, 0, 0, .5); }
.sc-title .shot .bar { height: 46px; background: var(--frame-bar); display: flex; align-items: center; gap: 9px; padding: 0 18px; border-bottom: 1px solid var(--frame-line); }
.sc-title .shot .bar i { width: 13px; height: 13px; border-radius: 50%; background: var(--frame-dot); }
.sc-title .shot .bar span { margin-left: 18px; flex: 1; max-width: 560px; height: 28px; border-radius: 7px; background: var(--card); font: 400 15px/28px var(--sans); color: var(--frame-text); padding: 0 14px; white-space: nowrap; overflow: hidden; }
.sc-title .shot .view { position: relative; overflow: hidden; }
.sc-title .shot .view img { display: block; width: 100%; height: 100%; }
.sc-title .cur { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 3; pointer-events: none; opacity: 0; }
.sc-title .cur svg { position: absolute; left: -3px; top: -2px; width: 34px; height: 44px; filter: drop-shadow(0 4px 8px var(--shadow)); }
.sc-title .cur svg path { fill: var(--ink); stroke: var(--view); stroke-width: 2; stroke-linejoin: round; }
.sc-title .flag { position: absolute; left: 820px; max-width: 560px; padding: 22px 26px; background: var(--ink); border-left: 5px solid var(--alert); box-shadow: 0 24px 54px var(--shadow); }
.sc-title .flag .fk { font: 600 18px/1 var(--sans); letter-spacing: .14em; text-transform: uppercase; color: var(--alert-bg); margin-bottom: 12px; }
.sc-title .flag .ft { font: 400 30px/1.3 var(--serif); color: var(--on-deep); text-wrap: balance; }`,
  build(d, U) {
    const kicker = d.kicker ? `<div class="kicker">${U.esc(d.kicker)}</div>` : '';
    if (d.open === 'question') {
      // each key its own span inside its word, so the typing reveals keys while lines still break between words
      const keys = (s) => String(s ?? '').split(/\s+/).filter(Boolean).map((w) => `<span class="qw">${[...w].map((ch) => `<span class="ch">${U.esc(ch)}</span>`).join('')}</span>`).join(' ');
      const items = d.items.map((it) => {
        const unit = it.unit ? `<small>${U.esc(it.unit)}</small>` : '';
        const num = typeof it.value === 'number' ? `<span class="v">${U.esc(it.prefix ?? '')}${(it.from ?? 0).toLocaleString('en-US')}${U.esc(it.suffix ?? '')}</span>` : `<span>${U.esc(it.text ?? it.value)}</span>`;
        return `<div class="it"><div class="rl"></div><div class="num">${num}${unit}</div><div class="lb">${U.esc(it.label)}</div></div>`;
      }).join('');
      return `<img class="ua-word" alt="UnifyApps"><h1 class="q">${keys(d.title)}${d.em ? ` <em>${keys(d.em)}</em>` : ''}<b class="caret"></b></h1><div class="qs" style="grid-template-columns:repeat(${Math.max(2, d.items.length)},1fr)">${items}</div>`;
    }
    const head = `${kicker}<h1 class="t1">${U.line(d.title, d.em)}</h1>${d.sub ? `<p class="sub">${U.esc(d.sub)}</p>` : ''}`;
    if (d.open === 'product') {
      const flag = d.flag ? `<div class="flag">${d.flag.kicker ? `<div class="fk">${U.esc(d.flag.kicker)}</div>` : ''}<div class="ft">${U.esc(d.flag.text)}</div></div>` : '';
      return `<img class="ua-word" alt="UnifyApps"><div class="pt">${head}</div><div class="shot"><div class="bar"><i></i><i></i><i></i><span>${U.esc(d.url ?? '')}</span></div><div class="view"><img src="${U.esc(U.asset(d.image))}" alt="">${d.click ? '<div class="cur"><svg viewBox="0 0 24 31"><path d="M2 2 L2 25 L7.6 19.6 L11.6 28.6 L15.6 26.8 L11.7 18 L19.6 18 Z"/></svg></div>' : ''}</div></div>${flag}`;
    }
    return `<img class="ua-word" alt="UnifyApps"><div class="tt">${head}</div>`;
  },
  anim(c, d, U) {
    c.fade(c.q('.ua-word'), c.start + 200, { dur: 900 });
    c.tw(c.q('.kicker'), [{ opacity: 0, letterSpacing: '.34em' }, { opacity: 1, letterSpacing: '.17em' }], { at: c.start + 350, dur: 1100 });
    if (d.open === 'question') return this.question(c, d);
    c.words(c.q('.t1'), c.start + 550, { stagger: 80, dur: 950 });
    c.fadeUp(c.q('.sub'), c.start + 1500);
    if (d.open === 'product') this.product(c, d, U);
  },
  // the question, typed in bursts (32 to 58 ms a key, a beat between words), then each figure on its own line
  question(c, d) {
    const q = c.q('.q'), keys = c.qa('.q .ch'), caret = c.q('.q .caret');
    const times = [];
    let t = c.start + 500;
    keys.forEach((el, k) => {
      t += 32 + c.rand() * 26 + (el.previousElementSibling ? 0 : 45);
      times.push(t);
      c.tw(el, [{ opacity: 0 }, { opacity: 1 }], { at: t, dur: 1, ease: 'linear' });
      c.sfx('key', t, { take: k % 4 });
    });
    const done = t;
    UA.extents.push([q, c.start + 500, done + 200]);
    c.tick((_, now) => {
      let n = 0;
      while (n < times.length && now >= times[n]) n++;
      const at = keys[Math.max(0, n - 1)];
      if (!at) return;
      caret.style.left = `${at.offsetLeft + (n ? at.offsetWidth + 6 : -12)}px`;
      caret.style.top = `${at.offsetTop}px`;
      caret.style.opacity = now < c.start + 300 || (now > done + 400 && Math.floor((now - done) / 530) % 2) ? '0' : '1';
    });
    c.qa('.qs .it').forEach((el, i) => {
      const it = d.items[i], at = c.t(i + 1);
      c.grow(el.querySelector('.rl'), at, { dur: 700 });
      c.fadeUp(el.querySelector('.num'), at + 100, { y: 30, dur: 700 });
      if (typeof it.value === 'number') c.count(el.querySelector('.v'), { from: it.from ?? 0, to: it.value, at: at + 150, dur: 1500, decimals: it.decimals ?? 0, prefix: it.prefix, suffix: it.suffix });
      c.fadeUp(el.querySelector('.lb'), at + 450, { y: 16 });
    });
  },
  // the product, tilted in beside the title; on the build the cursor glides to the click on a minimum-jerk path,
  // presses, and the flag comes up beside it
  product(c, d, U) {
    const shot = c.q('.shot'), view = c.q('.view'), img = view.querySelector('img');
    // a @2x screenshot has twice the pixels for the same layout: every coordinate stays in the 1x layout
    const dens = Number(/@([23])x\.[a-z]+$/i.exec(d.image)?.[1] ?? 1);
    const iw = (img.naturalWidth || 1440 * dens) / dens, ih = (img.naturalHeight || 900 * dens) / dens;
    const vw = Math.min(960, 760 * (iw / ih)), vh = vw * (ih / iw), top = Math.round((1080 - vh - 46) / 2);
    Object.assign(shot.style, { width: `${vw}px`, top: `${top}px` });
    view.style.height = `${vh}px`;
    c.tw(shot, [{ opacity: 0, transform: 'perspective(2400px) translateX(160px) rotateY(-22deg) scale(.94)' }, { opacity: 1, transform: 'perspective(2400px) rotateY(-8deg)' }], { at: c.start + 300, dur: 1300, ease: 'out' });
    const flag = c.q('.flag');
    if (flag) flag.style.top = `${Math.min(top + vh - 40, 1080 - 230)}px`;
    if (!d.click && !d.flag) return;
    const at = c.t(1), k = vw / iw;
    let hit = at;
    const cur = c.q('.cur');
    if (cur) {
      const to = d.click, from = [U.clamp(to[0] - 260, 0, iw), U.clamp(to[1] + 170, 0, ih)];
      const dur = U.clamp(420 + Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.55, 520, 900);
      hit = at + dur + 70;
      c.sfx('click', hit);
      UA.extents.push([shot, at, hit + 520]);
      const arrow = cur.querySelector('svg'), ease = (p) => p * p * p * (10 - 15 * p + 6 * p * p);
      c.tick((_, t) => {
        if (t < at - 200) { cur.style.opacity = '0'; return; }
        const e = ease(U.clamp((t - at) / dur));
        cur.style.left = `${(from[0] + (to[0] - from[0]) * e) * k}px`;
        cur.style.top = `${(from[1] + (to[1] - from[1]) * e) * k}px`;
        cur.style.opacity = String(U.clamp((t - at + 200) / 200));
        // the press: the arrow dips as the button goes down and comes back up
        const since = t - hit;
        arrow.style.transform = since >= 0 && since < 180 ? `scale(${0.82 + 0.18 * (since / 180)})` : 'none';
      });
    }
    if (flag) c.fadeUp(flag, hit + 200, { y: 18, dur: 650 });
  },
});
