// Screens as design sources: normalise any picture to a PNG reference, sample its colours, and turn the boxes a
// person or the session marked on it into the frame tree the spec builder reads. What a picture cannot say
// (fonts, line heights, letter-spacing, exact paddings between unmarked things) stays out of the spec.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasSips, isPng, readIhdr } from './png.mjs';
import { decodePngFile, resize, writePngFile } from '../../../native-visual-check/scripts/lib/png.mjs';

export const IMAGE_EXT = /\.(png|jpe?g|heic|webp|gif|tiff?|bmp)$/i;

function sips(args) { execFileSync('sips', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 }); }

/**
 * Writes `out` as a PNG no wider than `maxWidth` px. A PNG is copied (or resized in pure JS when it is too wide
 * and decodable); anything else needs macOS sips. Returns { width, height, tool }.
 */
export function toReferencePng(src, out, { maxWidth = null } = {}) {
  if (!existsSync(src)) throw new Error(`${src} does not exist`);
  mkdirSync(path.dirname(out), { recursive: true });
  const png = isPng(src);
  if (!png && !hasSips()) throw new Error(`${path.basename(src)} is not a PNG and sips (macOS) is not here to convert it; export the screen as PNG`);
  const before = png ? readIhdr(src) : null;
  if (png && (!maxWidth || before.width <= maxWidth)) {
    if (path.resolve(src) !== path.resolve(out)) copyFileSync(src, out);
    return { width: before.width, height: before.height, tool: 'copy' };
  }
  if (hasSips()) {
    const args = ['-s', 'format', 'png'];
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'design-png-'));
    const staged = path.join(tmp, 'out.png');
    try {
      sips([...args, src, '--out', staged]);
      const size = readIhdr(staged);
      if (maxWidth && size.width > maxWidth) sips(['--resampleWidth', String(maxWidth), staged, '--out', staged]);
      copyFileSync(staged, out);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const after = readIhdr(out);
    return { width: after.width, height: after.height, tool: 'sips' };
  }
  const image = decodePngFile(src);
  if (!image) throw new Error(`${path.basename(src)} is a PNG kind this reader cannot decode (palette or 16-bit) and sips is not here`);
  const small = resize(image, maxWidth);
  writePngFile(out, small);
  return { width: small.width, height: small.height, tool: 'resize' };
}

