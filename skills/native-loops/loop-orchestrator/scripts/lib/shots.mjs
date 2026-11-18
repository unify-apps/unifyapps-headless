// The shots a fix or build run keeps to show the person what changed, and the sheets made from them.
//
//   R/shots/<shot id>/shot.json     one screen of one page: its state, the issues it shows, each side
//   R/shots/<shot id>/before.png    the screen before the first write (a fix run)
//   R/shots/<shot id>/after.png     the same screen and state on the draft that passed (fix), or as built (build)
//   R/shots/<shot id>/design.png    the design the page was built from (a build run, optional)
//   R/shots/sheets/                 what `compose` writes: before-after-<shot id>.png for a fix run;
//                                   built-<page id>.png and built-overview.png for a build run
//
// A fix sheet shows only a shot whose after side says `verified`: the person sees what was fixed.
// No dependency: PNGs through native-visual-check's reader and writer, labels in a pixel font.
import fs from 'node:fs';
import path from 'node:path';
import { decodePngFile, readIhdrFile, resize, solidImage, writePngFile } from '../../../native-visual-check/scripts/lib/png.mjs';
import { nowMs, run } from './exec.mjs';
import { drawText, lineHeight, normalizeText, textWidth, wrapText } from './font.mjs';
import { missing, plural, usage } from './output.mjs';
import { readJson, writeJson } from './paths.mjs';

export const SIDES = ['before', 'after', 'design'];
export const AFTER_STATUSES = ['verified', 'still open', 'regressed'];
const SHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;

const WHITE = [255, 255, 255, 255];
const INK = [17, 17, 17, 255];
const MUTED = [110, 110, 110, 255];
const RULE = [214, 214, 214, 255];
const MARGIN = 32;
const GAP = 32;
const MAX_BUILD_PANELS = 4;
const OVERVIEW_PER_ROW = 4;

export const shotsDir = (runDir) => path.join(runDir, 'shots');
export const sheetsDir = (runDir) => path.join(shotsDir(runDir), 'sheets');
const shotFile = (runDir, id) => path.join(shotsDir(runDir), id, 'shot.json');
const list = (text) => String(text ?? '').split(',').map((item) => item.trim()).filter(Boolean);

/** Copy one side of a screen into R/shots/<id>/ and merge what it says into shot.json. */
export function addShot({ runDir, id, side, file, page, pageName, issues, state, title, version, status, by, order }) {
  if (!runDir || !fs.existsSync(runDir)) throw missing(`the run folder ${runDir ?? '(none)'} does not exist`);
  if (!id || !SHOT_ID.test(id) || id.includes('..')) throw usage('--id takes letters, digits, ".", "_" and "-": the first issue id the screen shows (fix) or the page id (build)');
  if (!SIDES.includes(side)) throw usage(`--side must be one of ${SIDES.join(', ')}`);
  if (!file) throw usage('shots add needs --file <png>');
  const source = path.resolve(file);
  if (!fs.existsSync(source)) throw missing(`${source} does not exist`);
  let size;
  try {
    size = readIhdrFile(source);
  } catch {
    throw usage(`${source} is not a PNG: take the screenshot as PNG`);
  }
  if (status !== undefined && side !== 'after') throw usage('--status is for an after shot');
  if (status !== undefined && !AFTER_STATUSES.includes(status)) throw usage(`--status must be one of ${AFTER_STATUSES.join(', ')}`);
  const goal = readJson(path.join(runDir, 'board.json'))?.goal ?? null;
  if (goal === 'fix' && side === 'after' && status === undefined) throw usage(`a fix run's after shot says what the retest found: --status ${AFTER_STATUSES.join('|')}`);
  if (order !== undefined && (!Number.isInteger(order) || order < 0)) throw usage('--order takes a whole number from 0');

  const existing = readJson(shotFile(runDir, id)) ?? { id, page: null, state: null, title: null, issues: [], order: null };
  if (!existing.page && !page) throw usage('the first side of a shot needs --page <page id>');
  if (existing.page && page && existing.page.id !== page) throw usage(`shot ${id} is a screen of page ${existing.page.id}, not ${page}: use another --id`);
  const target = path.join(shotsDir(runDir), id, `${side}.png`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (path.resolve(target) !== source) fs.copyFileSync(source, target);
  const record = {
    ...existing,
    page: { id: existing.page?.id ?? page, name: pageName ?? existing.page?.name ?? null },
    state: state ?? existing.state,
    title: title ?? existing.title,
    issues: [...new Set([...(existing.issues ?? []), ...list(issues)])],
    order: order ?? existing.order,
    [side]: {
      file: `${side}.png`, width: size.width, height: size.height,
      version: version ?? null, ...(side === 'after' ? { status: status ?? null, issues: list(issues) } : {}),
      by: by ?? null, at: new Date(nowMs()).toISOString(),
    },
  };
  writeJson(shotFile(runDir, id), record);
  const where = path.relative(runDir, target);
  return { data: record, text: `Shot ${id} · ${side}${status ? ` (${status})` : ''} → ${where}` };
}

/** Every shot.json under R/shots, in order (then id); one that does not parse is named, not thrown. */
export function loadShots(runDir) {
  const dir = shotsDir(runDir);
  const shots = [];
  const broken = [];
  if (!fs.existsSync(dir)) return { shots, broken };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'sheets') continue;
    const record = readJson(shotFile(runDir, entry.name));
    if (record && typeof record === 'object' && record.page?.id) shots.push({ ...record, id: record.id ?? entry.name, dir: path.join(dir, entry.name) });
    else broken.push(entry.name);
  }
  shots.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || String(a.id).localeCompare(String(b.id)));
  return { shots, broken };
}

