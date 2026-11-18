#!/usr/bin/env node
// The loading check: reads a screen recording of one page opening and finds the two faults a
// loading state exists to prevent. A blank: a band that is plain background while the page
// loads and holds content once it settles (a data region with no skeleton, or a skeleton
// smaller than its region). A shift: content that is on screen while the page loads and sits
// higher or lower once it settles (a skeleton of the wrong height pushes what is below it).
// Node 22, no packages; ffmpeg only for --video.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { decodePngFile, resize, composeSideBySide, fillRect, writePngFile } from '../../native-visual-check/scripts/lib/png.mjs';

const HELP = `loading-check — find blank bands and layout shifts in a recording of a page opening.

Usage
  node loading-check.mjs --video <recording.mp4> --out <dir> [options]
  node loading-check.mjs --frames <dir of PNG frames> --out <dir> [options]

Inputs
  --video        A screen recording that starts on a still screen, then opens the page and
                 ends once it settled. Frames are taken with ffmpeg at --fps.
  --frames       PNG frames instead, in name order: f-<seconds>.png (as frames.sh writes them)
                 or any names, timed by --fps.

Options
  --out          Folder for loading.json, composite.png and the frames (required).
  --fps          Frames a second (default 10).
  --open-at      Seconds into the recording when the page was opened; default the first frame
                 that differs from the first one.
  --points-high  The screen's height in points (874 on an iPhone 16 Pro). With it, bands and
                 shifts are also given in points and the two limits below are read in points.
  --min-band     Smallest blank band that counts: 24 pt with --points-high, else 0.03 of the height.
  --min-shift    Smallest shift that counts: 2 pt with --points-high, else 0.0025 of the height.
  --skip-top     Fraction of the height to skip at the top, the status bar (default 0.06).
  --json         Print loading.json instead of lines.

Output
  <out>/loading.json  { verdict, openAt, firstPaintAt, settledAt, loadingMs, findings[], composite }
  <out>/composite.png the first loading frame, the worst shift frame (when there is one) and the
                      settled frame side by side; red stripe = blank band, amber stripe = shifted rows.
  verdict: pass · fail (a blank or a shift) · not-seen (the data was there before the page
  settled on screen, so no loading frame exists) · not-settled (still changing at the end).
  Exit 0 on pass or not-seen, 1 on fail or not-settled, 2 on bad input, 3 when ffmpeg is missing.
`;

const WIDTH = 180; // analysis width; about 2 pt a row on a phone
const BINS = 60;
const SAME = 12; // the largest luminance step that is noise between two frames
const DETAIL = 6; // a row with at least this many steps between bins holds text, not a flat fill or a lone icon
const CHANGED_ROWS = 0.01; // a frame changed when this fraction of its rows did
const STILL_TAIL_SEC = 0.5;

const luminance = (data, offset) => 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];

/** Row signatures: per row, the mean luminance of BINS equal column bins. */
export function signature(image) {
  const small = image.width === WIDTH ? image : resize(image, WIDTH);
  const binWidth = small.width / BINS;
  const rows = new Float32Array(small.height * BINS);
  for (let row = 0; row < small.height; row += 1) {
    for (let bin = 0; bin < BINS; bin += 1) {
      let total = 0; let count = 0;
      for (let col = Math.floor(bin * binWidth); col < Math.floor((bin + 1) * binWidth); col += 1) {
        total += luminance(small.data, (row * small.width + col) * 4); count += 1;
      }
      rows[row * BINS + bin] = total / Math.max(1, count);
    }
  }
  return { height: small.height, rows };
}

const value = (sig, row, bin) => sig.rows[row * BINS + bin];

function rowDistance(left, leftRow, right, rightRow) {
  let worst = 0;
  for (let bin = 0; bin < BINS; bin += 1) worst = Math.max(worst, Math.abs(value(left, leftRow, bin) - value(right, rightRow, bin)));
  return worst;
}

/** The page background: the most common luminance (in steps of 4) of the settled frame. */
function background(sig, fromRow) {
  const counts = new Map();
  for (let index = fromRow * BINS; index < sig.rows.length; index += 1) {
    const bucket = Math.round(sig.rows[index] / 4);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] * 4;
}

