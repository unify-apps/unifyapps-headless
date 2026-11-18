// Elements the page does not own: the Preview app's dev menu, a bottom sheet parked below the
// screen, and the LogBox banners over the bottom of the page. Every dump lists them, so each
// viewport classifies them once and keeps them out of the anchors, the content height and the
// gap table. The dumps carry no hierarchy, only tree order: a group's members are the elements
// that follow it in the list and sit inside its frame, which is what tells a parked sheet's
// rows from page content mounted below the fold.
import { box } from './schemas.mjs';
import { axKind, axText } from './page-offset.mjs';

// LogBox reads its icon first: "!, Open debugger to view warnings.", "2, TypeError: …".
const BANNER_LABEL = /^(?:!|\d+|⚠|✕|✖|×),\s/;
const SHEET_LABEL = /\b(?:bottom sheet|sheet|modal|drawer|dev ?menu|debug ?menu)\b/i;
const EDGE_EPS = 1;
const FULL_WIDTH = 0.9;

export function isBannerLabel(label) {
  return BANNER_LABEL.test(String(label ?? ''));
}

export function isOffscreen(frame, screen, eps = 0.5) {
  return frame.y >= screen.h - eps || frame.y + frame.h <= eps;
}

function contains(outer, inner, eps = 0.5) {
  return inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;
}

function parkedAtEdge(frame, screen) {
  return Math.abs(frame.y - screen.h) <= EDGE_EPS || Math.abs(frame.y + frame.h) <= EDGE_EPS;
}

/** Members of a group: the run of elements right after it in dump order that sit inside its frame. */
function membersAfter(elements, index) {
  const frame = box(elements[index].frame);
  const members = [];
  for (let next = index + 1; next < elements.length; next += 1) {
    const inner = box(elements[next].frame);
    if (!inner || !contains(frame, inner)) break;
    members.push(elements[next]);
  }
  return members;
}

/** A full-width non-text element that says sheet by label or trait, or is parked at a screen edge with members. */
export function isSheetGroup(element, screen, members = []) {
  const frame = box(element.frame);
  if (!frame || axKind(element) === 'text' || frame.w < screen.w * FULL_WIDTH) return false;
  const traits = (element.traits ?? []).map((trait) => String(trait).toLowerCase());
  if (SHEET_LABEL.test(axText(element)) || traits.includes('adjustable')) return true;
  return parkedAtEdge(frame, screen) && members.length > 0;
}

/** Every element with `overlay`: "offscreen-sheet", "banner" or null. */
export function classifyOverlays(elements, screen) {
  const framed = elements.filter((element) => box(element.frame));
  const out = framed.map((element) => ({ ...element, overlay: null }));
  for (let index = 0; index < framed.length; index += 1) {
    const element = framed[index];
    const members = membersAfter(framed, index);
    let reason = null;
    if (isSheetGroup(element, screen, members) && isOffscreen(box(element.frame), screen)) reason = 'offscreen-sheet';
    else if (isBannerLabel(axText(element))) reason = 'banner';
    if (!reason) continue;
    out[index].overlay = out[index].overlay ?? reason;
    for (const member of members) { const slot = out[framed.indexOf(member)]; slot.overlay = slot.overlay ?? reason; }
  }
  return out;
}

/** The lowest bottom edge of the page's own elements, in the dump's coordinates. */
export function contentExtent(elements) {
  let bottom = 0;
  for (const element of elements) {
    if (element.overlay) continue;
    const frame = box(element.frame);
    if (frame) bottom = Math.max(bottom, frame.y + frame.h);
  }
  return { bottom };
}

function onscreenSheets(elements, screen) {
  const framed = elements.filter((element) => box(element.frame));
  return framed.filter((element, index) => isSheetGroup(element, screen, membersAfter(framed, index)) && !isOffscreen(box(element.frame), screen));
}

/** The label of a sheet that is on screen now and was not before (a swipe opened it), else null. */
export function findOpenedSheet(previousElements, currentElements, screen) {
  const before = new Set(onscreenSheets(previousElements, screen).map((sheet) => axText(sheet)));
  const opened = onscreenSheets(currentElements, screen).find((sheet) => !before.has(axText(sheet)));
  return opened ? axText(opened) || 'sheet' : null;
}
