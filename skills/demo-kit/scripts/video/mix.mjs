// Sound and the final files: the voice track laid from the plan, the score under it (ducked while the voice speaks),
// loudness to -16 LUFS with a true-peak ceiling of -1.5 dB in two passes, captions, a share copy, and the checks.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { compose, SR } from './music.mjs';
import { decode, run, writeWav } from '../core/util.mjs';

export async function voiceTrack(plan, file) {
  const n = Math.ceil((plan.duration / 1000 + 0.5) * SR);
  const v = new Float32Array(n);
  for (const s of plan.scenes) for (const b of s.beats) {
    if (!b.file) continue;
    const a = await decode(b.file, SR), i0 = Math.round((b.at / 1000) * SR);
    for (let i = 0; i < a.length && i0 + i < n; i++) v[i0 + i] += a[i];
  }
  writeWav(file, [v, v], SR);
  return file;
}

export function musicTrack(plan, file, mood) {
  writeWav(file, compose(plan, { mood }), SR);
  return file;
}

/** video (silent) + voice + optional music (ducked under the voice) + optional sound effects -> out.mp4 at broadcast loudness. */
export async function mux({ video, voice, music, sfx, gain = 0.4, out }) {
  const inputs = ['-i', video, '-i', voice, ...(music ? ['-i', music] : []), ...(sfx ? ['-i', sfx] : [])];
  const fx = sfx ? `[${music ? 3 : 2}:a]anull[fx]` : null;
  const graph = [
    music ? `[1:a]asplit=2[v1][v2];[2:a]volume=${gain}[m];[m][v1]sidechaincompress=threshold=0.035:ratio=5:attack=20:release=320:makeup=1[md]` : '[1:a]anull[v2]',
    fx,
    `[v2]${music ? '[md]' : ''}${sfx ? '[fx]' : ''}amix=inputs=${1 + (music ? 1 : 0) + (sfx ? 1 : 0)}:normalize=0[a]`,
  ].filter(Boolean).join(';');
  // pass 1 measures, pass 2 corrects to the target in one linear gain
  const m = await measure(inputs, graph);
  const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  // loudnorm can hand back 192 kHz, so the limiter works after the resample to 48 kHz: limited at 192 kHz, a Mac-voice
  // film rang back to -0.1 dB true peak once band-limited, against -1.7 dB limited at 48 kHz. It sits at -2.05 dBFS,
  // half a dB under the -1.5 dB ceiling, for the intersample peaks AAC encoding adds.
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${graph};[a]${ln},aresample=48000,alimiter=limit=0.79:level=false[o]`, '-map', '0:v', '-map', '[o]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  return out;
}

async function measure(inputs, graph) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', ...inputs, '-filter_complex', `${graph};[a]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-']);
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => { const j = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1); try { resolve(JSON.parse(j)); } catch { reject(new Error(`loudness measure failed: ${err.slice(-300)}`)); } });
  });
}

/** A copy for chat and email: 1280 wide, under 30 MiB (a second, bitrate-capped pass when the first is too big). */
export async function shareCopy(src, out, durationMs) {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  if (fs.statSync(out).size > 29.5 * 1024 * 1024) {
    const kbps = Math.floor((29 * 8 * 1024) / (durationMs / 1000)) - 140;
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-b:v', `${kbps}k`, '-maxrate', `${kbps * 1.4}k`, '-bufsize', `${kbps * 2}k`, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  }
  return out;
}

/**
 * Where nothing on screen moves: every stretch of `minMs` or more with no change at all, up to `untilMs`. The noise
 * floor (-68 dB) sits under any real motion, small packets and a turning mark included, and over the encoder's noise.
 */
export async function stillness(file, { untilMs, minMs = 500 } = {}) {
  const err = await new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, ...(untilMs ? ['-t', String(untilMs / 1000)] : []), '-vf', `freezedetect=n=0.0004:d=${minMs / 1000}`, '-an', '-f', 'null', '-']);
    let e = ''; p.stderr.on('data', (d) => { e += d; }); p.on('close', () => resolve(e));
  });
  const stills = [...err.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Math.round(+m[1] * 1000));
  const total = stills.reduce((a, b) => a + b, 0);
  return { stills: stills.length, frozenMs: total, frozenShare: untilMs ? +(total / untilMs).toFixed(3) : null, longestMs: Math.max(0, ...stills) };
}

/** What the finished file measures (length, picture, loudness and peak), and whether it is the film it should be. */
export async function qa(file, { width, height, duration }) {
  const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height,r_frame_rate', '-of', 'json', file])).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio');
  const loud = await new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => { const tail = err.slice(err.lastIndexOf('Summary:')); resolve({ lufs: parseFloat(tail.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]), peak: parseFloat(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]) }); });
  });
  const [num, den] = String(v?.r_frame_rate ?? '0/1').split('/').map(Number);
  const r = { seconds: +(+probe.format.duration).toFixed(2), mb: +(probe.format.size / 1048576).toFixed(1), width: v?.width, height: v?.height, fps: den ? +(num / den).toFixed(2) : null, audio: Boolean(a), ...loud };
  r.ok = Boolean(a) && r.lufs >= -17.5 && r.lufs <= -14.5 && r.peak <= -1.5 && r.width === width && r.height === height && Math.abs(probe.format.duration * 1000 - duration) <= 500;
  return r;
}
