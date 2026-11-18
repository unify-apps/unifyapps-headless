#!/usr/bin/env node
// Turns each video into an evidence pack a judge can read without watching it: what a script can
// measure, the transcript, labelled contact sheets, strips a tenth of a second apart around every
// change, and full-size frames where the picture rests. Each video gets a neutral label (A, B) in
// a random order; key.json, outside the packs, says which is which.
//
//   node pack.mjs <run dir> --brief <brief.md> --video <file> [--srt <file>] [--video <file> [--srt <file>]]
//                 [--transcribe] [--no-transcript] [--seed <n>]
//
// A transcript comes from the same place for every video: the captions files when each video has
// one, else whisper-cli when this laptop has it and a model, else none. --transcribe uses whisper
// even when captions are given. Nothing is installed.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from './rubric.mjs';

const W = 320, H = 180; // the frame size the measures are taken at
export const LIMITS = {
  pixel: 12, // a pixel has changed when it is this much lighter or darker (0-255)
  moving: 0.0005, // share of pixels changed from the frame before over which something moves (about 30 of 320x180)
  held: 0.002, // share of the frame whose edges changed since a stretch began under which nothing new has appeared: a soft drifting background has no edges, and a blinking dot is under it
  stillRun: 2, // seconds held for a still stretch
  rest: 0.6, // seconds held for a frame worth keeping full size
  change: 0.02, // share of pixels changed against half a second earlier for a change moment
  cut: 0.25, // share of pixels changed in one frame for a hard cut
  edge: 24, // a pixel is an edge when it differs this much from its right and lower neighbours together
  blank: 0.0015, // share of edge pixels under which a frame is empty
  blankRun: 0.3,
  silence: '-45dB',
  silenceRun: 1.5,
};

const time = (s) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
};
const stamp = (s) => `${Math.floor(s / 60)}m${(s % 60).toFixed(1).padStart(4, '0')}s`;

function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve({ out, err }) : reject(new Error(`${bin} ${args.slice(0, 6).join(' ')} failed (${code}): ${err.trim().split('\n').slice(-3).join(' ')}`))));
  });
}

async function pool(items, n, fn) {
  const queue = [...items.entries()];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await fn(next[1], next[0]);
  }));
}

export async function probe(file) {
  const { out } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate', '-of', 'json', file]);
  const j = JSON.parse(out);
  const v = j.streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error(`${file} has no picture`);
  const rate = (r) => { const [a, b] = String(r).split('/').map(Number); return b ? a / b : a; };
  const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate);
  return { duration: Number(j.format.duration), width: v.width, height: v.height, fps, hasAudio: j.streams.some((s) => s.codec_type === 'audio') };
}

/** Loudness (EBU R128) and the silent stretches, in one pass. */
export async function listenTo(file, duration) {
  const { err } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', `ebur128=peak=true,silencedetect=noise=${LIMITS.silence}:d=${LIMITS.silenceRun}`, '-f', 'null', '-']);
  const last = (re) => { const all = [...err.matchAll(re)]; return all.length ? Number(all.at(-1)[1]) : NaN; };
  const silences = [];
  let start = null;
  for (const line of err.split('\n')) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && start !== null) { silences.push({ start, end: Number(e[1]) }); start = null; }
  }
  if (start !== null) silences.push({ start, end: duration });
  return { lufs: last(/I:\s+(-?[\d.]+) LUFS/g), range: last(/LRA:\s+(-?[\d.]+) LU/g), peak: last(/Peak:\s+(-?[\d.]+) dBFS/g), silences };
}

/**
 * Per frame: the share of its pixels changed from the frame before and from half a second before,
 * the share that are edges, and whether its edges (text, shapes, lines) are still those of the frame
 * the current held stretch began on.
 */
