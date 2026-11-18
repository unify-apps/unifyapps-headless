// The solution design store: <solution>/design/<app-id>/ with design.md (the index), sources/ (files as given),
// screens/<screen>.png (one reference per screen and state) and specs/<screen>.json (+ .region-map.json).
// A screen is a page in one state: `home` (idle) or `home--empty`. design.md is for people and agents to read;
// its data lives in one JSON comment at its end, and the part between the index markers is rewritten from that
// data on every change. Text outside the markers (the notes) is kept.
// A WEB app's store (platform WEB) keeps one reference and one spec per screen and width, in CSS px with no
// device scaling: screens/<screen>@<width>.png and specs/<screen>@<width>.json, the files web-visual-check reads.
import crypto from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { slug, writeFileAtomic } from './args.mjs';

export const STORE_SCHEMA = 'loops.design-store/1';
export const DEFAULT_DEVICE = Object.freeze({ model: 'iPhone 16 Pro', widthPt: 402, heightPt: 874, safeAreaTop: 62, pxPerPt: 3 });
export const PLATFORMS = Object.freeze(['MOBILE', 'WEB']);
// A WEB page is checked at the design's own width (1440 unless the design is drawn at another) and at 375, the
// app frame of the phone view; only the design width has a spec. KNOWN_WEB_WIDTHS are the widths a picture's
// own width is recognised as.
export const WEB_WIDTHS = Object.freeze([1440, 375]);
export const KNOWN_WEB_WIDTHS = Object.freeze([2560, 1920, 1680, 1440, 1366, 1280, 1024, 768, 390, 375]);
export const WEB_DEVICE = Object.freeze({ model: 'browser', widthPt: 1440, heightPt: 900, safeAreaTop: 0, pxPerPt: 1 });
const START = '<!-- design-store:index:start -->';
const END = '<!-- design-store:index:end -->';
const DATA = /<!-- design-store:data\n([\s\S]*?)\n-->/;

export function storeDir(solutionDir, appId) {
  if (!appId || /[\\/]|\.\./.test(appId)) throw new Error(`--app must be an app id, got "${appId ?? ''}"`);
  return path.join(path.resolve(solutionDir), 'design', appId);
}

export const pageSlug = (page) => slug(page, 'page');
const isIdle = (state) => !state || slug(state) === 'idle';
/** `home` for the idle state, `home--empty` for another one; on WEB `home@1440`, `home--empty@375`. */
export const screenKey = (page, state = null, width = null) => `${isIdle(state) ? pageSlug(page) : `${pageSlug(page)}--${slug(state)}`}${width ? `@${width}` : ''}`;
/** The screen part of a key: `home--empty@375` → `home--empty` (what web-visual-check takes as --screen). */
export const screenOf = (key) => String(key).replace(/@\d+$/u, '');
const posix = (...parts) => path.posix.join(...parts);
export const screenFile = (key) => posix('screens', `${key}.png`);
export const specFile = (key) => posix('specs', `${key}.json`);
export const regionMapFile = (key) => posix('specs', `${key}.region-map.json`);

const given = (object = {}) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));

/** 'WEB' or 'MOBILE' from a flag value (web, WEB, mobile); null when none was given. */
export function platformOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const upper = String(value).trim().toUpperCase();
  if (!PLATFORMS.includes(upper)) throw new Error(`--platform must be web or mobile, got "${value}"`);
  return upper;
}

/** A store without a platform is a MOBILE one (every store written before WEB, and every MOBILE one since). */
export const isWeb = (index) => index?.platform === 'WEB';

/** "1440,375" → [1440, 375]: whole CSS px widths from 320 to 3840. */
export function parseWidths(text) {
  const list = (Array.isArray(text) ? text : String(text ?? '').split(',')).map((item) => String(item).trim()).filter(Boolean).map(Number);
  for (const width of list) if (!Number.isInteger(width) || width < 320 || width > 3840) throw new Error(`a width is a whole number of CSS px from 320 to 3840, got "${width}"`);
  return [...new Set(list)];
}

/**
 * The width a WEB picture was shot at, from its pixel width: a known width at 1x, else at 2x, else at 3x
 * (2880 px → 1440, 750 px → 375). Null when it is none of them: the caller then has to say --width.
 */
