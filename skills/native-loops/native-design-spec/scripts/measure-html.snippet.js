(element) => {
  // Measures one screen of an HTML prototype for store.mjs spec-from-measure. Paste this whole file as the
  // `function` of mcp__plugin_ua_playwright__browser_evaluate (with `target` = the screen's container when
  // the prototype draws a phone frame) and `filename` = a .json path, so the result never enters the chat.
  const root = element || document.querySelector('[data-screen]') || document.body;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD', 'BR', 'WBR']);
  const MEDIA = new Set(['img', 'svg', 'picture', 'video', 'canvas', 'iframe']);
  const FIELDS = new Set(['input', 'textarea', 'select']);
  const LIMIT = 2500;
  const rr = root.getBoundingClientRect();
  const ox = rr.left + window.scrollX;
  const oy = rr.top + window.scrollY;
  const round = (n) => Math.round(n * 100) / 100;
  const box = (r) => ({ x: round(r.left + window.scrollX - ox), y: round(r.top + window.scrollY - oy), w: round(r.width), h: round(r.height) });
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const pxOf = (v) => parseFloat(v) || 0;
  const style = (cs) => ({
    'font-size': cs.fontSize, 'line-height': cs.lineHeight, 'font-weight': cs.fontWeight, 'font-family': cs.fontFamily,
    color: cs.color, 'letter-spacing': cs.letterSpacing, 'text-transform': cs.textTransform, 'text-align': cs.textAlign,
    'background-color': cs.backgroundColor, 'background-image': cs.backgroundImage,
    'border-radius': [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
    'box-shadow': cs.boxShadow, opacity: cs.opacity, filter: cs.filter, 'backdrop-filter': cs.backdropFilter || cs.webkitBackdropFilter || 'none',
    'border-width': cs.borderTopWidth, 'border-style': cs.borderTopStyle, 'border-color': cs.borderTopColor,
    padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join(' '),
    display: cs.display, 'flex-direction': cs.flexDirection, gap: cs.rowGap, 'white-space': cs.whiteSpace, position: cs.position,
  });
  const paints = (cs) => (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) || cs.backgroundImage !== 'none'
    || (pxOf(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') || cs.boxShadow !== 'none';
  const inline = (el) => !SKIP.has(el.tagName) && getComputedStyle(el).display.startsWith('inline') && !MEDIA.has(el.tagName.toLowerCase()) && !FIELDS.has(el.tagName.toLowerCase()) && el.tagName !== 'BUTTON';
  const contentBox = (el, cs) => {
    const r = el.getBoundingClientRect();
    const l = pxOf(cs.paddingLeft) + pxOf(cs.borderLeftWidth), t = pxOf(cs.paddingTop) + pxOf(cs.borderTopWidth);
    const rgt = pxOf(cs.paddingRight) + pxOf(cs.borderRightWidth), b = pxOf(cs.paddingBottom) + pxOf(cs.borderBottomWidth);
    return { left: r.left + l, top: r.top + t, width: Math.max(0, r.width - l - rgt), height: Math.max(0, r.height - t - b) };
  };
  // The ink of the words horizontally, whole line boxes vertically, centred on the words: what a native Text
  // measures, also inside a button or a field that centres its text in a taller box.
  const textBox = (el, cs) => {
    const c = contentBox(el, cs);
    const lineHeight = cs.lineHeight === 'normal' ? Math.round(pxOf(cs.fontSize) * 1.2) : pxOf(cs.lineHeight);
    if (FIELDS.has(el.tagName.toLowerCase())) return box({ left: c.left, top: c.top + (c.height - lineHeight) / 2, width: c.width, height: lineHeight });
    const range = document.createRange();
    range.selectNodeContents(el);
    const t = range.getBoundingClientRect();
    if (!t.width || !lineHeight) return box(c);
    const height = Math.max(1, Math.round(t.height / lineHeight)) * lineHeight;
    return box({ left: t.left, top: t.top + t.height / 2 - height / 2, width: t.width, height });
  };
  const nameOf = (el) => el.getAttribute('data-name') || el.getAttribute('aria-label') || el.getAttribute('alt') || el.id
    || (typeof el.className === 'string' && el.className.trim() ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const nodes = [];
  let seq = 0;
  let truncated = false;
  const visit = (el, parent) => {
    if (SKIP.has(el.tagName)) return;
    if (nodes.length >= LIMIT) { truncated = true; return; }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    const children = [...el.children].filter((c) => !SKIP.has(c.tagName));
    if (r.width < 0.5 || r.height < 0.5) { for (const child of children) visit(child, parent); return; }
    const tag = el.tagName.toLowerCase();
    const id = `h${++seq}`;
    const node = { id, parent, tag, name: '', ...box(r), style: style(cs) };
    const media = MEDIA.has(tag) || /url\(/.test(cs.backgroundImage);
    const field = FIELDS.has(tag);
    const words = field ? clean(el.value || el.getAttribute('placeholder')) : clean(el.textContent);
    const textLeaf = !media && words && (field || children.every(inline));
    if (media) { node.kind = tag === 'svg' ? 'vector' : 'image'; node.name = nameOf(el); nodes.push(node); return; }
    if (textLeaf) {
      if (paints(cs) || field || tag === 'button' || (tag === 'a' && cs.display !== 'inline')) {
        node.kind = 'container';
        node.name = nameOf(el);
        nodes.push(node);
        const text = { id: `${id}t`, parent: id, tag: '#text', kind: 'text', name: words.slice(0, 120), text: words.slice(0, 400), ...textBox(el, cs), style: { ...style(cs), 'background-color': 'rgba(0, 0, 0, 0)', 'background-image': 'none', 'box-shadow': 'none', 'border-width': '0px', 'border-radius': '0px 0px 0px 0px' } };
        if (field && !el.value) text.placeholder = true;
        nodes.push(text);
      } else {
        Object.assign(node, { kind: 'text', name: words.slice(0, 120), text: words.slice(0, 400) }, textBox(el, cs));
        nodes.push(node);
      }
      return;
    }
    node.kind = children.length ? 'container' : 'box';
    node.name = nameOf(el);
    nodes.push(node);
    for (const child of children) visit(child, id);
  };
  for (const child of [...root.children]) visit(child, null);
  return JSON.stringify({
    schema: 'loops.design.html-measure/1', url: location.href, title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight }, dpr: window.devicePixelRatio,
    root: { name: nameOf(root), w: round(rr.width), h: round(Math.max(rr.height, root.scrollHeight)), style: style(getComputedStyle(root)) },
    truncated, nodes,
  });
}
