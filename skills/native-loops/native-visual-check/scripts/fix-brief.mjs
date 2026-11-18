#!/usr/bin/env node
// Turn the open rows of gaps.json into one page-layout task (two when it names too many blocks)
// in the style of hand-written layout tasks that landed first time: measured device values and candidate keys per block,
// linted the way UnifyApps Headless's plan revise lints a task.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readJson, writeJson, outlineNodes, CONFIG_PATHS } from './lib/schemas.mjs';

const HELP = `Usage:
  node fix-brief.mjs gaps.json --page ID --page-name NAME --app ID --app-name NAME --outline outline.json
      --pass n --depends-on TASK [--next-id tN] [--publish-task ID --publish-json JSON|FILE] [--plan PLANID]
      [--device "iPhone 16 Pro (402×874pt)"] [--platform mobile|web] [--max-ids 25] [--board DIR]
      [--evidence evidence.json] --out fix-task.json --md fix-brief.md [--json]
  node fix-brief.mjs --lint fix-task.json --outline outline.json

Takes the off, missing, extra (not data?) and visual-off rows that nobody accepted, groups them by
block and writes fix-task.json (an array: the fix task, a second chained task when more than
--max-ids blocks are named, and the publish task re-listed with its dependsOn extended) plus
fix-brief.md with the plan revise line. --next-id defaults to the id after --depends-on.
--lint checks an existing tasks file with the same rules (five lines, no placeholder phrase, no
stated field count, every named id in the outline).
--platform web words the task for a WEB page measured in UnifyApps Headless's browser (web-visual-check):
a "Browser pass" in CSS px at the spec's width, with no device scaling and no grid rule. Without
the flag, a gaps.json whose context says platform web is worded that way too; --device then
defaults to "browser <width>px wide" from the measured width. --platform mobile is the default.

Exit codes: 0 ok, 1 error, 2 usage, 3 nothing to fix, 5 lint failed.`;

// The same gap rules as UnifyApps Headless's contracts.mjs validateTasks / spec-requirements.mjs placeholderIn.
const GAP_MARKS = /\b(?:TBD|TBC|TODO)\b/u;
const GAP_WORDS = /\bto be (?:decided|determined|confirmed|defined)\b|\b(?:handle errors|similar to|wire it up|fill in)\b/iu;
const HAND_COUNT = /\b\d+\s+(?:[A-Za-z_-]+\s+){0,2}?(?:fields?|columns?|indexes|indices|index)\b/iu;

