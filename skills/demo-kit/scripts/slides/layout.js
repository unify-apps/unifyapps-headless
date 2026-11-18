/* The PowerPoint's reading of a story page, run inside the page: for one scene, every piece that becomes a shape (a
 * block of text, a box, a picture, a line or shape of a drawing, and what only a picture of it can keep), where each one
 * sits and how it looks at each build, and the page's own motion that brings it in. slides/native.mjs drives it;
 * slides/model.mjs turns what it reads into slides. Nothing here changes the page except the marks and classes the
 * pictures of it need, which `reset` takes off. */
(() => {
  const UA = window.UA;
  // live motion is left out, but for a wire's current, which at rest is the dashed line the page shows
  const SKIP = '.ua-fx:not(.ua-current), script, style, #bar, #amb, #cap';
  const SVG_SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);
  const INLINE = new Set(['inline', 'inline-block', 'inline-flex', 'contents']);
  const r1 = (x) => Math.round(x * 10) / 10;

  // ── colours: [hex, alpha]; a computed colour is rgb(), rgba() or color(srgb …); anything else is read off a pixel ──
  const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const known = new Map();
  const hex = (r, g, b) => [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  function color(c) {
    if (!c || c === 'none' || c === 'transparent' || c === 'currentcolor') return null;
    if (known.has(c)) return known.get(c);
    let v = null, m;
    if ((m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/))) v = [hex(+m[1], +m[2], +m[3]), m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    else if ((m = c.match(/^color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/))) v = [hex(m[1] * 255, m[2] * 255, m[3] * 255), m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
    else {
      pixel.clearRect(0, 0, 1, 1); pixel.fillStyle = '#000'; pixel.fillStyle = c; pixel.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
      v = [hex(r, g, b), a / 255];
    }
    if (v && v[1] < 0.004) v = null;
    known.set(c, v);
    return v;
  }

  /** How much of an element shows, through every parent; 0 when it is not drawn at all. */
  function shown(el, upTo = null) {
    let o = 1;
    for (let e = el; e && e !== upTo && e.nodeType === 1; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none') return 0;
      o *= +cs.opacity;
      if (o < 0.004) return 0;
    }
    return getComputedStyle(el).visibility === 'hidden' ? 0 : o;
  }
  const box = (r) => ({ x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height) });
  // a straight line has no height (or no width): it is on the frame when it has length
  const onFrame = (r, line) => (line ? r.width > 0.5 || r.height > 0.5 : r.width > 0.5 && r.height > 0.5) && r.right >= 0 && r.bottom >= 0 && r.left <= 1920 && r.top <= 1080;

  // ── what becomes a shape ──
  let src = [], root = null, sceneIndex = -1;

  function ownPaint(el, cs) {
    const bg = color(cs.backgroundColor);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ w: parseFloat(cs[`border${s}Width`]) || 0, c: cs[`border${s}Style`] === 'none' ? null : color(cs[`border${s}Color`]) }));
    const border = sides.some((s) => s.w > 0 && s.c);
    const image = cs.backgroundImage !== 'none';
    const shadow = cs.boxShadow !== 'none';
    return { bg, sides, border, image, shadow, any: !!bg || border || image || shadow };
  }

  /** The block a text node belongs to: the nearest parent that is not laid out inside a line, or that draws a box. */
  function blockOf(node) {
    let el = node.parentElement;
    while (el && el !== root && el.id !== 'foot') {
      const cs = getComputedStyle(el);
      if (!INLINE.has(cs.display) || cs.position === 'absolute' || cs.position === 'fixed' || el.tagName === 'svg') break;
      if (cs.display !== 'inline' && cs.display !== 'contents' && ownPaint(el, cs).any) break;
      el = el.parentElement;
    }
    return el;
  }

  function prepare(i, { footer = true } = {}) {
    reset();
    sceneIndex = i;
    const s = UA.list[i];
    root = s.root;
    for (const x of UA.list) if (x !== s) x.root.style.display = 'none';
    const roots = [root, footer && document.getElementById('foot')].filter(Boolean);
    for (const r of roots) materialize(r);
    const found = [], owner = new Map();
    const add = (el, kind, foot, whole = false) => found.push({ el, kind, foot, whole });
    for (const r of roots) {
      const foot = r.id === 'foot';
      const walk = document.createTreeWalker(r, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeType === 1 && (n.matches(SKIP) || n.tagName.toLowerCase() === 'svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      while (walk.nextNode()) {
        const n = walk.currentNode;
        if (n.nodeType === 3) {
          if (!n.data.trim()) continue;
          const b = blockOf(n);
          if (!owner.has(b)) { owner.set(b, []); add(b, 'text', foot); }
          owner.get(b).push(n);
          continue;
        }
        const tag = n.tagName.toLowerCase();
        if (tag === 'img') { add(n, 'pic', foot); continue; }
        if (tag === 'canvas') { add(n, 'raster', foot, true); continue; }
        const cs = getComputedStyle(n), paint = ownPaint(n, cs), masked = (cs.maskImage ?? 'none') !== 'none' || (cs.webkitMaskImage ?? 'none') !== 'none';
        // a word's own background (a highlighter) is drawn with its text
        if (!paint.any || cs.display === 'inline') continue;
        if (!paint.image && !masked) { add(n, 'box', foot); continue; }
        // a picture, a gradient or a mask (an icon cut from a colour): a picture of the box alone; a glow wider than
        // half the frame stays on the slide's background, with the ground
        const b = n.getBoundingClientRect();
        if (b.width * b.height <= 0.5 * 1920 * 1080) add(n, 'paint', foot);
      }
      for (const svg of r.querySelectorAll('svg')) if (!svg.closest(SKIP) && !svg.parentElement.closest('svg')) svgSources(svg, add, foot);
    }
    // in the page's own order, the footer last, and a box under its own text
    const rank = { box: 0, paint: 0, text: 1 };
    found.sort((a, b) => (a.foot !== b.foot ? (a.foot ? 1 : -1) : a.el === b.el ? (rank[a.kind] ?? 0) - (rank[b.kind] ?? 0) : a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    src = found.map((x, n) => ({ ...x, n }));
    for (const x of src) x.el.dataset.ppt = `${x.el.dataset.ppt ?? ''} ${x.kind}`.trim();
    // the heading, so PowerPoint's outline and its accessibility check know the slide's title
    const h = root.querySelector('h1, h2');
    const title = h && src.find((x) => x.kind === 'text' && (x.el === h || h.contains(x.el)));
    if (title) title.title = true;
    return src.map((x) => ({ n: x.n, kind: x.kind, foot: x.foot, title: !!x.title, tag: x.el.tagName.toLowerCase(), cls: String(x.el.className?.baseVal ?? x.el.className ?? '').slice(0, 60) }));
  }

  /**
   * A ::before or ::after that draws (a bullet, a bar, a word) made a real element, styled as it was, while the slide
   * is read, so it becomes a shape like the rest. `reset` takes them off again.
   */
  function materialize(r) {
    for (const el of r.querySelectorAll('*')) {
      if (el.closest(SKIP) || el.namespaceURI === 'http://www.w3.org/2000/svg') continue;
      for (const which of ['before', 'after']) {
        const ps = getComputedStyle(el, `::${which}`);
        if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
        const text = ps.content.match(/^"(.*)"$/s)?.[1] ?? '';
        if (!text.trim() && !ownPaint(el, ps).any) continue;
        const x = document.createElement('i');
        for (let k = 0; k < ps.length; k++) if (ps[k] !== 'content') x.style.setProperty(ps[k], ps.getPropertyValue(ps[k]));
        x.textContent = text;
        x.dataset.pptMade = '';
        if (which === 'before') el.prepend(x); else el.append(x);
        el.setAttribute(`data-ppt-${which}`, '');
      }
    }
  }

  /** A drawing's lines and shapes, each one its own shape, or a picture of it when PowerPoint cannot draw it. */
  function svgSources(svg, add, foot) {
    const cs = getComputedStyle(svg);
    if (cs.filter !== 'none' || cs.maskImage !== 'none' || svg.querySelector('image, foreignObject, use, mask, pattern, filter')) { add(svg, 'raster', foot, true); return; }
    for (const el of svg.querySelectorAll('*')) {
      if (el.closest(SKIP) || el.closest('defs, marker, clipPath, symbol')) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'text') { add(el, 'svgtext', foot); continue; }
      if (!SVG_SHAPES.has(tag)) continue;
      const ecs = getComputedStyle(el);
      const painted = (v) => v.startsWith('url(');
      // what PowerPoint cannot draw as a freeform is a picture of it
      const drawable = pathOf(el).every(([, ...v]) => v.every(Number.isFinite));
      if (!drawable || painted(ecs.fill) || painted(ecs.stroke) || ecs.filter !== 'none' || ecs.clipPath !== 'none' || ecs.maskImage !== 'none') add(el, 'raster', foot, true);
      else add(el, 'path', foot);
    }
  }

  // ── measuring one piece now ──
  function fontOf(cs) {
    const fams = cs.fontFamily.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
    const generic = fams.includes('monospace') ? 'mono' : fams.includes('sans-serif') ? 'sans' : fams.includes('serif') ? 'serif' : /sans|inter|helvetica|arial/i.test(fams[0]) ? 'sans' : 'serif';
    return { font: fams[0], generic, size: r1(parseFloat(cs.fontSize)), weight: +cs.fontWeight || 400, italic: cs.fontStyle !== 'normal' };
  }

  function highlightOf(el, block) {
    for (let e = el; e && e !== block; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const bg = color(cs.backgroundColor);
      if (bg) return bg;
      const m = cs.backgroundImage.match(/^linear-gradient\((rgba?\([^)]*\)|color\([^)]*\)),\s*(rgba?\([^)]*\)|color\([^)]*\))\)$/);
      if (m && m[1] === m[2] && !/(^|\s)0(px|%)?\s+\S|^0%/.test(cs.backgroundSize)) return color(m[1]);
    }
    return null;
  }

  function measureText(s) {
    const block = s.el, cs = getComputedStyle(block), lines = [];
    // text set down the page is one line PowerPoint turns on its side
    const vertical = cs.writingMode.startsWith('vertical');
    const range = document.createRange();
    let line = null, space = false;
    // read again each time: a counter writes a new text node as it counts
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 3 ? NodeFilter.FILTER_ACCEPT
        : n.matches(SKIP) || n.tagName.toLowerCase() === 'svg' || /\btext\b/.test(n.dataset?.ppt ?? '') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP),
    });
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const node of nodes) {
      const p = node.parentElement, ps = getComputedStyle(p);
      const inner = shown(p, block);
      const c = color(ps.color);
      if (!inner || !c) continue;
      const run = { ...fontOf(ps), color: c[0], alpha: r1(c[1] * inner * 100) / 100, spacing: ps.letterSpacing === 'normal' ? 0 : r1(parseFloat(ps.letterSpacing)), caps: ps.textTransform === 'uppercase', under: ps.textDecorationLine.includes('underline'), mark: highlightOf(p, block)?.[0] ?? null };
      const key = JSON.stringify(run);
      const re = /\s+|\S+/g;
      for (let m; (m = re.exec(node.data));) {
        if (/^\s/.test(m[0])) { space = true; continue; }
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rs = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
        if (!rs.length) continue;
        const a = rs[0], z = rs.at(-1);
        if (!line || (!vertical && a.top > line.mid)) {
          line = { top: a.top, bottom: a.bottom, left: a.left, right: z.right, mid: (a.top + a.bottom) / 2, runs: [] };
          lines.push(line);
          space = false;
        }
        const text = (space && line.runs.length ? ' ' : '') + m[0];
        space = false;
        const last = line.runs.at(-1);
        if (last && last.key === key) last.text += text; else line.runs.push({ key, ...run, text });
        line.top = Math.min(line.top, a.top); line.bottom = Math.max(line.bottom, z.bottom);
        line.left = Math.min(line.left, a.left); line.right = Math.max(line.right, z.right);
      }
    }
    if (!lines.length) return null;
    const r = block.getBoundingClientRect();
    // a parent that zooms (a screen's camera) draws the text larger than its font size says
    const k = block.offsetWidth ? r.width / block.offsetWidth : 1;
    if (Math.abs(k - 1) > 0.01) for (const l of lines) for (const x of l.runs) { x.size = r1(x.size * k); x.spacing = r1(x.spacing * k); }
    const pad = (k) => parseFloat(cs[`padding${k}`]) + parseFloat(cs[`border${k}Width`]);
    const content = { x: r.left + pad('Left'), y: r.top + pad('Top'), w: r.width - pad('Left') - pad('Right'), h: r.height - pad('Top') - pad('Bottom') };
    const lh = (cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight)) * k;
    // a font's own ascent, for where PowerPoint puts the baseline in a line of the same height
    const f = fontOf(cs);
    pixel.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const mt = pixel.measureText('Hxg');
    const align = { center: 'ctr', right: 'r', end: 'r', justify: 'l' }[cs.textAlign] ?? 'l';
    return {
      text: lines.map((l) => l.runs.map((x) => x.text).join('')).join('\n'),
      rect: box(r), content: { x: r1(content.x), y: r1(content.y), w: r1(content.w), h: r1(content.h) },
      align, lineHeight: r1(lh), ascent: r1(mt.fontBoundingBoxAscent * k), descent: r1(mt.fontBoundingBoxDescent * k), base: f, vertical,
      lines: lines.map((l) => ({ top: r1(l.top), bottom: r1(l.bottom), left: r1(l.left), right: r1(l.right), runs: l.runs.map(({ key, ...x }) => x) })),
    };
  }

  function measureSvgText(s) {
    const el = s.el, cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const c = color(cs.fill);
    if (!c || !el.textContent.trim()) return null;
    const anchor = cs.textAnchor;
    const run = { ...fontOf(cs), color: c[0], alpha: c[1] * (+cs.fillOpacity || 1), spacing: cs.letterSpacing === 'normal' ? 0 : r1(parseFloat(cs.letterSpacing)), caps: cs.textTransform === 'uppercase', under: false, mark: null, text: el.textContent.trim().replace(/\s+/g, ' ') };
    pixel.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const mt = pixel.measureText('Hxg');
    return {
      text: run.text, rect: box(r), content: box(r), align: anchor === 'middle' ? 'ctr' : anchor === 'end' ? 'r' : 'l',
      lineHeight: r1(r.height), ascent: r1(mt.fontBoundingBoxAscent), descent: r1(mt.fontBoundingBoxDescent), base: fontOf(cs),
      lines: [{ top: r1(r.top), bottom: r1(r.bottom), left: r1(r.left), right: r1(r.right), runs: [run] }],
    };
  }

  function measureBox(s) {
    const el = s.el, cs = getComputedStyle(el), r = el.getBoundingClientRect(), paint = ownPaint(el, cs);
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => parseFloat(cs[`border${k}Radius`]) || 0);
    const sh = cs.boxShadow.split(/,(?![^(]*\))/).map((x) => x.trim()).find((x) => !x.includes('inset'));
    let shadow = null;
    if (sh) {
      const c = color(sh.match(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i)?.[1]);
      const n = sh.replace(/(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)/i, '').trim().split(/\s+/).map(parseFloat);
      if (c && n.length >= 2) shadow = { x: n[0], y: n[1], blur: n[2] || 0, spread: n[3] || 0, color: c[0], alpha: c[1] };
    }
    const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    if (shadow) Object.assign(shadow, { x: shadow.x * k, y: shadow.y * k, blur: shadow.blur * k });
    return {
      rect: box(r), fill: paint.bg ? { color: paint.bg[0], alpha: paint.bg[1] } : null,
      sides: paint.sides.map((x) => (x.w > 0 && x.c ? { w: r1(x.w * k), color: x.c[0], alpha: x.c[1] } : null)),
      radius: r1(Math.min(rad * k, r.width / 2, r.height / 2)), radii, shadow,
    };
  }

  /** The part of the frame a piece can show in: inside every parent that clips what overflows it. */
  function clipOf(el) {
    let c = { l: 0, t: 0, r: 1920, b: 1080 };
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflow === 'visible' || e.classList.contains('w')) continue;
      const r = e.getBoundingClientRect();
      c = { l: Math.max(c.l, r.left), t: Math.max(c.t, r.top), r: Math.min(c.r, r.right), b: Math.min(c.b, r.bottom) };
    }
    return c;
  }

  function measurePic(s) {
    const el = s.el, cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!el.naturalWidth) return null;
    const pad = (k) => parseFloat(cs[`padding${k}`]) + parseFloat(cs[`border${k}Width`]);
    const cb = { x: r.left + pad('Left'), y: r.top + pad('Top'), w: r.width - pad('Left') - pad('Right'), h: r.height - pad('Top') - pad('Bottom') };
    const nw = el.naturalWidth, nh = el.naturalHeight, fit = cs.objectFit;
    let at = { ...cb }, crop = null;
    if (fit === 'contain' || fit === 'scale-down' || fit === 'none') {
      const k = fit === 'none' ? 1 : Math.min(cb.w / nw, cb.h / nh, fit === 'scale-down' ? 1 : Infinity);
      const [px, py] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      at = { x: cb.x + (cb.w - nw * k) * px, y: cb.y + (cb.h - nh * k) * py, w: nw * k, h: nh * k };
    } else if (fit === 'cover') {
      const k = Math.max(cb.w / nw, cb.h / nh), dw = nw * k, dh = nh * k;
      const [px, py] = cs.objectPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      const l = ((dw - cb.w) * px) / dw, t = ((dh - cb.h) * py) / dh;
      crop = { l, t, r: (dw - cb.w) / dw - l, b: (dh - cb.h) / dh - t };
    }
    // what a clipping parent cuts off (a screen's window around a picture its camera has moved in on) is cropped away
    const c = clipOf(el), l = Math.max(at.x, c.l), t = Math.max(at.y, c.t), rr = Math.min(at.x + at.w, c.r), bb = Math.min(at.y + at.h, c.b);
    if (rr - l < 1 || bb - t < 1) return null;
    if (l > at.x + 0.5 || t > at.y + 0.5 || rr < at.x + at.w - 0.5 || bb < at.y + at.h - 0.5) {
      const base = crop ?? { l: 0, t: 0, r: 0, b: 0 }, fw = 1 - base.l - base.r, fh = 1 - base.t - base.b;
      crop = { l: base.l + ((l - at.x) / at.w) * fw, t: base.t + ((t - at.y) / at.h) * fh, r: base.r + ((at.x + at.w - rr) / at.w) * fw, b: base.b + ((at.y + at.h - bb) / at.h) * fh };
      at = { x: l, y: t, w: rr - l, h: bb - t };
    }
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    return { rect: { x: r1(at.x), y: r1(at.y), w: r1(at.w), h: r1(at.h) }, crop, radius: r1(Math.min(rad, cb.w / 2, cb.h / 2)), round: rad >= Math.min(cb.w, cb.h) / 2 - 0.5, alt: el.alt || '', src: el.currentSrc.slice(0, 64), filter: cs.filter };
  }

  // ── a drawing's shapes, in the frame's pixels ──
  function pathOf(el) {
    const tag = el.tagName.toLowerCase(), g = (k) => el[k]?.baseVal?.value ?? +el.getAttribute(k) ?? 0;
    if (tag === 'path') return parsePath(el.getAttribute('d') || '');
    if (tag === 'line') return [['M', g('x1'), g('y1')], ['L', g('x2'), g('y2')]];
    if (tag === 'polyline' || tag === 'polygon') {
      const pts = [...el.points].map((p) => [p.x, p.y]);
      return [['M', ...pts[0]], ...pts.slice(1).map((p) => ['L', ...p]), ...(tag === 'polygon' ? [['Z']] : [])];
    }
    if (tag === 'rect') {
      const x = g('x'), y = g('y'), w = g('width'), h = g('height');
      let rx = el.rx.baseVal.value, ry = el.ry.baseVal.value;
      if (!el.hasAttribute('rx')) rx = ry; if (!el.hasAttribute('ry')) ry = rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
      return parsePath(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
    }
    const cx = g('cx'), cy = g('cy'), rx = tag === 'circle' ? g('r') : g('rx'), ry = tag === 'circle' ? g('r') : g('ry');
    return parsePath(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
  }

  /** SVG path data as absolute M, L, C and Z only: quadratics raised to cubics, arcs split into cubics. */
  function parsePath(d) {
    const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0;
    const num = () => +tok[i++];
    // an arc's flags are one digit each and may run into what follows them ("a2 2 0 012 2")
    const flag = () => { const t = tok[i]; if (t.length > 1 && (t[0] === '0' || t[0] === '1')) { tok[i] = t.slice(1); return +t[0]; } i++; return +t; };
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { out.push(['Z']); x = sx; y = sy; cx = x; cy = y; continue; }
      if (C === 'M') { x = ox + num(); y = oy + num(); sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; cx = x; cy = y; continue; }
      if (C === 'L') { x = ox + num(); y = oy + num(); out.push(['L', x, y]); }
      else if (C === 'H') { x = ox + num(); out.push(['L', x, y]); }
      else if (C === 'V') { y = oy + num(); out.push(['L', x, y]); }
      else if (C === 'C') { const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; out.push(['C', ...a]); [cx, cy, x, y] = a.slice(2); }
      else if (C === 'S') { const p = [2 * x - cx, 2 * y - cy], a = [ox + num(), oy + num(), ox + num(), oy + num()]; out.push(['C', ...p, ...a]); [cx, cy, x, y] = a; }
      else if (C === 'Q' || C === 'T') {
        const q = C === 'Q' ? [ox + num(), oy + num()] : [2 * x - qx, 2 * y - qy], e = [ox + num(), oy + num()];
        out.push(['C', x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1]), ...e]);
        [qx, qy] = q; [x, y] = e; cx = x; cy = y; continue;
      } else if (C === 'A') {
        const [rx, ry, rot, large, sweep] = [num(), num(), num(), flag(), flag()], ex = ox + num(), ey = oy + num();
        for (const c of arc(x, y, rx, ry, rot, large, sweep, ex, ey)) out.push(['C', ...c]);
        x = ex; y = ey;
      } else { i++; continue; }
      if (C !== 'C' && C !== 'S') { cx = x; cy = y; }
      qx = x; qy = y;
    }
    return out;
  }
  function arc(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const t = (phi * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x = cos * dx + sin * dy, y = -sin * dx + cos * dy;
    const l = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
    const k = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y * y - ry * ry * x * x) / (rx * rx * y * y + ry * ry * x * x)));
    const cxp = (k * rx * y) / ry, cyp = (-k * ry * x) / rx;
    const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2, ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    let a1 = ang(1, 0, (x - cxp) / rx, (y - cyp) / ry), da = ang((x - cxp) / rx, (y - cyp) / ry, (-x - cxp) / rx, (-y - cyp) / ry);
    if (!fs && da > 0) da -= 2 * Math.PI; else if (fs && da < 0) da += 2 * Math.PI;
    const n = Math.ceil(Math.abs(da) / (Math.PI / 2)), step = da / n, out = [];
    const pt = (a) => [ccx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, ccy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
    const dv = (a) => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
    for (let j = 0; j < n; j++) {
      const a = a1 + j * step, b = a + step, h = (4 / 3) * Math.tan(step / 4);
      const p0 = pt(a), p3 = pt(b), d0 = dv(a), d3 = dv(b);
      out.push([p0[0] + h * d0[0], p0[1] + h * d0[1], p3[0] - h * d3[0], p3[1] - h * d3[1], p3[0], p3[1]]);
    }
    return out;
  }

  function measurePath(s) {
    const el = s.el, cs = getComputedStyle(el), m = el.getScreenCTM();
    if (!m) return null;
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    const P = (px, py) => [r1(m.a * px + m.c * py + m.e), r1(m.b * px + m.d * py + m.f)];
    const d = pathOf(el).map(([c, ...v]) => { const o = [c]; for (let k = 0; k < v.length; k += 2) o.push(...P(v[k], v[k + 1])); return o; });
    if (d.length < 2) return null;
    const fill = color(cs.fill), stroke = color(cs.stroke), w = (parseFloat(cs.strokeWidth) || 0) * scale;
    const len = el.getTotalLength?.() ?? 0;
    let dash = cs.strokeDasharray === 'none' ? null : cs.strokeDasharray.split(/[ ,]+/).map(parseFloat).filter((v) => !isNaN(v));
    // a dash as long as the line is a line being drawn, not a dashed one: not there until the drawing starts
    if (dash && dash.length === 1 && dash[0] >= len * 0.98) {
      if (!fill && Math.abs(parseFloat(cs.strokeDashoffset) || 0) >= len * 0.98) return null;
      dash = null;
    }
    if (dash?.every((v) => !v)) dash = null;
    const xs = d.flatMap(([, ...v]) => v.filter((_, k) => k % 2 === 0)), ys = d.flatMap(([, ...v]) => v.filter((_, k) => k % 2 === 1));
    const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const marker = (k) => { const v = cs[k] && cs[k] !== 'none' ? cs[k] : el.getAttribute(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)); return v && v !== 'none'; };
    const first = d[0], lastPt = d.at(-1)[0] === 'Z' ? first.slice(1) : d.at(-1).slice(-2);
    return {
      rect, d, closed: d.at(-1)[0] === 'Z',
      fill: fill && cs.fill !== 'none' ? { color: fill[0], alpha: fill[1] * (+cs.fillOpacity) } : null,
      stroke: stroke && w > 0 ? { color: stroke[0], alpha: stroke[1] * (+cs.strokeOpacity), w: r1(w), cap: cs.strokeLinecap, join: cs.strokeLinejoin, dash: dash && dash.map((v) => r1(v * scale)) } : null,
      head: marker('markerStart'), tail: marker('markerEnd'), from: first.slice(1), to: lastPt,
    };
  }

  /** The nearest element at or above `el` that the page turns (not a live spin, which is drawn upright). */
  function turned(el) {
    for (let e = el; e && e !== root && e.nodeType === 1; e = e.parentElement) {
      if (e.namespaceURI === 'http://www.w3.org/2000/svg' && e.tagName !== 'svg') continue;
      const t = getComputedStyle(e).transform;
      if (t === 'none' || /rotate/.test(e.style.transform)) continue;
      const m = new DOMMatrix(t);
      if (Math.abs(Math.atan2(m.b, m.a)) > 0.01) return { e, m };
    }
    return null;
  }

  /**
   * Measures a piece inside a turned parent as it lies before the turn, then moves it to where the turn takes its
   * centre, with the turn as its own: PowerPoint turns each shape about its centre.
   */
  function upright(s, read) {
    // a drawing's points already carry the turn, and a picture of a piece is taken as it shows
    const t = ['text', 'svgtext', 'box', 'pic'].includes(s.kind) ? turned(s.el) : null;
    if (!t) return read();
    const { e, m } = t, cs = getComputedStyle(e);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
    const was = [e.style.getPropertyValue('transform'), e.style.getPropertyPriority('transform')];
    e.style.setProperty('transform', 'none', 'important');
    try {
      const b = e.getBoundingClientRect(), O = new DOMPoint(b.left + ox, b.top + oy);
      const out = read();
      if (!out?.rect) return out;
      const c = new DOMPoint(out.rect.x + out.rect.w / 2, out.rect.y + out.rect.h / 2);
      const to = new DOMMatrix().translate(O.x, O.y).multiply(m).translate(-O.x, -O.y).transformPoint(c);
      const dx = to.x - c.x, dy = to.y - c.y;
      const move = (r) => r && Object.assign(r, { x: r1(r.x + dx), y: r1(r.y + dy) });
      move(out.rect); move(out.content);
      for (const l of out.lines ?? []) Object.assign(l, { top: r1(l.top + dy), bottom: r1(l.bottom + dy), left: r1(l.left + dx), right: r1(l.right + dx) });
      out.rot = r1((Math.atan2(m.b, m.a) * 180) / Math.PI);
      return out;
    } finally {
      e.style.setProperty('transform', was[0], was[1]);
    }
  }

  /** Every piece as it shows now: null when it is not on screen. */
  function measure(t) {
    if (t != null) UA.seek(t);
    return src.map((s) => {
      const o = shown(s.el);
      if (o < 0.02) return null;
      const r = s.el.getBoundingClientRect(), c = clipOf(s.el);
      if (!onFrame(r, s.kind === 'path') || r.right <= c.l || r.left >= c.r || r.bottom <= c.t || r.top >= c.b) return null;
      const m = upright(s, () => (s.kind === 'text' ? measureText(s) : s.kind === 'svgtext' ? measureSvgText(s) : s.kind === 'box' ? measureBox(s) : s.kind === 'pic' ? measurePic(s) : s.kind === 'path' ? measurePath(s) : { rect: box(s.el.getBoundingClientRect()) }));
      return m && { opacity: r1(o * 1000) / 1000, ...m };
    });
  }

  /** The page's motion on each piece: its own, a parent's that carries it, or (for text) its words'. */
  function anims() {
    const scene = UA.list[sceneIndex];
    const pick = (f) => Object.fromEntries(['opacity', 'transform', 'strokeDashoffset', 'clipPath', 'filter', 'color', 'left', 'top', 'width', 'height'].filter((k) => f[k] != null).map((k) => [k, String(f[k])]));
    const ours = (el) => el !== scene.root && !el.classList?.contains('lens') && scene.root.contains(el);
    const motion = [
      // a carried element's move across a cut belongs to the video; a slide changes by its own fade
      ...UA.anims.filter((x) => !x.light && !x.seam && ours(x.el)).map((x) => {
        const kf = x.a.effect.getKeyframes();
        return { el: x.el, start: x.start, dur: +x.a.effect.getTiming().duration || 0, first: pick(kf[0]), last: pick(kf.at(-1)) };
      }),
      ...gsapMotion(scene).filter((x) => ours(x.el)),
    ];
    return src.map((s) => {
      if (s.foot) return [];
      const out = [];
      for (const x of motion) {
        const rel = x.el === s.el ? 'self' : x.el.contains(s.el) ? 'up' : s.kind === 'text' && s.el.contains(x.el) && x.el.textContent.trim() ? 'down' : null;
        if (!rel) continue;
        out.push({ rel, start: Math.round(x.start), dur: Math.round(x.dur), first: x.first, last: x.last, origin: getComputedStyle(x.el).transformOrigin, words: rel === 'down' ? x.el.textContent.trim().split(/\s+/).length : 0 });
      }
      return out;
    });
  }

  /**
   * A scene's GSAP tweens in the form of the page's Web Animations: each target's first and last frame, read by setting
   * the film clock to the tween's start and end, with only what the tween changes. Endless motion is left out.
   */
  function gsapMotion(scene) {
    const g = window.gsap, mine = UA.gsScenes?.find((x) => x.s === scene);
    if (!g || !mine) return [];
    const at = (tw) => { let t = tw.startTime(); for (let p = tw.parent; p && p !== UA.gsm; p = p.parent) t += p.startTime(); return t * 1000; };
    const keys = (v) => Object.keys({ ...v, ...(v.startAt ?? {}) });
    const runs = [];
    for (const tw of mine.tl.getChildren(true, true, false)) {
      if (tw.repeat() === -1) continue;
      const t0 = at(tw);
      // a staggered tween keeps one tween per target in its own timeline
      const parts = tw.timeline ? tw.timeline.getChildren(false, true, false).map((c) => [c, t0 + c.startTime() * 1000]) : [[tw, t0]];
      for (const [c, start] of parts) {
        const k = new Set(keys(c.vars).concat(keys(tw.vars)));
        for (const el of c.targets()) if (el instanceof Element) runs.push({ el, start, dur: c.duration() * 1000, k });
      }
    }
    if (!runs.length) return [];
    const read = (el, k) => {
      const f = {}, v = (p) => +g.getProperty(el, p) || 0;
      if (k.has('opacity') || k.has('autoAlpha')) f.opacity = String(r1(v('opacity') * 100) / 100);
      if (['x', 'y', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY', 'rotation', 'transform'].some((p) => k.has(p))) {
        const sx = v('scaleX'), sy = v('scaleY'), xp = v('xPercent'), yp = v('yPercent');
        f.transform = [
          xp ? `translateX(${r1(xp)}%)` : `translateX(${r1(v('x'))}px)`,
          yp ? `translateY(${r1(yp)}%)` : `translateY(${r1(v('y'))}px)`,
          sx === 0 && sy !== 0 ? 'scaleX(0)' : sy === 0 && sx !== 0 ? 'scaleY(0)' : `scale(${r1(Math.min(sx, sy) * 100) / 100})`,
        ].join(' ');
      }
      // a line drawn in shows none of its length at first
      if (k.has('drawSVG')) f.strokeDashoffset = parseFloat(getComputedStyle(el).strokeDasharray) < 0.5 ? '1' : '0';
      for (const p of ['clipPath', 'width', 'height', 'left', 'top']) if (k.has(p)) f[p] = getComputedStyle(el)[p];
      return f;
    };
    const was = UA.t;
    for (const t of [...new Set(runs.flatMap((r) => [r.start, r.start + r.dur]))].sort((a, b) => a - b)) {
      UA.seek(t);
      for (const r of runs) {
        if (r.start === t) r.first = read(r.el, r.k);
        if (r.start + r.dur === t) r.last = read(r.el, r.k);
      }
    }
    UA.seek(was);
    return runs.filter((r) => Object.keys(r.first).length).map(({ el, start, dur, first, last }) => ({ el, start, dur, first, last }));
  }

  /** The scene's clock: when it starts, its builds' cues, and where it ends. */
  const clock = () => { const s = UA.list[sceneIndex]; return { start: s.start, end: s.end, cues: [...s.cues], ground: s.ground, id: s.id, type: s.type, cut: s.cut }; };

  // ── the pictures: one piece alone on a clear page, or the slide's background without what became shapes ──
  const CSS = `
[data-ppt-before]::before, [data-ppt-after]::after { content: none !important; }
html.ppt-iso, html.ppt-iso body, html.ppt-iso #frame, html.ppt-iso #stage { background: transparent !important; }
html.ppt-iso * { visibility: hidden !important; }
html.ppt-iso [data-ppt-iso], html.ppt-iso [data-ppt-iso] * { visibility: visible !important; }
html.ppt-iso.ppt-own [data-ppt-iso] * { visibility: hidden !important; }
html.ppt-iso.ppt-own [data-ppt-iso] { color: transparent !important; -webkit-text-fill-color: transparent !important; }
html.ppt-iso .ua-fx, html.ppt-plate .ua-fx { display: none !important; }
html.ppt-plate [data-ppt~="text"], html.ppt-plate [data-ppt~="text"] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; text-decoration-color: transparent !important; }
html.ppt-plate [data-ppt~="text"] *:not([data-ppt]) { background: none !important; }
html.ppt-plate [data-ppt~="box"] { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
html.ppt-plate [data-ppt~="paint"] { background: none !important; border-color: transparent !important; box-shadow: none !important; }
html.ppt-plate [data-ppt~="pic"], html.ppt-plate [data-ppt~="path"], html.ppt-plate [data-ppt~="svgtext"], html.ppt-plate [data-ppt~="raster"] { visibility: hidden !important; }`;
  let style = null;
  function mode(name, n) {
    if (!style) { style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style); }
    const h = document.documentElement;
    h.classList.remove('ppt-iso', 'ppt-own', 'ppt-plate');
    document.querySelector('[data-ppt-iso]')?.removeAttribute('data-ppt-iso');
    if (name === 'plate') h.classList.add('ppt-plate');
    if (name === 'iso') {
      const s = src[n];
      s.el.setAttribute('data-ppt-iso', '');
      h.classList.add('ppt-iso');
      if (s.kind === 'paint') h.classList.add('ppt-own');
      const r = s.el.getBoundingClientRect(), pad = s.kind === 'paint' ? 2 : 6;
      const x = Math.max(0, Math.floor(r.left - pad)), y = Math.max(0, Math.floor(r.top - pad));
      return { x, y, w: Math.min(1920, Math.ceil(r.right + pad)) - x, h: Math.min(1080, Math.ceil(r.bottom + pad)) - y };
    }
    return null;
  }

  /** A picture's own pixels as PNG or JPEG data, drawn through its CSS filter (a white logo, a grey one). */
  async function picture(n, scale = 2) {
    const el = src[n].el, cs = getComputedStyle(el);
    const raw = el.currentSrc;
    if (cs.filter === 'none' && /^data:image\/(png|jpeg);base64,/.test(raw)) return raw;
    const r = el.getBoundingClientRect();
    const k = Math.min(4, Math.max(1, (scale * Math.max(r.width, r.height)) / Math.max(el.naturalWidth, el.naturalHeight)));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(el.naturalWidth * k)); c.height = Math.max(1, Math.round(el.naturalHeight * k));
    const g = c.getContext('2d');
    if (cs.filter !== 'none') g.filter = cs.filter;
    g.drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL(/jpe?g/.test(raw.slice(0, 30)) && cs.filter === 'none' ? 'image/jpeg' : 'image/png', 0.92);
  }

  function reset() {
    mode(null);
    for (const s of src) delete s.el.dataset.ppt;
    for (const x of document.querySelectorAll('[data-ppt-made]')) x.remove();
    for (const x of document.querySelectorAll('[data-ppt-before], [data-ppt-after]')) { x.removeAttribute('data-ppt-before'); x.removeAttribute('data-ppt-after'); }
    for (const x of UA.list) x.root.style.display = '';
    src = []; root = null; sceneIndex = -1;
  }

  /** The story's colours and fonts, for the PowerPoint theme a slide added by hand takes. */
  function palette() {
    const v = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    const h = (k) => color(v(k))?.[0];
    const first = (k) => v(k).split(',')[0].trim().replace(/^["']|["']$/g, '');
    return {
      major: first('--serif'), minor: first('--sans'),
      colors: { dk1: h('--ink'), lt1: h('--paper'), dk2: h('--deep'), lt2: h('--paper2'), accent1: h('--accent'), accent2: h('--deep2'), accent3: h('--accent-on-deep'), accent4: h('--alert'), accent5: h('--deep3'), accent6: h('--muted'), hlink: h('--accent'), folHlink: h('--accent2') },
    };
  }

  UA.ppt = { prepare, measure, anims, clock, mode, picture, palette, reset };
})();
