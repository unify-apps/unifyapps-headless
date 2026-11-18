#!/usr/bin/env node
// Layout signals from a capture's element dump (capture.mjs <out>.json): small targets, unlabeled controls,
// near-miss edges, the dominant margins, the type ramp, uneven gaps, overflow, text contrast, long lines and
// controls with no pointer cursor. Signals are leads a critic confirms on the screenshot, not issues.
//
//   node layout.mjs <dump.json> [--width <w>] [--json]
//
// Node 22; contrast comes from web-browser's colour library. Exit 2 on usage, 1 when the file is unreadable.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '../../../skills/web-loops/web-browser/scripts/lib');
const { contrastRatio, parseColor, requiredRatio } = await import(join(LIB, 'color.mjs'));

// WCAG 2.5.8 gives 24 CSS px as the least a target may be; 44 is what a primary action should have.
export const MIN_TARGET = 24;
export const GOOD_TARGET = 44;
// A left edge this close to a dominant edge, but not on it, is a near miss worth confirming.
const NEAR_MISS = 4;
// Lines longer than this many characters read badly (65 to 75 is comfortable; 90 is the usual ceiling).
const LONG_LINE = 90;
// How many of an edge or a gap make it a pattern.
const PATTERN = 3;

const round = (n) => Math.round(n);
const mode = (values) => {
  const tally = new Map();
  for (const v of values) tally.set(v, (tally.get(v) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
};
const where = (el) => ({ i: el.i, tag: el.tag, role: el.role, name: el.name || el.text || '', box: el.box });

/** Text contrast of one element against its effective background, with the ratio WCAG asks for. */
export function contrastOf(el) {
  const fg = parseColor(el.color);
  const bg = el.bg === 'image' ? null : parseColor(el.bg);
  if (!fg || !bg) return null;
  const ratio = Math.round(contrastRatio(fg, bg) * 100) / 100;
  const required = requiredRatio(el.font?.size ?? 16, el.font?.weight ?? '400');
  return { ratio, required, pass: ratio >= required };
}

export function layoutSignals(dump, { width = dump?.viewport?.w ?? 1440 } = {}) {
  const els = Array.isArray(dump?.elements) ? dump.elements : [];
  const content = els.filter((el) => el.box && (el.text || el.control || el.heading));
  const controls = els.filter((el) => el.control);
  const texts = els.filter((el) => el.text && el.font);

  const smallTargets = controls.filter((el) => el.box.w < MIN_TARGET || el.box.h < MIN_TARGET).map((el) => ({ ...where(el), least: MIN_TARGET }));
  const underGood = controls.filter((el) => (el.box.w < GOOD_TARGET || el.box.h < GOOD_TARGET) && !(el.box.w < MIN_TARGET || el.box.h < MIN_TARGET)).length;
  const unlabeled = controls.filter((el) => !el.name && !(el.input && el.input.labelled)).map(where);
  const unlabeledInputs = els.filter((el) => el.input && !el.input.labelled).map((el) => ({ ...where(el), placeholderOnly: Boolean(el.input.placeholder) }));
  const noPointer = controls.filter((el) => /^(button|link|tab|menuitem)$/u.test(el.role) && el.cursor !== 'pointer' && !(el.input)).map(where);

  const lefts = mode(content.map((el) => round(el.box.x)));
  const rights = mode(content.map((el) => round(width - (el.box.x + el.box.w))));
  const dominantLeftMargin = lefts[0]?.[0] ?? null;
  const dominantRightMargin = rights[0]?.[0] ?? null;
  const edges = lefts.filter(([, n]) => n >= PATTERN).map(([x]) => x);
  const misses = [];
  for (const el of content) {
    const x = round(el.box.x);
    if (edges.includes(x)) continue;
    const near = edges.find((e) => Math.abs(e - x) <= NEAR_MISS && Math.abs(e - x) > 0);
    if (near !== undefined) misses.push({ ...where(el), edge: near, off: x - near });
  }

  const sizes = new Map();
  for (const el of texts) {
    const size = Math.round(el.font.size * 2) / 2;
    if (!sizes.has(size)) sizes.set(size, { size, count: 0, weights: new Set(), samples: [] });
    const row = sizes.get(size);
    row.count += 1;
    row.weights.add(String(el.font.weight));
    if (row.samples.length < 3) row.samples.push(el.text.slice(0, 40));
  }
  const typeRamp = [...sizes.values()].sort((a, b) => b.size - a.size).map((row) => ({ ...row, weights: [...row.weights].sort() }));
  const headings = els.filter((el) => el.heading).map((el) => ({ level: el.heading, text: (el.text || el.name).slice(0, 60), size: el.font?.size ?? null }));
  const headingOrder = [];
  for (let k = 1; k < headings.length; k++) if (headings[k].level > headings[k - 1].level + 1) headingOrder.push({ from: headings[k - 1], to: headings[k] });

  const byY = [...content].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const gaps = [];
  for (let k = 1; k < byY.length; k++) {
    const prev = byY[k - 1]; const cur = byY[k];
    const gap = round(cur.box.y - (prev.box.y + prev.box.h));
    if (gap > 0 && gap < 200) gaps.push(gap);
  }
  const rhythm = mode(gaps).slice(0, 6).map(([gap, count]) => ({ gap, count }));
  const common = rhythm.filter((r) => r.count >= PATTERN).map((r) => r.gap);
  const unevenGaps = mode(gaps).filter(([gap, count]) => count < PATTERN && common.some((c) => Math.abs(c - gap) > 0 && Math.abs(c - gap) <= NEAR_MISS)).map(([gap, count]) => ({ gap, count, near: common.find((c) => Math.abs(c - gap) <= NEAR_MISS) }));

  const overflow = els.filter((el) => el.box && (el.box.x + el.box.w > width + 1 || el.box.x < -1)).map((el) => ({ ...where(el), right: round(el.box.x + el.box.w), width }));
  const contrast = texts.map((el) => ({ ...where(el), ...(contrastOf(el) ?? {}), color: el.color, bg: el.bg, size: el.font.size, weight: el.font.weight })).filter((c) => c.ratio !== undefined);
  const contrastFails = contrast.filter((c) => !c.pass);
  const longLines = texts.filter((el) => {
    const lineHeight = parseFloat(el.font.lineHeight) || el.font.size * 1.3;
    const chars = el.box.w / (el.font.size * 0.5);
    return el.box.h > lineHeight * 1.5 && chars > LONG_LINE;
  }).map((el) => ({ ...where(el), chars: round(el.box.w / (el.font.size * 0.5)) }));
  const fonts = mode(texts.map((el) => el.font.family).filter(Boolean)).map(([family, count]) => ({ family, count }));

  return {
    width, viewport: dump?.viewport ?? null, page: dump?.page ?? null, elements: els.length, controls: controls.length, truncated: Boolean(dump?.truncated),
    smallTargets, underGoodTarget: underGood, unlabeled, unlabeledInputs, noPointer,
    dominantLeftMargin, dominantRightMargin, edges, misses,
    typeRamp, fonts, headings, headingOrder, rhythm, unevenGaps,
    overflow, overflowX: Boolean(dump?.page?.overflowX), contrastFails, contrastChecked: contrast.length, longLines,
  };
}

export function main(argv = process.argv.slice(2)) {
  const file = argv.find((a) => !a.startsWith('--'));
  const widthAt = argv.indexOf('--width');
  if (!file) { process.stderr.write('usage: layout.mjs <dump.json> [--width <w>] [--json]\n'); process.exit(2); }
  let dump;
  try { dump = JSON.parse(readFileSync(resolve(file), 'utf8')); } catch (error) { process.stderr.write(`cannot read ${file}: ${error.message}\n`); process.exit(1); }
  const signals = layoutSignals(dump, widthAt >= 0 ? { width: Number(argv[widthAt + 1]) } : {});
  process.stdout.write(`${JSON.stringify(signals, null, argv.includes('--json') ? 0 : 1)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