const hex2 = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
export const hexOf = ({ r, g, b, a = 255 }) => `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;

/**
 * The most common colours inside `rect` (image pixels; whole image when absent), most frequent first. Exact
 * colours are counted, then shades within `near` per channel join the more frequent colour (JPEG noise,
 * anti-aliasing), which keeps a white card apart from an off-white page. `inset` trims the rect so edges and
 * borders do not vote.
 */
export function dominantColors(image, rect = null, { top = 5, inset = 0.15, near = 8, maxSamples = 40000 } = {}) {
  const r0 = rect ?? { x: 0, y: 0, w: image.width, h: image.height };
  const dx = r0.w * inset, dy = r0.h * inset;
  const x1 = Math.max(0, Math.floor(r0.x + dx)), y1 = Math.max(0, Math.floor(r0.y + dy));
  const x2 = Math.min(image.width, Math.ceil(r0.x + r0.w - dx)), y2 = Math.min(image.height, Math.ceil(r0.y + r0.h - dy));
  if (x2 <= x1 || y2 <= y1) return [];
  const step = Math.max(1, Math.floor(Math.sqrt(((x2 - x1) * (y2 - y1)) / maxSamples)));
  const counts = new Map();
  let total = 0;
  for (let y = y1; y < y2; y += step) {
    for (let x = x1; x < x2; x += step) {
      const offset = (y * image.width + x) * 4;
      const key = image.data.readUInt32BE(offset);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  const channels = (key) => ({ r: key >>> 24, g: (key >>> 16) & 255, b: (key >>> 8) & 255, a: key & 255 });
  const clusters = [];
  for (const [key, n] of [...counts.entries()].sort((left, right) => right[1] - left[1])) {
    const colour = channels(key);
    const home = clusters.find((cluster) => Math.abs(cluster.r - colour.r) <= near && Math.abs(cluster.g - colour.g) <= near && Math.abs(cluster.b - colour.b) <= near && Math.abs(cluster.a - colour.a) <= near);
    if (home) home.n += n; else clusters.push({ ...colour, n });
  }
  return clusters.sort((left, right) => right.n - left.n).slice(0, top).map((cluster) => ({ color: hexOf(cluster), share: Number((cluster.n / total).toFixed(3)) }));
}

const distance = (a, b) => Math.max(...[1, 3, 5].map((at) => Math.abs(parseInt(a.slice(at, at + 2), 16) - parseInt(b.slice(at, at + 2), 16))));

/** The text colour inside a text box: the most common colour that stands apart from the box's background. */
export function textColor(image, rect) {
  const colours = dominantColors(image, rect, { top: 6, inset: 0 });
  if (colours.length < 2) return null;
  return colours.slice(1).find((item) => distance(item.color, colours[0].color) > 48)?.color ?? null;
}

export function readImage(file) {
  try { return { image: decodePngFile(file), error: null }; } catch (error) { return { image: null, error: error.message }; }
}

const KIND_TAG = { text: 'text', image: 'rectangle', icon: 'vector', container: 'frame', shape: 'rectangle' };
const contains = (outer, inner) => inner !== outer && inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5 && outer.w * outer.h > inner.w * inner.h;

/**
 * Marked boxes -> { document, records, imageIds, notes }. `boxes` is [{ name, kind?, x, y, w, h, unit?: 'pt'|'px',
 * text?, fontSize?, lineHeight?, fontWeight?, color?, fill?, radius? }] in frame points (px divided by `pxPerPt`).
 * A box inside another becomes its child. A box without `fill` gets the colour sampled from the picture.
 */
export function boxesToSources(boxes, { frame, pxPerPt, image = null, pageName = 'screen' }) {
  const notes = [];
  const list = boxes.map((box, index) => {
    const k = box.unit === 'px' ? 1 / pxPerPt : 1;
    return { ...box, id: box.id ?? `m${index + 1}`, name: box.name ?? box.text ?? `box ${index + 1}`, kind: box.kind ?? (box.text ? 'text' : 'container'), x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k, children: [] };
  });
  if (!list.length) {
    list.push({ id: 'm1', name: 'Screen', kind: 'container', x: 0, y: 0, w: frame.w, h: frame.h, children: [], whole: true });
    notes.push('no boxes were marked: the spec has one region for the whole screen; judge the rest from screens/<page>.png');
  }
  const roots = [];
  for (const box of list) {
    const parents = list.filter((candidate) => contains(candidate, box)).sort((a, b) => a.w * a.h - b.w * b.h);
    box.parentBox = parents[0] ?? null;
    if (box.parentBox) box.parentBox.children.push(box); else roots.push(box);
  }
  const imageIds = new Set();
  const toElement = (box, parent) => {
    if (box.kind === 'image') imageIds.add(box.id);
    return {
      tag: KIND_TAG[box.kind] ?? 'frame',
      attrs: { id: box.id, name: box.name, x: String(box.x - (parent?.x ?? 0)), y: String(box.y - (parent?.y ?? 0)), width: String(box.w), height: String(box.h) },
      children: box.children.sort((a, b) => a.y - b.y || a.x - b.x).map((child) => toElement(child, box)),
      text: '',
    };
  };
  const document = { tag: '#document', attrs: {}, children: [{ tag: 'frame', attrs: { id: 'root', name: pageName, x: '0', y: '0', width: String(frame.w), height: String(frame.h) }, children: roots.map((box) => toElement(box, null)), text: '' }], text: '' };
  const records = list.map((box, order) => {
    const props = {};
    const propSources = {};
    for (const key of ['fontSize', 'lineHeight', 'fontWeight', 'color']) if (box[key] !== undefined) props[key] = box[key];
    const pixels = { x: box.x * pxPerPt, y: box.y * pxPerPt, w: box.w * pxPerPt, h: box.h * pxPerPt };
    if (image && box.kind === 'text' && box.color === undefined) {
      const sampled = textColor(image, pixels);
      if (sampled) { props.color = sampled; propSources.color = { source: 'screenshot', judge: 'visual', approx: true }; }
    }
    if (box.radius !== undefined) props.borderRadius = box.radius;
    if (box.fill !== undefined) props.fill = box.fill;
    else if (image && box.kind !== 'text' && box.kind !== 'image') {
      const sampled = dominantColors(image, pixels, { top: 1 })[0];
      if (sampled) { props.fill = sampled.color; propSources.fill = { source: 'screenshot', judge: 'visual', approx: true }; }
    }
    if (box.kind === 'image') props.image = true;
    const record = { name: box.name, nodeId: box.id, source: 'marked', order, props, propSources };
    if (box.kind === 'text') { record.text = box.text ?? box.name; record.kindHint = 'text'; }
    return record;
  });
  return { document, records, imageIds, notes };
}