export class FrameStats {
  constructor(rate) { this.rate = rate; this.back = Math.max(1, Math.round(rate / 2)); this.ring = []; this.anchor = null; this.diff = []; this.change = []; this.held = []; this.edge = []; }
  push(f) {
    const prev = this.ring.at(-1), back = this.ring.length >= this.back ? this.ring[this.ring.length - this.back] : this.ring[0], anchor = this.anchor;
    const edges = new Uint8Array(W * H);
    let d = 0, c = 0, a = 0, e = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, p = f[i];
        if (prev && Math.abs(p - prev[i]) > LIMITS.pixel) d++;
        if (back && Math.abs(p - back[i]) > LIMITS.pixel) c++;
        if (x < W - 1 && y < H - 1 && Math.abs(f[i + 1] - p) + Math.abs(f[i + W] - p) > LIMITS.edge) { edges[i] = 1; e++; }
        if (anchor && edges[i] !== anchor[i]) a++;
      }
    }
    const n = W * H, held = Boolean(anchor) && a / n < LIMITS.held;
    this.diff.push(prev ? d / n : 0);
    this.change.push(back ? c / n : 0);
    this.held.push(held);
    this.edge.push(e / n);
    if (!held) this.anchor = edges;
    this.ring.push(f);
    if (this.ring.length > this.back) this.ring.shift();
  }
}

const runs = (flags, rate, minLen) => {
  const out = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (start < 0) start = i; continue; }
    if (start >= 0 && (i - start) / rate >= minLen) out.push({ start: start / rate, end: i / rate });
    start = -1;
  }
  return out;
};

/** What the per-frame numbers say: still stretches, blank stretches, change moments and resting frames. */
export function analyse({ diff, change, held, edge }, rate, duration) {
  const still = held;
  const inside = (r, head, tail) => ({ start: Math.max(r.start, head), end: Math.min(r.end, duration - tail) });
  const stills = runs(still, rate, LIMITS.stillRun).map((r) => inside(r, 1, 3)).filter((r) => r.end - r.start >= LIMITS.stillRun);
  const blanks = runs(edge.map((e) => e < LIMITS.blank), rate, LIMITS.blankRun).map((r) => inside(r, 1.5, 1.5)).filter((r) => r.end - r.start >= LIMITS.blankRun);
  const span = Math.round(rate * 0.6), back = Math.max(1, Math.round(rate / 2));
  let peaks = [];
  for (let i = 1; i < change.length; i++) {
    if (change[i] < LIMITS.change) continue;
    let top = true;
    for (let j = Math.max(0, i - span); j <= Math.min(change.length - 1, i + span) && top; j++) if (change[j] > change[i] || (change[j] === change[i] && j < i)) top = false;
    if (!top) continue;
    let at = i;
    for (let j = Math.max(1, i - back + 1); j <= i; j++) if (diff[j] > diff[at]) at = j;
    peaks.push({ t: at / rate, size: change[i], kind: diff[at] >= LIMITS.cut ? 'cut' : 'move' });
  }
  const want = Math.max(8, Math.min(40, Math.round(duration / 7)));
  peaks = peaks.sort((a, b) => b.size - a.size).slice(0, want).sort((a, b) => a.t - b.t);
  // a resting frame: the last of a run of unchanged frames, where whatever was arriving has arrived
  const rests = runs(still, rate, LIMITS.rest).map((r) => Math.max(0, r.end - 0.15));
  const keep = Math.max(8, Math.min(30, Math.round(duration / 7)));
  const frames = [];
  for (let k = 0; k < keep && rests.length; k++) {
    const target = ((k + 0.5) / keep) * duration;
    const best = rests.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    if (!frames.some((f) => Math.abs(f - best) < 1)) frames.push(best);
  }
  // a stretch that never rests (live action, a long camera move) still gets a frame every 15 s
  const sorted = [0, ...frames.sort((a, b) => a - b), duration];
  for (let k = 1; k < sorted.length; k++) for (let t = sorted[k - 1] + 15; t < sorted[k] - 5; t += 15) frames.push(t);
  return {
    stills, blanks, changes: peaks, frames: frames.sort((a, b) => a - b).map((t) => Math.min(t, duration - 0.05)),
    movingShare: diff.filter((d, i) => i > 0 && d >= LIMITS.moving).length / Math.max(1, diff.length - 1),
  };
}