/** Draw `image` onto `target` at (x, y), alpha over what is there. */
function blit(target, image, x, y) {
  for (let row = 0; row < image.height; row += 1) {
    const ty = y + row;
    if (ty < 0 || ty >= target.height) continue;
    for (let col = 0; col < image.width; col += 1) {
      const tx = x + col;
      if (tx < 0 || tx >= target.width) continue;
      const from = (row * image.width + col) * 4;
      const to = (ty * target.width + tx) * 4;
      const alpha = image.data[from + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        target.data[to + channel] = Math.round(image.data[from + channel] * alpha + target.data[to + channel] * (1 - alpha));
      }
      target.data[to + 3] = 255;
    }
  }
}

function frame(target, x, y, w, h, color) {
  const line = (fx, fy, fw, fh) => {
    for (let row = Math.max(0, fy); row < Math.min(target.height, fy + fh); row += 1) {
      for (let col = Math.max(0, fx); col < Math.min(target.width, fx + fw); col += 1) {
        const offset = (row * target.width + col) * 4;
        [target.data[offset], target.data[offset + 1], target.data[offset + 2], target.data[offset + 3]] = color;
      }
    }
  };
  line(x - 1, y - 1, w + 2, 1); line(x - 1, y + h, w + 2, 1); line(x - 1, y, 1, h); line(x + w, y, 1, h);
}

/** The largest scale from `max` down to 2 at which the text fits `width`, and the text cut to fit at 2. */
function fit(text, width, max) {
  for (let scale = max; scale >= 2; scale -= 1) if (textWidth(text, scale) <= width) return { text, scale };
  let cut = normalizeText(text);
  while (cut.length > 1 && textWidth(`${cut}...`, 2) > width) cut = cut.slice(0, -1);
  return { text: `${cut}...`, scale: 2 };
}

/**
 * One sheet: a title, a muted subtitle, then rows of panels, each a picture under its label and
 * caption, scaled to `panelWidth` and framed. White, like a slide, so it can be pasted anywhere.
 * rows: [[{ image, label, caption }]]
 */
export function renderSheet({ title, subtitle = '', rows, panelWidth = 480, labelScale = 4 }) {
  const cols = Math.max(1, ...rows.map((row) => row.length));
  const width = MARGIN * 2 + cols * panelWidth + (cols - 1) * GAP;
  const inner = width - MARGIN * 2;
  const titleLines = wrapText(title, inner, 3);
  const subtitleLines = subtitle ? wrapText(subtitle, inner, 2) : [];
  const laid = rows.map((row) => {
    const panels = row.map((panel) => ({
      ...panel,
      image: panel.image.width === panelWidth ? panel.image : resize(panel.image, panelWidth),
      label: fit(panel.label ?? '', panelWidth, labelScale),
      caption: panel.caption ? fit(panel.caption, panelWidth, 2) : null,
    }));
    const labelHeight = Math.max(...panels.map((panel) => lineHeight(panel.label.scale)));
    const captionHeight = panels.some((panel) => panel.caption) ? 4 + lineHeight(2) : 0;
    const head = labelHeight + captionHeight + 12;
    return { panels, labelHeight, head, height: head + Math.max(...panels.map((panel) => panel.image.height)) };
  });
  const top = MARGIN + titleLines.length * lineHeight(3) + (subtitleLines.length ? 6 + subtitleLines.length * lineHeight(2) : 0) + 24;
  const height = top + laid.reduce((sum, row) => sum + row.height, 0) + GAP * Math.max(0, laid.length - 1) + MARGIN;
  const sheet = solidImage(width, height, WHITE);

  let y = MARGIN;
  for (const line of titleLines) { drawText(sheet, line, MARGIN, y, { scale: 3, color: INK }); y += lineHeight(3); }
  if (subtitleLines.length) {
    y += 6;
    for (const line of subtitleLines) { drawText(sheet, line, MARGIN, y, { scale: 2, color: MUTED }); y += lineHeight(2); }
  }
  y = top;
  for (const row of laid) {
    row.panels.forEach((panel, index) => {
      const x = MARGIN + index * (panelWidth + GAP);
      const labelY = y + row.labelHeight - lineHeight(panel.label.scale);
      drawText(sheet, panel.label.text, x + Math.floor((panelWidth - textWidth(panel.label.text, panel.label.scale)) / 2), labelY, { scale: panel.label.scale, color: INK });
      if (panel.caption) {
        drawText(sheet, panel.caption.text, x + Math.floor((panelWidth - textWidth(panel.caption.text, 2)) / 2), y + row.labelHeight + 4, { scale: 2, color: MUTED });
      }
      blit(sheet, panel.image, x, y + row.head);
      frame(sheet, x, y + row.head, panel.image.width, panel.image.height, RULE);
    });
    y += row.height + GAP;
  }
  return sheet;
}

