#!/usr/bin/env node
// Compare measured.json with spec.json: one row per element and property, each judged by
// frames, by block config, by a native fill, by pixels, or by a visual verdict. Writes gaps.json
// and the HTML report, prints the one-line summary and the non-match table.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  GAPS_SCHEMA, DEFAULT_TOLERANCE, MEASURED_PROPS, CONFIG_PROPS, VISUAL_PROPS, INFORMATIONAL_PROPS,
  assertSpec, assertMeasured, blocksFrom, outlineNodes, box, normText, pathAt, readJson, writeJson, emptySummary, CONFIG_PATHS,
} from './lib/schemas.mjs';
import { matchSpec, configValue, blockText, isBound, decorativeReason, measurableElements } from './lib/match.mjs';
import { normTextLoose } from './lib/schemas.mjs';
import { writeReport, writeComposite, writeCrops, samplePixelAt } from './lib/report.mjs';

const HELP = `Usage:
  node gap-table.mjs spec.json measured.json [--blocks blocks.json] [--outline outline.json]
      [--verdicts visual-verdicts.json] [--accept "7:<words>"]... [--regions a,b] [--pixels] [--crops]
      [--tolerance 2] [--tolerance-text-width 6] [--tolerance-drift 8] [--pass n] [--max-passes n]
      [--page-name NAME] [--board DIR | --figma screenshot.png] [--link]
      --out gaps.json [--report pass-report.html] [--json]

Rows: w,h,lines,gapTop|gapLeft,inset*,centerX,centerY,drift are measured from frames; fontSize,
lineHeight,fontWeight,color,letterSpacing,radius come from blocks.json (judge config); fill from a
native backgroundColor, else a pixel sample (--pixels), else a visual verdict; gradient, shadow,
blur, opacity, image are visual: unjudged until --verdicts names them. --accept takes a row number
or "<elementId>.<property>", a colon and the person's words. --regions keeps only those regions and
crops the report to them. The verdict is "off" while any off or missing row is not accepted.

Exit codes: 0 verdict match, 1 error, 2 usage, 4 verdict off.`;

const WEIGHTS = { thin: 100, light: 300, regular: 400, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 };

function num(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const hit = /-?\d+(?:\.\d+)?/.exec(value);
  return hit ? Number(hit[0]) : null;
}

function hex(value) {
  const raw = typeof value === 'string' ? value : value?.custom ?? value?.value ?? null;
  if (typeof raw !== 'string' || !raw.startsWith('#')) return null;
  const digits = raw.slice(1).toUpperCase();
  return digits.length === 8 && digits.endsWith('FF') ? `#${digits.slice(0, 6)}` : `#${digits}`;
}

function parseConfig(property, raw) {
  if (raw == null) return null;
  if (property === 'fontWeight') return typeof raw === 'string' && WEIGHTS[raw.toLowerCase()] !== undefined ? WEIGHTS[raw.toLowerCase()] : num(raw);
  if (property === 'color') return hex(raw);
  if (property === 'radius') return typeof raw === 'string' && raw.includes('full') ? 9999 : num(raw);
  return num(raw);
}

function expectOf(element, property) {
  const expect = element.expect?.[property];
  if (!expect || typeof expect !== 'object') return null;
  return expect;
}

function compare(expected, measured, tolerance) {
  if (expected === null || expected === undefined) return { delta: null, status: 'unknown' };
  if (measured === null || measured === undefined) return { delta: null, status: 'unknown' };
  if (typeof expected === 'string' || typeof measured === 'string') return { delta: null, status: String(expected).toUpperCase() === String(measured).toUpperCase() ? 'match' : 'off' };
  const delta = Math.round((measured - expected) * 10) / 10;
  return { delta, status: Math.abs(delta) <= tolerance ? 'match' : 'off' };
}

