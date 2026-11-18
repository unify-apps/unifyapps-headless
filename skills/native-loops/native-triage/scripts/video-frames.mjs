#!/usr/bin/env node
// Frames from a ticket's video attachment, so a ticket that has only a video is read from pictures.
// ffmpeg and ffprobe must be on PATH; without them it says what to ask the person for. Node 22, no packages.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const FALLBACK = 'video not playable: ask the person for frames';
export const EXIT = { OK: 0, USAGE: 2, NO_FFMPEG: 3, NOT_PLAYABLE: 4 };

const HELP = `video-frames — frames from a video attachment, written to disk.

Usage
  node video-frames.mjs <video file> --out <folder> [--count 8] [--width 480] [--sheet] [--json]

Options
  --out <folder>   Where frame-001.jpg … and frames.json go. Created when missing.
  --count <n>      Frames, evenly spaced through the video (default 8, at most 40).
  --width <px>     Frame width (default 480; the height keeps the ratio).
  --sheet          Also write sheet.jpg: every frame in one picture, so a check looks at one image.
  --json           Print the manifest as JSON.

Answers
  exit 0  frames written; frames.json lists each file and its time in seconds.
  exit 3  ffmpeg or ffprobe is not on PATH: "${FALLBACK}".
  exit 4  the file is missing or has no video stream: "${FALLBACK}".
  exit 2  usage.`;

const have = (tool) => spawnSync(tool, ['-version'], { encoding: 'utf8' }).status === 0;

export function probeDuration(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
  const seconds = Number(String(result.stdout).trim());
  return result.status === 0 && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function extractFrames({ video, out, count = 8, width = 480, sheet = false }) {
  if (!have('ffmpeg') || !have('ffprobe')) return { ok: false, exit: EXIT.NO_FFMPEG, reason: 'ffmpeg-missing', message: `ffmpeg is not on PATH; ${FALLBACK}` };
  if (!fs.existsSync(video)) return { ok: false, exit: EXIT.NOT_PLAYABLE, reason: 'no-file', message: `${video} does not exist; ${FALLBACK}` };
  const duration = probeDuration(video);
  if (!duration) return { ok: false, exit: EXIT.NOT_PLAYABLE, reason: 'no-video-stream', message: `${path.basename(video)} has no readable video stream; ${FALLBACK}` };
  fs.mkdirSync(out, { recursive: true });
  // Frames and the sheet of an earlier run in this folder would otherwise be tiled into this run's sheet.
  for (const name of fs.readdirSync(out)) if (/^frame-\d+\.jpg$/u.test(name) || name === 'sheet.jpg') fs.rmSync(path.join(out, name));
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const at = Number((duration * (index + 0.5) / count).toFixed(2));
    const file = path.join(out, `frame-${String(frames.length + 1).padStart(3, '0')}.jpg`); // numbered by success: the sheet reads an unbroken sequence
    const done = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', video, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '4', file], { encoding: 'utf8' });
    if (done.status === 0 && fs.existsSync(file)) frames.push({ file, atSeconds: at });
  }
  if (!frames.length) return { ok: false, exit: EXIT.NOT_PLAYABLE, reason: 'no-frames', message: `no frame could be decoded from ${path.basename(video)}; ${FALLBACK}` };
  let sheetFile = null;
  if (sheet) {
    const columns = Math.min(4, frames.length);
    const rows = Math.ceil(frames.length / columns);
    sheetFile = path.join(out, 'sheet.jpg');
    const made = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(out, 'frame-%03d.jpg'), '-vf', `tile=${columns}x${rows}`, '-frames:v', '1', '-q:v', '4', sheetFile], { encoding: 'utf8' });
    if (made.status !== 0) sheetFile = null;
  }
  const manifest = { ok: true, exit: EXIT.OK, video: path.resolve(video), durationSeconds: Number(duration.toFixed(2)), frames, sheet: sheetFile };
  fs.writeFileSync(path.join(out, 'frames.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { out: { type: 'string' }, count: { type: 'string' }, width: { type: 'string' }, sheet: { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  });
  if (values.help) { console.log(HELP); return EXIT.OK; }
  if (positionals.length !== 1 || !values.out) { console.error('usage: video-frames.mjs <video file> --out <folder> (see --help)'); return EXIT.USAGE; }
  const count = values.count === undefined ? 8 : Number(values.count);
  const width = values.width === undefined ? 480 : Number(values.width);
  if (!Number.isInteger(count) || count < 1 || count > 40) { console.error('--count takes a whole number from 1 to 40'); return EXIT.USAGE; }
  if (!Number.isInteger(width) || width < 120 || width > 1920) { console.error('--width takes a whole number from 120 to 1920'); return EXIT.USAGE; }
  const result = extractFrames({ video: path.resolve(positionals[0]), out: path.resolve(values.out), count, width, sheet: Boolean(values.sheet) });
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`${result.frames.length} frames of ${result.durationSeconds}s in ${path.resolve(values.out)}${result.sheet ? `, sheet ${result.sheet}` : ''}`);
  else console.log(result.message);
  return result.exit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