async function frameStats(file, fps) {
  const rate = Math.min(30, Math.round(fps) || 30);
  const stats = new FrameStats(rate);
  await new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-an', '-vf', `fps=${rate},scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const size = W * H;
    let buf = Buffer.alloc(0), err = '';
    p.stdout.on('data', (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      let off = 0;
      for (; off + size <= buf.length; off += size) stats.push(Uint8Array.prototype.slice.call(buf, off, off + size));
      buf = buf.subarray(off);
    });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg could not read the frames of ${file}: ${err.trim()}`))));
  });
  return { stats, rate };
}

/** Everything a script can measure in one video. */
export async function measure(file) {
  const info = await probe(file);
  const [audio, { stats, rate }] = await Promise.all([info.hasAudio ? listenTo(file, info.duration) : null, frameStats(file, info.fps)]);
  const seen = analyse(stats, rate, info.duration);
  const inner = (audio?.silences ?? []).map((s) => ({ start: Math.max(s.start, 1), end: Math.min(s.end, info.duration - 1) })).filter((s) => s.end - s.start > 0);
  const longest = (list) => list.reduce((m, r) => Math.max(m, r.end - r.start), 0);
  const stillTime = seen.stills.reduce((s, r) => s + r.end - r.start, 0);
  return {
    ...info,
    audio: audio && { lufs: audio.lufs, peak: audio.peak, range: audio.range, silences: inner },
    dead: { longestStill: longest(seen.stills), stillShare: stillTime / Math.max(1, info.duration - 4), longestSilence: info.hasAudio ? longest(inner) : info.duration, stills: seen.stills },
    blanks: seen.blanks,
    changes: seen.changes,
    frames: seen.frames,
    movingShare: seen.movingShare,
  };
}

// ---- transcripts ----

const clock = (s) => { const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s); return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`) : NaN; };

/** Segments from an .srt or .vtt file. */
export function readCaptions(text) {
  const out = [];
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->');
    const words = lines.slice(at + 1).join(' ').replace(/<[^>]+>|\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
    if (words) out.push({ start: clock(a), end: clock(b), text: words });
  }
  return out;
}

export function findWhisper() {
  let bin = null;
  try { bin = execFileSync('which', ['whisper-cli'], { encoding: 'utf8' }).trim() || null; } catch { /* not installed */ }
  if (!bin) return null;
  if (process.env.WHISPER_MODEL && fs.existsSync(process.env.WHISPER_MODEL)) return { bin, model: process.env.WHISPER_MODEL };
  const kit = process.env.UA_DEMO_KIT_HOME ?? path.join(process.env.UA_HOME ?? path.join(os.homedir(), '.nebula'), 'demo-kit');
  for (const dir of [path.join(kit, 'whisper'), path.join(os.homedir(), '.cache', 'whisper'), path.join(os.homedir(), '.cache', 'whisper-cpp'), '/opt/homebrew/share/whisper-cpp', '/usr/local/share/whisper-cpp']) {
    // only ggml-*.bin: whisper.cpp's for-tests-*.bin files are vocabulary-only stubs
    const model = fs.existsSync(dir) && fs.readdirSync(dir).filter((f) => /^ggml-.+\.bin$/.test(f)).sort()[0];
    if (model) return { bin, model: path.join(dir, model) };
  }
  return null;
}