export function webWidthOfPicture(pxWidth) {
  for (const k of [1, 2, 3]) if (pxWidth % k === 0 && KNOWN_WEB_WIDTHS.includes(pxWidth / k)) return { width: pxWidth / k, k };
  return null;
}

export function emptyIndex(appId, { appName = null, device = {}, platform = null, widths = null } = {}) {
  const web = platform === 'WEB';
  // A MOBILE index carries no platform key, as every one written before WEB did.
  const index = { schema: STORE_SCHEMA, appId, appName, ...(web ? { platform: 'WEB' } : {}), approved: null, device: { ...(web ? WEB_DEVICE : DEFAULT_DEVICE), ...given(device) }, sources: [], screens: {}, createdAt: new Date().toISOString(), updatedAt: null };
  if (web) {
    index.widths = widths?.length ? widths : [...WEB_WIDTHS];
    index.device.widthPt = index.widths[0];
  }
  return index;
}

// A store written before the design spec was named kept its specs in contracts/ and its index named them
// `contract` and `contractSummary`. The folder moves to specs/ once; the index is read in the new names.
const LEGACY_SPEC_DIR = 'contracts';
const legacyPath = (file) => (typeof file === 'string' ? file.replace(/^contracts\//u, 'specs/') : file);

/** Moves an old store's contracts/ to specs/ once. Returns { from, to, moved } or null when there was nothing to move. */
export function moveLegacySpecs(dir) {
  const from = path.join(dir, LEGACY_SPEC_DIR);
  const to = path.join(dir, 'specs');
  if (!existsSync(from)) return null;
  if (!existsSync(to)) {
    renameSync(from, to);
    return { from, to, moved: 'all' };
  }
  // Both exist (specs/ was made first): move each file specs/ does not have yet; a name in both stays put.
  const moved = [];
  for (const name of readdirSync(from)) {
    if (existsSync(path.join(to, name))) continue;
    renameSync(path.join(from, name), path.join(to, name));
    moved.push(name);
  }
  try { rmdirSync(from); } catch { /* still holds a file specs/ also has */ }
  return { from, to, moved };
}

function upgradeIndex(index) {
  for (const screen of Object.values(index.screens ?? {})) {
    if ('contract' in screen) {
      screen.spec ??= legacyPath(screen.contract);
      delete screen.contract;
    }
    if ('contractSummary' in screen) {
      screen.specSummary ??= screen.contractSummary;
      delete screen.contractSummary;
    }
    if (screen.regionMap) screen.regionMap = legacyPath(screen.regionMap);
  }
  return index;
}

export function readIndex(dir) {
  const file = path.join(dir, 'design.md');
  if (!existsSync(file)) return null;
  const match = DATA.exec(readFileSync(file, 'utf8'));
  if (!match) throw new Error(`${file} has no design-store data block; it was not written by store.mjs`);
  return upgradeIndex(JSON.parse(match[1]));
}

const cell = (value) => String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** How design.md names a screen's source: figma <key>/<node>, prototype <file>#<anchor>, screenshot <file>, pdf <file>. */
export function sourceLabel(screen) {
  if (screen.figma?.fileKey) return `figma ${screen.figma.fileKey}/${screen.figma.nodeId}`;
  if (screen.sourceKind === 'html') {
    const anchor = screen.url ? new URL(screen.url, 'http://x').hash : '';
    return `prototype ${screen.source ?? '—'}${anchor && !String(screen.source).includes('#') ? anchor : ''}`;
  }
  if (screen.sourceKind) return `${screen.sourceKind} ${screen.source ?? ''}`.trim();
  return screen.source ?? '—';
}

function deviceLine(index) {
  if (isWeb(index)) {
    const shown = [...new Set(Object.values(index.screens).map((screen) => screen.width).filter(Boolean))].sort((a, b) => b - a);
    const extra = shown.filter((width) => !(index.widths ?? []).includes(width));
    return `- Device: browser (WEB) · widths ${(index.widths ?? WEB_WIDTHS).join(', ')}${extra.length ? ` (also ${extra.join(', ')} from the design)` : ''} · one spec per width, CSS px from the app's top-left, 1:1 (no device scaling, no grid)`;
  }
  return `- Device: ${index.device.model} ${index.device.widthPt}×${index.device.heightPt} pt, safe top ${index.device.safeAreaTop} · ${scaleLine(index)}`;
}

function scaleLine(index) {
  const frames = [...new Set(Object.values(index.screens).map((screen) => screen.frame?.widthPt).filter(Boolean))];
  const device = index.device.widthPt;
  if (!frames.length) return `scale rule: <canvas> → ${device} (×k), 4 pt grid`;
  return frames.map((width) => (Math.abs(width - device) < 0.5 ? `canvas ${width} = device, whole points` : `canvas ${width} → ${device} (×${(device / width).toFixed(4)}), 4 pt grid`)).join('; ');
}

// One row per screen and state, and on WEB per width too: the widest first under one page and state.
const rowOrder = (a, b) => screenOf(a.key).localeCompare(screenOf(b.key)) || (b.width ?? 0) - (a.width ?? 0);

export function renderIndex(index) {
  const web = isWeb(index);
  const screens = Object.values(index.screens).sort(rowOrder);
  // The width column is a WEB one: a MOBILE store's table is as it always was.
  const lines = [
    START,
    `- Approved: ${index.approved ? `${index.approved.words} (${index.approved.at.slice(0, 10)})` : 'not yet approved'}`,
    deviceLine(index),
    '',
    web ? '| screen | state | width | page (name · id) | source | version | reference | spec | notes |' : '| screen | state | page (name · id) | source | version | reference | spec | notes |',
    web ? '|---|---|---|---|---|---|---|---|---|' : '|---|---|---|---|---|---|---|---|',
    ...screens.map((screen) => [
      cell(screen.pageName ?? screen.page), cell(screen.state ?? 'idle'), ...(web ? [cell(screen.width)] : []), cell(`${screen.pageName ?? '—'} · ${screen.pageId ?? '—'}`),
      cell(sourceLabel(screen)), cell(screen.version), screen.reference ? `[${screen.reference}](${screen.reference})` : '—',
      screen.spec ? `[${screen.spec}](${screen.spec})${screen.specSummary ? ` (${screen.specSummary.elements} elements${screen.specSummary.unknownFonts ? `, ${screen.specSummary.unknownFonts} unknown font values` : ''})` : ''}` : '—',
      cell(screen.notes ?? ''),
    ].join(' | ')).map((row) => `| ${row} |`),
    ...(screens.length ? [] : [web ? '| — | — | — | — | — | — | — | — | no screens yet |' : '| — | — | — | — | — | — | — | no screens yet |']),
    '',
    '| source file | kind | screen | version | added |',
    '|---|---|---|---|---|',
    ...index.sources.map((source) => `| [${source.file}](${source.file}) | ${source.kind} | ${cell(source.screen)} | ${cell(source.version)} | ${source.addedAt.slice(0, 10)} |`),
    ...(index.sources.length ? [] : ['| — | — | — | — | — |']),
    END,
  ];
  return lines.join('\n');
}

export function writeIndex(dir, index) {
  index.updatedAt = new Date().toISOString();
  const file = path.join(dir, 'design.md');
  const data = `<!-- design-store:data\n${JSON.stringify(index, null, 2)}\n-->`;
  let text = existsSync(file) ? readFileSync(file, 'utf8')
    : `# Design — ${index.appName ?? index.appId} (${index.appId})\n\n${START}\n${END}\n\n## Notes\n\nWritten by the native-design-spec block (store.mjs). Write notes here; the part above is rewritten on every change.\n\n${data}\n`;
  if (text.indexOf(START) < 0 || text.indexOf(END) < text.indexOf(START)) text = `${text.trimEnd()}\n\n${START}\n${END}\n`;
  const start = text.indexOf(START), end = text.indexOf(END) + END.length;
  text = text.slice(0, start) + renderIndex(index) + text.slice(end);
  text = DATA.test(text) ? text.replace(DATA, () => data) : `${text.trimEnd()}\n\n${data}\n`;
  writeFileAtomic(file, text);
  return file;
}

export function ensureStore(dir, appId, options = {}) {
  moveLegacySpecs(dir);
  for (const sub of ['sources', 'screens', 'specs']) mkdirSync(path.join(dir, sub), { recursive: true });
  let index = readIndex(dir);
  const created = !index;
  if (!index) index = emptyIndex(appId, options);
  else {
    const now = index.platform ?? 'MOBILE';
    if (options.platform && options.platform !== now) throw new Error(`${dir} is a ${now} store; an app is WEB or MOBILE, never both`);
    if (options.device) index.device = { ...index.device, ...given(options.device) };
    if (isWeb(index) && options.widths?.length) { index.widths = options.widths; index.device.widthPt = options.widths[0]; }
  }
  if (options.appName) index.appName = options.appName;
  writeIndex(dir, index);
  return { index, created };
}

export function loadStore(dir) {
  moveLegacySpecs(dir);
  const index = readIndex(dir);
  if (!index) throw new Error(`${dir} is not a design store yet: run "store.mjs init" first`);
  return index;
}

export function sha256(file) { return crypto.createHash('sha256').update(readFileSync(file)).digest('hex'); }

export function classifySource(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.html', '.htm'].includes(ext)) return 'html';
  if (['.png', '.jpg', '.jpeg', '.heic', '.webp', '.gif', '.tif', '.tiff', '.bmp'].includes(ext)) return 'screenshot';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.css') return 'css';
  if (ext === '.svg') return 'svg';
  if (ext === '.xml') return 'figma-metadata';
  if (ext === '.zip') return 'archive';
  return 'other';
}

/** Copies one file into sources/ (the same content is never copied twice) and records it. */
export function addSource(dir, index, file, { kind, screen = null, version = null, notes = null, origin = null, name: wanted = null } = {}) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`${file} is not a file`);
  const hash = sha256(file);
  const known = index.sources.find((source) => source.sha256 === hash);
  if (known) {
    if (screen && !known.screen) known.screen = screen;
    return { entry: known, copied: false };
  }
  const ext = path.extname(wanted ?? file).toLowerCase();
  const base = wanted ? path.basename(wanted, ext) : slug(path.basename(file, path.extname(file)), 'source');
  let name = `${base}${ext}`;
  for (let n = 2; index.sources.some((source) => source.file === posix('sources', name)) || existsSync(path.join(dir, 'sources', name)); n++) name = `${base}-${n}${ext}`;
  copyFileSync(file, path.join(dir, 'sources', name));
  const entry = { file: posix('sources', name), kind: kind ?? classifySource(file), sha256: hash, bytes: statSync(file).size, screen, version: version ?? `sha:${hash.slice(0, 8)}`, origin: origin ?? path.basename(file), notes, addedAt: new Date().toISOString() };
  index.sources.push(entry);
  return { entry, copied: true };
}