function measuredGeometry(element, property, match, matches, measured, blockJson) {
  const m = match.measured?.page;
  if (!m) return { value: null, hint: 'element not measured' };
  const parent = matches.get(element.parent ?? '')?.measured;
  const prev = matches.get(element.prevSibling ?? '')?.measured;
  const derivedParent = parent?.source === 'derived';
  switch (property) {
    case 'w': return { value: m.w };
    case 'h': return { value: m.h };
    case 'lines': {
      const lineHeight = num(expectOf(element, 'lineHeight')?.value) ?? num(configValue(blockJson, 'lineHeight')) ?? ((num(expectOf(element, 'fontSize')?.value) ?? 15) * 1.3);
      return { value: Math.max(1, Math.round(m.h / lineHeight)) };
    }
    case 'gapTop': return prev ? { value: Math.round((m.y - (prev.page.y + prev.page.h)) * 10) / 10 } : { value: null, hint: `previous sibling ${element.prevSibling ?? '?'} not measured` };
    case 'gapLeft': return prev ? { value: Math.round((m.x - (prev.page.x + prev.page.w)) * 10) / 10 } : { value: null, hint: `previous sibling ${element.prevSibling ?? '?'} not measured` };
    case 'insetTop': case 'insetLeft': case 'insetRight': case 'insetBottom': {
      if (!parent) return { value: null, hint: `parent ${element.parent ?? '?'} not measured` };
      if (derivedParent) return { value: null, hint: 'parent box derived from its children; measure it with native-find-views' };
      const p = parent.page;
      const value = property === 'insetTop' ? m.y - p.y : property === 'insetLeft' ? m.x - p.x : property === 'insetRight' ? p.x + p.w - (m.x + m.w) : p.y + p.h - (m.y + m.h);
      return { value: Math.round(value * 10) / 10 };
    }
    case 'centerX': case 'centerY': {
      if (!parent || derivedParent) return { value: null, hint: 'parent not measured' };
      const axis = property === 'centerX' ? 'x' : 'y';
      const size = axis === 'x' ? 'w' : 'h';
      return { value: Math.round(((m[axis] + m[size] / 2) - (parent.page[axis] + parent.page[size] / 2)) * 10) / 10 };
    }
    case 'drift': return { value: Math.round((m.y - box(element.app).y) * 10) / 10 };
    default: return { value: null };
  }
}

function noiseFor(row, element, match, measured, kindOf) {
  const status = measured.bands.status; const tabbar = measured.bands.tabbar; const header = measured.bands.header;
  const app = box(element.app); const page = match.measured?.page ?? app;
  const inStatus = page && page.y + page.h <= (status?.h ?? 0) + 1;
  if (inStatus && row.status !== 'match') return 'status-band';
  if (row.status !== 'off') return null;
  const inTabbar = tabbar && page && page.y >= tabbar.y - 2;
  if (inTabbar && Math.abs(row.delta ?? 0) <= 4) return 'tabbar';
  if (row.property === 'gapTop' && element.kind === 'text' && kindOf(element.prevSibling) === 'text' && Math.abs(row.delta ?? 0) <= 4) return 'cap-trim';
  if (row.property === 'w' && element.kind === 'text' && Math.abs(row.delta ?? 0) <= 12) return 'font-width';
  if (row.property === 'centerY' && header && Math.abs(Math.abs(row.delta ?? 0) - header.h / 2) <= 2) return 'vertical-centering';
  return null;
}

function looksDynamic(text) {
  return /\d/.test(text) || /[$€£%]|AED|SAR/.test(text) || text.split(/\s+/).length >= 6;
}

function verdictFor(verdicts, element, property) {
  const table = verdicts?.verdicts ?? verdicts ?? {};
  return table[`${element.id}.${property}`] ?? null;
}

