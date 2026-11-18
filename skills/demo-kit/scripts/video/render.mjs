// The video's frames: the story page rendered frame by frame from its clock, in parallel chunks joined losslessly.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openPage } from '../core/chrome.mjs';
import { run } from '../core/util.mjs';

function encoder(out, fps, { crf = 17 } = {}) {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
  const err = [];
  p.stderr.on('data', (d) => err.push(d));
  const done = new Promise((resolve, reject) => p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg: ${Buffer.concat(err).toString().trim()}`)))));
  return {
    write: (buf) => new Promise((resolve) => (p.stdin.write(buf) ? resolve() : p.stdin.once('drain', resolve))),
    end: () => { p.stdin.end(); return done; },
  };
}

/** Renders [fromMs, toMs) of the page to `out` (no audio). */
export async function renderVideo(page, out, { fps = 30, scale = 1, from = 0, to, workers, log = () => {} }) {
  const first = Math.floor((from / 1000) * fps), last = Math.ceil((to / 1000) * fps);
  const total = last - first;
  const n = Math.max(1, Math.min(workers ?? Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2))), Math.ceil(total / (fps * 4))));
  const per = Math.ceil(total / n);
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.seg-'));
  const t0 = Date.now();
  let doneFrames = 0, lastPct = -10;
  try {
    const segs = await Promise.all(Array.from({ length: n }, async (_, w) => {
      const a = first + w * per, b = Math.min(last, a + per);
      const seg = path.join(tmp, `seg-${String(w).padStart(2, '0')}.mp4`);
      if (a >= b) return null;
      const film = await openPage(page, { scale });
      const enc = encoder(seg, fps, { crf: scale > 1 ? 18 : 17 });
      try {
        for (let f = a; f < b; f++) {
          await film.seek((f * 1000) / fps);
          await enc.write(await film.frame(92));
          doneFrames++;
          const pct = Math.floor((doneFrames / total) * 100);
          if (pct >= lastPct + 10) { lastPct = pct; log(`render: ${pct}% (${doneFrames}/${total} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
        }
      } finally { film.close(); }
      await enc.end();
      return seg;
    }));
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
    return { frames: total, workers: n, seconds: (Date.now() - t0) / 1000 };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
