/* The deck's presenter: the story page, stepped build by build. Each step plays the page's own clock from where that
 * build starts moving to where it settles (UA.stops), so the deck animates exactly as the video does, and rests between
 * clicks with the logo's mark still turning. Motion off shows each scene whole. One file: nothing is fetched. */
UA.player = (F) => {
  const W = 1920, H = 1080;
  const stops = UA.stops();
  const label = (d) => d.kicker || d.title || d.text || d.who || '';
  const scenes = F.scenes.map((s, i) => ({ id: s.id, i, label: label(s.data), title: [s.data.title, s.data.em].filter(Boolean).join(' '), lines: s.lines, stops: stops.filter((x) => x.scene === i) }));
  const store = {
    get: (k) => { try { return localStorage.getItem(`ua-deck:${k}`); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(`ua-deck:${k}`, v); } catch { /* private window */ } },
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { cur: null, motion: store.get('motion') ?? (reduced ? 'off' : 'on'), auto: false, playing: null, timer: 0, started: 0, digits: '', pw: null };
  // in motion a scene is entered together with its first build, so the deck never rests on a bare heading; a scene
  // with no builds rests on its entrance
  const opening = (s) => s.stops[Math.min(1, s.stops.length - 1)];
  const path = () => (st.motion === 'on' ? stops.filter((x) => x.step > 0 || x.last) : stops.filter((x) => x.last));
  // the lines said while a stop plays: its build's, and on arriving in a scene its opening line too
  const sayNow = (x, l) => l.build === x.step || (x === opening(scenes[x.scene]) && l.build < x.step);
  const esc = UA.esc;

  // ── the frame and the controls ──
  document.body.classList.add('deck');
  const frame = document.getElementById('frame');
  const fit = () => { frame.style.transform = `scale(${Math.min(innerWidth / W, innerHeight / H)})`; };
  addEventListener('resize', fit); fit();
  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const I = {
    prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', notes: 'M5 6h14M5 11h14M5 16h9', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    play: 'M8 5l11 7-11 7z', pause: 'M8 5v14M16 5v14', full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', screen: 'M3 5h18v11H3zM8 20h8M12 16v4',
    motion: 'M3 12c3-6 6-6 9 0s6 6 9 0', help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5',
  };
  const ui = document.createElement('div');
  ui.innerHTML = `
<nav id="deck-bar" aria-label="Presentation">
  <button data-do="prev" aria-label="Back (←)">${icon(I.prev)}</button>
  <span class="count" aria-hidden="true"></span>
  <span class="ticks">${scenes.map((s) => `<button class="tick" data-go="${s.i}" title="${s.i + 1} · ${esc(s.label)}" aria-label="Scene ${s.i + 1}: ${esc(s.label)}"></button>`).join('')}</span>
  <button data-do="next" aria-label="Next (→)">${icon(I.next)}</button>
  <i class="sep"></i>
  <button data-do="motion" class="tg" aria-label="Motion (M)">${icon(I.motion)}</button>
  <button data-do="auto" class="tg" aria-label="Play on its own (A)">${icon(I.play)}</button>
  <button data-do="notes" class="tg" aria-label="Speaker notes (N)">${icon(I.notes)}</button>
  <button data-do="overview" aria-label="All scenes (O)">${icon(I.grid)}</button>
  <button data-do="presenter" aria-label="Presenter view (P)">${icon(I.screen)}</button>
  <button data-do="full" aria-label="Full screen (F)">${icon(I.full)}</button>
  <button data-do="help" aria-label="Keys (?)">${icon(I.help)}</button>
</nav>
<aside id="deck-notes" hidden><div class="nh"><b></b><span></span></div><ol></ol></aside>
<section id="deck-over" hidden aria-label="All scenes"><div class="grid">${scenes.map((s) => `<button data-go="${s.i}"><span class="th">${F.thumbs?.[s.id] ? `<img src="${F.thumbs[s.id]}" alt="">` : `<em>${esc(s.title || s.label)}</em>`}</span><span class="cap"><b>${s.i + 1}</b>${esc(s.label)}</span></button>`).join('')}</div></section>
<section id="deck-help" hidden aria-label="Keys"><div class="card"><h3>Presenting</h3><dl>
  <dt>→ Space Enter, click</dt><dd>Next build</dd><dt>←</dt><dd>Back</dd><dt>Shift →  Shift ←</dt><dd>Next or previous scene</dd>
  <dt>Home End</dt><dd>First or last scene</dd><dt>3 Enter</dt><dd>Go to scene 3</dd><dt>O</dt><dd>All scenes</dd><dt>N</dt><dd>Speaker notes</dd>
  <dt>P</dt><dd>Presenter view, in a second window</dd><dt>F</dt><dd>Full screen</dd><dt>B</dt><dd>Black screen</dd><dt>A</dt><dd>Play on its own</dd><dt>M</dt><dd>Motion on or off</dd>
</dl></div></section>
<div id="deck-black" hidden></div>
<div id="deck-live" class="sr" aria-live="polite"></div>`;
  document.body.append(...ui.children);
  for (const b of document.querySelectorAll('#deck-bar [aria-label]')) b.title = b.getAttribute('aria-label');
  const $ = (id) => document.getElementById(id);
  const bar = $('deck-bar'), notes = $('deck-notes'), over = $('deck-over'), help = $('deck-help'), black = $('deck-black');

  // ── moving through the deck ──
  const finish = () => { if (st.playing) { UA.seek(st.playing.to); st.playing = null; } };
  function show(x, { animate = false, from } = {}) {
    finish();
    clearTimeout(st.timer);
    st.cur = x;
    if (animate && st.motion === 'on') st.playing = { from: from ?? x.from, to: x.to, t0: performance.now() };
    else UA.seek(x.to);
    sync();
    if (st.auto) st.timer = setTimeout(advance, (st.playing ? x.to - st.playing.from : 0) + hold(x));
  }
  const at = () => path().indexOf(st.cur);
  function next() {
    if (!st.started) st.started = Date.now();
    const p = path(), i = at(), y = p[i + 1];
    if (y) show(y, { animate: true, from: y === opening(scenes[y.scene]) ? scenes[y.scene].stops[0].from : undefined });
  }
  function back() { const p = path(), i = at(); if (i > 0) show(p[i - 1]); }
  // a jump enters the scene as itself, never through the leaving of a scene that was not on screen
  function scene(n, { animate = true } = {}) {
    const s = scenes[Math.max(0, Math.min(scenes.length - 1, n))];
    const x = st.motion === 'on' ? opening(s) : s.stops.at(-1);
    const adjacent = st.cur && st.cur.scene === s.i - 1 && st.cur.last;
    show(x, { animate, from: adjacent ? s.stops[0].from : UA.list[s.i].start - 300 });
  }
  // on its own: each build holds for its lines at a speaking pace, and the deck starts again after the end card
  const hold = (x) => {
    const words = scenes[x.scene].lines.filter((l) => sayNow(x, l) || (st.motion !== 'on' && x.last)).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    return Math.min(14000, Math.max(2600, (words / 2.6) * 1000 + 1200));
  };
  const advance = () => { const p = path(); if (at() < p.length - 1) next(); else scene(0); };

  // ── what the controls and the second window show ──
  function sync() {
    const x = st.cur, s = scenes[x.scene], n = s.stops.length - 1;
    bar.querySelector('.count').textContent = `${x.scene + 1} / ${scenes.length}`;
    bar.querySelectorAll('.tick').forEach((t, i) => { t.classList.toggle('on', i === x.scene); t.classList.toggle('done', i < x.scene); });
    for (const [k, on] of [['motion', st.motion === 'on'], ['auto', st.auto], ['notes', !notes.hidden]]) bar.querySelector(`[data-do="${k}"]`).setAttribute('aria-pressed', String(on));
    bar.querySelector('[data-do="auto"]').innerHTML = icon(st.auto ? I.pause : I.play);
    over.querySelectorAll('[data-go]').forEach((b, i) => b.classList.toggle('on', i === x.scene));
    notes.querySelector('.nh b').textContent = `${x.scene + 1} · ${s.label}`;
    notes.querySelector('.nh span').textContent = n ? `build ${x.step} of ${n}` : '';
    notes.querySelector('ol').innerHTML = noteItems(s, x);
    $('deck-live').textContent = `Scene ${x.scene + 1} of ${scenes.length}${s.label ? `: ${s.label}` : ''}${n ? `, build ${x.step} of ${n}` : ''}`;
    try { if (location.protocol !== 'about:') history.replaceState(null, '', `#${x.scene + 1}${x.step ? `.${x.step}` : ''}`); } catch { /* a sandboxed frame */ }
    presenter();
  }
  const noteItems = (s, x) => s.lines.map((l) => `<li class="${sayNow(x, l) ? 'now' : l.build < x.step ? 'said' : ''}">${esc(l.text)}</li>`).join('') || '<li class="none">No notes for this scene.</li>';

  function presenter() {
    const w = st.pw;
    if (!w || w.closed) { st.pw = null; return; }
    const x = st.cur, s = scenes[x.scene], nx = path()[at() + 1], ns = nx && scenes[nx.scene], d = w.document;
    d.getElementById('now').innerHTML = `<b>${x.scene + 1} / ${scenes.length}</b> ${esc(s.label)}${s.stops.length > 1 ? ` <span>build ${x.step} of ${s.stops.length - 1}</span>` : ''}`;
    d.getElementById('lines').innerHTML = noteItems(s, x);
    d.getElementById('next').innerHTML = !nx ? '<em>The end</em>' : nx.scene === x.scene ? `<em>Next build in this scene</em>${F.thumbs?.[s.id] ? `<img src="${F.thumbs[s.id]}" alt="">` : ''}` : `${F.thumbs?.[ns.id] ? `<img src="${F.thumbs[ns.id]}" alt="">` : ''}<span>${nx.scene + 1} · ${esc(ns.label)}</span>`;
  }
  function openPresenter() {
    let w = null;
    try { w = window.open('', 'ua-deck-presenter', 'popup,width=1180,height=760'); } catch { /* blocked */ }
    if (!w) { toggle(notes); return; }
    const v = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    // the deck's own fonts, when they are inside it
    const fonts = [...document.querySelectorAll('style')].find((x) => x.textContent.includes('@font-face'))?.textContent ?? '';
    w.document.open();
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Presenter · ${esc(F.title ?? '')}</title><style>${fonts.replace(/<\//g, '<\\/')}</style><style>
body{margin:0;background:${v('--deep-edge')};color:${v('--on-deep')};font:400 15px/1.4 ${v('--sans')};display:grid;grid-template:auto 1fr auto/1.5fr 1fr;gap:18px;padding:22px;height:100vh;box-sizing:border-box}
header{grid-column:1/3;display:flex;gap:24px;align-items:baseline;color:${v('--on-deep-body')}}header b{color:${v('--accent-on-deep')};font-weight:600}#clock{margin-left:auto;font-variant-numeric:tabular-nums}#timer{font:300 34px/1 ${v('--serif')};color:${v('--on-deep')};cursor:pointer;font-variant-numeric:tabular-nums}
#now{font:500 15px/1.3 ${v('--sans')};letter-spacing:.06em;text-transform:uppercase;color:${v('--accent-on-deep')};margin-bottom:10px}#now span{color:${v('--on-deep-body')};text-transform:none;letter-spacing:0;margin-left:8px}
ol{margin:0;padding:0 0 0 1.5em;overflow:auto;font:400 26px/1.45 ${v('--serif')}}li{margin:0 0 14px;color:${v('--on-deep-body')}}li.now{color:${v('--on-deep')}}li.said{opacity:.45}li.none{list-style:none;opacity:.6}
#next{display:flex;flex-direction:column;gap:10px;color:${v('--on-deep-body')}}#next img{width:100%;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.4)}#next em{font:italic 400 18px ${v('--serif')}}
h4{margin:0 0 10px;font:600 12px/1 ${v('--sans')};letter-spacing:.16em;text-transform:uppercase;color:${v('--on-deep-body')}}footer{grid-column:1/3;display:flex;gap:10px}
button{font:600 14px/1 ${v('--sans')};padding:12px 22px;border-radius:99px;border:1px solid ${v('--on-deep-rule')};background:transparent;color:inherit;cursor:pointer}button.go{background:${v('--accent-on-deep')};color:${v('--deep-edge')};border:0}
</style><header><b>${esc(F.title ?? '')}</b><span id="timer" title="Click to restart">0:00</span><span id="clock"></span></header>
<main style="display:flex;flex-direction:column;min-height:0"><div id="now"></div><ol id="lines"></ol></main><aside><h4>Next</h4><div id="next"></div></aside>
<footer><button id="b">Back</button><button class="go" id="n">Next</button></footer>`);
    w.document.close();
    w.addEventListener('keydown', key);
    w.document.getElementById('n').onclick = next;
    w.document.getElementById('b').onclick = back;
    w.document.getElementById('timer').onclick = () => { st.started = Date.now(); };
    const tick = () => {
      if (w.closed) return;
      const s = st.started ? Math.floor((Date.now() - st.started) / 1000) : 0;
      w.document.getElementById('timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      w.document.getElementById('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      w.setTimeout(tick, 500);
    };
    st.pw = w;
    tick();
    presenter();
  }

  // ── overlays and modes ──
  const toggle = (el, on = el.hidden) => { el.hidden = !on; if (el === notes) store.set('notes', on ? '1' : ''); sync(); };
  const full = () => { const d = document; (d.fullscreenElement ? d.exitFullscreen() : d.documentElement.requestFullscreen?.())?.catch?.(() => null); };
  function setMotion(m) {
    st.motion = m; store.set('motion', m);
    UA.drift = 0;
    const s = scenes[st.cur.scene];
    show(m === 'on' ? opening(s) : s.stops.at(-1));
  }
  const actions = {
    prev: back, next, overview: () => toggle(over), notes: () => toggle(notes), help: () => toggle(help), full, presenter: openPresenter,
    motion: () => setMotion(st.motion === 'on' ? 'off' : 'on'),
    auto: () => { st.auto = !st.auto; if (!st.started) st.started = Date.now(); show(st.cur); },
  };

  function key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target?.closest?.('input, textarea')) return;
    const k = e.key;
    if (!help.hidden && k !== '?') { toggle(help, false); e.preventDefault(); return; }
    if (!over.hidden && k === 'Escape') { toggle(over, false); return; }
    if (/^\d$/.test(k)) { st.digits = (st.digits + k).slice(-3); return; }
    if (k === 'Enter' && st.digits) { scene(Number(st.digits) - 1); st.digits = ''; toggle(over, false); e.preventDefault(); return; }
    st.digits = '';
    if (!black.hidden && k !== 'b' && k !== '.') { black.hidden = true; e.preventDefault(); return; }
    const go = {
      ArrowRight: e.shiftKey ? () => scene(st.cur.scene + 1) : next, ArrowDown: next, PageDown: next, ' ': next, Enter: next,
      ArrowLeft: e.shiftKey ? () => scene(st.cur !== opening(scenes[st.cur.scene]) && st.motion === 'on' ? st.cur.scene : st.cur.scene - 1, { animate: false }) : back, ArrowUp: back, PageUp: back, Backspace: back,
      Home: () => scene(0, { animate: false }), End: () => scene(scenes.length - 1, { animate: false }),
      o: actions.overview, g: actions.overview, n: actions.notes, p: actions.presenter, f: actions.full, a: actions.auto, m: actions.motion, '?': actions.help,
      b: () => { black.hidden = !black.hidden; }, '.': () => { black.hidden = !black.hidden; },
    }[k.length === 1 ? k.toLowerCase() : k];
    if (!go) return;
    e.preventDefault();
    if (st.auto && ![actions.auto, actions.notes, actions.full, actions.help].includes(go)) { st.auto = false; }
    go();
  }
  addEventListener('keydown', key);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.go != null) { scene(+b.dataset.go); if (!over.hidden) toggle(over, false); return; }
    if (b?.dataset.do) { if (st.auto && b.dataset.do !== 'auto') st.auto = false; actions[b.dataset.do](); return; }
    if (e.target.closest('#deck-bar, #deck-notes')) return;
    if (!over.hidden) return toggle(over, false);
    if (!help.hidden) return toggle(help, false);
    if (!black.hidden) { black.hidden = true; return; }
    st.auto = false;
    next();
  });
  // a swipe on a touch screen
  let touch = null;
  addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') touch = [e.clientX, e.clientY]; });
  addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch[0], dy = e.clientY - touch[1];
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { st.auto = false; (dx < 0 ? next : back)(); }
  });
  // the controls and the pointer go away while the deck is being watched
  let idle = 0;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 2600); };
  addEventListener('pointermove', wake); wake();

  // one loop: a playing build moves the clock; between builds the live motion and the mark keep going
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(100, now - last); last = now;
    const p = st.playing;
    if (p) {
      const t = p.from + (now - p.t0);
      if (t >= p.to) { UA.seek(p.to); st.playing = null; } else UA.seek(t);
    } else if (st.motion === 'on' && !document.hidden) { UA.drift += dt; UA.hold(UA.t); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // open where the address says (#3.2 is scene 3, build 2), or on the first scene as it enters
  const m = /^#(\d+)(?:\.(\d+))?$/.exec(location.hash);
  const stopAt = (hash) => {
    const h = /^#(\d+)(?:\.(\d+))?$/.exec(hash), s = h && scenes[+h[1] - 1];
    return s && (st.motion === 'on' ? s.stops[Math.min(Math.max(1, +(h[2] ?? 1)), s.stops.length - 1)] : s.stops.at(-1));
  };
  if (store.get('notes') === '1') notes.hidden = false;
  const want = stopAt(location.hash);
  if (want) show(want);
  else show(path()[0], { animate: true, from: 0 });
  addEventListener('hashchange', () => { const x = stopAt(location.hash); if (x) show(x); });
};