function picture(shot, side) {
  if (!shot[side]) return null;
  const file = path.join(shot.dir, shot[side].file ?? `${side}.png`);
  if (!fs.existsSync(file)) return null;
  try {
    return decodePngFile(file);
  } catch {
    return null;
  }
}

const pageName = (shot) => shot.page?.name || shot.page?.id;
const joined = (...parts) => parts.filter(Boolean).join(' · ');

function fixSheets(runDir, shots) {
  const sheets = [];
  const skipped = [];
  for (const shot of shots) {
    const reason = !shot.before ? 'no before shot'
      : !shot.after ? 'no after shot'
        : shot.after.status !== 'verified' ? `after shot ${shot.after.status ? `says ${shot.after.status}` : 'has no status'}`
          : null;
    if (reason) { skipped.push({ id: shot.id, reason }); continue; }
    const before = picture(shot, 'before');
    const after = picture(shot, 'after');
    if (!before || !after) { skipped.push({ id: shot.id, reason: `the ${before ? 'after' : 'before'} PNG does not decode` }); continue; }
    const proven = shot.after.issues?.length ? shot.after.issues : shot.issues ?? [];
    const fixed = proven.length ? `fixed ${proven.join(', ')}` : null;
    const sheet = renderSheet({
      title: shot.title || joined(pageName(shot), shot.state),
      subtitle: shot.title ? joined(pageName(shot), shot.state, fixed) : fixed ?? '',
      rows: [[
        { image: before, label: 'BEFORE', caption: shot.before.version },
        { image: after, label: 'AFTER', caption: shot.after.version },
      ]],
    });
    const file = path.join(sheetsDir(runDir), `before-after-${shot.id}.png`);
    writePngFile(file, sheet);
    sheets.push({ kind: 'before-after', file, shot: shot.id, page: shot.page, issues: proven });
  }
  return { sheets, skipped };
}

function buildSheets(runDir, shots, runId) {
  const sheets = [];
  const skipped = [];
  const pages = new Map();
  for (const shot of shots) {
    if (!shot.after) { skipped.push({ id: shot.id, reason: 'no after shot' }); continue; }
    if (!pages.has(shot.page.id)) pages.set(shot.page.id, []);
    pages.get(shot.page.id).push(shot);
  }
  const tops = [];
  for (const [pageId, group] of pages) {
    const built = group.map((shot) => ({ shot, image: picture(shot, 'after') })).filter((item) => item.image);
    for (const item of group) if (!built.some((entry) => entry.shot === item)) skipped.push({ id: item.id, reason: 'the after PNG does not decode' });
    if (!built.length) continue;
    const designShot = group.find((shot) => shot.design);
    const design = designShot ? picture(designShot, 'design') : null;
    if (designShot && !design) skipped.push({ id: designShot.id, reason: 'the design PNG does not decode' });
    const room = MAX_BUILD_PANELS - (design ? 1 : 0);
    const shown = built.slice(0, room);
    const panels = [
      ...(design ? [{ image: design, label: 'DESIGN', caption: 'the approved design' }] : []),
      ...shown.map((item, index) => ({
        image: item.image,
        label: shown.length > 1 ? `BUILT ${index + 1}` : 'BUILT',
        caption: joined(item.shot.state, item.shot.after.version),
      })),
    ];
    const more = built.length - shown.length;
    const name = pageName(group[0]);
    const sheet = renderSheet({
      title: group[0].title || name,
      subtitle: joined(group[0].title ? name : null, `run ${runId}`, more > 0 ? `${plural(more, 'more shot')} in shots/` : null),
      rows: [panels],
    });
    const file = path.join(sheetsDir(runDir), `built-${pageId}.png`);
    writePngFile(file, sheet);
    sheets.push({ kind: 'built', file, page: group[0].page, shots: shown.map((item) => item.shot.id) });
    tops.push({ image: built[0].image, label: name, caption: built[0].shot.after.version });
  }
  if (tops.length >= 2) {
    const rows = [];
    for (let index = 0; index < tops.length; index += OVERVIEW_PER_ROW) rows.push(tops.slice(index, index + OVERVIEW_PER_ROW));
    const sheet = renderSheet({ title: 'What was built', subtitle: joined(plural(tops.length, 'page'), `run ${runId}`), rows, panelWidth: 360, labelScale: 3 });
    const file = path.join(sheetsDir(runDir), 'built-overview.png');
    writePngFile(file, sheet);
    sheets.unshift({ kind: 'overview', file, pages: tops.length });
  }
  return { sheets, skipped };
}

