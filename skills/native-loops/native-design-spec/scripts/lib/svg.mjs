// A modest read of a Figma SVG export: drop shadows, blurs, gradients and rounded rects, each with the box
// it paints, so a spec element at the same place can take them. Never read by the model; a 52 MB
// export is scanned with regexes in a few seconds. Layer names are not in an SVG unless the export
// included ids, so everything matches by geometry.
import { normalizeColor } from './color.mjs';

const MAX_BYTES = 96 * 1024 * 1024;

function numbers(text) { return [...String(text).matchAll(/-?\d*\.?\d+(?:e-?\d+)?/g)].map((match) => Number(match[0])); }

// Bounding box of a path's coordinates: Figma writes absolute commands, so the extremes of the pairs are the box.
function pathBox(d) {
  const values = numbers(d.replace(/[a-zA-Z]/g, ' '));
  if (values.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let index = 0; index + 1 < values.length; index += 2) {
    minX = Math.min(minX, values[index]); maxX = Math.max(maxX, values[index]);
    minY = Math.min(minY, values[index + 1]); maxY = Math.max(maxY, values[index + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function attrs(text) {
  const out = {};
  for (const match of text.matchAll(/([\w:-]+)="([^"]*)"/g)) out[match[1]] = match[2];
  return out;
}

export function parseSvgExport(source) {
  const text = String(source).slice(0, MAX_BYTES);
  const filters = {};
  for (const match of text.matchAll(/<filter\s+([^>]*)>([\s\S]*?)<\/filter>/g)) {
    const meta = attrs(match[1]);
    const body = match[2];
    const blur = [...body.matchAll(/stdDeviation="([\d.]+)"/g)].map((item) => Number(item[1]));
    const offsetTag = /<feOffset\b([^>]*)>/.exec(body);
    const offset = offsetTag ? attrs(offsetTag[1]) : {};
    const colorMatrix = /<feColorMatrix[^>]*values="([^"]+)"/.exec(body);
    const flood = /<feFlood[^>]*flood-color="([^"]+)"(?:[^>]*flood-opacity="([\d.]+)")?/.exec(body);
    const isShadow = /dropShadow|<feOffset/i.test(body) || /shadow/i.test(meta.id ?? '');
    let color = null;
    if (flood) color = normalizeColor(flood[1]);
    else if (colorMatrix) { const values = numbers(colorMatrix[1]); if (values.length >= 20) color = normalizeColor(`rgba(${Math.round(values[4] * 255)},${Math.round(values[9] * 255)},${Math.round(values[14] * 255)},${values[18]})`); }
    filters[meta.id] = {
      id: meta.id,
      kind: isShadow ? 'shadow' : blur.length ? 'blur' : 'other',
      shadow: isShadow ? { x: Number(offset.dx ?? 0), y: Number(offset.dy ?? 0), blur: (blur[0] ?? 0) * 2, spread: 0, color } : null,
      blur: !isShadow && blur.length ? blur[0] * 2 : null,
    };
  }
  const gradients = {};
  for (const match of text.matchAll(/<(linear|radial)Gradient\s+([^>]*)>([\s\S]*?)<\/\1Gradient>/g)) {
    const meta = attrs(match[2]);
    const stops = [...match[3].matchAll(/<stop\s+([^>]*)\/?>/g)].map((stop) => {
      const stopAttrs = attrs(stop[1]);
      const opacity = stopAttrs['stop-opacity'] !== undefined ? Number(stopAttrs['stop-opacity']) : 1;
      const base = normalizeColor(stopAttrs['stop-color'] ?? 'black') ?? '#000000FF';
      const alpha = Math.round(parseInt(base.slice(7, 9), 16) * opacity).toString(16).padStart(2, '0').toUpperCase();
      return { offset: stopAttrs.offset !== undefined ? Number(stopAttrs.offset) : null, color: base.slice(0, 7) + alpha };
    });
    gradients[meta.id] = { id: meta.id, type: match[1], stops, meta };
  }
  const shapes = [];
  const use = (box, shapeAttrs) => {
    if (!box || box.w <= 0 || box.h <= 0) return;
    const filter = /url\(#([^)]+)\)/.exec(shapeAttrs.filter ?? '')?.[1] ?? null;
    const fillRef = /url\(#([^)]+)\)/.exec(shapeAttrs.fill ?? '')?.[1] ?? null;
    shapes.push({ box, rx: shapeAttrs.rx !== undefined ? Number(shapeAttrs.rx) : null, fill: normalizeColor(shapeAttrs.fill ?? ''), fillOpacity: shapeAttrs['fill-opacity'] !== undefined ? Number(shapeAttrs['fill-opacity']) : null, gradient: fillRef && gradients[fillRef] ? gradients[fillRef] : null, filter: filter && filters[filter] ? filters[filter] : null, stroke: normalizeColor(shapeAttrs.stroke ?? ''), strokeWidth: shapeAttrs['stroke-width'] !== undefined ? Number(shapeAttrs['stroke-width']) : null });
  };
  // a <g filter> group lends its filter to the first shape inside it
  let pendingFilter = null;
  for (const match of text.matchAll(/<(g|rect|path|circle|ellipse)\s+([^>]*?)\/?>/g)) {
    const shapeAttrs = attrs(match[2]);
    if (match[1] === 'g') { pendingFilter = shapeAttrs.filter ?? null; continue; }
    if (pendingFilter && !shapeAttrs.filter) { shapeAttrs.filter = pendingFilter; pendingFilter = null; }
    if (match[1] === 'rect') use({ x: Number(shapeAttrs.x ?? 0), y: Number(shapeAttrs.y ?? 0), w: Number(shapeAttrs.width ?? 0), h: Number(shapeAttrs.height ?? 0) }, shapeAttrs);
    else if (match[1] === 'path') use(pathBox(shapeAttrs.d ?? ''), shapeAttrs);
    else if (match[1] === 'circle') { const r = Number(shapeAttrs.r ?? 0); use({ x: Number(shapeAttrs.cx) - r, y: Number(shapeAttrs.cy) - r, w: 2 * r, h: 2 * r }, { ...shapeAttrs, rx: r }); }
    else if (match[1] === 'ellipse') { const rx = Number(shapeAttrs.rx ?? 0), ry = Number(shapeAttrs.ry ?? 0); use({ x: Number(shapeAttrs.cx) - rx, y: Number(shapeAttrs.cy) - ry, w: 2 * rx, h: 2 * ry }, { ...shapeAttrs, rx }); }
  }
  const root = /<svg\s+([^>]*)>/.exec(text);
  const rootAttrs = root ? attrs(root[1]) : {};
  return { width: Number(rootAttrs.width ?? 0) || null, height: Number(rootAttrs.height ?? 0) || null, shapes, filters: Object.values(filters).length, gradients: Object.values(gradients).length, truncated: source.length > MAX_BYTES };
}

// The shapes drawn at one box (frame coordinates), nearest first.
export function shapesAt(svg, box, tolerance = 1.5) {
  const hits = [];
  for (const shape of svg.shapes) {
    const cost = Math.abs(shape.box.x - box.x) + Math.abs(shape.box.y - box.y) + Math.abs(shape.box.w - box.w) + Math.abs(shape.box.h - box.h);
    if (cost <= tolerance * 4) hits.push({ shape, cost });
  }
  return hits.sort((a, b) => a.cost - b.cost).map((hit) => hit.shape);
}
