// Every visible node with a size becomes an element: kind, key, parent, previous sibling, flow and box.
import { slug } from '../args.mjs';
import { isShapeTag } from './positions.mjs';
import { flowOf } from './regions.mjs';

const IMAGE_NAME = /\b(image|photo|picture|avatar|thumbnail|banner|poster|cover|img|logo|illustration)\b/i;
const ICON_NAME = /\b(icon|chevron|arrow|glyph|check|cross|close|dot|pin|bell|star)\b/i;
const ICON_MAX = 48;

const hasTextInside = (node) => node.tag === 'text' || node.children.some(hasTextInside);

export function kindOf(node) {
  if (node.tag === 'text') return 'text';
  if (node.imageFill || IMAGE_NAME.test(node.name)) return 'image';
  if (isShapeTag(node.tag)) {
    if (node.children.length === 0 && node.w <= ICON_MAX && node.h <= ICON_MAX) return 'icon';
    if (node.children.length === 0) return 'shape';
  }
  if (!hasTextInside(node) && node.w <= ICON_MAX && node.h <= ICON_MAX && (ICON_NAME.test(node.name) || node.tag === 'instance' || node.children.length > 0)) return 'icon';
  if (node.children.length > 0 || node.tag === 'instance' || node.tag === 'frame' || node.tag === 'group' || node.tag === 'section') return 'container';
  return 'shape';
}

export function orderedChildren(node, flow) {
  const children = node.children.filter((child) => child.w > 0 && child.h > 0);
  if (flow === 'column') return [...children].sort((a, b) => a.abs.y - b.abs.y || a.order - b.order);
  if (flow === 'row') return [...children].sort((a, b) => a.abs.x - b.abs.x || a.order - b.order);
  return children;
}

export function centeredIn(node, parent) {
  if (!parent) return { x: false, y: false };
  const left = node.abs.x - parent.abs.x, right = parent.abs.x + parent.abs.w - (node.abs.x + node.abs.w);
  const top = node.abs.y - parent.abs.y, bottom = parent.abs.y + parent.abs.h - (node.abs.y + node.abs.h);
  return { x: Math.abs(left - right) <= 1 && left > 0.5 && node.abs.w < parent.abs.w - 1, y: Math.abs(top - bottom) <= 1 && top > 0.5 && node.abs.h < parent.abs.h - 1 };
}

// Walks each region in flow order and returns { regions, elements } with ids r1.. and e1..
export function buildElements(regionNodes, regionKeys) {
  const regions = [];
  const elements = [];
  const usedKeys = new Set();
  const keyFor = (base) => { let key = base; let suffix = 2; while (usedKeys.has(key)) key = `${base}#${suffix++}`; usedKeys.add(key); return key; };
  regionNodes.forEach((regionNode, index) => {
    const regionId = `r${index + 1}`;
    const regionKeyText = regionKeys[index];
    const region = { id: regionId, key: regionKeyText, node: regionNode, elementIds: [] };
    regions.push(region);
    const add = (node, parentElement, prevElement, flow) => {
      const element = {
        id: `e${elements.length + 1}`, region: regionId, node,
        key: parentElement ? keyFor(`${regionKeyText}/${slug(node.name)}`) : keyFor(regionKeyText),
        name: node.name, figmaNodeId: node.id, kind: kindOf(node),
        parent: parentElement?.id ?? null, prevSibling: prevElement?.id ?? null, flow,
        visible: node.visible, figma: { ...node.abs }, centered: centeredIn(node, node.parent && parentElement ? node.parent : null),
      };
      elements.push(element);
      region.elementIds.push(element.id);
      const childFlow = flowOf(node);
      element.childFlow = childFlow;
      let previous = null;
      for (const child of orderedChildren(node, childFlow)) { previous = add(child, element, previous, childFlow); }
      return element;
    };
    add(regionNode, null, null, 'column');
  });
  return { regions, elements };
}
