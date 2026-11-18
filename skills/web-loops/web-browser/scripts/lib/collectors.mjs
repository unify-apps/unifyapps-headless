// What the WEB checks read INSIDE the page, through browser.mjs `eval`. Each function is sent as
// its source text (`fn.toString()`), so it uses nothing from outside its own body: driver.mjs
// composes `helpers()` (H) and `pageContext(H)` (ctx) in front of a collector, which runs as
// `collector(ctx, H, opts)`. They only read the page, except that the interaction survey marks
// the elements it found with `data-ua-probe` (removed by `cleanup`) and the loggers add
// listeners. The analysis is in Node (interaction.mjs, a11y.mjs, responsive.mjs), where it is
// tested on fixtures.
//
// UnifyApps DOM the collectors rely on (app-verify's page-checks.mjs, app-test-author's
// builder-app dialect): the page root carries `data-page-id`; every block root carries
// `data-block-id` (and `data-block-type`, `data-block-runtime-block-id`); the page scrolls inside
// `main.ua-page-workspace`; the app's theme root is `.interface-theme`; the app's navigation sits
// in `.nocode-navigation-container`; a WEB preview's frame carries a `min-w-[<width>px]` class.

/** Helpers every collector gets as `H`. */
export function helpers() {
  const round = (n) => Math.round(n * 10) / 10;
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const text = (el, max) => clean(el.innerText || el.textContent).slice(0, max || 60);
  const cs = (el) => (el.ownerDocument.defaultView || window).getComputedStyle(el);
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = cs(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    let n = el;
    for (let depth = 0; n && n.nodeType === 1 && depth < 30; depth++, n = n.parentElement) if (Number(cs(n).opacity) === 0) return false;
    return true;
  };
  const box = (el, origin) => {
    const r = el.getBoundingClientRect();
    const o = origin || { x: 0, y: 0 };
    return { x: round(r.left - o.x), y: round(r.top - o.y), w: round(r.width), h: round(r.height) };
  };
  const block = (el) => {
    const b = el.closest('[data-block-id]');
    return b ? { blockId: b.getAttribute('data-block-id'), blockType: b.getAttribute('data-block-type') || null } : { blockId: null, blockType: null };
  };
  const SIG = ['backgroundColor', 'color', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderTopWidth',
    'boxShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'textDecorationLine', 'opacity', 'transform', 'filter', 'backgroundImage'];
  const sig = (el) => { const s = cs(el); const out = {}; for (const key of SIG) out[key] = s[key]; return out; };
  const sigPair = (el) => { const b = el.closest('[data-block-id]'); return { el: sig(el), block: b && b !== el ? sig(b) : null }; };
  const IMPLICIT = { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button', IMG: 'img', NAV: 'navigation', MAIN: 'main', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading' };
  const role = (el) => {
    const own = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (own) return own;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox', button: 'button', submit: 'button', reset: 'button', image: 'button' }[type] || 'textbox';
    }
    if (el.tagName === 'A' && !el.hasAttribute('href')) return 'generic';
    return IMPLICIT[el.tagName] || 'generic';
  };
  const name = (el) => clean(el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || text(el, 40)).slice(0, 40);
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // A URL without its host and query (they may carry a signed token); a data: URI as its type only.
  const pathOnly = (u) => {
    try {
      const url = new URL(u, location.href);
      return url.protocol === 'data:' ? `data:${url.pathname.split(/[;,]/)[0]}` : url.pathname;
    } catch (error) { return null; }
  };
  return { round, clean, text, cs, visible, box, block, sig, sigPair, role, name, ownText, pathOnly };
}

/**
 * Where the page is: the document that holds the page root (`data-page-id`) with the most
 * blocks — the top document, or a same-origin iframe's — and the app root around it.
 */
