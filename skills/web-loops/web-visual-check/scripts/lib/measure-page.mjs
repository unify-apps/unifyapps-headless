// The measure of a WEB page, run INSIDE the page through web-browser's evalIn (sent as source
// text, so it uses nothing from outside its body; `ctx` and `H` are web-browser's pageContext and
// helpers). Answers every block box and every text, button and image of the app, in CSS px from
// the app root's top-left corner (the `.interface-theme` element around the page root, else the
// page root), with the computed typography, colours, radii, border, shadow, padding and gaps.

export function measureWebPage(ctx, H, opts) {
  const limit = opts.limit || 4000;
  const root = ctx.roots[0];
  if (!root) return { error: 'no page root ([data-page-id]) on the page' };
  const app = ctx.appRoot;
  const ar = app.getBoundingClientRect();
  // The page scrolls inside main.ua-page-workspace: what it has scrolled is added back, so y is page y.
  const workspace = root.closest('main.ua-page-workspace') || ctx.doc.querySelector('main.ua-page-workspace');
  const scrollTop = workspace ? workspace.scrollTop : 0;
  const origin = { x: ar.left, y: ar.top - scrollTop };
  const typo = (s) => ({ fontSize: s.fontSize, lineHeight: s.lineHeight, fontWeight: s.fontWeight, color: s.color, letterSpacing: s.letterSpacing, fontFamily: s.fontFamily, textTransform: s.textTransform });
  const shape = (s) => ({
    radius: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius],
    borderWidth: s.borderTopWidth, borderStyle: s.borderTopStyle, borderColor: s.borderTopColor, boxShadow: s.boxShadow, opacity: s.opacity,
    padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft], gap: [s.rowGap, s.columnGap], backgroundImage: s.backgroundImage !== 'none',
  });
  const pinned = (s) => /fixed|sticky/.test(s.position);
  const paints = (s) => (s.backgroundColor && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(s.backgroundColor)) || s.backgroundImage !== 'none'
    || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none') || s.boxShadow !== 'none';
  // The box a person sees for a block: its root when the root paints, else the first element under
  // it (three levels down) that paints and is not another block — a Button block's <button>.
  const painted = (root) => {
    let level = [root];
    for (let depth = 0; depth < 3 && level.length; depth++) {
      const next = [];
      for (const node of level) {
        for (const child of node.children) {
          if (child.hasAttribute('data-block-id')) continue;
          if (H.visible(child) && paints(H.cs(child))) return child;
          next.push(child);
        }
      }
      level = next;
    }
    return null;
  };
  let truncated = false;
  const containers = [];
  for (const el of app.querySelectorAll('[data-block-id]')) {
    if (containers.length >= limit) { truncated = true; break; }
    if (!H.visible(el)) continue;
    const own = H.cs(el);
    const face = paints(own) ? null : painted(el);
    const s = face ? H.cs(face) : own;
    containers.push({
      id: `c${containers.length + 1}`, kind: 'view', text: null, label: el.getAttribute('aria-label'), identifier: null,
      blockId: el.getAttribute('data-block-id'), blockType: el.getAttribute('data-block-type'), runtimeId: el.getAttribute('data-block-runtime-block-id'),
      page: H.box(face || el, origin), rootBox: face ? H.box(el, origin) : null, face: face ? face.tagName.toLowerCase() : null,
      pinned: pinned(own), backgroundColor: s.backgroundColor, style: shape(s), inPage: ctx.inPage(el),
    });
  }
  const elements = [];
  const MEDIA = 'img,svg,picture,video,canvas,[role="img"]';
  const CONTROL = 'button,a[href],[role="button"],[role="link"],[role="tab"],[role="menuitem"]';
  const inlineOnly = (el) => [...el.children].every((child) => { const d = H.cs(child).display; return d.startsWith('inline') && !child.matches(MEDIA); });
  for (const el of app.querySelectorAll('*')) {
    if (elements.length >= limit) { truncated = true; break; }
    if (el.matches(MEDIA)) {
      if (el.closest('svg') !== el && el.closest('svg')) continue;
      if (!H.visible(el)) continue;
      elements.push({
        id: `m${elements.length + 1}`, kind: 'image', text: null, label: el.getAttribute('alt') || el.getAttribute('aria-label') || null, identifier: null,
        ...H.block(el), page: H.box(el, origin), pinned: pinned(H.cs(el)), backgroundColor: null, inPage: ctx.inPage(el),
      });
      continue;
    }
    const field = el.matches('input:not([type="hidden"]),textarea,select');
    if (!field && (!H.ownText(el) || !inlineOnly(el))) continue;
    if (!H.visible(el)) continue;
    // A text leaf: the words' own box horizontally, whole line boxes vertically, as a native Text measures.
    const s = H.cs(el);
    let page;
    if (field) page = H.box(el, origin);
    else {
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      const lineHeight = s.lineHeight === 'normal' ? Math.round(parseFloat(s.fontSize) * 1.2) : parseFloat(s.lineHeight);
      const lines = Math.max(1, Math.round(r.height / (lineHeight || r.height || 1)));
      const height = lineHeight ? lines * lineHeight : r.height;
      page = { x: H.round(r.left - origin.x), y: H.round(r.top + r.height / 2 - height / 2 - origin.y), w: H.round(r.width), h: H.round(height) };
    }
    const control = el.closest(CONTROL);
    const words = field ? H.clean(el.value || el.getAttribute('placeholder')) : H.clean(el.textContent);
    const kind = control && H.clean(control.textContent) === words ? 'button' : 'text';
    elements.push({
      id: `t${elements.length + 1}`, kind, text: words.slice(0, 400), label: el.getAttribute('aria-label') || null, identifier: null,
      ...H.block(el), page, pinned: pinned(s), backgroundColor: s.backgroundColor, style: typo(s), field, inPage: ctx.inPage(el),
    });
  }
  return {
    schema: 'loops.web.measure/1', path: location.pathname, viewport: { w: ctx.win.innerWidth, h: ctx.win.innerHeight }, dpr: ctx.win.devicePixelRatio,
    app: { w: H.round(ar.width), h: H.round(Math.max(ar.height, app.scrollHeight, workspace ? workspace.scrollHeight : 0)) }, scrollTop,
    pageIds: ctx.pageIds, inFrame: ctx.inFrame, containers, elements, truncated,
  };
}
