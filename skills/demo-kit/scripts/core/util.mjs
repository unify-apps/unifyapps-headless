// Small shared helpers: paths, processes, audio files.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const KIT = path.resolve(import.meta.dirname, '..');
export const RUNTIME = path.join(KIT, 'runtime');
export const HOME = process.env.UA_DEMO_KIT_HOME ?? path.join(process.env.UA_HOME ?? path.join(os.homedir(), '.nebula'), 'demo-kit');
export const VENV = path.join(HOME, 'venv');

export class UsageError extends Error {}

export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
export const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`); };
export const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

/** Runs a command; resolves with stdout, rejects with stderr's tail. */
export function run(cmd, args, { input, cwd, quiet } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err.push(d); if (!quiet && process.env.DEMO_KIT_DEBUG) process.stderr.write(d); });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${Buffer.concat(err).toString().trim().split('\n').slice(-4).join(' | ')}`))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

export async function which(cmd) {
  try { return (await run('/bin/sh', ['-c', `command -v ${cmd}`])).toString().trim() || null; } catch { return null; }
}

export async function duration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(parseFloat(out.toString()) * 1000);
}

/** Decodes any audio file to mono 48 kHz float samples. */
export async function decode(file, sr = 48000) {
  const raw = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(sr), 'pipe:1']);
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Writes channels of float samples as a 32-bit float WAV. */
export function writeWav(file, channels, sr = 48000) {
  const n = channels[0].length, ch = channels.length, bytes = n * ch * 4;
  const buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(ch, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * ch * 4, 28); buf.writeUInt16LE(ch * 4, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 4) buf.writeFloatLE(channels[c][i], o);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

/** Runs async jobs with at most `n` at once. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}