/** Open the sheets in the system viewer (macOS `open`); elsewhere say where they are. */
function openSheets(files) {
  if (!files.length) return 'nothing to open';
  if (process.platform !== 'darwin' && !process.env.LOOPS_FAKE_EXEC) return 'not opened: `open` is macOS only';
  const result = run('open', files);
  return result.status === 0 ? `opened ${plural(files.length, 'sheet')}` : `not opened: ${result.stderr.trim() || `open exited ${result.status}`}`;
}

/** The sheets of a fix run (before and after) or a build run (what was built), into R/shots/sheets/. */
export function composeShots({ runDir, runId = path.basename(runDir ?? ''), goal, open = false }) {
  if (!runDir || !fs.existsSync(runDir)) throw missing(`the run folder ${runDir ?? '(none)'} does not exist`);
  const { shots, broken } = loadShots(runDir);
  const kind = goal ?? readJson(path.join(runDir, 'board.json'))?.goal ?? (shots.some((shot) => shot.before) ? 'fix' : 'build');
  if (!['fix', 'build'].includes(kind)) throw usage(`shots compose makes sheets for a fix or a build run, not ${kind}: pass --goal fix|build`);
  fs.rmSync(sheetsDir(runDir), { recursive: true, force: true });
  const { sheets, skipped } = kind === 'fix' ? fixSheets(runDir, shots) : buildSheets(runDir, shots, runId);
  for (const name of broken) skipped.push({ id: name, reason: 'shot.json missing or unreadable' });
  const opened = open ? openSheets(sheets.map((sheet) => sheet.file)) : null;
  const what = kind === 'fix' ? 'before/after' : 'built';
  const lines = [
    sheets.length ? `${plural(sheets.length, `${what} sheet`)} in ${path.relative(runDir, sheetsDir(runDir))}/:` : `No ${what} sheet: ${shots.length ? 'no shot is complete' : 'no shot was taken'}.`,
    ...sheets.map((sheet) => `- ${sheet.file}`),
    ...skipped.map((item) => `- not shown: ${item.id} (${item.reason})`),
    ...(opened ? [opened] : []),
  ];
  return { data: { goal: kind, sheets, skipped, opened }, text: lines.join('\n') };
}

/** The shots of a run, one line each. */
export function listShots({ runDir }) {
  if (!runDir || !fs.existsSync(runDir)) throw missing(`the run folder ${runDir ?? '(none)'} does not exist`);
  const { shots, broken } = loadShots(runDir);
  const side = (shot, name) => (shot[name] ? `${name}${shot[name].version ? ` ${shot[name].version}` : ''}${shot[name].status ? ` (${shot[name].status})` : ''}` : null);
  const lines = shots.map((shot) => `${shot.id} · ${pageName(shot)}${shot.state ? ` · ${shot.state}` : ''} · ${[side(shot, 'before'), side(shot, 'after'), side(shot, 'design')].filter(Boolean).join(' · ') || 'no side'}${shot.issues?.length ? ` · ${shot.issues.join(', ')}` : ''}`);
  for (const name of broken) lines.push(`${name} · shot.json missing or unreadable`);
  return { data: { shots: shots.map(({ dir, ...shot }) => shot), broken }, text: lines.length ? lines.join('\n') : 'No shots in this run.' };
}
