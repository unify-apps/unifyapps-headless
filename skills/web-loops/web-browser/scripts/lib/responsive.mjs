// The responsive check's analysis, per width: the page or a block wider than the window, text cut
// off or running over other text, and which navigation the page shows (side bar, top bar, bottom
// bar, drawer or none). Pure.
import { foldRepeats } from './a11y.mjs';
import { classOf } from './breakpoints.mjs';

const ISSUES_PER_KIND = 10;

const right = (box) => box.x + box.w;
const bottom = (box) => box.y + box.h;
const area = (box) => Math.max(0, box.w) * Math.max(0, box.h);
const inside = (inner, outer) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && right(inner) <= right(outer) + 1 && bottom(inner) <= bottom(outer) + 1;
const overlapArea = (a, b) => Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x)) * Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));

/**
 * Which navigation shows: `side`, `side-right`, `top`, `bottom`, `drawer` (none on screen, a menu
 * button is), `none`, or `other`. Boxes are measured against the app's own box, so a preview
 * toolbar above the app does not count.
 */
export function navVariant(data) {
  const app = data.app ?? { x: 0, y: 0, w: data.viewport.w, h: data.viewport.h };
  const navs = (data.navs ?? []).filter((nav) => !nav.nested);
  const main = navs.find((nav) => nav.kind === 'app-navigation') ?? [...navs].sort((a, b) => area(b.box) - area(a.box))[0] ?? null;
  const vw = Math.min(app.w || data.viewport.w, data.viewport.w);
  const vh = Math.max(app.h || data.viewport.h, 1);
  const shown = main && main.visible && main.box.w >= 2 && main.box.h >= 2 && right(main.box) > app.x + 1 && main.box.x < app.x + vw - 1;
  if (!shown) return { variant: (data.menuButtons ?? []).length ? 'drawer' : 'none', nav: main };
  const box = { ...main.box, x: main.box.x - app.x, y: main.box.y - app.y };
  // Tall and narrower than the screen is a side bar, however much of a phone it takes.
  const tall = box.h >= 0.5 * Math.min(vh, data.viewport.h) && box.h > box.w && box.w < 0.9 * vw;
  let variant = 'other';
  if (tall && box.x <= 4) variant = 'side';
  else if (tall && right(box) >= vw - 4) variant = 'side-right';
  else if (!tall && box.w >= 0.6 * vw && box.y <= 4) variant = 'top';
  else if (!tall && box.w >= 0.6 * vw && bottom(box) >= data.viewport.h - app.y - 4) variant = 'bottom';
  return { variant, nav: main, widthShare: Math.round((box.w / vw) * 100) / 100 };
}

/**
 * On a phone width the window is wider than the app: the preview draws a 375 px frame inside a phone
 * bezel, and the window is 460 px so the bezel is not cut. The frame's own box is then the edge a block
 * must stay inside. The page's scroller, the preview frame or the app box, whichever is the width asked for
 * and narrower than the window; null at a laptop width, where the window is the edge.
 */
export function frameOf(data, width) {
  if (width >= 768) return null;
  const candidates = [(data.scrollers ?? []).find((scroller) => scroller.kind === 'page-workspace')?.box, data.frame?.box, data.app];
  return candidates.find((box) => box && Math.abs(box.w - width) <= 24 && box.w < data.viewport.w - 24) ?? null;
}