export function screenEntry(index, page, state = null, width = null) {
  if (isWeb(index) && !width) throw new Error('a WEB screen has a width: pass --width <px> (the design store keeps one spec per width)');
  const key = screenKey(page, state, isWeb(index) ? width : null);
  index.screens[key] ??= { key, page: pageSlug(page), state: isIdle(state) ? 'idle' : state, ...(isWeb(index) ? { width } : {}), pageId: null, pageName: null, source: null, sourceKind: null, url: null, version: null, reference: null, px: null, pxPerPt: null, frame: null, figma: null, spec: null, regionMap: null, specSummary: null, notes: null, updatedAt: null };
  return index.screens[key];
}

/** The widths a page in a state has entries for, widest first (WEB). */
export function widthsOf(index, page, state = null) {
  const base = screenKey(page, state);
  return Object.values(index.screens).filter((screen) => screenOf(screen.key) === base && screen.width).map((screen) => screen.width).sort((a, b) => b - a);
}

/**
 * The entry a command acts on. MOBILE: the page in its state. WEB: the given width, else the only width the
 * page has in that state, else `pick` ('widest' takes the widest) or an error naming the widths there are.
 */
export function findEntry(index, page, state = null, width = null, { create = false, pick = null } = {}) {
  if (!isWeb(index)) return create ? screenEntry(index, page, state) : index.screens[screenKey(page, state)] ?? null;
  if (width) return create ? screenEntry(index, page, state, width) : index.screens[screenKey(page, state, width)] ?? null;
  const widths = widthsOf(index, page, state);
  if (widths.length === 1 || (widths.length && pick === 'widest')) return index.screens[screenKey(page, state, widths[0])];
  if (!widths.length) throw new Error(`no ${screenKey(page, state)} screen at any width yet: pass --width <px>`);
  throw new Error(`${screenKey(page, state)} has ${widths.join(', ')}: pass --width <px>`);
}
