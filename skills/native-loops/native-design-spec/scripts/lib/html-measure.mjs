// Turns the JSON measure-html.snippet.js returns (loops.design.html-measure/1) into the same inputs the Figma
// path gives the spec builder: a frame tree in the parseXml shape and one style record per node.
import { readFileSync } from 'node:fs';
import { propsFromDeclarations } from './css.mjs';

export const MEASURE_SCHEMA = 'loops.design.html-measure/1';
// A prototype often draws the phone's own bars; they are dropped like Figma's status bar layers.
export const HTML_EXCLUDE = 'status[ _-]?bar|home[ _-]?indicator|dynamic[ _-]?island|notch';

// browser_evaluate's `filename` may hold the returned string quoted once more, or wrapped in text.
export function parseMeasure(text) {
  let value = String(text).trim();
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth++) {
    try { value = JSON.parse(value); continue; } catch { /* not JSON as a whole */ }
    const start = value.indexOf('{'), end = value.lastIndexOf('}');
    if (start < 0 || end <= start) break;
    try { value = JSON.parse(value.slice(start, end + 1)); } catch { break; }
  }
  if (!value || typeof value !== 'object' || !Array.isArray(value.nodes)) throw new Error('not an HTML measure: expected the JSON measure-html.snippet.js returns (an object with nodes[])');
  if (value.schema && value.schema !== MEASURE_SCHEMA) throw new Error(`measure schema ${value.schema}, expected ${MEASURE_SCHEMA}`);
  return value;
}

export function readMeasure(file) { return parseMeasure(readFileSync(file, 'utf8')); }

const TAG_OF = { text: 'text', image: 'rectangle', vector: 'vector', container: 'frame', box: 'rectangle' };

// The computed style the snippet reads, as the declarations css.mjs understands.
export function declarationsOf(style = {}) {
  const decl = {};
  const keep = ['font-size', 'font-weight', 'font-family', 'color', 'text-transform', 'text-align', 'border-radius', 'opacity', 'display', 'flex-direction', 'gap', 'white-space'];
  for (const key of keep) if (style[key] !== undefined && style[key] !== '') decl[key] = style[key];
  const size = parseFloat(style['font-size']);
  if (style['line-height'] && style['line-height'] !== 'normal') decl['line-height'] = style['line-height'];
  else if (Number.isFinite(size)) decl['line-height'] = `${Math.round(size * 1.2)}px`;
  decl['letter-spacing'] = !style['letter-spacing'] || style['letter-spacing'] === 'normal' ? '0px' : style['letter-spacing'];
  const layers = [];
  if (style['background-image'] && style['background-image'] !== 'none') layers.push(style['background-image']);
  if (style['background-color'] && !/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(style['background-color'])) layers.push(style['background-color']);
  if (layers.length) decl.background = layers.join(', ');
  if (style['box-shadow'] && style['box-shadow'] !== 'none') decl['box-shadow'] = style['box-shadow'];
  if (style.filter && style.filter !== 'none') decl.filter = style.filter;
  if (style['backdrop-filter'] && style['backdrop-filter'] !== 'none') decl['backdrop-filter'] = style['backdrop-filter'];
  const borderWidth = parseFloat(style['border-width']);
  if (borderWidth > 0 && style['border-style'] && style['border-style'] !== 'none') decl.border = `${style['border-width']} ${style['border-style']} ${style['border-color'] ?? ''}`.trim();
  if (style.padding) decl.padding = style.padding;
  if (decl['border-radius'] && /^(0px ?)+$/.test(decl['border-radius'].trim() + ' ')) delete decl['border-radius'];
  return decl;
}

/**
 * Returns { document, records, imageIds, pinnedTop, pinnedBottom, notes, frame }.
 * Element boxes come in page coordinates relative to the measured root; the tree gets parent-relative x/y,
 * which is how Figma metadata reads, so the builder places it with `positions: relative`.
 */
export function measureToSources(measure, { pageName, platform = null } = {}) {
  // A WEB page has no phone bars: nothing is kept for a status band, and nothing is dropped as one.
  const web = String(platform ?? '').toLowerCase() === 'web';
  const notes = [];
  if (measure.truncated) notes.push(`the measure stopped at ${measure.nodes.length} nodes; measure a smaller container (browser_evaluate target)`);
  const frame = { w: Number(measure.root?.w ?? measure.viewport?.width ?? 0), h: Number(measure.root?.h ?? measure.viewport?.height ?? 0) };
  if (!(frame.w > 0 && frame.h > 0)) throw new Error('the measure has no root size');
  const viewportH = Number(measure.viewport?.height ?? frame.h);
  // An empty box that paints nothing (a spacer) has nothing to measure on the device; a phone bar placeholder
  // stays, because it sets the status band.
  const bar = web ? null : new RegExp(HTML_EXCLUDE, 'i');
  const paints = (node) => { const props = propsFromDeclarations(declarationsOf(node.style)); return Boolean(props.fill || props.gradient || props.image || props.border || props.shadow); };
  const kept = measure.nodes.filter((node) => node.kind !== 'box' || paints(node) || Boolean(bar?.test(node.name ?? '')));
  const byId = new Map(kept.map((node) => [node.id, { ...node, children: [] }]));
  const pinnedTop = [], pinnedBottom = [];
  // A fixed bar sits at the bottom of the window, not of the page: it goes to the bottom of the frame, pinned.
  for (const node of byId.values()) {
    if (node.parent || node.style?.position !== 'fixed') continue;
    const escaped = `^${String(node.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
    if (node.y + node.h >= viewportH - 2 && node.y > viewportH / 2) {
      const shift = frame.h - viewportH;
      const move = (item) => { item.y += shift; for (const child of kept.filter((candidate) => candidate.parent === item.id)) move(byId.get(child.id)); };
      move(node);
      pinnedBottom.push(escaped);
    } else if (node.y <= 2) pinnedTop.push(escaped);
  }
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : null;
    if (parent) parent.children.push(node); else roots.push(node);
  }
  const imageIds = new Set();
  const toElement = (node, parentBox) => {
    if (node.kind === 'image') imageIds.add(node.id);
    return {
      tag: TAG_OF[node.kind] ?? 'frame',
      attrs: { id: node.id, name: node.name || node.tag || node.id, x: String(node.x - parentBox.x), y: String(node.y - parentBox.y), width: String(node.w), height: String(node.h) },
      children: node.children.map((child) => toElement(child, node)),
      text: '',
    };
  };
  const rootElement = {
    tag: 'frame',
    attrs: { id: 'root', name: pageName ?? measure.title ?? measure.root?.name ?? 'screen', x: '0', y: '0', width: String(frame.w), height: String(frame.h) },
    children: roots.map((node) => toElement(node, { x: 0, y: 0 })),
    text: '',
  };
  const records = kept.map((node, order) => {
    const props = propsFromDeclarations(declarationsOf(node.style));
    if (node.kind === 'image') props.image = true;
    const record = { name: node.name ?? null, nodeId: node.id, source: 'html', order, tag: node.tag, props };
    if (node.kind === 'text') { record.text = node.text ?? node.name; record.kindHint = 'text'; }
    if (node.placeholder) record.placeholder = true;
    return record;
  });
  const background = propsFromDeclarations(declarationsOf(measure.root?.style ?? {})).fill ?? null;
  return { document: { tag: '#document', attrs: {}, children: [rootElement], text: '' }, records, imageIds, pinnedTop, pinnedBottom, notes, frame, background };
}
