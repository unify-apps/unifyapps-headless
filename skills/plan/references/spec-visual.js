/* ua-spec-js v3 — the one script the visual spec carries. spec draft, accept and revise inline
   this exact text, validateSpecHtml allows this text and no other script, and render.mjs checks a
   record's page the same way before writing it to disk. It expands, collapses, filters, highlights
   and scroll-tracks; it reads only this page's DOM, makes no network call and builds no HTML from
   strings. The page reads in full without it. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $$(s, c) { return [].slice.call((c || d).querySelectorAll(s)); }
  function make(tag, cls, text) { var n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  /* expand / collapse with a height animation */
  function bodyOf(det) { return det.querySelector('.ent-body, .dec-body'); }
  function isOpen(det) { return det._to != null ? det._to : det.open; }
  function setOpen(det, open, instant) {
    var b = bodyOf(det);
    if (det._a) { det._a.cancel(); det._a = null; }
    det._to = open;
    if (!b || reduce || instant || !b.animate) { det.open = open; det._to = null; return; }
    b.style.overflow = 'hidden';
    if (open) det.open = true;
    var h = open ? b.scrollHeight : b.offsetHeight;
    var a = b.animate(open ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }] : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: open ? 220 : 160, easing: 'cubic-bezier(.2,.7,.2,1)' });
    det._a = a;
    a.onfinish = function () { if (!open) det.open = false; b.style.overflow = ''; det._a = null; det._to = null; };
    a.oncancel = function () { b.style.overflow = ''; };
  }
  function openTarget(id) {
    var t = id && d.getElementById(id);
    if (t && t.tagName === 'DETAILS' && !t.open) setOpen(t, true, true);
  }

  d.addEventListener('click', function (e) {
    var s = e.target.closest('details.ent > summary, details.dec > summary');
    if (s) { e.preventDefault(); setOpen(s.parentElement, !isOpen(s.parentElement)); return; }
    var a = e.target.closest('a');
    if (a) {
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) === '#') openTarget(href.slice(1));
    }
  });
  if (location.hash) openTarget(location.hash.slice(1));

  /* keyboard: arrows move between rows of one section */
  d.addEventListener('keydown', function (e) {
    var s = e.target.closest && e.target.closest('details.ent > summary, details.dec > summary');
    if (!s) return;
    var det = s.parentElement;
    if (e.key === 'ArrowRight' && !isOpen(det)) { e.preventDefault(); setOpen(det, true); return; }
    if (e.key === 'ArrowLeft' && isOpen(det)) { e.preventDefault(); setOpen(det, false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    var all = $$('details > summary', s.closest('section')).filter(function (x) { return x.offsetParent !== null; });
    var n = all[all.indexOf(s) + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) { e.preventDefault(); n.focus(); }
  });

  /* section tools */
  function toolsFor(sec) {
    var head = sec.querySelector('.sec-head');
    if (!head) return null;
    var t = make('div', 'tools');
    head.appendChild(t);
    return t;
  }

  var changes = d.getElementById('changes');
  var dg = d.querySelector('.dg');
  if (changes) {
    var ents = $$('details.ent', changes);
    var groups = $$('.grp', changes);
    var tools = groups.length > 1 ? toolsFor(changes) : null;
    if (tools && groups.length > 1) {
      var seg = make('div', 'seg');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Show');
      var opts = [['', 'All']].concat(groups.map(function (g) { return [g.getAttribute('data-kind'), g.getAttribute('data-label')]; }));
      var btns = opts.map(function (o) {
        var b = make('button', null, o[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', o[0] ? 'false' : 'true');
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          groups.forEach(function (g) { g.classList.toggle('is-hidden', !!o[0] && g.getAttribute('data-kind') !== o[0]); });
          if (dg) {
            if (o[0]) dg.setAttribute('data-only', o[0]); else dg.removeAttribute('data-only');
            $$('.dg-node', dg).forEach(function (n) { n.classList.toggle('is-kind', n.getAttribute('data-group') === o[0]); });
          }
        });
        seg.appendChild(b);
        return b;
      });
      tools.appendChild(seg);
    }
  }

  /* diagram: highlight a box with its arrows; rows highlight their box */
  if (dg) {
    var edges = $$('.dg-edge', dg);
    var nodes = $$('.dg-node', dg);
    var focus = function (id) {
      if (!id) { dg.classList.remove('is-focus'); $$('.is-hot', dg).forEach(function (x) { x.classList.remove('is-hot'); }); return; }
      var hot = {}; hot[id] = 1;
      edges.forEach(function (e) {
        var on = e.getAttribute('data-from') === id || e.getAttribute('data-to') === id;
        e.classList.toggle('is-hot', on);
        if (on) { hot[e.getAttribute('data-from')] = 1; hot[e.getAttribute('data-to')] = 1; }
      });
      nodes.forEach(function (n) { n.classList.toggle('is-hot', !!hot[n.getAttribute('data-node')]); });
      dg.classList.add('is-focus');
    };
    nodes.forEach(function (n) {
      var id = n.getAttribute('data-node');
      n.addEventListener('mouseenter', function () { focus(id); });
      n.addEventListener('focus', function () { focus(id); });
      n.addEventListener('mouseleave', function () { focus(null); });
      n.addEventListener('blur', function () { focus(null); });
    });
    $$('.ent[data-node]').forEach(function (r) {
      var s = r.querySelector('summary') || r;
      s.addEventListener('mouseenter', function () { focus(r.getAttribute('data-node')); });
      s.addEventListener('mouseleave', function () { focus(null); });
    });
  }

  /* scroll tracking for the contents rail */
  var bar = d.querySelector('.topbar');
  var links = $$('aside nav a[href^="#"]');
  var secs = links.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  var cur = null, ticking = false;
  function mark(id) {
    if (id === cur) return;
    cur = id;
    links.forEach(function (a) { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  }
  function track() {
    ticking = false;
    var top = bar ? bar.offsetHeight : 0;
    var line = top + (window.innerHeight - top) * 0.3;
    var act = secs[0];
    secs.forEach(function (s) { if (s.getBoundingClientRect().top <= line) act = s; });
    if (window.innerHeight + window.scrollY >= root.scrollHeight - 4) act = secs[secs.length - 1];
    if (act) mark(act.id);
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(track); } }, { passive: true });
  links.forEach(function (a) { a.addEventListener('click', function () { mark(a.getAttribute('href').slice(1)); }); });
  track();

  /* print everything open */
  var saved = [];
  window.addEventListener('beforeprint', function () { saved = $$('details').map(function (x) { return [x, x.open]; }); saved.forEach(function (x) { x[0].open = true; }); });
  window.addEventListener('afterprint', function () { saved.forEach(function (x) { x[0].open = x[1]; }); saved = []; });
})();
