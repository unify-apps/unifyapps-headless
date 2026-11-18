// The WEB gap table: native-visual-check's match and gap logic on a WEB measure, then every
// typography, colour and radius row judged from the computed style the browser reports (judge
// `computed`), not from the block config. Pure.
import { buildGaps } from '../../../../native-loops/native-visual-check/scripts/gap-table.mjs';
import { matchSpec } from '../../../../native-loops/native-visual-check/scripts/lib/match.mjs';
import { CONFIG_PROPS, emptySummary } from '../../../../native-loops/native-visual-check/scripts/lib/schemas.mjs';

export const WEB_TOLERANCE = Object.freeze({ pt: 2, textWidth: 6, drift: 8 });
// How far a computed value may sit from the spec and still match.
const COMPUTED_TOLERANCE = { fontSize: 0.5, lineHeight: 0.5, fontWeight: 50, letterSpacing: 0.01, color: 0 };

/** The spec of one screen at one width in the design store: specs/<screen>@<width>.json. */
export function specPath(store, screen, width) {
  return `${store.replace(/\/+$/u, '')}/specs/${screen}@${width}.json`;
}

const hexKey = (value) => {
  if (typeof value !== 'string' || !value.startsWith('#')) return null;
  const digits = value.slice(1).toUpperCase();
  return digits.length === 8 && digits.endsWith('FF') ? `#${digits.slice(0, 6)}` : `#${digits}`;
};

/** The computed value of one property for a matched element, in the spec's units, or null. */
export function computedValue(property, measured) {
  const style = measured?.style;
  if (!style) return null;
  if (property === 'radius') return typeof style.radius === 'number' ? style.radius : null;
  if (property === 'color') return hexKey(style.color);
  const value = style[property];
  return typeof value === 'number' ? value : null;
}

function judge(property, expected, value, tolerance) {
  if (expected === null || expected === undefined || value === null || value === undefined) return { delta: null, status: 'unknown' };
  if (property === 'color') return { delta: null, status: hexKey(expected) === hexKey(value) ? 'match' : 'off' };
  const delta = Math.round((value - expected) * 1000) / 1000;
  const tol = COMPUTED_TOLERANCE[property] ?? tolerance.pt;
  return { delta, status: Math.abs(delta) <= tol ? 'match' : 'off' };
}

/** The summary of a gap table, counted as native-visual-check counts it. */
export function summarize(rows) {
  const summary = emptySummary();
  summary.rows = rows.length;
  for (const row of rows) {
    if (row.informational && row.status === 'off') continue;
    if (row.status in summary) summary[row.status] += 1;
    if (row.judge === 'visual' && row.status !== 'unknown') summary.visual += 1;
  }
  summary.verdict = rows.some((row) => (row.status === 'off' || row.status === 'missing') && !row.informational) ? 'off' : 'match';
  return summary;
}

/**
 * gaps.json for a WEB measure. Takes buildGaps' options; returns its gaps with the config rows
 * judged from computed styles where the matched element has one.
 */