/** Anything but plain background: a skeleton bar counts, so does text. */
function painted(sig, row, bg) {
  for (let bin = 0; bin < BINS; bin += 1) if (Math.abs(value(sig, row, bin) - bg) > SAME) return true;
  return false;
}

/** Text or icons: enough steps across the row that a flat bar or fill cannot match it. */
function detailed(sig, row) {
  let steps = 0;
  for (let bin = 1; bin < BINS; bin += 1) if (Math.abs(value(sig, row, bin) - value(sig, row, bin - 1)) > SAME) steps += 1;
  return steps >= DETAIL;
}

function differs(left, right, fromRow) {
  let changed = 0;
  for (let row = fromRow; row < left.height; row += 1) if (rowDistance(left, row, right, row) > SAME) changed += 1;
  return changed / Math.max(1, left.height - fromRow) >= CHANGED_ROWS;
}

/**
 * Bands that are plain background while loading and hold content once settled. A band runs over
 * rows plain in both frames (the gaps between text lines and between cards) and ends only at a row
 * the loading frame paints: a skeleton bar breaks it, so a skeleton's own gaps never add up, and a
 * page body left empty under its header is one band, not one per card.
 */
function blankBands(loading, settled, bg, { from, to, min }) {
  const found = [];
  let start = -1; let last = -1;
  const close = () => { if (start >= 0 && last - start + 1 >= min) found.push([start, last]); start = -1; };
  for (let row = from; row < to; row += 1) {
    if (painted(loading, row, bg)) { close(); continue; }
    if (painted(settled, row, bg)) { if (start < 0) start = row; last = row; }
  }
  close();
  return found;
}

/**
 * The dy (rows) that lines up the most detailed rows that differ in place, when it clears `min`
 * and beats by half again every dy farther off than the matched band is tall: a band whose rows
 * look alike (a button, a row of vertical strokes) matches near its true dy too, and a repeating
 * pattern (list rows) matches a whole pitch away.
 */
function bestShift(loading, settled, rows, { maxShift, min }) {
  const counts = [];
  for (let dy = -maxShift; dy <= maxShift; dy += 1) {
    if (dy === 0) continue;
    const matched = rows.filter((row) => row + dy >= 0 && row + dy < settled.height && rowDistance(loading, row, settled, row + dy) <= SAME);
    counts.push({ dy, rows: matched });
  }
  const best = counts.reduce((top, item) => (!top || item.rows.length > top.rows.length || (item.rows.length === top.rows.length && Math.abs(item.dy) < Math.abs(top.dy)) ? item : top), null);
  if (!best || best.rows.length < min) return null;
  const reach = Math.max(2, Math.max(...best.rows) - Math.min(...best.rows) + 1);
  const rival = Math.max(0, ...counts.filter((item) => Math.abs(item.dy - best.dy) > reach).map((item) => item.rows.length));
  return best.rows.length >= rival * 1.5 ? best : null;
}

/**
 * Pure: frames [{ t, image }] in time order → the verdict and findings.
 * The limits are fractions of the height, or points when pointsHigh is given.
 */
