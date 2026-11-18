// The person's material as numbered parts small enough to read whole, a ledger of them, and the check that holds the
// notes to it: a long transcript read in one go gets skimmed, a part at a time does not. Material arrives as zips,
// self-contained HTML pages that are mostly embedded media, and films with their captions beside them, none of which
// a single read takes in; each becomes text parts, and a film also sheets of its frames. Also a search across the
// parts, so a name, figure or system is looked up in the material before anything is guessed.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UsageError, readJson, writeJson } from './util.mjs';

// a part one read takes in whole, with room left to think about it: about 6,000 words
const PART_LINES = 400, PART_CHARS = 24000;
// a line longer than this (minified code, an inlined file) is cut into pieces, so no part is one endless line
const LINE_CHARS = 4000;
// a PDF is read through its pages, 20 at a time (the most one read of a PDF takes)
const PDF_PAGES = 20;
// a film's sheet: 12 frames spread over its length, 480 px wide each, enough to see its look and its scenes
const SHEET_FRAMES = 12;
// and its reading sheets: a frame at each change of picture, at most 32, four to a sheet at 960 px wide, so the words
// and figures on screen (a chart and its source line, a slide's list) can be read, which captions never carry
const READ_FRAMES = 32, READ_PER_SHEET = 4;
// a change of picture: how far a keyframe differs from the one before (ffmpeg's scene score, 0 to 1); its frame is taken
// once a transition has had time to settle, 1.5 s on, or just before the next change
const SCENE_CHANGE = 0.2, SETTLE = 1.5;
// notes shorter than this under a part's heading are a heading, not notes
const MIN_WORDS = 25;
const TEXT = new Set(['.txt', '.md', '.vtt', '.srt', '.csv', '.tsv', '.json', '.yaml', '.yml', '.xml', '.log']);
const MEDIA = new Set(['.mp3', '.m4a', '.wav', '.aac', '.mp4', '.mov', '.webm', '.mkv']);
const FILM = new Set(['.mp4', '.mov', '.webm', '.mkv']);

const ledgerFile = (dir) => path.join(dir, 'inputs', 'parts.json');
const notesFile = (dir) => path.join(dir, 'inputs', 'notes.md');
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const has = (cmd) => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };

const entities = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
// an Office file is a zip of XML: its paragraphs, in order, as lines
const officeText = (file, members, para, tab) => {
  const xml = members.map((m) => { try { return run('unzip', ['-p', file, m]); } catch { return ''; } }).join('\n');
  return entities(xml.replace(para, '\n').replace(tab, '\t').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
};

const DATA_URI = /data:([a-z0-9.+/-]+)(;base64)?,([A-Za-z0-9+/=%]+)/gi;
/**
 * A self-contained page's words: what it shows, its alt text and labels, and any captions it carries inside; never
 * its embedded pictures, sound, fonts, scripts or styles, which are nearly all of its bytes.
 */
function htmlText(raw) {
  const captions = [...raw.matchAll(DATA_URI)].filter((m) => /^text\/(vtt|srt|plain)$/i.test(m[1]))
    .map((m) => (m[2] ? Buffer.from(m[3], 'base64').toString('utf8') : decodeURIComponent(m[3])));
  const media = [...raw.matchAll(DATA_URI)].filter((m) => /^(audio|video)\//i.test(m[1])).length;
  const page = raw.replace(DATA_URI, '').replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*\b(?:alt|aria-label|title)="([^"]{3,})"[^>]*>/gi, (_, label) => ` ${label} `)
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|td|th|figcaption|blockquote|button|a)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const text = entities(page).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return [text, ...captions.map((c) => `\n--- captions carried inside the page ---\n${c.trim()}`), ...(media ? [`\n--- ${media} sound or film file(s) inside the page, not read ---`] : [])].join('\n');
}

/** A file's text, or null for what is read another way (a PDF's pages, a picture, a recording). */
function textOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT.has(ext)) return fs.readFileSync(file, 'utf8');
  if (ext === '.html' || ext === '.htm') return htmlText(fs.readFileSync(file, 'utf8'));
  if (ext === '.docx') return officeText(file, ['word/document.xml'], /<\/w:p>/g, /<w:tab\/>/g);
  if (ext === '.pptx') {
    const slides = run('unzip', ['-Z1', file]).split('\n').filter((m) => /^ppt\/(slides|notesSlides)\/\w+\d+\.xml$/.test(m)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return officeText(file, slides, /<\/a:p>/g, /<a:tab\/>/g);
  }
  return null;
}