async function transcribe(file, whisper, tmp) {
  const wav = path.join(tmp, 'voice.wav'), base = path.join(tmp, 'voice');
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
  const english = /\.en\.bin$/.test(whisper.model);
  await run(whisper.bin, ['-m', whisper.model, '-f', wav, '-l', english ? 'en' : 'auto', '-oj', '-of', base, '-np']);
  const j = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
  fs.rmSync(wav, { force: true });
  return j.transcription.map((s) => ({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text: s.text.trim() })).filter((s) => s.text && !/^\[.*\]$|^\(.*\)$/.test(s.text));
}

const vowels = /[aeiouy]+/g;
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? 2 : 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, (m) => m[0]).replace(/^y/, '');
  return Math.max(1, (trimmed.match(vowels) ?? []).length);
}

/** Words, pace, sentence length and reading grade of the narration. */
export function narration(segments, duration) {
  if (!segments.length) return null;
  const text = segments.map((s) => s.text).join(' ');
  const words = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  let speaking = 0, end = -1;
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const from = Math.max(s.start, end);
    if (s.end > from) speaking += s.end - from;
    end = Math.max(end, s.end);
  }
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length).filter(Boolean);
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
  return {
    words: words.length, speaking, coverage: speaking / duration, wpm: words.length / (speaking / 60),
    sentences: sentences.length, average: words.length / sentences.length, longest: Math.max(...sentences), long: sentences.filter((n) => n > 30).length, grade,
  };
}

// ---- pictures ----

function findChrome() {
  const env = process.env.JUDGE_CHROME ?? process.env.DEMO_KIT_CHROME;
  if (env) return env;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split('-')[1] - a.split('-')[1]);
    for (const d of dirs) {
      for (const rel of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        if (fs.existsSync(path.join(root, d, rel))) return path.join(root, d, rel);
      }
    }
  }
  return null;
}

/** One headless Chrome that turns small HTML pages into JPEGs. */
async function camera() {
  const bin = findChrome();
  if (!bin) throw new Error('needs Chrome for Testing to label the contact sheets: run `npx playwright install chromium`');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'video-judge-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  const close = () => { try { proc.kill('SIGKILL'); } catch { /* gone */ } try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chrome still writing as it dies */ } };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    let targets;
    for (let i = 0; !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { if (i > 80) throw e; await new Promise((r) => setTimeout(r, 150)); }
    }
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let id = 0;
    const waiting = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
    await send('Page.enable');
    return {
      async shoot(html, out, width, height) {
        fs.writeFileSync(`${out}.html`, html);
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: pathToFileURL(`${out}.html`).href });
        const ready = 'new Promise((r) => { const go = () => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((d) => { i.onload = i.onerror = d; }))).then(() => setTimeout(r, 60)); document.readyState === "complete" ? go() : addEventListener("load", go); })';
        await send('Runtime.evaluate', { expression: ready, awaitPromise: true });
        const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { x: 0, y: 0, width, height, scale: 1 } });
        fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
        fs.rmSync(`${out}.html`);
      },
      close: () => { try { ws.close(); } catch { /* closed */ } close(); },
    };
  } catch (e) { close(); throw e; }
}

