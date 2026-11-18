// Finds, for each element, the design-context record, the CSS export layer and the SVG shape that describe it.
// Order of trust: node id, then the text itself, then name plus size, then position plus size.
import { shapesAt } from '../svg.mjs';

const near = (a, b, tolerance = 1) => a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) <= tolerance;
const sameSize = (record, node) => near(record.props.width, node.w) && near(record.props.height, node.h);
const normText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function index(records, keyOf) {
  const map = new Map();
  for (const record of records) {
    const key = keyOf(record);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

export function attachSources(elements, { designContext = null, css = [], svg = null } = {}) {
  const dcRecords = designContext?.records ?? [];
  const dcById = index(dcRecords, (record) => record.nodeId);
  const dcByText = index(dcRecords.filter((record) => record.text), (record) => normText(record.text));
  const dcByName = index(dcRecords, (record) => record.name && normText(record.name));
  const cssByName = index(css, (record) => normText(record.name));
  const cssByText = index(css.filter((record) => record.kindHint === 'text'), (record) => normText(record.text));
  const takenCss = new Set();
  const takenDc = new Set();

  const take = (taken, candidates, pick) => {
    const free = candidates.filter((record) => !taken.has(record));
    const chosen = pick(free.length ? free : candidates);
    if (chosen) taken.add(chosen);
    return chosen ?? null;
  };

  for (const element of elements) {
    const node = element.node;
    const matched = {};
    let dc = take(takenDc, dcById.get(node.id) ?? [], (list) => list[0]);
    if (dc) matched.designContext = 'node-id';
    if (!dc && element.kind === 'text') { dc = take(takenDc, dcByText.get(normText(node.name)) ?? [], (list) => (list.length === 1 ? list[0] : list.find((record) => sameSize(record, node)) ?? null)); if (dc) matched.designContext = 'text'; }
    if (!dc) { dc = take(takenDc, dcByName.get(normText(node.name)) ?? [], (list) => list.find((record) => sameSize(record, node)) ?? (list.length === 1 ? list[0] : null)); if (dc) matched.designContext = 'name'; }

    let cssRecord = take(takenCss, cssByName.get(normText(node.name)) ?? [], (list) => list.find((record) => sameSize(record, node)) ?? null);
    if (cssRecord) matched.css = 'name+size';
    if (!cssRecord) { cssRecord = take(takenCss, cssByName.get(normText(node.name)) ?? [], (list) => (list.length === 1 ? list[0] : null)); if (cssRecord) matched.css = 'name'; }
    if (!cssRecord && element.kind === 'text') { cssRecord = take(takenCss, cssByText.get(normText(node.name)) ?? [], (list) => list[0]); if (cssRecord) matched.css = 'text'; }
    if (!cssRecord && element.parent) {
      cssRecord = take(takenCss, css, (list) => list.find((record) => sameSize(record, node) && near(record.props.left, node.rel.x) && near(record.props.top, node.rel.y)) ?? null);
      if (cssRecord) matched.css = 'position+size';
    }

    const shapes = svg ? shapesAt(svg, element.figma) : [];
    if (shapes.length) matched.svg = 'geometry';
    element.sources = { designContext: dc, css: cssRecord, svg: shapes[0] ?? null, matchedBy: matched };
  }
  return elements;
}