export function buildGaps({ spec, measured, blocks = [], outline = [], verdicts = null, accept = new Map(), regions = null, tolerance = DEFAULT_TOLERANCE, pass = 1, pixels = false, passDir = null }) {
  const { matches, used, regionOffsets, index } = matchSpec({ spec, measured, blocks, outline, regions });
  const wanted = regions ? spec.regions.filter((region) => regions.includes(region.id)) : spec.regions;
  const regionIds = new Set(wanted.map((region) => region.id));
  const kindOf = (id) => spec.elements.find((element) => element.id === id)?.kind ?? null;
  const rows = [];
  const push = (element, match, property, extra) => {
    const blockJson = index.byId.get(match?.block?.id)?.block ?? null;
    const base = {
      region: element.region, element: element.name ?? element.id, elementId: element.id, figmaNodeId: element.figmaNodeId ?? null,
      property, unit: 'pt', expected: null, figma: null, measured: null, delta: null, tol: tolerance.pt, status: 'unknown', judge: 'measured', source: null,
      matchedBy: match?.matchedBy ?? 'none', confidence: match?.confidence ?? 'low',
      block: match?.block ?? { id: null, displayName: null, parentId: null, parentDisplayName: null, how: 'none' },
      neighbour: null, boxes: { expected: match?.expectedBox ?? box(element.app), measured: match?.measured?.page ?? null, viewport: match?.measured?.window?.k ?? null },
      noise: null, configPath: null, hint: null, advisory: null, accepted: null,
    };
    const row = { ...base, ...extra };
    if (row.status !== 'match' && row.status !== 'unknown' && row.status !== 'unjudged') {
      const noise = noiseFor(row, element, match ?? {}, measured, kindOf);
      if (noise) { row.noise = noise; row.status = 'noise'; }
    }
    const viewport = measured.viewports.find((entry) => entry.k === row.boxes.viewport);
    if (viewport?.offsetConfidence === 'low') row.confidence = 'low';
    rows.push(row);
    return { row, blockJson };
  };
  for (const element of spec.elements.filter((element) => regionIds.has(element.region))) {
    const match = matches.get(element.id);
    const blockEntry = index.byId.get(match?.block?.id);
    const expectKeys = Object.keys(element.expect ?? {});
    const visualOnly = expectKeys.length > 0 && expectKeys.every((key) => VISUAL_PROPS.includes(key) || key === 'fill');
    // A glow or a shadow layer has no accessibility element: it is judged from the crop, never missing.
    if (!match?.measured && !visualOnly) {
      const hidden = blockEntry?.hidden;
      const { row } = push(element, match, 'presence', { status: 'missing', hint: hidden ? `block ${blockEntry.id} ${blockEntry.displayName ?? ''} is hidden (visibility false)` : 'no measured element matched by text, name or geometry' });
      // Missing is for what a tree could have listed: text, a named icon or image, a container with a matched child. The status band keeps its noise verdict.
      const decorative = decorativeReason(element) ?? (element.kind === 'container' ? 'container without a matched child' : null);
      if (row.status === 'missing' && decorative) Object.assign(row, { status: 'unknown', judge: 'visual', hint: 'decorative layer: judge from the crop', decorative });
      continue;
    }
    const blockJson = blockEntry?.block ?? null;
    const derivedSelf = match?.measured?.source === 'derived';
    if (match?.measured) push(element, match, 'drift', { expected: box(element.app).y, measured: match.measured.page.y, delta: Math.round((match.measured.page.y - box(element.app).y) * 10) / 10, tol: tolerance.drift, status: Math.abs(match.measured.page.y - box(element.app).y) <= tolerance.drift ? 'match' : 'off', source: 'rule', informational: true, hint: derivedSelf ? 'box derived from children' : null });
    for (const property of MEASURED_PROPS) {
      const expect = expectOf(element, property);
      if (!expect || property === 'drift' || !match?.measured) continue;
      const got = derivedSelf && property !== 'gapTop' && property !== 'gapLeft'
        ? { value: null, hint: 'box derived from its children; measure it with native-find-views or on a dev build' }
        : measuredGeometry(element, property, match, matches, measured, blockJson);
      const tol = property === 'drift' ? tolerance.drift : property === 'w' && element.kind === 'text' ? tolerance.textWidth : property === 'lines' ? 0 : tolerance.pt;
      const expected = expect.source === 'unknown' ? null : num(expect.value);
      const result = compare(expected, got.value, tol);
      push(element, match, property, {
        unit: property === 'lines' ? 'lines' : 'pt', expected, figma: expect.figma ?? null, measured: got.value, delta: result.delta, tol, status: result.status,
        source: expect.source ?? null, neighbour: expect.neighbour ?? (property.startsWith('gap') ? element.prevSibling ?? null : property.startsWith('inset') || property.startsWith('center') ? element.parent ?? null : null),
        hint: got.hint ?? (expected === null ? 'spec has no value (source unknown)' : null), informational: INFORMATIONAL_PROPS.includes(property) || undefined,
      });
    }
    for (const property of CONFIG_PROPS) {
      const expect = expectOf(element, property);
      if (!expect) continue;
      const raw = configValue(blockJson, property);
      const expected = expect.source === 'unknown' ? null : (property === 'color' ? hex(expect.value) : num(expect.value));
      let value = parseConfig(property, raw);
      // rounded-full is a pill: its radius is half the shorter side of the box it is on.
      if (property === 'radius' && value === 9999 && match?.measured) value = Math.round(Math.min(match.measured.page.w, match.measured.page.h) / 2);
      // Fonts and line heights are whole points by the scaling rule, so a 1pt difference is a real gap.
      const result = compare(expected, value, property === 'fontWeight' ? 50 : property === 'color' ? 0 : property === 'letterSpacing' ? 0.2 : property === 'fontSize' || property === 'lineHeight' ? 0.5 : tolerance.pt);
      const configPath = property === 'radius' && typeof pathAt(blockJson, CONFIG_PATHS.radiusCustom) === 'number' ? CONFIG_PATHS.radiusCustom : CONFIG_PATHS[property];
      push(element, match, property, {
        unit: property === 'color' ? 'hex' : property === 'fontWeight' ? 'weight' : 'pt', expected, figma: expect.figma ?? null, measured: value, delta: result.delta, status: result.status, judge: 'config', source: expect.source ?? null, configPath,
        hint: !blockJson ? 'block not identified; name it by hand' : raw === undefined && expected !== null ? `${configPath} is not set (a variant or preset may apply)` : expected === null ? 'spec has no value (source unknown)' : null,
      });
    }
    const fill = expectOf(element, 'fill');
    if (fill) {
      const expected = fill.source === 'unknown' ? null : hex(fill.value);
      const native = hex(match?.measured?.backgroundColor) ?? hex(configValue(blockJson, 'backgroundColor'));
      let value = native; let judge = native ? 'native' : null;
      if (!value && pixels && passDir && match?.measured?.window?.k) { value = samplePixelAt({ measured, passDir, element: match.measured }); judge = value ? 'pixel' : null; }
      const result = value ? compare(expected, value, 0) : { delta: null, status: 'unjudged' };
      push(element, match, 'fill', { unit: 'hex', expected, figma: fill.figma ?? null, measured: value, status: expected === null ? 'unknown' : result.status, judge: judge ?? 'visual', source: fill.source ?? null, configPath: CONFIG_PATHS.backgroundColor, hint: value ? null : 'no native fill read; judge the crop' });
    }
    for (const property of VISUAL_PROPS) {
      const expect = expectOf(element, property);
      if (!expect) continue;
      const verdict = verdictFor(verdicts, element, property);
      push(element, match, property, { unit: 'visual', expected: expect.value ?? null, figma: expect.figma ?? null, measured: verdict?.note ?? null, status: verdict ? (verdict.status === 'match' ? 'match' : 'off') : 'unjudged', judge: 'visual', source: expect.source ?? null, configPath: property === 'gradient' ? CONFIG_PATHS.gradient : property === 'shadow' || property === 'blur' ? CONFIG_PATHS.effects : null, hint: verdict ? null : 'judge from the region crop' });
    }
    const text = expectOf(element, 'text');
    if (text && match?.measured) {
      const bound = isBound(blockText(blockJson));
      const result = bound ? { delta: null, status: 'unknown' } : compare(normTextLoose(text.value), normTextLoose(match.measured.text), 0);
      // The same words with other spacing or punctuation ("Login / Register" vs "Login/Register") match; the raw difference is advice.
      const advisory = result.status === 'match' && normText(text.value) !== normText(match.measured.text) ? `spacing or punctuation differs: Figma "${text.value}", device "${match.measured.text}"` : null;
      push(element, match, 'text', { unit: 'text', expected: text.value ?? null, figma: text.figma ?? null, measured: match.measured.text ?? null, status: text.source === 'unknown' ? 'unknown' : result.status, source: text.source ?? null, configPath: CONFIG_PATHS.text, advisory, hint: bound ? 'text is bound to data; the frame shows a sample' : advisory });
    }
  }
  // Text the device shows that no spec element matched, inside the chosen regions' bands.
  const bands = wanted.map((region) => box(region.app)).filter(Boolean);
  const pool = measurableElements(measured);
  const overlap = (left, right) => left.x < right.x + right.w && right.x < left.x + left.w && left.y < right.y + right.h && right.y < left.y + left.h;
  for (const element of pool) {
    if (used.has(element.id) || !element.text || element.kind !== 'text' && element.kind !== 'button') continue;
    // A pressable that repeats its text as its label sits on the matched text; it is not text the frame lacks.
    if (pool.some((other) => used.has(other.id) && normTextLoose(other.text) === normTextLoose(element.text) && overlap(other.page, element.page))) continue;
    const inside = bands.some((band) => element.page.y + element.page.h > band.y - 8 && element.page.y < band.y + band.h + 8);
    if (!inside) continue;
    const region = wanted.find((candidate) => { const band = box(candidate.app); return band && element.page.y >= band.y - 8 && element.page.y < band.y + band.h + 8; });
    const dynamic = looksDynamic(element.text);
    rows.push({
      region: region?.id ?? null, element: element.text, elementId: null, figmaNodeId: null, property: 'extra', unit: 'text', expected: null, figma: null, measured: element.text, delta: null, tol: null,
      status: 'extra', judge: 'measured', source: null, matchedBy: 'none', confidence: 'high', block: { id: element.blockId ?? null, displayName: element.displayName ?? null, parentId: null, parentDisplayName: null, how: element.blockId ? 'blockId' : 'none' },
      neighbour: null, boxes: { expected: null, measured: element.page, viewport: element.window?.k ?? null }, noise: null, configPath: null, hint: dynamic ? 'data? looks dynamic; confirm before hiding' : 'the frame does not show this text', accepted: null, tag: dynamic ? 'data?' : null,
    });
  }
  rows.forEach((row, position) => { row.n = position + 1; });
  for (const row of rows) {
    const words = accept.get(String(row.n)) ?? accept.get(`${row.elementId}.${row.property}`);
    if (words !== undefined && row.status !== 'match') { row.accepted = words || 'accepted'; row.status = 'accepted'; }
  }
  const summary = emptySummary();
  summary.rows = rows.length;
  for (const row of rows) {
    // drift is informational: it is in the file and the report, never in the off count.
    if (row.informational && row.status === 'off') continue;
    if (row.status in summary) summary[row.status] += 1;
    // visual counts the rows a person judges; a decorative layer or a fill without a value is nothing to judge.
    if (row.judge === 'visual' && row.status !== 'unknown') summary.visual += 1;
  }
  summary.verdict = rows.some((row) => (row.status === 'off' || row.status === 'missing') && !row.informational) ? 'off' : 'match';
  return {
    schema: GAPS_SCHEMA, pass, tolerance: { ...tolerance }, regions: regions ?? null,
    context: { page: spec.page ?? null, device: measured.device, scale: spec.scale ?? null, regionOffsets: Object.fromEntries(regionOffsets), mode: measured.mode },
    summary, rows,
  };
}