/** Findings at one width. `evidence` names the file the width's data sits in. */
export function responsiveFindings({ width, data, evidence = `responsive-${width}.json`, widest = null }) {
  const findings = [];
  const notes = [];
  const frame = frameOf(data, width);
  const left = frame ? frame.x : 0;
  const edge = frame ? right(frame) : data.viewport.w;
  const limit = frame ? `${Math.round(frame.w)}px app frame` : `${data.viewport.w}px window`;
  const at = `at ${width}px (${classOf(width)})`;
  const where = (item) => ({ blockId: item.blockId ?? null, blockType: item.blockType ?? null, inPage: item.inPage ?? true });

  // W12: nothing wider than the window.
  const sideways = data.page.scrollWidth - data.page.clientWidth;
  if (sideways > 1) {
    findings.push({ blockId: null, blockType: null, inPage: true, what: 'the page', rule: 'W12', severity: 'major', kind: 'layout', expected: `no sideways scroll ${at} (WCAG 1.4.10)`, actual: `the page scrolls sideways by ${sideways}px (${data.page.scrollWidth} wide in a ${data.page.clientWidth}px window)`, evidence: `${evidence}#page`, fix: 'find the block below that is too wide' });
  }
  for (const scroller of data.scrollers ?? []) {
    const over = scroller.scrollWidth - scroller.clientWidth;
    if (over > 1) findings.push({ blockId: null, blockType: null, inPage: true, what: `the page scroller (${scroller.kind})`, rule: 'W12', severity: 'major', kind: 'layout', expected: `the page fits its scroller ${at}`, actual: `it scrolls sideways by ${over}px`, evidence: `${evidence}#scrollers`, fix: 'find the block below that is too wide' });
  }
  const wide = (data.blocks ?? []).filter((block) => !block.inHScroll && !(block.fixed && (block.box.x >= edge || right(block.box) <= left)) && right(block.box) > left && block.box.x < edge && (right(block.box) > edge + 1 || block.box.x < left - 1));
  const reported = [];
  for (const block of [...wide].sort((a, b) => area(b.box) - area(a.box))) {
    if (reported.some((outer) => inside(block.box, outer.box))) continue;
    reported.push(block);
  }
  for (const block of reported.slice(0, ISSUES_PER_KIND)) {
    const over = Math.round(Math.max(right(block.box) - edge, left - block.box.x));
    findings.push({ ...where(block), what: block.blockType ?? 'block', rule: 'W12', severity: 'major', kind: 'layout', expected: `inside the ${limit} ${at}`, actual: `runs ${over}px past the ${block.box.x < left - 1 ? 'left' : 'right'} edge (x ${block.box.x}, w ${block.box.w})`, evidence: `${evidence}#blocks`, fix: 'width 100% or fill, a max-width, wrap or stack the row at this width (the variant\'s layout), or let the block scroll inside itself' });
  }
  if (reported.length > ISSUES_PER_KIND) notes.push(`${reported.length - ISSUES_PER_KIND} more blocks past the window edge ${at}`);

  // W13: text cut off.
  for (const text of data.texts ?? []) {
    const own = text.own ?? {};
    const cutX = /(hidden|clip)/u.test(own.overflowX) && own.scrollWidth > own.clientWidth + 1;
    const cutY = /(hidden|clip)/u.test(own.overflowY) && own.scrollHeight > own.clientHeight + 1 && (own.lineClamp === 'none' || !own.lineClamp);
    let finding = null;
    if (cutX && own.textOverflow === 'ellipsis') {
      finding = { severity: 'minor', fold: 'ellipsis', foldWhat: 'text cut with an ellipsis', actual: `cut with an ellipsis (${own.scrollWidth}px of text in ${own.clientWidth}px)`, fix: 'room for the text at this width, a wrap, or a tooltip with the whole text' };
    } else if (cutX || cutY) {
      finding = { severity: 'major', fold: 'cut', foldWhat: 'text cut off', actual: cutX ? `cut off: ${own.scrollWidth}px of text in ${own.clientWidth}px` : `cut off: ${own.scrollHeight}px of text in ${own.clientHeight}px`, fix: 'let the text wrap (white-space normal) or give it room; an ellipsis when cutting is meant' };
    } else if (text.clipBy && !text.inHScroll) {
      finding = { severity: 'major', fold: 'clipped', foldWhat: 'text clipped by its container', actual: `clipped by its container${text.clipBy.blockId ? ` ${text.clipBy.blockId}` : ''} by ${text.clipBy.overPx}px`, fix: 'a container height that fits its content (auto, or fit), or overflow visible' };
    }
    if (finding) findings.push({ ...where(text), what: 'text', rule: 'W13', kind: 'layout', expected: `the whole text shows ${at}`, evidence: `${evidence}#texts`, ...finding });
  }

  // W14: text over text.
  const all = data.texts ?? [];
  const byIndex = new Map(all.map((text) => [text.i, text]));
  // A text inside a text (inline markup in one sentence) is one text, not two that overlap.
  const nested = (a, b) => {
    for (const [inner, outer] of [[a, b], [b, a]]) for (let up = inner.parentText; up !== null && up !== undefined; up = byIndex.get(up)?.parentText) if (up === outer.i) return true;
    return a.parentText === undefined && b.parentText === undefined && (inside(a.box, b.box) || inside(b.box, a.box));
  };
  const texts = all.filter((text) => text.box.w > 0 && text.box.h > 0).sort((a, b) => a.box.y - b.box.y);
  const overlaps = [];
  for (let i = 0; i < texts.length && overlaps.length < ISSUES_PER_KIND * 3; i++) {
    const a = texts[i];
    for (let j = i + 1; j < texts.length && texts[j].box.y < bottom(a.box); j++) {
      const b = texts[j];
      if (nested(a, b)) continue;
      const shared = overlapArea(a.box, b.box);
      if (shared >= 0.25 * Math.min(area(a.box), area(b.box))) overlaps.push([a, b, shared]);
    }
  }
  for (const [a, b, shared] of overlaps.slice(0, ISSUES_PER_KIND)) {
    findings.push({ ...where(a), what: `text over text${b.blockId && b.blockId !== a.blockId ? ` (with ${b.blockId})` : ''}`, rule: 'W14', severity: 'major', kind: 'layout', expected: `texts do not overlap ${at}`, actual: `two texts share ${Math.round(shared)}px² (${Math.round((100 * shared) / Math.min(area(a.box), area(b.box)))}% of the smaller)`, evidence: `${evidence}#texts`, fix: 'a fixed height or absolute position that does not fit this width: let the row grow, or stack it' });
  }

  // W15: a navigation that fits the width.
  const nav = navVariant(data);
  if (nav.variant === 'side' && width < 768 && (nav.widthShare ?? 0) > 0.25) {
    findings.push({ ...where(nav.nav ?? {}), inPage: false, what: 'app navigation', rule: 'W15', severity: 'major', kind: 'navigation', expected: `a top bar, bottom bar or drawer ${at}`, actual: `a side bar taking ${Math.round((nav.widthShare ?? 0) * 100)}% of the width`, evidence: `${evidence}#navs`, fix: 'the app navigation\'s mobile layout: a drawer or a bottom bar for small screens' });
  }
  if (nav.variant === 'none' && widest && widest.variant !== 'none' && widest.variant !== 'drawer') {
    findings.push({ blockId: null, blockType: null, inPage: false, what: 'app navigation', rule: 'W15', severity: 'major', kind: 'navigation', expected: `a way to navigate ${at}`, actual: `no navigation and no menu button (a ${widest.variant} bar at ${widest.width}px)`, evidence: `${evidence}#navs`, fix: 'show a menu button that opens the navigation at this width' });
  }
  if (nav.nav && nav.variant === 'top' && nav.nav.scrollWidth > nav.nav.clientWidth + 1) {
    findings.push({ blockId: null, blockType: null, inPage: false, what: 'app navigation', rule: 'W15', severity: 'minor', kind: 'navigation', expected: `every navigation item shows ${at}`, actual: `the top bar's items need ${nav.nav.scrollWidth}px in ${nav.nav.clientWidth}px`, evidence: `${evidence}#navs`, fix: 'fewer top-level items, a "more" menu, or a drawer at this width' });
  }
  return { findings: foldRepeats(findings), notes, nav: { width, variant: nav.variant, share: nav.widthShare ?? null } };
}

