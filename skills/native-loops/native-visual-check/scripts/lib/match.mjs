// Pairs spec elements with measured elements and names the block behind each pair.
// Order: block id (mode A, authoritative) → text → layer-name slug → geometry. Block identity
// without ids goes through blocks.json text, displayName slug, or a common ancestor in the outline.
// Decorative layers (bare shapes, generic names, stock photos) never match: no accessibility
// element can show them, so the gap table judges them from the crop instead of calling them missing.
import { box, normText, normTextLoose, slug, pathAt, CONFIG_PATHS } from './schemas.mjs';

const CENTRE_TOL_X = 24;
const CENTRE_TOL_Y = 40;
const SIZE_TOL = 0.3;
const TEXT_SIZE_TOL = 0.5;
const CONTAIN_RATIO = 0.6;

const GENERIC_NAME = /^(?:rectangle|rect|ellipse|oval|circle|vector|line|polygon|star|path|shape|group|frame|mask|background|bg|window|rear|front|grabber|handle|overlay|shadow|blur|glow|fill|union|subtract|intersect|exclude|boolean|image|photo|picture|divider|separator)(?:[\s_-]*\d+)*$/i;
const PHOTO_NAME = /^(?:adobestock|istock|shutterstock|getty|unsplash|pexels|img|dsc|dcim|photo|pic)(?:[\s_-]+|\d)|\.(?:png|jpe?g|webp|heic)(?:\s+\d+)?$/i;
const GLYPH_NAME = /\b(?:icon|ico|ic|glyph|chevron|arrow|close|cross|check|tick|search|menu|hamburger|plus|minus|star|heart|bell|home|user|avatar|logo|edit|pencil|trash|bin|delete|share|filter|sort|info|warning|alert|back|forward|next|prev|play|pause|camera|calendar|clock|pin|map|phone|mail|lock|eye|settings|gear|cog|dots|more|refresh|download|upload|link|tag|cart|bag|wallet|card|qr|scan|flag|globe|location)\b|svgrepo|lucide|heroicon|material|tabler|phosphor|feather|fontawesome|\bfa-|\bmdi/i;

export function expectedText(element) {
  const value = element.expect?.text?.value;
  if (typeof value === 'string' && value.trim()) return value;
  return element.kind === 'text' ? element.name ?? null : null;
}

/** Why a spec element cannot have a measured twin, or null when it can. Containers derive from their children instead. */
export function decorativeReason(element) {
  if (element.kind === 'text') return null;
  const name = String(element.name ?? '').trim();
  if (PHOTO_NAME.test(name)) return 'background photo';
  if (!name || GENERIC_NAME.test(name)) return 'generic layer name';
  if (element.kind === 'shape') return 'bare shape';
  if (element.kind === 'icon' && !GLYPH_NAME.test(name)) return 'icon without a glyph name';
  return null;
}

/** Overlays (a parked sheet, LogBox banners) are neither matchable nor extra. */
export function measurableElements(measured) {
  return measured.elements.filter((element) => !element.overlay);
}

