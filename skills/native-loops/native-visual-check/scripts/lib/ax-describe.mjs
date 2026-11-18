// The `describe` tool answers {description, source}: a text rendering of the accessibility
// service's tree, one element per line, frames normalised to the screen. It lists what
// native-describe-screen leaves out (image groups, pressable groups with their label), so the two
// dumps are merged per viewport: a line whose frame sits on a native element within FRAME_EPS is
// that element; the rest are added with source "describe".
import { box, round1 } from './schemas.mjs';

// `  AXGroup "Logo"  (0.060, 0.098, 0.239, 0.046)`; the label is optional and may hold quotes.
const LINE = /^(\s*)(AX[A-Za-z]+)(?:\s+"(.*)")?\s+\(\s*(-?\d*\.?\d+),\s*(-?\d*\.?\d+),\s*(-?\d*\.?\d+),\s*(-?\d*\.?\d+)\s*\)\s*$/;
const TRAIT_BY_ROLE = { AXStaticText: 'staticText', AXImage: 'image', AXButton: 'button', AXLink: 'link', AXTextField: 'textField' };

export const FRAME_EPS = 1.5;

/** Parses the tool's description text; `dump` is the JSON answer or the text itself. */
export function parseDescribe(dump) {
  const text = typeof dump === 'string' ? dump : dump?.description ?? '';
  let source = typeof dump === 'object' && dump ? dump.source ?? null : null;
  let mode = null;
  const entries = [];
  for (const line of text.split('\n')) {
    const header = /^(Source|Mode):\s*(\S+)/.exec(line);
    if (header) { if (header[1] === 'Mode') mode = header[2]; else source = source ?? header[2]; continue; }
    if (/^ROOT\b/.test(line)) continue;
    const hit = LINE.exec(line);
    if (!hit) continue;
    const [, indent, role, label, x, y, w, h] = hit;
    entries.push({ role, label: label ?? null, depth: Math.max(1, Math.round(indent.length / 2)), normalized: { x: Number(x), y: Number(y), w: Number(w), h: Number(h) } });
  }
  return { source, mode, entries };
}

/** One entry in the shape native-describe-screen uses, frame in points. */
export function axEntryToElement(entry, screen) {
  const n = entry.normalized;
  const trait = TRAIT_BY_ROLE[entry.role];
  return {
    frame: { x: round1(n.x * screen.w), y: round1(n.y * screen.h), width: round1(n.w * screen.w), height: round1(n.h * screen.h) },
    label: entry.label, traits: trait ? [trait] : [], viewClassName: null, axRole: entry.role, source: 'describe',
  };
}

function sameFrame(left, right, eps) {
  return Math.abs(left.x - right.x) <= eps && Math.abs(left.y - right.y) <= eps && Math.abs(left.w - right.w) <= eps && Math.abs(left.h - right.h) <= eps;
}

/**
 * Native elements first, each tagged source "native"; a describe entry on a native frame marks
 * it "native+describe" (and lends its label when the native one has none), any other entry is
 * appended as its own element. Two describe entries never merge with each other: a group and
 * its only child can share a frame and are still two things.
 */
export function mergeAxIntoNative(nativeElements, axEntries, screen, eps = FRAME_EPS) {
  const merged = nativeElements.map((element) => ({ ...element, source: element.source ?? 'native' }));
  const nativeCount = merged.length;
  for (const entry of axEntries) {
    const candidate = axEntryToElement(entry, screen);
    const frame = box(candidate.frame);
    const twin = merged.slice(0, nativeCount).find((element) => sameFrame(box(element.frame), frame, eps));
    if (!twin) { merged.push(candidate); continue; }
    twin.source = 'native+describe';
    twin.axRole = twin.axRole ?? entry.role;
    if (!twin.label && candidate.label) twin.label = candidate.label;
  }
  return merged;
}