// a PDF's page count, read from its page objects (a rough count is enough to split it into reads)
const pdfPages = (file) => (fs.readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length || 1;

// a zip is unpacked beside the parts and read like a folder
function walk(p, unpacked) {
  if (fs.statSync(p).isDirectory()) return fs.readdirSync(p).filter((f) => !f.startsWith('.') && f !== '__MACOSX').sort().flatMap((f) => walk(path.join(p, f), unpacked));
  if (path.extname(p).toLowerCase() !== '.zip') return [p];
  const to = path.join(unpacked, path.basename(p, path.extname(p)));
  fs.mkdirSync(to, { recursive: true });
  run('unzip', ['-q', '-o', p, '-d', to]);
  return walk(to, unpacked);
}

/** The times (s) a film's picture changes, read from its keyframes only: at most `max`, spread evenly when more. */
function changes(file, max) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-skip_frame', 'nokey', '-i', file, '-vf', `select='gt(scene,${SCENE_CHANGE})',showinfo`, '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 256 << 20 });
  const cuts = [0, ...[...String(r.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1])];
  const ts = cuts.map((t, i) => Math.max(t, Math.min(t + SETTLE, (cuts[i + 1] ?? Infinity) - 0.2)));
  return ts.length <= max ? ts : Array.from({ length: max }, (_, i) => ts[Math.round((i * (ts.length - 1)) / (max - 1))]);
}
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** A film's duration in seconds, from ffprobe. */
const duration = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim()) || 0;

/**
 * Splits every source file into parts under inputs/parts/ and writes the ledger, inputs/parts.json. A part holds whole
 * lines and says where they came from; a PDF becomes page ranges; a film becomes a sheet of its frames for its look,
 * and reading sheets of a frame at each change of picture for what it shows, its words coming from the captions beside
 * it; a recording with no captions is listed to transcribe first.
 */