export function pageContext(H) {
  const frames = [...document.querySelectorAll('iframe')];
  const docs = [{ doc: document, frame: null }];
  for (const frame of frames) {
    try { if (frame.contentDocument) docs.push({ doc: frame.contentDocument, frame }); } catch (error) { /* another origin */ }
  }
  let best = null;
  for (const entry of docs) {
    const all = [...entry.doc.querySelectorAll('[data-page-id]')];
    const roots = all.filter((r) => !all.some((other) => other !== r && other.contains(r)));
    const blocks = roots.reduce((n, r) => n + r.querySelectorAll('[data-block-id]').length, 0);
    if (!best || blocks > best.blocks) best = { ...entry, roots, blocks };
  }
  const doc = best.doc;
  const roots = best.roots;
  const appRoot = roots.length ? (roots[0].closest('.interface-theme') || roots[0]) : doc.body;
  return {
    doc,
    win: doc.defaultView || window,
    roots,
    appRoot,
    blocks: best.blocks,
    pageIds: [...new Set(roots.map((r) => r.getAttribute('data-page-id')))],
    inFrame: Boolean(best.frame),
    frameIndex: best.frame ? frames.indexOf(best.frame) : -1,
    inPage: (el) => roots.some((r) => r.contains(el)),
    inApp: (el) => appRoot.contains(el),
  };
}

/** Waits until the page stops changing (no DOM mutation for quietMs), at most capMs. */
export async function settle(ctx, H, opts) {
  const quietMs = opts.quietMs || 500;
  const capMs = opts.capMs || 8000;
  const started = Date.now();
  let last = Date.now();
  const observer = new MutationObserver(() => { last = Date.now(); });
  observer.observe(ctx.doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  while (Date.now() - last < quietMs && Date.now() - started < capMs) await new Promise((done) => setTimeout(done, 100));
  observer.disconnect();
  return { ms: Date.now() - started, settled: Date.now() - last >= quietMs, blocks: ctx.blocks, pageIds: ctx.pageIds, inFrame: ctx.inFrame, frameIndex: ctx.frameIndex, viewport: { w: window.innerWidth, h: window.innerHeight } };
}

/**
 * Every interactive element of the app: native controls, ARIA widget roles, a tabindex of 0 or
 * more, and the outermost element with `cursor: pointer` (a clickable div). Marks each with
 * `data-ua-probe=<n>` and answers its resting look, whether it is focusable, and which
 * stylesheet rules give it a :hover, :focus, :focus-visible or :active look.
 */
export function surveyInteractive(ctx, H, opts) {
  const max = opts.max || 60;
  const doc = ctx.doc;
  for (const el of doc.querySelectorAll('[data-ua-probe]')) el.removeAttribute('data-ua-probe');
  const ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem']);
  const NATIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[contenteditable="true"],[contenteditable=""]';
  const picked = [];
  let scanned = 0;
  for (const el of ctx.appRoot.querySelectorAll('*')) {
    if (++scanned > 20000) break;
    const native = el.matches(NATIVE);
    const roleHit = ROLES.has((el.getAttribute('role') || '').trim());
    const tabbable = el.hasAttribute('tabindex') && Number(el.getAttribute('tabindex')) >= 0;
    let pointerTop = false;
    if (!native && !roleHit && !tabbable && H.cs(el).cursor === 'pointer') {
      const parent = el.parentElement;
      pointerTop = !parent || H.cs(parent).cursor !== 'pointer';
    }
    if (!(native || roleHit || tabbable || pointerTop)) continue;
    if (!H.visible(el)) continue;
    picked.push({ el, native, roleHit, tabbable, pointerTop });
  }
  // A clickable wrapper around a real control is the control's box, not a second control.
  const kept = picked.filter((p) => !(p.pointerTop && picked.some((q) => q !== p && (q.native || q.roleHit) && p.el.contains(q.el))));
  // Selectors of the stylesheet rules that give a state its own look, with the state taken off.
  const states = { hover: [], focus: [], focusVisible: [], active: [] };
  const STATE = /:(hover|focus-visible|focus-within|focus|active)\b/g;
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) { try { visit(rule.cssRules); } catch (error) { /* unreadable */ } continue; }
      const text = rule.selectorText;
      if (!text || !STATE.test(text)) continue;
      STATE.lastIndex = 0;
      for (const part of text.split(',')) {
        const found = part.match(STATE);
        if (!found) continue;
        const bare = part.replace(STATE, '').trim() || '*';
        for (const hit of found) {
          const key = hit === ':hover' ? 'hover' : hit === ':focus-visible' ? 'focusVisible' : hit === ':active' ? 'active' : 'focus';
          if (states[key].length < 6000) states[key].push(bare);
        }
      }
    }
  };
  for (const sheet of doc.styleSheets) { try { visit(sheet.cssRules); } catch (error) { /* another origin */ } }
  const matchesAny = (el, list) => list.some((sel) => { try { return el.matches(sel) || Boolean(el.querySelector(sel)); } catch (error) { return false; } });
  const probes = kept.slice(0, max).map((p, index) => {
    const el = p.el;
    const n = index + 1;
    el.setAttribute('data-ua-probe', String(n));
    const s = H.cs(el);
    return {
      n, tag: el.tagName.toLowerCase(), role: H.role(el), name: H.name(el), ...H.block(el),
      inPage: ctx.inPage(el), box: H.box(el), native: p.native, roleAttr: p.roleHit, tabbable: p.tabbable,
      pointerOnly: p.pointerTop && !p.native && !p.roleHit && !p.tabbable,
      focusable: el.tabIndex >= 0 && !el.disabled, disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      cursor: s.cursor, rest: H.sigPair(el), hoveredAtRest: el.matches(':hover'),
      rules: { hover: matchesAny(el, states.hover), focus: matchesAny(el, states.focus), focusVisible: matchesAny(el, states.focusVisible), active: matchesAny(el, states.active) },
      ripple: Boolean(el.querySelector('.MuiTouchRipple-root, [class*="ripple" i]')),
    };
  });
  return {
    probes, found: kept.length, truncated: kept.length > max, inFrame: ctx.inFrame, frameIndex: ctx.frameIndex, pageIds: ctx.pageIds,
    focusableInApp: [...ctx.appRoot.querySelectorAll('*')].filter((el) => el.tabIndex >= 0 && !el.disabled && H.visible(el)).length,
    rules: { hover: states.hover.length, focus: states.focus.length, focusVisible: states.focusVisible.length, active: states.active.length },
  };
}

