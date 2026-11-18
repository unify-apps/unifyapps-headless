// A WEB page's measure (loops.web.measure/1, from measure-page.mjs) → the visual check's measured.json
// (loops.visual.measured/1, native-visual-check's schemas.mjs), so native-visual-check's match and gap
// logic reads it unchanged. One viewport: the whole page in one shot, CSS px for points. Pure.
import { parseColor, toHex } from '../../../web-browser/scripts/lib/color.mjs';
import { MEASURED_SCHEMA } from '../../../../native-loops/native-visual-check/scripts/lib/schemas.mjs';

export const WEB_MEASURE_SCHEMA = 'loops.web.measure/1';

const px = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};
const round = (n, places = 1) => (n === null ? null : Math.round(n * 10 ** places) / 10 ** places);

/** A computed colour → `#RRGGBB` (or `#RRGGBBAA`); transparent and unreadable → null. */
export function hexOf(value) {
  const color = parseColor(value);
  if (!color || color.a === 0) return null;
  return toHex(color);
}

/** Computed typography → the spec's units: px, weight number, hex, letter-spacing in em. */
export function typography(style) {
  if (!style) return null;
  const fontSize = px(style.fontSize);
  const lineHeight = style.lineHeight === 'normal' ? (fontSize ? Math.round(fontSize * 1.2) : null) : px(style.lineHeight);
  const spacing = style.letterSpacing === 'normal' ? 0 : px(style.letterSpacing);
  return {
    fontSize: round(fontSize), lineHeight: round(lineHeight), fontWeight: Number(style.fontWeight) || null, color: hexOf(style.color),
    letterSpacing: fontSize && spacing !== null ? round(spacing / fontSize, 3) : null, fontFamily: style.fontFamily ?? null, textTransform: style.textTransform ?? null,
  };
}

/** Computed box style → radius (the largest corner, px), border, shadow, padding and gaps in px. */
export function shapeOf(style) {
  if (!style) return null;
  const corners = (style.radius ?? []).map(px).filter((n) => n !== null);
  return {
    radius: corners.length ? Math.max(...corners) : null, corners,
    border: px(style.borderWidth) > 0 && style.borderStyle !== 'none' ? { width: px(style.borderWidth), color: hexOf(style.borderColor) } : null,
    shadow: style.boxShadow && style.boxShadow !== 'none' ? style.boxShadow : null, opacity: px(style.opacity),
    padding: (style.padding ?? []).map(px), gap: (style.gap ?? []).map((value) => (value === 'normal' ? 0 : px(value))), backgroundImage: Boolean(style.backgroundImage),
  };
}

/**
 * measure → measured.json. `displayNames` (block id → name, from a cache blocks export) names
 * the blocks as the native fiber walk does; `png` is the page shot copied into the pass folder.
 */
export function toMeasured(measure, { width = null, displayNames = new Map(), png = null } = {}) {
  if (measure?.schema !== WEB_MEASURE_SCHEMA) throw new Error(`measure: schema must be ${WEB_MEASURE_SCHEMA}, got ${measure?.schema ?? measure?.error ?? 'nothing'}`);
  const screen = { w: measure.app?.w ?? measure.viewport.w, h: measure.app?.h ?? measure.viewport.h };
  const common = (item) => ({
    window: { ...item.page, k: 1 }, seenIn: [1], source: 'dom', traits: [], viewClassName: null, derived: null,
    displayName: item.blockId ? displayNames.get(item.blockId) ?? null : null, blockType: item.blockType ?? null, pinned: Boolean(item.pinned), inPage: item.inPage !== false,
  });
  const elements = (measure.elements ?? []).map((item) => ({
    id: item.id, kind: item.kind, text: item.text ?? null, label: item.label ?? null, identifier: null, page: item.page, blockId: item.blockId ?? null,
    backgroundColor: hexOf(item.backgroundColor), style: item.kind === 'image' ? null : typography(item.style), ...common(item),
  }));
  const containers = (measure.containers ?? []).map((item) => ({
    id: item.id, kind: 'view', text: null, label: item.label ?? null, identifier: null, page: item.page, blockId: item.blockId ?? null,
    backgroundColor: hexOf(item.backgroundColor), style: shapeOf(item.style), runtimeId: item.runtimeId ?? null, rootBox: item.rootBox ?? null, face: item.face ?? null, ...common(item),
  }));
  return {
    schema: MEASURED_SCHEMA, mode: 'web',
    device: { model: `web ${width ?? measure.viewport.w}`, screen, scale: measure.dpr ?? 1, safeAreaTop: 0, platform: 'web', viewport: measure.viewport },
    viewports: [{ k: 1, offset: 0, offsetConfidence: 'exact', png, h: screen.h }],
    bands: { status: null, header: null, tabbar: null },
    // Block boxes go first among the elements: native-visual-check's match takes the first element
    // with a block id, and a spec element named by block id means the block's box, not a text in it.
    contentHeight: screen.h, elements: [...containers, ...elements], containers: [], overlays: [],
    notes: measure.truncated ? ['the measure stopped at its limit; the page has more blocks than it read'] : [],
    source: { path: measure.path ?? null, pageIds: measure.pageIds ?? [], inFrame: Boolean(measure.inFrame), scrollTop: measure.scrollTop ?? 0 },
  };
}