export function summaryLine(gaps, { pageName = null, maxPasses = null } = {}) {
  const s = gaps.summary;
  const visualOff = gaps.rows.filter((row) => row.judge === 'visual' && row.status === 'off').length;
  const head = `Pass ${gaps.pass}${maxPasses ? `/${maxPasses}` : ''}${pageName ? ` · ${pageName}` : ''}`;
  return `${head} · ${s.rows} rows: ${s.match} match · ${s.off} off · ${s.missing} missing · ${s.extra} extra · ${s.visual} visual (${visualOff} off${s.unjudged ? `, ${s.unjudged} unjudged` : ''}) · ${s.noise} noise · ${s.unknown} unknown · ${s.accepted} accepted → verdict ${s.verdict}`;
}

export function markdownTable(gaps, limit = 20) {
  const shown = gaps.rows.filter((row) => row.status !== 'match' && row.status !== 'noise' && row.status !== 'unknown' && !row.informational).slice(0, limit);
  if (!shown.length) return '(no rows outside match, noise and unknown)';
  const cell = (value) => (value === null || value === undefined ? '' : String(value).replace(/\|/g, '\\|'));
  const lines = ['| # | region | element | property | expected | measured | Δ | status | block | note |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const row of shown) {
    const block = row.block?.id ? `${row.block.displayName ?? ''} ${row.block.id}`.trim() : '';
    lines.push(`| ${row.n} | ${cell(row.region)} | ${cell(row.element)} | ${cell(row.property)} | ${cell(row.expected)} | ${cell(row.measured)} | ${cell(row.delta)} | ${row.status}${row.judge !== 'measured' ? ` (${row.judge})` : ''} | ${cell(block)} | ${cell(row.accepted ?? row.hint)} |`);
  }
  return lines.join('\n');
}