/** Logs the look of each probe the mouse moves onto, 250 ms later (after a transition starts). */
export function installHoverLog(ctx, H) {
  const win = ctx.win;
  if (win.__uaHoverOff) win.__uaHoverOff();
  const log = [];
  win.__uaHover = log;
  const onOver = (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-ua-probe]') : null;
    if (!target) return;
    const n = Number(target.getAttribute('data-ua-probe'));
    setTimeout(() => { log.push({ n, sig: H.sigPair(target), hovered: target.matches(':hover') }); }, 250);
  };
  ctx.doc.addEventListener('pointerover', onOver, true);
  win.__uaHoverOff = () => ctx.doc.removeEventListener('pointerover', onOver, true);
  return { installed: true };
}

export function readHoverLog(ctx) {
  return ctx.win.__uaHover || [];
}

/**
 * Puts the keyboard's starting point at the top of the document, then logs every element that
 * takes focus: its probe number, where it is, and its look then and 250 ms later.
 */
export function installFocusLog(ctx, H) {
  if (window.__uaFocusOff) window.__uaFocusOff();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const body = document.body;
  const had = body.getAttribute('tabindex');
  body.setAttribute('tabindex', '-1');
  body.focus();
  if (had === null) body.removeAttribute('tabindex'); else body.setAttribute('tabindex', had);
  const docs = ctx.doc === document ? [document] : [document, ctx.doc];
  const log = [];
  window.__uaFocus = log;
  const onFocus = (event) => {
    const target = event.target;
    if (!target || target.nodeType !== 1) return;
    const probe = target.closest('[data-ua-probe]');
    const entry = {
      i: log.length, n: probe === target ? Number(target.getAttribute('data-ua-probe')) : null,
      inside: probe && probe !== target ? Number(probe.getAttribute('data-ua-probe')) : null,
      tag: target.tagName.toLowerCase(), role: H.role(target), name: H.name(target), inApp: ctx.inApp(target), inPage: ctx.inPage(target),
      box: H.box(target), focusVisible: (() => { try { return target.matches(':focus-visible'); } catch (error) { return null; } })(), sig: null,
    };
    log.push(entry);
    setTimeout(() => { entry.sig = H.sigPair(target); }, 250);
  };
  for (const d of docs) d.addEventListener('focusin', onFocus, true);
  window.__uaFocusOff = () => { for (const d of docs) d.removeEventListener('focusin', onFocus, true); };
  return { installed: true, docs: docs.length };
}

export function readFocusLog() {
  return window.__uaFocus || [];
}

/** Takes off the probe marks and the loggers, and lets go of focus. */
export function cleanup(ctx) {
  for (const el of ctx.doc.querySelectorAll('[data-ua-probe]')) el.removeAttribute('data-ua-probe');
  if (ctx.win.__uaHoverOff) ctx.win.__uaHoverOff();
  if (window.__uaFocusOff) window.__uaFocusOff();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  return { cleaned: true };
}

