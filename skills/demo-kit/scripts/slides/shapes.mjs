// The shapes of a native slide as PowerPoint XML: text boxes with their own runs and line breaks, boxes with fill,
// border, corner and shadow, pictures, and a drawing's lines as freeform shapes, all placed in the 1920x1080 frame's
// pixels (one pixel is 6350 EMU, half a point). Each item is one shape, or one group, so one effect can move it.

const EMU = 6350;
export const emu = (px) => Math.round(px * EMU);
const pt100 = (px) => Math.round(px * 50);
const pct = (f) => Math.round(f * 100000);

export function esc(s) {
  return String(s ?? '').replace(/[^\t\n\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

const solid = (hex, alpha = 1) => `<a:solidFill><a:srgbClr val="${hex}">${alpha < 0.999 ? `<a:alpha val="${pct(Math.max(0, alpha))}"/>` : ''}</a:srgbClr></a:solidFill>`;
const xfrm = (r) => `<a:xfrm${r.rot ? ` rot="${Math.round((((r.rot % 360) + 360) % 360) * 60000)}"` : ''}><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${Math.max(1, emu(r.w))}" cy="${Math.max(1, emu(r.h))}"/></a:xfrm>`;

/** The corner shape of a box `r` with corner radius `rad`: a circle, a rounded rectangle, or a plain one. */
function geom(r, rad) {
  const short = Math.min(r.w, r.h);
  if (rad >= short / 2 - 0.5 && Math.abs(r.w - r.h) < 1) return '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
  if (rad > 0.5) return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((rad / short) * 100000))}"/></a:avLst></a:prstGeom>`;
  return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
}

function shadowOf(sh, opacity) {
  if (!sh || sh.alpha * opacity < 0.01) return '';
  const dist = Math.hypot(sh.x, sh.y), dir = Math.round(((Math.atan2(sh.y, sh.x) * 180) / Math.PI + 360) % 360 * 60000);
  return `<a:effectLst><a:outerShdw blurRad="${emu(sh.blur)}" dist="${emu(dist)}" dir="${dir}" algn="ctr" rotWithShape="0"><a:srgbClr val="${sh.color}"><a:alpha val="${pct(sh.alpha * opacity)}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
}

const nv = (id, name, { descr = '', box = false, title = false } = {}) =>
  `<p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"${descr ? ` descr="${esc(descr)}"` : ''}/><p:cNvSpPr${box ? ' txBox="1"' : ''}>${title ? '<a:spLocks noGrp="1"/>' : ''}</p:cNvSpPr><p:nvPr>${title ? '<p:ph type="title"/>' : ''}</p:nvPr></p:nvSpPr>`;

/**
 * A text box that sets each line where the page did: one paragraph, a break at each of the page's line ends, the
 * page's line height exactly, and its fonts, sizes, colours, spacing and capitals run by run. One line never wraps;
 * more wrap only past the longest line, so a font a little wider on another machine does not break a line early.
 */
export function textShape(id, it, name) {
  const m = it.m, o = it.opacity;
  const S = m.lineHeight, n = m.lines.length;
  const left = Math.min(...m.lines.map((l) => l.left)), right = Math.max(...m.lines.map((l) => l.right));
  // room past the longest line, more for one line, which some viewers wrap whatever the box says
  const widest = right - left, slack = n === 1 ? Math.max(24, widest * 0.3) : Math.max(12, widest * 0.06);
  // placed by its own lines, not its box: an icon or a number beside the text in the same box keeps its place
  let x, w;
  if (m.align === 'ctr') { w = widest + slack; x = (left + right) / 2 - w / 2; }
  else if (m.align === 'r') { w = widest + slack; x = right - w; }
  else { x = left; w = Math.max(widest, m.content.x + m.content.w - left) + slack; }
  // where the page put the first line's baseline, and the line PowerPoint draws it on: 80% of an exact line's height
  // lies above its baseline
  const base = m.lines[0].top + m.ascent;
  const y = base - 0.8 * S;
  const runs = m.lines.map((l) => l.runs.map((r) => run(r, o)).join('')).join(`<a:br>${rPr(m.lines[0].runs[0], o, true)}</a:br>`);
  const end = rPr(m.lines.at(-1).runs.at(-1), o, true).replace('<a:rPr', '<a:endParaRPr').replace('</a:rPr>', '</a:endParaRPr>');
  // text set down the page: a line across a box as long as the column, turned a quarter to run down it
  const r = m.rect, L = r.h * 1.1, at = m.vertical ? { x: r.x + r.w / 2 - L / 2, y: r.y + r.h / 2 - r.w / 2, w: L, h: r.w, rot: 90 + (m.rot ?? 0) } : { x, y, w, h: S * n, rot: m.rot };
  return `<p:sp>${nv(id, name, { box: !it.title, title: it.title })}<p:spPr>${xfrm(at)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
    + `<p:txBody><a:bodyPr wrap="${n === 1 ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${m.vertical ? 'ctr' : 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>`
    + `<a:p><a:pPr algn="${m.vertical ? 'ctr' : m.align}" indent="0" marL="0"><a:lnSpc><a:spcPts val="${pt100(S)}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>${runs}${end}</a:p></p:txBody></p:sp>`;
}

function rPr(r, o, bare = false) {
  const attrs = [`lang="en-US"`, `sz="${pt100(r.size)}"`, `b="${r.weight >= 600 ? 1 : 0}"`, `i="${r.italic ? 1 : 0}"`, r.under ? 'u="sng"' : '', r.caps ? 'cap="all"' : '', r.spacing ? `spc="${pt100(r.spacing)}"` : '', 'dirty="0"'].filter(Boolean).join(' ');
  const font = `<a:latin typeface="${esc(r.font)}" pitchFamily="${r.generic === 'sans' ? 34 : r.generic === 'mono' ? 49 : 18}" charset="0"/><a:cs typeface="${esc(r.font)}"/>`;
  return `<a:rPr ${attrs}>${bare ? '' : solid(r.color, r.alpha * o)}${!bare && r.mark ? `<a:highlight><a:srgbClr val="${r.mark}"/></a:highlight>` : ''}${font}</a:rPr>`;
}
const run = (r, o) => `<a:r>${rPr(r, o)}<a:t>${esc(r.text)}</a:t></a:r>`;

/**
 * A box: its fill, its border when every side has the same one (drawn inside the box's edge, as the page does), its
 * corners and its shadow. A border on some sides only (a card's accent bar) becomes a bar of its own in one group with it.
 */
export function boxShape(id, it, name, next) {
  const m = it.m, o = it.opacity, r = m.rect;
  const sides = m.sides;
  const even = sides.every((s) => s && sides[0] && s.w === sides[0].w && s.color === sides[0].color && s.alpha === sides[0].alpha);
  const line = even ? sides[0] : null;
  const inset = line ? line.w / 2 : 0;
  const body = { x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, h: r.h - 2 * inset, rot: m.rot };
  const fill = m.fill ? solid(m.fill.color, m.fill.alpha * o) : '<a:noFill/>';
  const ln = line ? `<a:ln w="${emu(line.w)}">${solid(line.color, line.alpha * o)}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
  const shape = (sid, nm, rect, geo, f, l, fx = '') => `<p:sp>${nv(sid, nm)}<p:spPr>${xfrm(rect)}${geo}${f}${l}${fx}</p:spPr></p:sp>`;
  const main = (sid) => shape(sid, name, body, geom(body, Math.max(0, m.radius - inset)), fill, ln, shadowOf(m.shadow, o));
  const bars = even ? [] : sides.map((s, k) => s && {
    s, rect: [{ x: r.x, y: r.y, w: r.w, h: s.w }, { x: r.x + r.w - s.w, y: r.y, w: s.w, h: r.h }, { x: r.x, y: r.y + r.h - s.w, w: r.w, h: s.w }, { x: r.x, y: r.y, w: s.w, h: r.h }][k],
  }).filter(Boolean);
  if (!bars.length) return main(id);
  return group(id, name, { ...r, rot: m.rot }, [main(next()), ...bars.map((b) => shape(next(), `${name} edge`, b.rect, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', solid(b.s.color, b.s.alpha * o), '<a:ln><a:noFill/></a:ln>'))]);
}

/** Shapes as one group over `r`, drawn where they are: the group's own box maps onto itself. */
export function group(id, name, r, children) {
  const x = xfrm(r).replace('</a:xfrm>', `<a:chOff x="${emu(r.x)}" y="${emu(r.y)}"/><a:chExt cx="${Math.max(1, emu(r.w))}" cy="${Math.max(1, emu(r.h))}"/></a:xfrm>`);
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${x}</p:grpSpPr>${children.join('')}</p:grpSp>`;
}

/** A picture (or a picture of a piece PowerPoint cannot draw), cropped and cornered as the page shows it. */
export function picShape(id, it, name, rId) {
  const m = it.m, o = it.kind === 'pic' ? it.opacity : 1;
  const c = m.crop;
  const crop = c ? `<a:srcRect l="${pct(c.l)}" t="${pct(c.t)}" r="${pct(c.r)}" b="${pct(c.b)}"/>` : '<a:srcRect/>';
  const alpha = o < 0.995 ? `<a:alphaModFix amt="${pct(o)}"/>` : '';
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}"${m.alt ? ` descr="${esc(m.alt)}"` : ''}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill><a:blip r:embed="${rId}">${alpha}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
    + `<p:spPr>${xfrm({ ...m.rect, rot: m.rot })}${geom(m.rect, m.radius ?? 0)}</p:spPr></p:pic>`;
}

/** A drawing's line or shape as a freeform: its path, stroke (width, ends, joins, dashes, arrowheads) and fill. */
export function pathShape(id, it, name) {
  const m = it.m, o = it.opacity;
  const w = Math.max(1, m.rect.w), h = Math.max(1, m.rect.h);
  const P = (x, y) => `<a:pt x="${emu(x - m.rect.x)}" y="${emu(y - m.rect.y)}"/>`;
  const cmds = m.d.map(([c, ...v]) => (c === 'M' ? `<a:moveTo>${P(v[0], v[1])}</a:moveTo>` : c === 'L' ? `<a:lnTo>${P(v[0], v[1])}</a:lnTo>` : c === 'C' ? `<a:cubicBezTo>${P(v[0], v[1])}${P(v[2], v[3])}${P(v[4], v[5])}</a:cubicBezTo>` : '<a:close/>')).join('');
  const st = m.stroke;
  const ln = st ? `<a:ln w="${emu(st.w)}" cap="${{ round: 'rnd', square: 'sq' }[st.cap] ?? 'flat'}">${solid(st.color, st.alpha * o)}<a:prstDash val="${st.dash?.length ? dashOf(st.dash, st.w) : 'solid'}"/>${{ round: '<a:round/>', bevel: '<a:bevel/>' }[st.join] ?? '<a:miter lim="800000"/>'}${m.head ? '<a:headEnd type="triangle" w="med" len="med"/>' : ''}${m.tail ? '<a:tailEnd type="triangle" w="med" len="med"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>${nv(id, name)}<p:spPr>${xfrm({ x: m.rect.x, y: m.rect.y, w, h })}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>`
    + `<a:path w="${emu(w)}" h="${emu(h)}"${m.fill ? '' : ' fill="none"'}${st ? '' : ' stroke="0"'}>${cmds}</a:path></a:pathLst></a:custGeom>${m.fill ? solid(m.fill.color, m.fill.alpha * o) : '<a:noFill/>'}${ln}</p:spPr></p:sp>`;
}

// PowerPoint's own dashes, as dash and gap in line widths: every viewer draws these
const DASHES = { sysDot: [1, 1], sysDash: [3, 1], dot: [1, 3], dash: [4, 3], lgDash: [8, 3] };

/** The PowerPoint dash nearest a dash pattern (SVG repeats an odd list, so it reads its first two as dash and gap). */
export function dashOf(dash, w) {
  const [d, g = d] = dash.map((v) => v / Math.max(0.5, w));
  let best = 'dash', far = Infinity;
  for (const [name, [dd, gg]] of Object.entries(DASHES)) {
    const off = Math.abs(Math.log((d + 0.01) / dd)) + Math.abs(Math.log((g + 0.01) / gg));
    if (off < far) { far = off; best = name; }
  }
  return best;
}
