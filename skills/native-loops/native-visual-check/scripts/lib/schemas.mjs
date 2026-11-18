// The three file shapes of a visual check and the small helpers every script shares.
// spec.json (the design spec) is written by native-design-spec; measured.json by measure-merge;
// gaps.json by gap-table. The blocks agree on the field names here.
import fs from 'node:fs';
import path from 'node:path';

export const SPEC_SCHEMA = 'loops.design.spec/1';
export const MEASURED_SCHEMA = 'loops.visual.measured/1';
export const GAPS_SCHEMA = 'loops.visual.gaps/1';
// The ids these shapes had before the rename to design spec and visual check; a file a store or a run
// wrote then still reads.
export const LEGACY_SCHEMAS = Object.freeze({ [SPEC_SCHEMA]: 'loops.pixel.contract/1', [MEASURED_SCHEMA]: 'loops.pixel.measured/1', [GAPS_SCHEMA]: 'loops.pixel.gaps/1' });
/** True when `value` is `schema` or the id it had before. */
export const isSchema = (value, schema) => value === schema || (LEGACY_SCHEMAS[schema] !== undefined && value === LEGACY_SCHEMAS[schema]);

export const STATUSES = ['match', 'off', 'missing', 'extra', 'unknown', 'unjudged', 'noise', 'accepted'];
export const JUDGES = ['measured', 'config', 'native', 'pixel', 'visual'];
export const NOISE_RULES = ['status-band', 'vertical-centering', 'cap-trim', 'font-width', 'tabbar'];

// Which judge answers which property. `drift` is informational: it never flips the verdict.
export const MEASURED_PROPS = ['w', 'h', 'lines', 'gapTop', 'gapLeft', 'insetTop', 'insetLeft', 'insetRight', 'insetBottom', 'centerX', 'centerY', 'drift'];
export const CONFIG_PROPS = ['fontSize', 'lineHeight', 'fontWeight', 'color', 'letterSpacing', 'radius'];
export const VISUAL_PROPS = ['gradient', 'shadow', 'blur', 'opacity', 'image'];
export const INFORMATIONAL_PROPS = ['drift'];

export const DEFAULT_TOLERANCE = Object.freeze({ pt: 2, textWidth: 6, drift: 8 });

// Where each config property lives in a stored block (read from a home page read-back).
export const CONFIG_PATHS = Object.freeze({
  fontSize: 'component.appearance.styles.fontSize.custom',
  lineHeight: 'component.appearance.lineHeight.custom',
  fontWeight: 'component.appearance.weight',
  color: 'component.appearance.color.custom',
  letterSpacing: 'component.appearance.letterSpacing.custom',
  radius: 'component.appearance.styles.borderRadius.all',
  radiusCustom: 'component.appearance.customStyles.borderRadius',
  text: 'component.content.value',
  maxLines: 'component.content.addOns.truncation.maxNumberOfLines',
  backgroundColor: 'component.appearance.styles.backgroundColor',
  gradient: 'component.appearance.customStyles.linearGradient',
  effects: 'component.appearance.effects',
  gap: 'component.appearance.styles.gap',
  padding: 'component.appearance.styles.padding',
  margin: 'component.appearance.styles.margin',
  width: 'component.appearance.styles.width',
  height: 'component.appearance.styles.height',
});

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// A box is {x, y, w, h}; the board may write width/height, argent writes width/height too.
export function box(value) {
  if (!value || typeof value !== 'object') return null;
  const w = value.w ?? value.width;
  const h = value.h ?? value.height;
  if (![value.x, value.y, w, h].every((side) => typeof side === 'number' && Number.isFinite(side))) return null;
  return { x: value.x, y: value.y, w, h };
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function normText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Spacing and punctuation the font or the builder may change: "Login / Register" and
// "Login/Register" are one text, so are curly and straight quotes, dashes and a trailing period.
export function normTextLoose(value) {
  return normText(value)
    .normalize('NFKC')
    .replace(/[‘’‚`´]/g, "'").replace(/[“”„]/g, '"').replace(/[–—‐‑]/g, '-').replace(/…/g, '...')
    .replace(/\s*([/\-·•|&+:;,.!?()[\]"'])\s*/g, '$1')
    .replace(/[.:]+$/, '')
    .trim();
}

// Layer names ("Ask Field") and displayNames ("askField") meet on their letters and digits.
export function slug(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function pathAt(value, dotted) {
  return String(dotted).split('.').reduce((current, key) => (current == null ? undefined : current[key]), value);
}

// `cache blocks --json` prints {blocks:[…]}; a raw page read keeps a map under properties.blocks.
export function blocksFrom(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.blocks)) return json.blocks;
  const map = json.properties?.blocks ?? json.cache?.page?.properties?.blocks ?? json.page?.properties?.blocks;
  return map && typeof map === 'object' ? Object.values(map) : [];
}

export function outlineNodes(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return json.nodes ?? json.outline?.nodes ?? [];
}

function fail(what) {
  throw new Error(what);
}

export function assertSpec(spec) {
  if (!isSchema(spec?.schema, SPEC_SCHEMA)) fail(`spec.json: schema must be ${SPEC_SCHEMA}, got ${spec?.schema}`);
  if (!Array.isArray(spec.regions) || !Array.isArray(spec.elements)) fail('spec.json: regions[] and elements[] are required');
  if (!spec.device || typeof spec.device.widthPt !== 'number') fail('spec.json: device.widthPt is required');
  const regionIds = new Set(spec.regions.map((region) => region.id));
  for (const element of spec.elements) {
    if (!element.id || !regionIds.has(element.region)) fail(`spec.json: element ${element.id ?? '?'} needs a known region`);
    if (!box(element.app)) fail(`spec.json: element ${element.id} needs an app box {x,y,w,h}`);
  }
  return spec;
}

export function assertMeasured(measured) {
  if (!isSchema(measured?.schema, MEASURED_SCHEMA)) fail(`measured.json: schema must be ${MEASURED_SCHEMA}, got ${measured?.schema}`);
  if (!Array.isArray(measured.viewports) || !Array.isArray(measured.elements)) fail('measured.json: viewports[] and elements[] are required');
  if (!measured.device?.screen) fail('measured.json: device.screen is required');
  return measured;
}

export function emptySummary() {
  return { rows: 0, match: 0, off: 0, missing: 0, extra: 0, unknown: 0, visual: 0, unjudged: 0, noise: 0, accepted: 0, verdict: 'match' };
}