export function parseAccept(list = []) {
  const map = new Map();
  for (const entry of list) {
    const colon = entry.indexOf(':');
    const key = colon === -1 ? entry : entry.slice(0, colon);
    map.set(key.trim(), colon === -1 ? '' : entry.slice(colon + 1).trim());
  }
  return map;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      blocks: { type: 'string' }, outline: { type: 'string' }, verdicts: { type: 'string' }, accept: { type: 'string', multiple: true },
      regions: { type: 'string' }, pixels: { type: 'boolean', default: false }, crops: { type: 'boolean', default: false },
      tolerance: { type: 'string' }, 'tolerance-text-width': { type: 'string' }, 'tolerance-drift': { type: 'string' },
      pass: { type: 'string', default: '1' }, 'max-passes': { type: 'string' }, 'page-name': { type: 'string' }, board: { type: 'string' }, figma: { type: 'string' },
      link: { type: 'boolean', default: false }, out: { type: 'string' }, report: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  const [specFile, measuredFile] = positionals;
  if (!specFile || !measuredFile || !values.out) { console.error('gap-table needs spec.json, measured.json and --out. Run with --help.'); return 2; }
  const spec = assertSpec(readJson(specFile));
  const measured = assertMeasured(readJson(measuredFile));
  const tolerance = { pt: values.tolerance ? Number(values.tolerance) : DEFAULT_TOLERANCE.pt, textWidth: values['tolerance-text-width'] ? Number(values['tolerance-text-width']) : DEFAULT_TOLERANCE.textWidth, drift: values['tolerance-drift'] ? Number(values['tolerance-drift']) : DEFAULT_TOLERANCE.drift };
  const passDir = path.dirname(path.resolve(measuredFile));
  const gaps = buildGaps({
    spec, measured, blocks: values.blocks ? blocksFrom(readJson(values.blocks)) : [], outline: values.outline ? outlineNodes(readJson(values.outline)) : [],
    verdicts: values.verdicts ? readJson(values.verdicts) : null, accept: parseAccept(values.accept ?? []), regions: values.regions ? values.regions.split(',').map((item) => item.trim()).filter(Boolean) : null,
    tolerance, pass: Number(values.pass), pixels: values.pixels, passDir,
  });
  writeJson(values.out, gaps);
  const figmaPng = values.figma ?? [values.board && path.join(values.board, 'screenshot.png'), values.board && path.join(values.board, 'figma', 'screenshot.png')].find((file) => file && fs.existsSync(file)) ?? null;
  const written = { out: values.out };
  if (values.report) {
    written.report = writeReport({ spec, measured, gaps, passDir, out: values.report, figmaPng, link: values.link, regions: gaps.regions });
    written.composite = writeComposite({ measured, passDir, figmaPng, spec, out: path.join(path.dirname(values.report), 'composite.png') });
  }
  if (values.crops) written.crops = writeCrops({ spec, measured, gaps, passDir, figmaPng, outDir: path.join(passDir, 'crops') });
  const line = summaryLine(gaps, { pageName: values['page-name'] ?? spec.page?.name ?? null, maxPasses: values['max-passes'] ? Number(values['max-passes']) : null });
  if (values.json) console.log(JSON.stringify({ ...written, summary: gaps.summary, line }));
  else { console.log(line); console.log(markdownTable(gaps)); for (const [key, file] of Object.entries(written)) if (file) console.log(`${key}: ${Array.isArray(file) ? file.join(', ') : file}`); }
  return gaps.summary.verdict === 'match' ? 0 : 4;
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(1); });
}
