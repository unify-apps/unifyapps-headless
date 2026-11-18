// Regions are the top-level parts of the frame the visual check measures one at a time.
import { slug } from '../args.mjs';

export const DEFAULT_EXCLUDE = 'status ?bar|home ?indicator|dynamic island|notch';

// Drops every node whose name matches, anywhere in the tree, and returns what was dropped.
export function excludeNodes(root, pattern) {
  const regex = pattern ? new RegExp(pattern, 'i') : null;
  const dropped = [];
  const visit = (node) => {
    node.children = node.children.filter((child) => {
      if (regex && regex.test(child.name)) { dropped.push(child); return false; }
      return true;
    });
    for (const child of node.children) visit(child);
  };
  visit(root);
  return dropped;
}

// The status band is the top child the design draws for the phone's own status bar.
export function statusBand(root, dropped, override) {
  if (override !== undefined && override !== 'auto') return { value: Number(override), source: 'flag' };
  const top = dropped.find((node) => node.parent === root && Math.abs(node.abs.y) <= 1 && node.h > 0 && node.h < 120);
  if (top) return { value: top.h, source: 'metadata', nodeId: top.id, name: top.name };
  return { value: 54, source: 'rule' };
}

export function flowOf(node) {
  const children = node.children.filter((child) => child.w > 0 && child.h > 0);
  if (children.length < 2) return 'column';
  const byY = [...children].sort((a, b) => a.abs.y - b.abs.y);
  const stackedVertically = byY.every((child, index) => index === 0 || child.abs.y >= byY[index - 1].abs.y + byY[index - 1].abs.h - 1);
  if (stackedVertically) return 'column';
  const byX = [...children].sort((a, b) => a.abs.x - b.abs.x);
  const stackedHorizontally = byX.every((child, index) => index === 0 || child.abs.x >= byX[index - 1].abs.x + byX[index - 1].abs.w - 1);
  return stackedHorizontally ? 'row' : 'free';
}

// Descends through single-child wrappers; in auto mode, one frame that holds the whole page is opened one level.
export function pickRegions(root, { depth = 'auto', skip = [] } = {}) {
  const skipRegexes = skip.map((pattern) => new RegExp(pattern, 'i'));
  const container = (node) => ['frame', 'group', 'instance', 'section', 'component'].includes(node.tag);
  const unwrap = (node) => { let current = node; while (current.children.length === 1 && container(current.children[0]) && current.children[0].w > 0 && current.children[0].h > 0) current = current.children[0]; return current; };
  let candidates = root.children.filter((child) => child.w > 0 && child.h > 0);
  let depthUsed = 1;
  if (depth === 'auto' || depth === '1' || depth === 1) candidates = candidates.map(unwrap);
  if (depth === 'auto' && candidates.length === 1 && candidates[0].children.length >= 2) { candidates = candidates[0].children.filter((child) => child.w > 0 && child.h > 0).map(unwrap); depthUsed = 2; }
  if (depth === '2' || depth === 2) { candidates = candidates.flatMap((node) => (node.children.length ? node.children.filter((child) => child.w > 0 && child.h > 0).map(unwrap) : [node])); depthUsed = 2; }
  const kept = candidates.filter((node) => !skipRegexes.some((regex) => regex.test(node.name)));
  const skipped = candidates.filter((node) => skipRegexes.some((regex) => regex.test(node.name))).map((node) => node.name);
  kept.sort((a, b) => a.abs.y - b.abs.y || a.abs.x - b.abs.x);
  return { regions: kept, skipped, depthUsed };
}

export function pinnedFor(region, { pinnedTop = [], pinnedBottom = [] }) {
  const matches = (patterns) => patterns.some((pattern) => new RegExp(pattern, 'i').test(region.name));
  if (matches(pinnedTop)) return 'top';
  if (matches(pinnedBottom)) return 'bottom';
  return null;
}

export function regionKey(region, used) {
  let key = slug(region.name, 'region');
  let suffix = 2;
  while (used.has(key)) key = `${slug(region.name, 'region')}#${suffix++}`;
  used.add(key);
  return key;
}