export function webGaps({ spec, measured, blocks = [], outline = [], verdicts = null, accept = new Map(), regions = null, tolerance = WEB_TOLERANCE, pass = 1 }) {
  const gaps = buildGaps({ spec, measured, blocks, outline, verdicts, accept, regions, tolerance, pass, pixels: false, passDir: null });
  const { matches } = matchSpec({ spec, measured, blocks, outline, regions });
  const byId = new Map(spec.elements.map((element) => [element.id, element]));
  for (const row of gaps.rows) {
    if (!CONFIG_PROPS.includes(row.property) || !row.elementId) continue;
    const match = matches.get(row.elementId);
    const measuredElement = match?.measured ?? null;
    // A radius sits on the block's box: a text matched for the element lends its block's container.
    const source = row.property === 'radius' && measuredElement && typeof measuredElement.style?.radius !== 'number'
      ? (measured.containers ?? []).find((container) => container.blockId && container.blockId === measuredElement.blockId) ?? measuredElement
      : measuredElement;
    let value = computedValue(row.property, source);
    if (value === null) { row.hint = row.hint ?? 'no computed style read for this element'; continue; }
    let expected = row.expected;
    const raw = byId.get(row.elementId)?.expect?.[row.property]?.value;
    if (row.property === 'radius' && raw === 'pill' && source?.page) {
      const half = Math.round(Math.min(source.page.w, source.page.h) / 2);
      expected = half;
      value = Math.min(value, half);
    }
    const result = judge(row.property, expected, value, tolerance);
    row.config = row.measured;
    row.expected = expected;
    row.measured = value;
    row.delta = result.delta;
    row.judge = 'computed';
    row.unit = row.property === 'color' ? 'hex' : row.property === 'fontWeight' ? 'weight' : row.property === 'letterSpacing' ? 'em' : 'px';
    if (row.status !== 'accepted') row.status = result.status;
    row.hint = expected === null ? 'spec has no value (source unknown)' : row.config !== null && row.config !== undefined && String(row.config) !== String(value) ? `config reads ${row.config}; the page shows ${value}` : null;
  }
  for (const row of gaps.rows) if (row.unit === 'pt') row.unit = 'px';
  gaps.summary = summarize(gaps.rows);
  gaps.context = { ...gaps.context, platform: 'web', judgeOfStyle: 'computed' };
  return gaps;
}

const KIND = {
  w: 'layout', h: 'layout', lines: 'typography', gapTop: 'spacing', gapLeft: 'spacing', insetTop: 'spacing', insetLeft: 'spacing', insetRight: 'spacing', insetBottom: 'spacing',
  centerX: 'layout', centerY: 'layout', drift: 'layout', presence: 'component', extra: 'component', fontSize: 'typography', lineHeight: 'typography', fontWeight: 'typography',
  letterSpacing: 'typography', text: 'typography', color: 'colour', fill: 'colour', radius: 'component', gradient: 'colour', shadow: 'component', blur: 'component', opacity: 'colour', image: 'component',
};

/** The open rows of a gap table as findings of the UI check, for web-browser's issues.mjs. */
export function gapFindings(gaps, { evidence = 'gaps.json', specFile = 'spec', spec = null } = {}) {
  const findings = [];
  const regionName = new Map((spec?.regions ?? []).map((region) => [region.id, region.name ?? region.id]));
  for (const row of gaps.rows) {
    if (!['off', 'missing', 'extra'].includes(row.status) || row.informational) continue;
    const numeric = typeof row.delta === 'number';
    const severity = row.status === 'missing' ? 'major' : row.status === 'extra' ? 'minor' : numeric && Math.abs(row.delta) <= 4 ? 'minor' : 'major';
    const unit = row.unit && !['text', 'hex', 'visual', 'lines', 'weight'].includes(row.unit) ? row.unit : '';
    const where = `${specFile} ${row.elementId}.${row.property}`;
    const expected = row.status === 'extra' ? 'not in the design'
      : row.property === 'presence' ? `"${row.element}" shown (${where})`
        : `${row.expected ?? '?'}${unit}${row.source ? ` (${row.source}, ${where})` : ''}`;
    const actual = row.status === 'missing' ? `missing${row.hint ? `: ${row.hint}` : ''}` : `${row.measured ?? '?'}${unit}${numeric ? ` (Δ ${row.delta > 0 ? '+' : ''}${row.delta})` : ''}`;
    findings.push({
      blockId: row.block?.id ?? null, blockType: row.block?.displayName ?? null, inPage: true,
      what: `${regionName.get(row.region) ?? row.region ?? ''}/${row.element ?? ''} ${row.property}`.trim(), rule: row.elementId ? `spec ${row.elementId}.${row.property}` : '—',
      severity, kind: KIND[row.property] ?? 'layout', expected, actual, evidence: `${evidence}#row${row.n}`,
      fix: row.configPath && row.status === 'off' ? `${row.configPath} → ${row.expected}` : row.hint ?? '—',
    });
  }
  return findings;
}