export function analyse(frames, { openAt = null, pointsHigh = null, minBand = null, minShift = null, skipTop = 0.06 } = {}) {
  if (frames.length < 2) throw new Error('need at least two frames');
  const sigs = frames.map((frame) => ({ t: frame.t, ...signature(frame.image) }));
  const height = sigs[0].height;
  const top = Math.round(height * skipTop);
  const rowsOf = (limit, pointsDefault, fraction) => {
    const given = limit ?? (pointsHigh ? pointsDefault : null);
    return Math.max(1, Math.round(given == null ? height * fraction : pointsHigh ? (given / pointsHigh) * height : given * height));
  };
  const bandRows = rowsOf(minBand, 24, 0.03);
  const shiftRows = rowsOf(minShift, 2, 0.0025);
  const share = (rows) => Math.round((rows / height) * 1000) / 1000;
  const points = (rows) => (pointsHigh ? Math.round((rows / height) * pointsHigh) : null);

  const openIndex = openAt != null ? sigs.findIndex((sig) => sig.t >= openAt) : sigs.findIndex((sig, index) => index > 0 && differs(sigs[0], sig, top));
  const base = { frames: sigs.length, openAt: openIndex >= 0 ? sigs[openIndex].t : null, firstPaintAt: null, settledAt: null, loadingMs: 0, findings: [] };
  if (openIndex < 0) return { ...base, verdict: 'not-seen', note: 'the screen never changed: the page did not open in the recording' };

  let settledIndex = openIndex;
  for (let index = openIndex + 1; index < sigs.length; index += 1) if (differs(sigs[index - 1], sigs[index], top)) settledIndex = index;
  const settled = sigs[settledIndex];
  const tail = sigs.at(-1).t - settled.t;
  if (tail < STILL_TAIL_SEC) return { ...base, settledAt: settled.t, verdict: 'not-settled', note: `the screen still changed ${Math.round(tail * 1000)} ms before the recording ended` };

  // The page is on screen once its header band matches the settled frame and stays matched;
  // a page with nothing painted in that band falls back to half a second after the open (the push).
  const bg = background(settled, top);
  const headerEnd = Math.min(height, top + Math.round(height * 0.1));
  const headerRows = [];
  for (let row = top; row < headerEnd; row += 1) if (painted(settled, row, bg)) headerRows.push(row);
  let paintIndex = settledIndex;
  if (headerRows.length) {
    while (paintIndex - 1 >= openIndex && headerRows.every((row) => rowDistance(sigs[paintIndex - 1], row, settled, row) <= SAME)) paintIndex -= 1;
  } else {
    const after = sigs.findIndex((sig) => sig.t >= sigs[openIndex].t + 0.5);
    paintIndex = after < 0 ? settledIndex : Math.min(settledIndex, after);
  }
  const result = { ...base, firstPaintAt: sigs[paintIndex].t, settledAt: settled.t, loadingMs: Math.round((settled.t - sigs[paintIndex].t) * 1000) };
  if (paintIndex >= settledIndex) return { ...result, verdict: 'not-seen', note: 'the data was there before the page settled on screen; no loading frame to judge' };

  const step = sigs[1].t - sigs[0].t;
  const blanks = [];
  let worstShift = null;
  for (let index = paintIndex; index < settledIndex; index += 1) {
    const loading = sigs[index];
    const counted = new Set(); // a band split in two in one frame still counts that frame once
    for (const [from, to] of blankBands(loading, settled, bg, { from: top, to: height, min: bandRows })) {
      let seen = blanks.find((band) => from <= band.to && to >= band.from);
      if (seen) Object.assign(seen, { from: Math.min(seen.from, from), to: Math.max(seen.to, to) });
      else blanks.push(seen = { from, to, frames: 0, firstAt: loading.t });
      if (!counted.has(seen)) { seen.frames += 1; counted.add(seen); }
    }
    const moved = [];
    for (let row = top; row < height; row += 1) if (detailed(loading, row) && rowDistance(loading, row, settled, row) > SAME) moved.push(row);
    // Half a blank band: a moved section or footer is taller; a lone floating control (the dev reload pill) is not.
    const shift = bestShift(loading, settled, moved, { maxShift: Math.round(height * 0.3), min: Math.max(3, Math.round(bandRows / 2)) });
    if (shift && Math.abs(shift.dy) >= shiftRows && (!worstShift || Math.abs(shift.dy) > Math.abs(worstShift.dy))) worstShift = { ...shift, index, t: loading.t };
  }
  const findings = blanks.map((band) => ({
    kind: 'blank', from: share(band.from), to: share(band.to + 1), fromPt: points(band.from), toPt: points(band.to + 1),
    at: band.firstAt, ms: Math.round(band.frames * step * 1000),
  }));
  if (worstShift) {
    const [first, last] = [Math.min(...worstShift.rows), Math.max(...worstShift.rows) + 1];
    findings.push({ kind: 'shift', from: share(first), to: share(last), fromPt: points(first), toPt: points(last), dy: share(worstShift.dy), dyPt: points(worstShift.dy), at: worstShift.t });
  }
  findings.sort((a, b) => a.from - b.from);
  return { ...result, verdict: findings.length ? 'fail' : 'pass', findings, paintIndex, settledIndex, shiftIndex: worstShift?.index ?? null };
}