/**
 * What the a11y check reads from the DOM: form fields and their labels, images without alt,
 * headings, ARIA attributes used wrongly, and each distinct text colour on its background.
 */
export function collectA11y(ctx, H, opts) {
  const scope = ctx.appRoot;
  const maxText = opts.maxText || 1500;
  const doc = ctx.doc;
  const where = (el) => ({ ...H.block(el), inPage: ctx.inPage(el), box: H.box(el) });
  const fieldSel = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),select,textarea,[role="textbox"],[role="combobox"],[role="searchbox"],[role="spinbutton"]';
  const fields = [...scope.querySelectorAll(fieldSel)].filter(H.visible).slice(0, 200).map((el) => {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return {
      tag: el.tagName.toLowerCase(), type: (el.getAttribute('type') || '').toLowerCase() || null, role: H.role(el),
      labels: el.labels ? [...el.labels].filter((l) => H.text(l, 40)).length : 0,
      ariaLabel: Boolean((el.getAttribute('aria-label') || '').trim()),
      labelledBy: ids.filter((id) => doc.getElementById(id) && H.text(doc.getElementById(id), 40)).length,
      missingRefs: ids.filter((id) => !doc.getElementById(id)),
      title: Boolean((el.getAttribute('title') || '').trim()), placeholder: Boolean((el.getAttribute('placeholder') || '').trim()),
      ...where(el),
    };
  });
  const images = [...scope.querySelectorAll('img, svg[role="img"], [role="img"]')].filter(H.visible).slice(0, 300).map((el) => ({
    tag: el.tagName.toLowerCase(), alt: el.hasAttribute('alt') ? (el.getAttribute('alt').trim() ? 'text' : 'empty') : 'missing',
    ariaLabel: Boolean((el.getAttribute('aria-label') || '').trim() || (el.getAttribute('aria-labelledby') || '').trim() || el.querySelector?.('title')),
    hidden: Boolean(el.closest('[aria-hidden="true"]')), path: el.tagName === 'IMG' ? H.pathOnly(el.currentSrc || el.src) : null,
    inControl: Boolean(el.closest('a,button,[role="button"],[role="link"]')), ...where(el),
  }));
  const headings = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].filter(H.visible).slice(0, 200).map((el) => ({
    level: Number(el.getAttribute('aria-level')) || Number((/^H(\d)$/.exec(el.tagName) || [])[1]) || null, text: H.text(el, 40), ...where(el),
  }));
  const ROLES = new Set(['alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem']);
  const WIDGETS = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'textbox', 'searchbox', 'combobox']);
  const NATIVE = 'a[href],button,input,select,textarea,summary';
  const INTERACTIVE = 'a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"]';
  const aria = [];
  const push = (problem, el, extra) => { if (aria.length < 200) aria.push({ problem, tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: H.name(el), ...where(el), ...(extra || {}) }); };
  for (const el of scope.querySelectorAll('[role]')) {
    if (!H.visible(el)) continue;
    const first = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (first && !ROLES.has(first)) push('invalid-role', el, { value: first });
    else if (WIDGETS.has(first) && el.tabIndex < 0 && !el.matches(NATIVE) && !el.closest('[aria-activedescendant]') && !(el.disabled || el.getAttribute('aria-disabled') === 'true')) push('widget-not-focusable', el);
    else if ((first === 'presentation' || first === 'none') && el.matches(NATIVE) && el.tabIndex >= 0) push('presentation-on-focusable', el);
  }
  for (const el of scope.querySelectorAll('[aria-hidden="true"]')) {
    const focusable = [el, ...el.querySelectorAll('*')].filter((n) => n.tabIndex >= 0 && !n.disabled && H.visible(n));
    if (focusable.length) push('hidden-but-focusable', el, { count: focusable.length });
  }
  for (const el of scope.querySelectorAll('a[href],button,[role="button"],[role="link"]')) {
    if (!H.visible(el)) continue;
    const inner = el.querySelector(INTERACTIVE);
    if (inner && H.visible(inner)) push('nested-interactive', el, { inner: inner.tagName.toLowerCase() });
  }
  for (const el of scope.querySelectorAll('[aria-labelledby],[aria-describedby]')) {
    const ids = `${el.getAttribute('aria-labelledby') || ''} ${el.getAttribute('aria-describedby') || ''}`.split(/\s+/).filter(Boolean);
    const missing = ids.filter((id) => !doc.getElementById(id));
    if (missing.length && H.visible(el)) push('missing-reference', el, { missing });
  }
  // Text on its background: one entry per distinct colour, size and weight, with how many share it.
  const texts = new Map();
  let seen = 0;
  for (const el of scope.querySelectorAll('*')) {
    if (seen >= maxText) break;
    if (!H.ownText(el) || !H.visible(el)) continue;
    seen++;
    const s = H.cs(el);
    let opacity = 1;
    const stack = [];
    let image = false;
    for (let n = el, depth = 0; n && n.nodeType === 1 && depth < 40; n = n.parentElement, depth++) {
      const ns = H.cs(n);
      opacity *= Number(ns.opacity);
      if (ns.backgroundImage && ns.backgroundImage !== 'none') { image = true; break; }
      const bg = ns.backgroundColor;
      stack.push(bg);
      // Opaque ends the walk; a colour in another space (oklch, color()) counts as opaque and Node reads it.
      const alpha = /^rgba\([^)]*[,/]\s*([\d.]+%?)\s*\)$/.exec(bg);
      const transparent = bg === 'transparent' || (alpha && parseFloat(alpha[1]) === 0);
      if (!transparent && (!alpha || (alpha[1].endsWith('%') ? parseFloat(alpha[1]) >= 100 : Number(alpha[1]) >= 1))) break;
    }
    const disabled = Boolean(el.closest('[disabled],[aria-disabled="true"]'));
    const key = [s.color, stack.join('|'), image, s.fontSize, s.fontWeight, opacity.toFixed(2), disabled].join('~');
    const hit = texts.get(key);
    if (hit) { hit.count++; continue; }
    texts.set(key, { color: s.color, stack, image, opacity: Math.round(opacity * 100) / 100, fontSize: s.fontSize, fontWeight: s.fontWeight, disabled, count: 1, ...where(el) });
  }
  return { fields, images, headings, aria, texts: [...texts.values()], scannedText: seen, pageIds: ctx.pageIds, inFrame: ctx.inFrame };
}

