// Reads the metadata tree into flat nodes and settles whether x/y are absolute or parent-relative.
import { rootElement } from '../xml.mjs';

const SHAPE_TAGS = new Set(['rectangle', 'rounded-rectangle', 'ellipse', 'line', 'vector', 'boolean-operation', 'star', 'polygon', 'regular-polygon']);

export function readNodes(document) {
  const root = rootElement(document);
  if (!root) throw new Error('metadata has no root element');
  const nodes = [];
  const visit = (element, parent, depth) => {
    const node = {
      id: element.attrs.id ?? `n${nodes.length}`,
      tag: element.tag.toLowerCase(),
      name: element.attrs.name ?? element.tag,
      x: Number(element.attrs.x ?? 0), y: Number(element.attrs.y ?? 0),
      w: Number(element.attrs.width ?? 0), h: Number(element.attrs.height ?? 0),
      visible: element.attrs.visible === undefined ? true : element.attrs.visible !== 'false',
      parent, children: [], depth, order: nodes.length,
    };
    nodes.push(node);
    if (parent) parent.children.push(node);
    for (const child of element.children) if (child.tag[0] !== '#') visit(child, node, depth + 1);
    return node;
  };
  const rootNode = visit(root, null, 0);
  return { root: rootNode, nodes };
}

const inside = (child, parentBox) => child.x >= parentBox.x - 0.5 && child.y >= parentBox.y - 0.5 && child.x + child.w <= parentBox.x + parentBox.w + 0.5 && child.y + child.h <= parentBox.y + parentBox.h + 0.5;

// Share of children that lie inside their parent under each reading. Figma's metadata is parent-relative
// (95.6% inside on a measured login section against 21% absolute), but the script measures rather than assumes.
export function detectPositions(nodes, cssRecords = []) {
  let relative = 0, absolute = 0, total = 0;
  for (const node of nodes) {
    if (!node.parent || node.w <= 0 || node.h <= 0) continue;
    total++;
    if (inside(node, { x: 0, y: 0, w: node.parent.w, h: node.parent.h })) relative++;
    if (inside(node, node.parent)) absolute++;
  }
  const result = { mode: relative >= absolute ? 'relative' : 'absolute', relativeShare: total ? relative / total : null, absoluteShare: total ? absolute / total : null, evidence: 'containment', confident: total ? Math.max(relative, absolute) / total >= 0.95 : false };
  // A CSS export writes left/top relative to the parent; where names match the export settles it.
  const byName = new Map();
  for (const record of cssRecords) if (record.props.left !== null && record.props.left !== undefined && record.props.top !== null && record.props.top !== undefined) byName.set(record.name, record);
  let agreeRelative = 0, agreeAbsolute = 0;
  for (const node of nodes) {
    const record = node.parent && byName.get(node.name);
    if (!record || Math.abs((record.props.width ?? node.w) - node.w) > 1) continue;
    if (Math.abs(record.props.left - node.x) <= 1 && Math.abs(record.props.top - node.y) <= 1) agreeRelative++;
    if (Math.abs(record.props.left - (node.x - node.parent.x)) <= 1 && Math.abs(record.props.top - (node.y - node.parent.y)) <= 1) agreeAbsolute++;
  }
  if (agreeRelative + agreeAbsolute >= 3 && agreeRelative !== agreeAbsolute) {
    result.mode = agreeRelative > agreeAbsolute ? 'relative' : 'absolute';
    result.evidence = 'css';
    result.cssAgreement = { relative: agreeRelative, absolute: agreeAbsolute };
    result.confident = true;
  }
  return result;
}

// `abs` is the box in frame coordinates (root at 0,0); `rel` is the box inside the parent.
export function placeNodes(root, mode) {
  const visit = (node) => {
    if (!node.parent) { node.abs = { x: 0, y: 0, w: node.w, h: node.h }; node.rel = { x: 0, y: 0, w: node.w, h: node.h }; }
    else if (mode === 'relative') { node.abs = { x: node.parent.abs.x + node.x, y: node.parent.abs.y + node.y, w: node.w, h: node.h }; node.rel = { x: node.x, y: node.y, w: node.w, h: node.h }; }
    else { node.abs = { x: node.x - root.x, y: node.y - root.y, w: node.w, h: node.h }; node.rel = { x: node.x - node.parent.x, y: node.y - node.parent.y, w: node.w, h: node.h }; }
    for (const child of node.children) visit(child);
  };
  visit(root);
}

export const isShapeTag = (tag) => SHAPE_TAGS.has(tag);