/** The first loading frame, the worst shift frame and the settled frame, with each band striped at the left edge. */
export function composite(frames, result) {
  if (result.paintIndex == null) return null;
  const picks = [...new Set([result.paintIndex, result.shiftIndex, result.settledIndex].filter((index) => index != null))];
  return composeSideBySide(picks.map((index) => {
    const image = resize(frames[index].image, 300);
    for (const finding of result.findings) {
      if (finding.kind === 'shift' && index !== result.shiftIndex) continue;
      const colour = finding.kind === 'blank' ? [220, 38, 38, 255] : [245, 158, 11, 255];
      fillRect(image, 0, finding.from * image.height, 8, (finding.to - finding.from) * image.height, colour);
    }
    return image;
  }));
}

function framesFromVideo(video, dir, fps) {
  const have = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (have.error || have.status !== 0) throw Object.assign(new Error('ffmpeg is not on PATH; install it (brew install ffmpeg) or pass --frames'), { exit: 3 });
  fs.mkdirSync(dir, { recursive: true });
  const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `fps=${fps},scale=${WIDTH}:-2`, path.join(dir, 'f-%05d.png')], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`ffmpeg could not read ${video}: ${made.stderr.trim()}`);
}

function readFrames(dir, fps) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
  if (files.length < 2) throw new Error(`fewer than two PNG frames in ${dir}`);
  const timed = files.every((name) => /^f-\d+\.\d+\.png$/u.test(name));
  return files.map((name, index) => ({ t: timed ? Number(name.slice(2, -4)) : Math.round((index / fps) * 1000) / 1000, image: decodePngFile(path.join(dir, name)) }));
}

function parseArgs(argv) {
  const args = { fps: 10, skipTop: 0.06, json: false };
  const numbers = { '--fps': 'fps', '--open-at': 'openAt', '--points-high': 'pointsHigh', '--min-band': 'minBand', '--min-shift': 'minShift', '--skip-top': 'skipTop' };
  const strings = { '--video': 'video', '--frames': 'frames', '--out': 'out' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = true;
    else if (strings[arg]) args[strings[arg]] = argv[++index];
    else if (numbers[arg]) {
      const number = Number(argv[++index]);
      if (!Number.isFinite(number) || number < 0) throw new Error(`${arg} needs a number`);
      args[numbers[arg]] = number;
    } else throw new Error(`Unknown option ${arg}. Run with --help.`);
  }
  if (!args.fps) throw new Error('--fps must be above 0');
  return args;
}

const where = (finding) => (finding.fromPt != null ? `${finding.fromPt}–${finding.toPt} pt` : `${finding.from}–${finding.to} of the height`);
const line = (finding) => (finding.kind === 'blank'
  ? `blank · ${where(finding)} · plain background for ${finding.ms} ms from ${finding.at} s, content once settled`
  : `shift · ${where(finding)} · moved ${Math.abs(finding.dyPt ?? finding.dy)}${finding.dyPt != null ? ' pt' : ' of the height'} ${finding.dy > 0 ? 'down' : 'up'} between ${finding.at} s and the settled frame`);

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.out || (!args.video && !args.frames)) { process.stdout.write(HELP); process.exitCode = args.help ? 0 : 2; return; }
  const out = path.resolve(args.out);
  const frameDir = args.frames ? path.resolve(args.frames) : path.join(out, 'frames');
  if (args.video) framesFromVideo(path.resolve(args.video), frameDir, args.fps);
  const frames = readFrames(frameDir, args.fps);
  const result = analyse(frames, args);
  const image = composite(frames, result);
  fs.mkdirSync(out, { recursive: true });
  if (image) writePngFile(path.join(out, 'composite.png'), image);
  const { paintIndex, settledIndex, shiftIndex, ...report } = result;
  const doc = { ...report, video: args.video ? path.resolve(args.video) : null, frameDir, pointsHigh: args.pointsHigh ?? null, composite: image ? path.join(out, 'composite.png') : null };
  fs.writeFileSync(path.join(out, 'loading.json'), `${JSON.stringify(doc, null, 2)}\n`);
  if (args.json) process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  else {
    for (const finding of doc.findings) process.stdout.write(`${line(finding)}\n`);
    const count = (kind) => doc.findings.filter((finding) => finding.kind === kind).length;
    process.stdout.write(`${doc.verdict} · loading ${doc.loadingMs} ms · blank ${count('blank')} · shift ${count('shift')}${doc.note ? ` · ${doc.note}` : ''}\n`);
  }
  process.exitCode = ['pass', 'not-seen'].includes(doc.verdict) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = error.exit ?? 2; }
}