export function splitInputs(dir, sources) {
  if (!sources.length) throw new UsageError('inputs needs the material: one or more files, folders or zips');
  const partsDir = path.join(dir, 'inputs', 'parts'), unpacked = path.join(dir, 'inputs', 'unpacked');
  const own = [partsDir, unpacked].map((d) => d + path.sep);
  const files = [...new Set(sources.flatMap((s) => {
    if (!fs.existsSync(s)) throw new UsageError(`no file or folder ${s}`);
    return walk(path.resolve(s), unpacked);
  }))].filter((f) => (!own.some((d) => f.startsWith(d)) || f.startsWith(unpacked)) && ![notesFile(dir), ledgerFile(dir)].includes(f));
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });
  const parts = [], skipped = [];
  const add = (p) => { parts.push({ id: `P${parts.length + 1}`, ...p }); return parts.at(-1); };
  const slug = (f) => path.basename(f).replace(/[^\w.-]+/g, '_');
  const ffmpeg = has('ffmpeg') && has('ffprobe');
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.pdf') {
      const pages = pdfPages(file);
      for (let a = 1; a <= pages; a += PDF_PAGES) add({ file, pages: `${a}-${Math.min(pages, a + PDF_PAGES - 1)}` });
      continue;
    }
    if (MEDIA.has(ext)) {
      const stem = file.slice(0, -ext.length), captions = ['.srt', '.vtt'].map((e) => stem + e).find((c) => fs.existsSync(c));
      if (FILM.has(ext) && ffmpeg) {
        const secs = duration(file), p = add({ file, frames: SHEET_FRAMES, ...(captions && { captions: path.basename(captions) }) });
        p.part = path.join(partsDir, `${p.id}-${slug(file)}.jpg`);
        const every = Math.max(1, secs / SHEET_FRAMES);
        run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${every.toFixed(2)},scale=480:-1,tile=4x3`, '-frames:v', '1', p.part]);
        const times = changes(file, READ_FRAMES), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-frames-'));
        try {
          times.forEach((t, i) => run('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=960:-1', path.join(tmp, `${String(i).padStart(3, '0')}.jpg`)]));
          for (let a = 0; a < times.length; a += READ_PER_SHEET) {
            const at = times.slice(a, a + READ_PER_SHEET), q = add({ file, frames: at.length, at: at.map(clock).join(', '), ...(captions && { captions: path.basename(captions) }) });
            q.part = path.join(partsDir, `${q.id}-${slug(file)}.jpg`);
            run('ffmpeg', ['-v', 'error', '-y', '-start_number', String(a), '-i', path.join(tmp, '%03d.jpg'), '-vf', 'tile=2x2', '-frames:v', '1', q.part]);
          }
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      }
      if (!captions) skipped.push({ file, why: FILM.has(ext) && ffmpeg ? 'no captions beside it: its frames are a part; transcribe it for its words' : 'a recording with no captions: transcribe it, then add the transcript' });
      continue;
    }
    const text = textOf(file);
    if (text == null) { skipped.push({ file, why: 'not text: look at it directly' }); continue; }
    const lines = text.split(/\r?\n/).flatMap((l) => (l.length > LINE_CHARS ? l.match(new RegExp(`[\\s\\S]{1,${LINE_CHARS}}`, 'g')) : [l]));
    for (let a = 0; a < lines.length;) {
      let b = a, chars = 0;
      while (b < lines.length && b - a < PART_LINES && (chars + lines[b].length < PART_CHARS || b === a)) chars += lines[b++].length + 1;
      const p = add({ file, lines: `${a + 1}-${b}`, ...(ext === '.html' || ext === '.htm' ? { from: 'the page\'s words' } : {}) });
      p.part = path.join(partsDir, `${p.id}-${slug(file)}.txt`);
      fs.writeFileSync(p.part, lines.slice(a, b).join('\n'));
      a = b;
    }
  }
  writeJson(ledgerFile(dir), { parts, skipped });
  return { parts, skipped };
}

/** The ledger, or null when the material was never split (a story written without material). */
export const readLedger = (dir) => (fs.existsSync(ledgerFile(dir)) ? readJson(ledgerFile(dir)) : null);

export const where = (p) => `${path.basename(p.file)}, ${p.pages ? `pages ${p.pages}` : p.frames ? `a sheet of ${p.frames} frame${p.frames === 1 ? '' : 's'}${p.at ? ` at ${p.at}: read every word and figure on screen` : ''}${p.captions ? `; its words are in ${p.captions}` : ''}` : `lines ${p.lines}`}`;

/** How to read a part: its text file, a PDF's pages, or a film's frame sheet (a picture). */
export const howToRead = (p) => (p.pages ? `read ${p.file} pages ${p.pages}` : `read ${p.part}`);

/** Every part the notes leave out: inputs/notes.md needs a "## P<n>" heading per part with real notes under it. */
export function readingProblems(dir) {
  const ledger = readLedger(dir);
  if (!ledger) return [];
  const notes = fs.existsSync(notesFile(dir)) ? fs.readFileSync(notesFile(dir), 'utf8') : '';
  const sections = new Map();
  for (const m of notes.matchAll(/^##\s+(P\d+)\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/gm)) sections.set(m[1], m[2]);
  return ledger.parts.flatMap((p) => {
    const words = (sections.get(p.id) ?? '').split(/\s+/).filter(Boolean).length;
    if (words >= MIN_WORDS) return [];
    return [`inputs: part ${p.id} (${where(p)}) ${sections.has(p.id) ? `has ${words} words of notes` : 'has no notes'} in inputs/notes.md; ${howToRead(p)} in full and write what it says under "## ${p.id}"`];
  });
}

/** Lines of the material holding every one of the words, as "P3 call.vtt:812  <line>"; PDFs and films are not searched. */
export function findInInputs(dir, words) {
  const ledger = readLedger(dir);
  if (!ledger) throw new UsageError(`no material split yet: run inputs ${dir} <files> first`);
  if (!words.length) throw new UsageError('find needs the words to look for');
  const want = words.map((w) => w.toLowerCase());
  const out = [];
  for (const p of ledger.parts.filter((x) => x.lines)) {
    const first = +p.lines.split('-')[0];
    fs.readFileSync(p.part, 'utf8').split('\n').forEach((line, i) => {
      if (want.every((w) => line.toLowerCase().includes(w))) out.push(`${p.id} ${path.basename(p.file)}:${first + i}  ${line.trim().slice(0, 200)}`);
    });
  }
  return out;
}