/** What the responsive check reads at one width: overflow, clipped and overlapping text, the navigation. */
export function collectResponsive(ctx, H, opts) {
  const max = opts.max || 1500;
  const { doc, win } = ctx;
  const scope = ctx.appRoot;
  const se = doc.scrollingElement || doc.documentElement;
  const scrollsX = (s) => /(auto|scroll)/.test(s.overflowX);
  const scrollers = [...doc.querySelectorAll('main.ua-page-workspace')].map((el) => ({ kind: 'page-workspace', scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, box: H.box(el) }));
  for (let n = ctx.roots[0] ? ctx.roots[0].parentElement : null; n && n !== doc.body; n = n.parentElement) {
    const s = H.cs(n);
    if (/(auto|scroll)/.test(s.overflowX) && !n.matches('main.ua-page-workspace')) scrollers.push({ kind: 'page-ancestor', scrollWidth: n.scrollWidth, clientWidth: n.clientWidth, box: H.box(n) });
  }
  const pageScrollers = new Set([...doc.querySelectorAll('main.ua-page-workspace')]);
  const inHScroll = (el) => {
    for (let n = el.parentElement; n && n !== scope.parentElement; n = n.parentElement) {
      if (pageScrollers.has(n)) return false;
      if (scrollsX(H.cs(n))) return true;
    }
    return false;
  };
  const frame = ctx.roots[0] ? ctx.roots[0].closest('[class*="min-w-["]') : null;
  const blocks = [];
  for (const el of scope.querySelectorAll('[data-block-id]')) {
    if (blocks.length >= max) break;
    if (!H.visible(el)) continue;
    const s = H.cs(el);
    blocks.push({ ...H.block(el), box: H.box(el), inPage: ctx.inPage(el), inHScroll: inHScroll(el), fixed: /fixed|sticky/.test(s.position) });
  }
  const texts = [];
  const textIndex = new Map();
  for (const el of scope.querySelectorAll('*')) {
    if (texts.length >= max) break;
    if (!H.ownText(el) || !H.visible(el)) continue;
    const s = H.cs(el);
    // The nearest text element around this one: inline markup inside a sentence, not a second text.
    let parentText = null;
    for (let n = el.parentElement; n && n !== scope.parentElement && parentText === null; n = n.parentElement) if (textIndex.has(n)) parentText = textIndex.get(n);
    textIndex.set(el, texts.length);
    let clipBy = null;
    for (let n = el.parentElement, depth = 0; n && n !== scope.parentElement && depth < 12; n = n.parentElement, depth++) {
      const ns = H.cs(n);
      if (/(hidden|clip)/.test(ns.overflowX) || /(hidden|clip)/.test(ns.overflowY)) {
        const r = el.getBoundingClientRect();
        const p = n.getBoundingClientRect();
        const over = Math.max(r.right - p.right, p.left - r.left, r.bottom - p.bottom, p.top - r.top);
        if (over > 1) clipBy = { ...H.block(n), overPx: Math.round(over) };
        break;
      }
      if (/(auto|scroll)/.test(ns.overflowX) || /(auto|scroll)/.test(ns.overflowY)) break;
    }
    texts.push({
      i: texts.length, parentText, ...H.block(el), box: H.box(el), inPage: ctx.inPage(el), inHScroll: inHScroll(el), length: H.clean(el.textContent).length,
      own: {
        overflowX: s.overflowX, overflowY: s.overflowY, textOverflow: s.textOverflow, lineClamp: s.webkitLineClamp || 'none', whiteSpace: s.whiteSpace,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
      },
      clipBy,
    });
  }
  const navs = [...new Set([...doc.querySelectorAll('.nocode-navigation-container, nav, [role="navigation"]')])].slice(0, 20).map((el) => {
    const s = H.cs(el);
    const r = el.getBoundingClientRect();
    return {
      kind: el.matches('.nocode-navigation-container') ? 'app-navigation' : el.tagName.toLowerCase() === 'nav' ? 'nav' : 'role-navigation',
      box: { x: H.round(r.left), y: H.round(r.top), w: H.round(r.width), h: H.round(r.height) }, visible: H.visible(el),
      position: s.position, display: s.display, transform: s.transform, items: el.querySelectorAll('a,button,[role="link"],[role="button"],[role="menuitem"],[role="tab"]').length,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, nested: Boolean(el.parentElement && el.parentElement.closest('.nocode-navigation-container, nav, [role="navigation"]')),
    };
  });
  const menuButtons = [...scope.querySelectorAll('button,[role="button"],a')].filter((el) => H.visible(el) && (
    /\b(menu|navigation|hamburger|open nav|sidebar)\b/i.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${H.text(el, 30)}`)
    || (el.getAttribute('aria-haspopup') && el.getAttribute('aria-controls')))).slice(0, 10).map((el) => ({ ...H.block(el), box: H.box(el), name: H.name(el) }));
  return {
    viewport: { w: win.innerWidth, h: win.innerHeight }, dpr: win.devicePixelRatio, app: H.box(scope),
    page: { scrollWidth: se.scrollWidth, clientWidth: se.clientWidth }, scrollers,
    frame: frame ? { minWidth: H.cs(frame).minWidth, box: H.box(frame) } : null,
    blocks, texts, navs, menuButtons, pageIds: ctx.pageIds, inFrame: ctx.inFrame,
  };
}

/**
 * Waits until the page lays out at `width` (the page's scroller, a frame whose min-width is the width,
 * or the page root takes it, within 24 px), at most 5 s. Answers the width the page has.
 */
export async function waitForWidth(ctx, H, opts) {
  const started = Date.now();
  const width = opts.width;
  const widths = () => {
    const root = ctx.roots[0];
    const list = [];
    const scroller = root ? root.closest('main.ua-page-workspace') : ctx.doc.querySelector('main.ua-page-workspace');
    if (scroller) list.push(scroller);
    for (const el of ctx.doc.querySelectorAll('[class*="min-w-["]')) if (ctx.win.getComputedStyle(el).minWidth === `${width}px`) list.push(el);
    if (root) list.push(root);
    return list.map((el) => Math.round(el.getBoundingClientRect().width));
  };
  const near = () => widths().find((w) => Math.abs(w - width) <= 24);
  while (Date.now() - started < 5000 && near() === undefined) await new Promise((done) => setTimeout(done, 100));
  const hit = near();
  return { ok: hit !== undefined, frameWidth: hit ?? widths()[0] ?? Math.round(ctx.win.innerWidth), viewport: { w: ctx.win.innerWidth, h: ctx.win.innerHeight }, ms: Date.now() - started };
}