const PAGE = 1568; // the widest picture a judge reads without it being shrunk
const css = `body{margin:0;background:#2b2b2e;font:600 13px/1 -apple-system,Helvetica,Arial,sans-serif;color:#f2f2f2}
h1{font-size:15px;margin:0;padding:9px 10px 7px}.g{display:grid;gap:6px;padding:0 4px 6px}
figure{margin:0}img{display:block;width:100%;outline:1px solid #555}figcaption{padding:3px 0 2px;text-align:center}`;
const grid = (title, cols, cells) => `<!doctype html><meta charset="utf-8"><style>${css}.g{grid-template-columns:repeat(${cols},1fr)}</style><h1>${title}</h1><div class="g">${cells.map((c) => `<figure><img src="${pathToFileURL(c.file).href}"><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`;
const gridHeight = (cols, n, cellW, aspect) => 31 + Math.ceil(n / cols) * (Math.round(cellW / aspect) + 24);

async function grab(file, at, out, width, { count = 1, every = 0 } = {}) {
  const args = ['-v', 'error', '-y', '-ss', Math.max(0, at).toFixed(3), '-i', file, '-an'];
  if (count > 1) args.push('-vf', `fps=${1 / every},scale=${width}:-2`, '-frames:v', String(count), '-q:v', '3', out);
  else args.push('-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '3', out);
  await run('ffmpeg', args);
}

async function pictures(file, m, dir) {
  const tmp = path.join(dir, 'tmp');
  for (const d of ['tmp', 'sheets', 'changes', 'frames']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const aspect = m.width / m.height;
  const cam = await camera();
  const made = { sheets: [], changes: [], frames: [] };
  try {
    // the whole video at a glance
    const ovN = 40, ovEvery = m.duration / ovN;
    await grab(file, ovEvery / 2, path.join(tmp, 'ov-%03d.jpg'), 192, { count: ovN, every: ovEvery });
    const ov = fs.readdirSync(tmp).filter((f) => f.startsWith('ov-')).sort().map((f, k) => ({ file: path.join(tmp, f), label: time(ovEvery / 2 + k * ovEvery) }));
    await cam.shoot(grid(`The whole video: ${ov.length} frames, one every ${ovEvery.toFixed(1)} s`, 8, ov), path.join(dir, 'overview.jpg'), PAGE, gridHeight(8, ov.length, 190, aspect));
    // contact sheets in order
    const step = m.duration <= 240 ? 2 : m.duration <= 480 ? 3 : 4;
    const n = Math.floor((m.duration - step / 2) / step) + 1;
    await grab(file, step / 2, path.join(tmp, 'sh-%04d.jpg'), 256, { count: n, every: step });
    const cells = fs.readdirSync(tmp).filter((f) => f.startsWith('sh-')).sort().map((f, k) => ({ file: path.join(tmp, f), label: time(step / 2 + k * step) }));
    for (let s = 0; s * 24 < cells.length; s++) {
      const part = cells.slice(s * 24, s * 24 + 24);
      const out = path.join(dir, 'sheets', `sheet-${String(s + 1).padStart(2, '0')}.jpg`);
      await cam.shoot(grid(`Frames every ${step} s, ${part[0].label} to ${part.at(-1).label}`, 6, part), out, PAGE, gridHeight(6, part.length, 254, aspect));
      made.sheets.push({ file: path.relative(dir, out), from: part[0].label, to: part.at(-1).label });
    }
    // a strip across every change, a tenth of a second apart
    await pool(m.changes, 4, async (c, k) => {
      const d = path.join(tmp, `ch-${k}`);
      fs.mkdirSync(d);
      await grab(file, c.t - 0.6, path.join(d, '%02d.jpg'), 224, { count: 14, every: 0.1 });
    });
    for (const [k, c] of m.changes.entries()) {
      const d = path.join(tmp, `ch-${k}`);
      const strip = fs.readdirSync(d).sort().map((f, j) => ({ file: path.join(d, f), label: time(Math.max(0, c.t - 0.6) + j * 0.1) }));
      const out = path.join(dir, 'changes', `change-${String(k + 1).padStart(2, '0')}-${stamp(c.t)}.jpg`);
      await cam.shoot(grid(`Change ${k + 1} at ${time(c.t)} (${c.kind === 'cut' ? 'a hard cut' : 'a move or a soft change'}), frames 0.1 s apart`, 7, strip), out, PAGE, gridHeight(7, strip.length, 218, aspect));
      made.changes.push({ file: path.relative(dir, out), t: time(c.t), kind: c.kind });
    }
    // full-size frames where the picture rests
    await pool(m.frames, 4, async (t) => {
      const out = path.join(dir, 'frames', `${stamp(t)}.jpg`);
      await grab(file, t, out, PAGE);
      made.frames.push({ file: path.relative(dir, out), t: time(t) });
    });
    made.frames.sort((a, b) => a.t.localeCompare(b.t));
  } finally {
    cam.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return made;
}

// ---- the pack ----

const pct = (x) => `${Math.round(x * 100)}%`;

function measuresText(m) {
  const n = m.narration;
  const list = (rs) => (rs.length ? rs.map((r) => `${time(r.start)} (${(r.end - r.start).toFixed(1)} s)`).join(', ') : 'none');
  return [
    '# Measured facts', '',
    'Taken by a script from the file. They are facts to use as evidence, not scores.', '',
    `- Length ${time(m.duration)}, ${m.width}x${m.height}, ${Math.round(m.fps * 100) / 100} frames a second.`,
    m.audio ? `- Loudness ${m.audio.lufs.toFixed(1)} LUFS, true peak ${m.audio.peak.toFixed(1)} dBTP, loudness range ${m.audio.range.toFixed(1)} LU.` : '- No sound track.',
    n ? `- Narration: ${n.words} words, ${Math.round(n.wpm)} a minute, speaking ${pct(n.coverage)} of the time. ${n.sentences} sentences, ${n.average.toFixed(1)} words on average, the longest ${n.longest}; reading grade ${n.grade.toFixed(1)}.` : `- Narration: ${m.transcript === 'none' ? 'no transcript' : 'none heard'}.`,
    `- Silences of ${LIMITS.silenceRun} s or more (after the first second, before the last): ${m.audio ? list(m.audio.silences) : 'no sound track'}.`,
    `- Picture completely still for ${LIMITS.stillRun} s or more: ${list(m.dead.stills)}. Still ${pct(m.dead.stillShare)} of the time; something moves ${pct(m.movingShare)} of the time.`,
    `- Blank frames for ${LIMITS.blankRun} s or more: ${list(m.blanks)}.`,
    `- ${m.changes.length} biggest changes of picture: ${m.changes.filter((c) => c.kind === 'cut').length} hard cuts, the rest moves or soft changes.`,
    '',
  ].join('\n');
}

function indexText(label, made, m) {
  return [
    `# Video ${label}: the evidence pack`, '',
    'You cannot watch the video; this folder is how you see and hear it. Times are minutes:seconds from the start.', '',
    '- `brief.md`: what the video is for. Judge it against this.',
    '- `rubric.md`: the checks and what each score means.',
    `- \`transcript.md\`: ${m.transcript === 'none' ? 'no transcript; judge the words from what is on screen' : `the narration with times (${m.transcript === 'captions' ? 'from the captions file' : 'transcribed from the sound'})`}.`,
    '- `measures.md`: what a script measured.',
    '- `overview.jpg`: the whole video at a glance.',
    `- \`sheets/\`: frames in order: ${made.sheets.map((s) => `\`${s.file}\` (${s.from} to ${s.to})`).join(', ')}.`,
    `- \`changes/\`: ${made.changes.length} strips of 14 frames 0.1 s apart across each big change of picture, for motion and transitions. The time is in each file name.`,
    `- \`frames/\`: ${made.frames.length} full-size frames where the picture rests, for layout, text and image quality. The time is the file name.`,
    '',
  ].join('\n');
}