/** Every width, the widest first so the narrower ones are compared with it. */
export function responsiveAcross(widths) {
  const sorted = [...widths].sort((a, b) => b.width - a.width);
  const widestNav = sorted.length ? { width: sorted[0].width, variant: navVariant(sorted[0].data).variant } : null;
  const findings = [];
  const notes = [];
  const navs = [];
  // One problem of one block at several widths is one issue: the widest width's, naming the others.
  const seen = new Map();
  for (const entry of sorted) {
    const result = responsiveFindings({ width: entry.width, data: entry.data, evidence: entry.evidence, widest: entry === sorted[0] ? null : widestNav });
    for (const finding of result.findings) {
      const key = `${finding.rule}|${finding.blockId ?? ''}|${finding.what}|${finding.inPage}`;
      const first = seen.get(key);
      if (first) { first.widths.push(entry.width); continue; }
      const kept = { ...finding, widths: [entry.width] };
      seen.set(key, kept);
      findings.push(kept);
    }
    notes.push(...result.notes);
    navs.push(result.nav);
  }
  return {
    findings: findings.map(({ widths: list, ...finding }) => (list.length > 1 ? { ...finding, actual: `${finding.actual}; also at ${list.slice(1).map((w) => `${w}px`).join(', ')}` } : finding)),
    notes, navs,
  };
}