function centre(frame) {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

function kindsAgree(specKind, measuredKind) {
  if (specKind === 'text') return measuredKind === 'text' || measuredKind === 'button';
  if (specKind === 'image' || specKind === 'icon') return measuredKind === 'image' || measuredKind === 'view' || measuredKind === 'button';
  return measuredKind !== 'text';
}

function geometryCost(expected, measured) {
  const a = centre(expected); const b = centre(measured);
  const dx = Math.abs(a.x - b.x); const dy = Math.abs(a.y - b.y);
  if (dx > CENTRE_TOL_X || dy > CENTRE_TOL_Y) return null;
  const dw = Math.abs(expected.w - measured.w) / Math.max(1, expected.w);
  const dh = Math.abs(expected.h - measured.h) / Math.max(1, expected.h);
  if (dw > SIZE_TOL || dh > SIZE_TOL) return null;
  return dx / CENTRE_TOL_X + dy / CENTRE_TOL_Y + dw + dh;
}

function nameOf(measured) {
  return measured.displayName ?? measured.identifier ?? measured.label ?? '';
}

function slugsAgree(left, right) {
  const a = slug(left); const b = slug(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
}

/** Equal after loose normalisation, or one inside the other at ≥60% of its length ("Acme" is not "Begin your journey with ACME"). */
export function textsSimilar(left, right) {
  const a = normTextLoose(left); const b = normTextLoose(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.includes(short) && short.length / long.length >= CONTAIN_RATIO;
}

function sizesClose(left, right, ratio = TEXT_SIZE_TOL) {
  return Math.abs(left.w - right.w) <= ratio * Math.max(left.w, right.w, 1) && Math.abs(left.h - right.h) <= ratio * Math.max(left.h, right.h, 1);
}

/** The window the region sits in: pinned-bottom regions hang from the screen bottom. */
export function defaultRegionOffset(region, measured) {
  const app = box(region.app);
  if (!app) return 0;
  const screen = measured.device?.screen ?? {};
  if (region.pinned === 'bottom' && typeof screen.h === 'number') return Math.round((screen.h - app.h - app.y) * 10) / 10;
  return 0;
}

function textCandidates(element, pool, want) {
  const wanted = normTextLoose(want);
  const app = box(element.app);
  return pool.filter((candidate) => {
    const have = normTextLoose(candidate.text);
    if (!have || !(have === wanted || (wanted.length >= 8 && have.startsWith(wanted.slice(0, Math.max(8, wanted.length - 3)))))) return false;
    // A group that carries the text as its label (an image's alt, a card) is the text only when it is text-sized.
    return candidate.kind !== 'view' || !app || sizesClose(app, candidate.page);
  });
}

// A layer name pairs elements only when the boxes are the same order of size, and a text only
// when the texts themselves are alike: "Acme" (37pt) is not "Begin your journey with ACME"
// (354pt), and the 812pt-tall "Login" sheet is not the Login/Register button.
function nameFits(element, candidate) {
  const app = box(element.app);
  if (!app || !sizesClose(app, candidate.page)) return false;
  return element.kind !== 'text' || textsSimilar(expectedText(element) ?? element.name, candidate.text);
}

function pickClosest(candidates, expected) {
  const texts = candidates.filter((candidate) => candidate.kind === 'text');
  const pool = texts.length ? texts : candidates;
  return [...pool].sort((left, right) => {
    const byArea = left.page.w * left.page.h - right.page.w * right.page.h;
    if (!expected) return byArea;
    const a = centre(expected); const l = centre(left.page); const r = centre(right.page);
    return (Math.hypot(l.x - a.x, l.y - a.y) - Math.hypot(r.x - a.x, r.y - a.y)) || byArea;
  })[0];
}

function findMatch(element, pool, expectedBox) {
  if (element.block) {
    const byBlock = pool.find((candidate) => candidate.blockId && candidate.blockId === element.block);
    if (byBlock) return { measured: byBlock, matchedBy: 'block', confidence: 'high' };
  }
  const want = expectedText(element);
  if (want) {
    const candidates = textCandidates(element, pool, want);
    if (candidates.length) return { measured: pickClosest(candidates, expectedBox), matchedBy: 'text', confidence: candidates.length === 1 ? 'high' : 'medium' };
  }
  // A layer name may contain a child's text ("Payments tile" vs "Payments"); kinds must agree too.
  const byName = pool.filter((candidate) => nameOf(candidate) && kindsAgree(element.kind, candidate.kind) && slugsAgree(element.name, nameOf(candidate)) && nameFits(element, candidate));
  if (byName.length) return { measured: pickClosest(byName, expectedBox), matchedBy: 'name', confidence: 'medium' };
  if (expectedBox) {
    let best = null;
    for (const candidate of pool) {
      if (!kindsAgree(element.kind, candidate.kind)) continue;
      const cost = geometryCost(expectedBox, candidate.page);
      if (cost !== null && (!best || cost < best.cost)) best = { candidate, cost };
    }
    if (best) return { measured: best.candidate, matchedBy: 'geometry', confidence: best.cost < 0.5 ? 'medium' : 'low' };
  }
  return { measured: null, matchedBy: 'none', confidence: 'low' };
}

export function blockText(block) {
  const content = block?.component?.content ?? {};
  const value = content.value ?? content.text ?? content.label ?? content.data?.alt ?? null;
  return typeof value === 'string' ? value : null;
}

export function isBound(value) {
  return typeof value === 'string' && value.includes('{{');
}

function commonAncestor(ids, parentOf) {
  if (!ids.length) return null;
  const chain = (id) => { const out = []; let current = parentOf.get(id); while (current) { out.push(current); current = parentOf.get(current); } return out; };
  const first = chain(ids[0]);
  return first.find((ancestor) => ids.every((id) => chain(id).includes(ancestor))) ?? null;
}

/** Index blocks.json and the outline once; both answer "which block is this element". */
export function blockIndex(blocks = [], outline = []) {
  const byId = new Map();
  for (const node of outline) byId.set(node.id, { id: node.id, displayName: node.displayName ?? null, parentId: node.parentId ?? null, componentType: node.componentType ?? null, hidden: Boolean(node.hidden), block: null });
  for (const block of blocks) {
    const entry = byId.get(block.id) ?? { id: block.id, displayName: block.displayName ?? null, parentId: block.parentId ?? null, componentType: block.component?.componentType ?? null, hidden: block.visibility?.value === false, block: null };
    entry.block = block;
    entry.displayName = entry.displayName ?? block.displayName ?? null;
    byId.set(block.id, entry);
  }
  const parentOf = new Map([...byId.values()].map((entry) => [entry.id, entry.parentId]));
  const describe = (id) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const parent = entry.parentId ? byId.get(entry.parentId) : null;
    return { id: entry.id, displayName: entry.displayName, parentId: entry.parentId, parentDisplayName: parent?.displayName ?? null };
  };
  return { byId, parentOf, describe, blocks, outline };
}

export function identifyBlock(element, match, index, childBlockIds = []) {
  const none = { id: null, displayName: null, parentId: null, parentDisplayName: null, how: 'none' };
  if (match?.measured?.blockId && index.byId.has(match.measured.blockId)) return { ...index.describe(match.measured.blockId), how: 'blockId' };
  if (match?.measured?.blockId) return { ...none, id: match.measured.blockId, displayName: match.measured.displayName ?? null, how: 'blockId' };
  const text = match?.measured?.text ?? expectedText(element);
  if (text) {
    const hits = index.blocks.filter((block) => !isBound(blockText(block)) && normTextLoose(blockText(block)) === normTextLoose(text));
    const preferred = hits.find((block) => slugsAgree(block.displayName, element.name)) ?? hits[0];
    if (preferred) return { ...index.describe(preferred.id), how: 'text' };
  }
  const byName = [...index.byId.values()].filter((entry) => slugsAgree(entry.displayName, element.name));
  if (byName.length === 1) return { ...index.describe(byName[0].id), how: 'name-slug' };
  if (byName.length > 1) {
    const exact = byName.find((entry) => slug(entry.displayName) === slug(element.name));
    if (exact) return { ...index.describe(exact.id), how: 'name-slug' };
  }
  const ancestor = commonAncestor(childBlockIds.filter((id) => index.byId.has(id)), index.parentOf);
  if (ancestor) return { ...index.describe(ancestor), how: 'ancestor' };
  return none;
}

function unionBoxes(boxes) {
  const x = Math.min(...boxes.map((item) => item.x)); const y = Math.min(...boxes.map((item) => item.y));
  const right = Math.max(...boxes.map((item) => item.x + item.w)); const bottom = Math.max(...boxes.map((item) => item.y + item.h));
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Returns Map(elementId → {measured, matchedBy, confidence, block, regionOffset, derived}),
 * the set of measured ids already matched and the per-region offsets.
 */
export function matchSpec({ spec, measured, blocks = [], outline = [], regions = null }) {
  const index = blockIndex(blocks, outline);
  const wanted = regions ? spec.regions.filter((region) => regions.includes(region.id)) : spec.regions;
  const pool = [...measurableElements(measured), ...(measured.containers ?? []).map((container) => ({ ...container, kind: container.kind ?? 'view' }))];
  const used = new Set();
  const matches = new Map();
  const regionOffsets = new Map();
  const elementsOf = (region) => spec.elements.filter((element) => element.region === region.id);
  for (const region of wanted) {
    const elements = elementsOf(region);
    let regionOffset = null;
    for (const element of elements) {
      const want = expectedText(element);
      if (!want) continue;
      const hit = textCandidates(element, pool.filter((candidate) => !used.has(candidate.id)), want);
      if (hit.length) { regionOffset = Math.round((pickClosest(hit, box(element.app)).page.y - box(element.app).y) * 10) / 10; break; }
    }
    const by = regionOffset === null ? 'default' : 'first-text';
    if (regionOffset === null) regionOffset = defaultRegionOffset(region, measured);
    regionOffsets.set(region.id, { offset: regionOffset, by });
    for (const element of elements) {
      const app = box(element.app);
      const expectedBox = app ? { ...app, y: app.y + regionOffset } : null;
      // A decorative layer takes no element; it keeps an entry so its block is still named for the report.
      const decorative = decorativeReason(element);
      const found = decorative ? { measured: null, matchedBy: 'none', confidence: 'low', decorative } : findMatch(element, pool.filter((candidate) => !used.has(candidate.id)), expectedBox);
      if (found.measured) used.add(found.measured.id);
      matches.set(element.id, { ...found, regionOffset, expectedBox, derived: false, block: null });
    }
  }
  // A container nobody measured is the union of its matched children, which can still judge
  // the children's gaps but never its own insets.
  for (const element of spec.elements) {
    const match = matches.get(element.id);
    if (!match || match.measured) continue;
    const childBoxes = spec.elements.filter((child) => child.parent === element.id).map((child) => matches.get(child.id)?.measured?.page).filter(Boolean);
    if (element.kind === 'container' && childBoxes.length) {
      match.measured = { id: `d:${element.id}`, kind: 'view', text: null, page: unionBoxes(childBoxes), window: null, pinned: false, seenIn: [], source: 'derived', derived: 'children-union', blockId: null };
      match.matchedBy = 'derived'; match.confidence = 'low'; match.derived = true;
    }
  }
  for (const element of spec.elements) {
    const match = matches.get(element.id);
    if (!match) continue;
    const childIds = spec.elements.filter((child) => child.parent === element.id).map((child) => matches.get(child.id)?.block?.id).filter(Boolean);
    match.block = identifyBlock(element, match, index, childIds);
  }
  return { matches, used, regionOffsets, index };
}

export function configValue(block, property) {
  if (!block) return undefined;
  if (property === 'radius') return pathAt(block, CONFIG_PATHS.radius) ?? pathAt(block, CONFIG_PATHS.radiusCustom);
  return pathAt(block, CONFIG_PATHS[property]);
}