function shuffle(list, seed) {
  let s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rand = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function parseArgs(argv) {
  const o = { videos: [], transcribe: false, noTranscript: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--video') o.videos.push({ file: argv[++i] });
    else if (a === '--srt') { if (!o.videos.length) throw new Error('--srt goes after the --video it belongs to'); o.videos.at(-1).srt = argv[++i]; }
    else if (a === '--brief') o.brief = argv[++i];
    else if (a === '--seed') o.seed = Number(argv[++i]);
    else if (a === '--transcribe') o.transcribe = true;
    else if (a === '--no-transcript') o.noTranscript = true;
    else if (!a.startsWith('--') && !o.run) o.run = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.run || !o.videos.length || o.videos.length > 2) throw new Error('usage: pack.mjs <run dir> --brief <brief.md> --video <file> [--srt <file>] [--video <file> [--srt <file>]] [--transcribe] [--no-transcript] [--seed <n>]');
  if (!o.brief) throw new Error('--brief is needed: the judges score each video against what it is for');
  return o;
}

/** Where every video's transcript comes from: one source for all of them. */
export function transcriptSource(videos, { transcribe, noTranscript, whisper }) {
  if (noTranscript) return 'none';
  if (!transcribe && videos.every((v) => v.srt)) return 'captions';
  if (whisper) return 'whisper';
  return videos.every((v) => v.srt) ? 'captions' : 'none';
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  for (const v of o.videos) for (const f of [v.file, v.srt].filter(Boolean)) if (!fs.existsSync(f)) throw new Error(`${f} is not there`);
  if (!fs.existsSync(o.brief)) throw new Error(`${o.brief} is not there`);
  if (fs.existsSync(path.join(o.run, 'key.json'))) throw new Error(`${o.run} already holds a run; give a new folder`);
  const whisper = findWhisper();
  const source = transcriptSource(o.videos, { ...o, whisper });
  const note = source === 'none' && !o.noTranscript
    ? (o.videos.some((v) => v.srt) ? 'only some videos have captions and this laptop has no whisper-cli with a model, so no video gets a transcript' : 'no captions files and no whisper-cli with a model on this laptop, so no video gets a transcript')
    : null;
  const labels = o.videos.length === 1 ? ['A'] : shuffle(['A', 'B'], o.seed);
  fs.mkdirSync(path.join(o.run, 'judge'), { recursive: true });
  const brief = fs.readFileSync(o.brief, 'utf8');
  fs.writeFileSync(path.join(o.run, 'brief.md'), brief);
  const key = { version: 1, made: new Date().toISOString(), transcript: source, note, videos: {} };
  for (const [i, v] of o.videos.entries()) {
    const label = labels[i], dir = path.join(o.run, label);
    fs.mkdirSync(dir, { recursive: true });
    const m = await measure(v.file);
    m.transcript = source;
    const segments = source === 'captions' ? readCaptions(fs.readFileSync(v.srt, 'utf8')) : source === 'whisper' ? await transcribe(v.file, whisper, fs.mkdtempSync(path.join(os.tmpdir(), 'video-judge-voice-'))) : [];
    m.narration = narration(segments, m.duration);
    const made = await pictures(v.file, m, dir);
    fs.writeFileSync(path.join(dir, 'measures.json'), `${JSON.stringify(m, null, 1)}\n`);
    fs.writeFileSync(path.join(dir, 'measures.md'), measuresText(m));
    fs.writeFileSync(path.join(dir, 'transcript.md'), segments.length
      ? `# Narration\n\n${segments.map((s) => `[${time(s.start)} to ${time(s.end)}] ${s.text}`).join('\n')}\n`
      : `# Narration\n\n${source === 'none' ? 'No transcript. Judge the words from what is on screen, and score P1 na.' : 'No words were heard.'}\n`);
    fs.writeFileSync(path.join(dir, 'brief.md'), brief);
    fs.writeFileSync(path.join(dir, 'rubric.md'), render());
    fs.writeFileSync(path.join(dir, 'index.md'), indexText(label, made, m));
    key.videos[label] = { file: path.resolve(v.file), captions: v.srt ? path.resolve(v.srt) : null };
    console.log(`${label}: ${time(m.duration)}, ${made.sheets.length} sheets, ${made.changes.length} change strips, ${made.frames.length} frames, narration ${m.narration ? `${m.narration.words} words` : 'none'}`);
  }
  fs.writeFileSync(path.join(o.run, 'key.json'), `${JSON.stringify(key, null, 1)}\n`);
  console.log(`transcripts: ${source}${note ? ` (${note})` : ''}`);
  console.log(`packs in ${path.resolve(o.run)}: ${labels.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