function withoutQuotedValues(text) {
  return String(text ?? '')
    .replace(/(?<![\\`])((?:\\\\)*)(`+)(?!`)[^\n]*?(?<!`)\2(?!`)/gu, '$1 named value ')
    .replace(/"[^"]*"|“[^”]*”|‘[^’]*’|(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' named value ');
}

export function placeholderIn(text) {
  const visible = withoutQuotedValues(text);
  const found = [GAP_MARKS.exec(visible), GAP_WORDS.exec(visible)].filter(Boolean).sort((left, right) => left.index - right.index)[0];
  return found ? found[0] : null;
}

export function lintTask(task, outlineIds) {
  const problems = [];
  const lines = String(task.body ?? '').trim().split(/\r?\n/u);
  if (lines.length < 5) problems.push(`${task.id} body needs at least five lines (has ${lines.length}).`);
  if (!String(task.proof ?? '').trim()) problems.push(`${task.id} needs a proof read-back.`);
  for (const part of ['body', 'proof']) {
    const gap = placeholderIn(task[part]);
    if (gap) problems.push(`${task.id} ${part} has a placeholder: "${gap}".`);
    const count = HAND_COUNT.exec(withoutQuotedValues(task[part]));
    if (count) problems.push(`${task.id} ${part} states a count, "${count[0]}".`);
  }
  if (outlineIds) {
    for (const id of new Set(String(task.body ?? '').match(/\bb_[A-Za-z0-9]{3,}\b/gu) ?? [])) {
      if (!outlineIds.has(id)) problems.push(`${task.id} body names ${id}, which is not in the outline.`);
    }
  }
  if (!Array.isArray(task.dependsOn)) problems.push(`${task.id} dependsOn must be an array.`);
  return problems;
}

const fmt = (value) => (value === null || value === undefined ? '?' : typeof value === 'number' ? `${Math.round(value * 10) / 10}` : String(value));

// The words of a pass, per platform: a MOBILE pass measures a simulator in points against a frame
// scaled to the phone; a WEB pass measures the browser in CSS px against the spec of one width.
export const PLATFORM_WORDS = {
  mobile: { unit: 'pt', design: 'Figma', pass: 'Simulator pass', title: 'simulator pass', frame: 'the frame' },
  web: { unit: 'px', design: 'design', pass: 'Browser pass', title: 'browser pass', frame: 'the design' },
};
export const PLATFORMS = Object.keys(PLATFORM_WORDS);

/** mobile or web: the flag, else the gap table's own context (web-visual-check sets platform web). */
export function platformOf(gaps, flag = null) {
  if (flag) return flag;
  return gaps?.context?.platform === 'web' ? 'web' : 'mobile';
}

/** The --device text when none is given. */
export function defaultDevice(platform, gaps) {
  if (platform !== 'web') return 'iPhone 16 Pro (402×874pt)';
  const width = gaps?.context?.device?.screen?.w;
  return width ? `browser ${width}px wide` : 'browser';
}

function factFor(row, rowsById, words = PLATFORM_WORDS.mobile) {
  const el = row.element; const m = row.measured; const e = row.expected; const b = row.boxes ?? {};
  const pt = (value) => (typeof value === 'number' ? `${fmt(value)}${words.unit}` : fmt(value));
  const F = words.design;
  const prev = row.neighbour ? rowsById.get(row.neighbour) : null;
  switch (row.property) {
    case 'gapTop': return b.measured ? `${el} top at ${pt(b.measured.y)} with ${prev?.element ?? row.neighbour} bottom at ${pt(b.measured.y - m)} (gap ${fmt(m)}, ${F} ${fmt(e)})` : `${el} gap above ${fmt(m)} (${F} ${fmt(e)})`;
    case 'gapLeft': return b.measured ? `${el} left at ${pt(b.measured.x)} with ${prev?.element ?? row.neighbour} right at ${pt(b.measured.x - m)} (gap ${fmt(m)}, ${F} ${fmt(e)})` : `${el} gap left ${fmt(m)} (${F} ${fmt(e)})`;
    case 'w': return `${el} ${fmt(m)} wide (${F} ${fmt(e)})`;
    case 'h': return `${el} ${fmt(m)} tall (${F} ${fmt(e)})`;
    case 'lines': return `${el} wraps to ${fmt(m)} lines (${F} ${fmt(e)})`;
    case 'presence': return `${el} is not on screen${row.hint?.includes('hidden') ? ` (${row.hint})` : ''}`;
    case 'extra': return `"${el}" shows at ${pt(b.measured?.y)}, which ${words.frame} does not have`;
    case 'text': return `${el} reads "${fmt(m)}" (${F} "${fmt(e)}")`;
    default:
      if (row.judge === 'visual') return `${el} ${row.property}: ${fmt(m)} (${F} ${fmt(e)})`;
      if (row.judge === 'config') return `${el} ${row.property} ${fmt(m)} in config (${F} ${fmt(e)})`;
      if (row.property.startsWith('inset')) return `${el} ${row.property} ${fmt(m)} inside ${prev?.element ?? row.neighbour ?? 'its parent'} (${F} ${fmt(e)})`;
      return `${el} ${row.property} ${fmt(m)} (${F} ${fmt(e)})`;
  }
}

function candidateKeys(row, group, rowsById, kinds, words = PLATFORM_WORDS.mobile) {
  const block = row.block ?? {}; const parent = block.parentDisplayName ? `${block.parentDisplayName} (${block.parentId})` : block.parentId ? block.parentId : 'its parent';
  const prev = row.neighbour ? rowsById.get(row.neighbour) : null;
  const isText = kinds.get(row.elementId) === 'text';
  switch (row.property) {
    case 'gapTop': case 'gapLeft': {
      const siblings = group.siblingGaps.get(block.parentId ?? '') ?? [];
      const sameDelta = siblings.length >= 2 && siblings.every((other) => Math.abs((other.delta ?? 0) - (row.delta ?? 0)) <= 1);
      if (sameDelta) return `the parent ${parent} appearance.styles.gap.all (every child gap is off by ${fmt(row.delta)})`;
      const side = row.property === 'gapTop' ? 't' : 'l';
      return `appearance.styles.margin.custom.${side} on this block, or the bottom margin of ${prev?.block?.displayName ? `${prev.block.displayName} (${prev.block.id})` : prev?.element ?? 'the previous sibling'}, or the padding of ${parent}`;
    }
    case 'insetTop': case 'insetLeft': case 'insetRight': case 'insetBottom': return `${parent} appearance.styles.padding.custom.${row.property.slice(5, 6).toLowerCase()}`;
    case 'w': return isText ? `the wrapping width of ${parent} (its padding) or appearance.letterSpacing.custom` : 'appearance.styles.width.custom';
    case 'h': return isText ? 'appearance.lineHeight.custom, content.addOns.truncation.maxNumberOfLines, or the wrapping width of its parent' : 'appearance.styles.height.custom (or minHeight.custom)';
    case 'lines': return 'appearance.lineHeight.custom, content.addOns.truncation.maxNumberOfLines, or the wrapping width of its parent';
    case 'centerX': case 'centerY': return `alignItems and justifyContent on ${parent}`;
    case 'fill': return CONFIG_PATHS.backgroundColor + '.custom';
    case 'gradient': return CONFIG_PATHS.gradient;
    case 'shadow': case 'blur': return `${CONFIG_PATHS.effects} (drop-shadow x, y, blur, spread, color)`;
    case 'opacity': return 'component.appearance.customStyles.opacity';
    case 'image': return 'component.content.data.src and component.appearance.objectFit';
    case 'text': return CONFIG_PATHS.text;
    case 'presence': return row.hint?.includes('hidden') ? `visibility of ${block.id ?? 'the block'} (set it to show)` : `render ${row.element} inside ${parent}`;
    case 'extra': return `hide or remove "${row.element}", which ${words.frame} does not show`;
    default: return row.configPath ?? `the ${row.property} key of the block`;
  }
}

export function openRows(gaps) {
  return gaps.rows.filter((row) => {
    if (row.informational || row.status === 'accepted') return false;
    if (row.status === 'off' || row.status === 'missing') return true;
    return row.status === 'extra' && row.tag !== 'data?';
  });
}

function groupByBlock(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.block?.id ?? `~${row.elementId ?? row.element}`;
    if (!groups.has(key)) groups.set(key, { key, id: row.block?.id ?? null, displayName: row.block?.displayName ?? null, rows: [], regions: new Set(), siblingGaps: new Map() });
    const group = groups.get(key);
    group.rows.push(row);
    if (row.region) group.regions.add(row.region);
  }
  // Sibling gaps off by one delta point at the parent's gap, not at each child's margin.
  for (const group of groups.values()) {
    for (const row of rows) {
      if (!row.property.startsWith('gap') || !row.block?.parentId) continue;
      if (!group.siblingGaps.has(row.block.parentId)) group.siblingGaps.set(row.block.parentId, []);
      group.siblingGaps.get(row.block.parentId).push(row);
    }
  }
  return [...groups.values()];
}

function blockLine(group, rowsById, kinds, outlineIds, warnings, words = PLATFORM_WORDS.mobile) {
  const known = group.id && outlineIds.has(group.id);
  if (group.id && !known) warnings.push(`block ${group.id} (${group.displayName ?? '?'}) is not in the outline; the brief names its displayName only`);
  const head = group.id && known ? `${group.displayName ?? group.id} (${group.id})` : group.displayName ? `${group.displayName} (block not identified; find it by name)` : `${group.rows[0].element} (block not identified; find it under ${group.rows[0].region})`;
  const parts = group.rows.map((row) => {
    const expected = row.property === 'presence' ? 'present' : row.property === 'extra' ? 'absent' : fmt(row.expected);
    const measured = row.property === 'presence' ? 'absent' : row.property === 'extra' ? 'present' : fmt(row.measured);
    const figma = row.figma !== null && row.figma !== undefined && row.figma !== row.expected ? ` (${words.design} ${fmt(row.figma)})` : '';
    return `${row.property} ${expected}, measured ${measured}${figma} — ${candidateKeys(row, group, rowsById, kinds, words)}`;
  });
  return `${head}: ${parts.join('; ')}`;
}

function scaleRule(context, platform = 'mobile') {
  if (platform === 'web') {
    const width = context?.device?.screen?.w ? `${context.device.screen.w}` : "the spec's";
    return `Use the design's values as they are, in CSS px at ${width} px wide in the browser preview: the spec is this one width of the design, 1:1, so nothing is scaled and no grid is applied; letter-spacing in em; another width has its own pass, and the phone width the responsive check. Change only look and structure: every binding, data source reference, event, visibility rule and text stays as it is.`;
  }
  const scale = context?.scale; const device = context?.device;
  const factor = scale?.factor ? ` (×${Math.round(scale.factor * 10000) / 10000})` : '';
  const width = device?.screen?.w ? `${device.screen.w}` : 'the device width';
  const grid = scale?.grid ?? 4;
  return `Scale the frame to the device${factor}: canvas values to ${width}pt wide; sizes, paddings, gaps and radii to the nearest multiple of ${grid}; fonts, line heights and values under ${scale?.smallBelow ?? 7}pt to whole points; letter-spacing in em; a gap next to text subtracts half the neighbouring line's extra leading. Change only look and structure: every binding, data source reference, event, visibility rule and text stays as it is.`;
}

function buildBody({ groups, rows, pageId, appId, pass, device, context, boardDir, rowsById, kinds, outlineIds, warnings, platform = 'mobile' }) {
  const words = PLATFORM_WORDS[platform];
  const ids = groups.map((group) => group.id).filter((id) => id && outlineIds.has(id));
  const lines = [
    `Read: cache outline ${pageId} --app-id ${appId}, then cache blocks ${pageId} --app-id ${appId} --id ${ids.join(',') || '<the blocks the lines below name>'}; live get_blocks before writing.`,
    scaleRule(context, platform),
    `${words.pass} ${pass} on the ${device} measured: ${rows.map((row) => factFor(row, rowsById, words)).join('; ')}.`,
    ...groups.map((group) => blockLine(group, rowsById, kinds, outlineIds, warnings, words)),
  ];
  if (boardDir) {
    const regions = [...new Set(groups.flatMap((group) => [...group.regions]))];
    for (const region of regions) {
      const file = path.join(boardDir, 'crops', `${region}.png`);
      if (fs.existsSync(file)) lines.push(`Design: board/crops/${region}.png`);
      else warnings.push(`no crop for region ${region} under ${boardDir}/crops; the Design line was left out`);
    }
  }
  lines.push('Where a value has no supported key, keep the nearest supported value and say so in the report; add no new blocks.');
  lines.push('Read back with get_blocks on every block this body names and report the values against this body.');
  return lines.join('\n');
}

function proofFor(groups, outlineIds) {
  const named = groups.map((group) => (group.id && outlineIds.has(group.id) ? `${group.displayName ?? group.id} ${group.id}` : group.displayName ?? group.rows[0].element));
  return `get_blocks on ${named.join(', ')}: every value this body lists; bindings and events unchanged.`;
}

function titleFor(pageName, pass, groups, words = PLATFORM_WORDS.mobile) {
  const items = groups.slice(0, 4).map((group) => `${group.displayName ?? group.rows[0].element} ${group.rows[0].property === 'presence' ? 'missing' : group.rows[0].property}`);
  return `${pageName}: ${words.title} ${pass} fixes (${items.join(', ')}${groups.length > 4 ? ', …' : ''})`;
}

function nextIdAfter(dependsOn) {
  const hit = /^t(\d+)$/u.exec(dependsOn ?? '');
  return hit ? `t${Number(hit[1]) + 1}` : 't1';
}

function bump(id) {
  const hit = /^t(\d+)$/u.exec(id);
  return hit ? `t${Number(hit[1]) + 1}` : `${id}b`;
}

export function buildFixTasks({ gaps, outline, pageId, pageName, appId, appName, pass, dependsOn, nextId = null, publishTask = null, device = null, maxIds = 25, boardDir = null, platform = null }) {
  const kind = platformOf(gaps, platform);
  if (!PLATFORM_WORDS[kind]) throw new Error(`platform must be ${PLATFORMS.join(' or ')}`);
  const shownOn = device ?? defaultDevice(kind, gaps);
  const outlineIds = new Set(outlineNodes(outline).map((node) => node.id));
  const rows = openRows(gaps);
  if (!rows.length) return { tasks: [], warnings: [], impact: 'absorbed', rows };
  const kinds = new Map(); // elementId → kind, read from the gap rows' units
  for (const row of gaps.rows) if (row.elementId && (row.unit === 'lines' || row.property === 'text')) kinds.set(row.elementId, 'text');
  const rowsById = new Map(gaps.rows.filter((row) => row.elementId).map((row) => [row.elementId, row]));
  const warnings = [];
  const groups = groupByBlock(rows);
  const chunks = groups.length > maxIds ? [groups.slice(0, Math.ceil(groups.length / 2)), groups.slice(Math.ceil(groups.length / 2))] : [groups];
  const entity = { kind: 'page', id: pageId, name: pageName, app: appName, appId };
  const tasks = [];
  let id = nextId ?? nextIdAfter(dependsOn);
  let previous = dependsOn;
  for (const chunk of chunks) {
    const chunkRows = chunk.flatMap((group) => group.rows);
    const body = buildBody({ groups: chunk, rows: chunkRows, pageId, appId, pass, device: shownOn, context: gaps.context, boardDir, rowsById, kinds, outlineIds, warnings, platform: kind });
    tasks.push({ id, title: titleFor(pageName, pass, chunk, PLATFORM_WORDS[kind]), kind: 'page-layout', entity, dependsOn: [previous], visual: false, body, proof: proofFor(chunk, outlineIds) });
    previous = id; id = bump(id);
  }
  const lastFix = tasks[tasks.length - 1].id;
  if (publishTask) {
    const stored = publishTask.task ?? publishTask;
    tasks.push({ ...stored, dependsOn: [...new Set([...(stored.dependsOn ?? []), lastFix])] });
  }
  const problems = tasks.flatMap((task) => lintTask(task, outlineIds));
  const impact = publishTask || chunks.length === 2 ? 'major' : 'absorbed';
  return { tasks, warnings, impact, rows, problems, platform: kind };
}

export function briefMarkdown({ result, pageName, pass, outFile, planId = '<planId>' }) {
  const lines = [`# Fix brief · pass ${pass} · ${pageName}`, '', `${result.rows.length} open rows → ${result.tasks.filter((task) => task.kind === 'page-layout').length} fix task(s), impact ${result.impact}.`, ''];
  for (const task of result.tasks) {
    const relisted = task.kind !== 'page-layout';
    lines.push(`## ${relisted ? 'Re-listed' : 'Task'} ${task.id} · ${task.title}`, '', relisted ? `dependsOn now ${JSON.stringify(task.dependsOn)}` : 'Body:');
    if (!relisted) { task.body.split('\n').forEach((line, index) => lines.push(`${index + 1}. ${line}`)); lines.push('', `Proof: ${task.proof}`); }
    lines.push('');
  }
  if (result.warnings.length) lines.push('Warnings:', ...result.warnings.map((warning) => `- ${warning}`), '');
  if (result.problems?.length) lines.push('Lint:', ...result.problems.map((problem) => `- ${problem}`), '');
  const summary = result.rows.slice(0, 4).map((row) => `${row.element} ${row.property}`).join(', ') + (result.rows.length > 4 ? ` and ${result.rows.length - 4} more` : '');
  lines.push('Recommendation:', '', `plan revise ${planId} --tasks-file ${outFile} --impact ${result.impact} --reason "visual check pass ${pass}: ${summary} (person: <words>)"`, '');
  return lines.join('\n');
}

function evidenceLines(result, pass) {
  const expected = (row) => (row.property === 'presence' ? 'present' : row.property === 'extra' ? 'absent' : fmt(row.expected));
  const measured = (row) => (row.property === 'presence' ? 'absent' : row.property === 'extra' ? 'present' : fmt(row.measured));
  return result.rows.map((row) => `visual check pass ${pass} | ${row.region ?? '?'} · ${row.element} ${row.property}: expected ${expected(row)}, measured ${measured(row)}${row.delta !== null && row.delta !== undefined ? ` (Δ${fmt(row.delta)})` : ''} → ${result.tasks[0]?.id ?? '?'}`);
}

function loadPublishJson(value) {
  if (!value) return null;
  const text = fs.existsSync(value) ? fs.readFileSync(value, 'utf8') : value;
  return JSON.parse(text);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      page: { type: 'string' }, 'page-name': { type: 'string' }, app: { type: 'string' }, 'app-name': { type: 'string' }, outline: { type: 'string' },
      pass: { type: 'string', default: '1' }, 'depends-on': { type: 'string' }, 'next-id': { type: 'string' }, 'publish-task': { type: 'string' }, 'publish-json': { type: 'string' },
      plan: { type: 'string' }, device: { type: 'string' }, platform: { type: 'string' }, 'max-ids': { type: 'string', default: '25' }, board: { type: 'string' },
      evidence: { type: 'string' }, out: { type: 'string' }, md: { type: 'string' }, lint: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) { console.log(HELP); return 0; }
  const outlineIds = values.outline ? new Set(outlineNodes(readJson(values.outline)).map((node) => node.id)) : null;
  if (values.lint) {
    const tasks = readJson(values.lint);
    const problems = (Array.isArray(tasks) ? tasks : [tasks]).flatMap((task) => lintTask(task, outlineIds));
    console.log(problems.length ? problems.join('\n') : `OK ${values.lint} passes the task lint`);
    return problems.length ? 5 : 0;
  }
  if (values.platform && !PLATFORMS.includes(values.platform)) { console.error(`--platform must be ${PLATFORMS.join(' or ')}`); return 2; }
  const [gapsFile] = positionals;
  const required = ['page', 'page-name', 'app', 'app-name', 'outline', 'depends-on', 'out', 'md'];
  if (!gapsFile || required.some((key) => !values[key])) { console.error(`fix-brief needs gaps.json and --${required.join(', --')}. Run with --help.`); return 2; }
  if (values['publish-task'] && !values['publish-json']) { console.error('--publish-task needs --publish-json with the stored task (from ua plan get <planId> --json, tasks[]).'); return 2; }
  const publish = values['publish-task'] ? loadPublishJson(values['publish-json']) : null;
  if (publish && (publish.task ?? publish).id !== values['publish-task']) { console.error(`--publish-json holds task ${(publish.task ?? publish).id}, not ${values['publish-task']}`); return 2; }
  const result = buildFixTasks({
    gaps: readJson(gapsFile), outline: readJson(values.outline), pageId: values.page, pageName: values['page-name'], appId: values.app, appName: values['app-name'],
    pass: Number(values.pass), dependsOn: values['depends-on'], nextId: values['next-id'] ?? null, publishTask: publish, device: values.device ?? null, platform: values.platform ?? null, maxIds: Number(values['max-ids']), boardDir: values.board ?? null,
  });
  if (!result.tasks.length) { console.log('nothing to fix: no off, missing, extra or visual-off row is open'); return 3; }
  writeJson(values.out, result.tasks);
  fs.mkdirSync(path.dirname(values.md), { recursive: true });
  fs.writeFileSync(values.md, briefMarkdown({ result, pageName: values['page-name'], pass: Number(values.pass), outFile: values.out, planId: values.plan ?? '<planId>' }));
  if (values.evidence) writeJson(values.evidence, evidenceLines(result, Number(values.pass)));
  for (const warning of result.warnings) console.error(`warning: ${warning}`);
  if (result.problems.length) { console.error(result.problems.join('\n')); return 5; }
  const summary = { out: values.out, md: values.md, tasks: result.tasks.map((task) => task.id), rows: result.rows.length, impact: result.impact, warnings: result.warnings };
  console.log(values.json ? JSON.stringify(summary) : `OK ${result.rows.length} rows → ${result.tasks.map((task) => task.id).join(' → ')} (${result.impact}) → ${values.out}, ${values.md}`);
  return 0;
}

// Compare real paths: Node resolves the main module through symlinks (~/.claude/skills links), argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main().then((code) => process.exit(code), (error) => { console.error(error.message); process.exit(1); });
}
