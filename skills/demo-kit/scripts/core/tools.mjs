// What each output needs on this machine, and what to run when it is missing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome } from './chrome.mjs';
import { GSAP, gsapDir, gsapReady, installGsap } from './gsap.mjs';
import { HOME, VENV, run, which } from './util.mjs';

export const OUTPUTS = ['deck', 'slides', 'video'];

// whisper-cli needs a ggml model and Homebrew installs none; only ggml-*.bin, since whisper.cpp's for-tests-*.bin are vocabulary-only stubs
function whisperModel() {
  if (process.env.WHISPER_MODEL && fs.existsSync(process.env.WHISPER_MODEL)) return process.env.WHISPER_MODEL;
  for (const dir of [path.join(HOME, 'whisper'), path.join(os.homedir(), '.cache', 'whisper'), '/opt/homebrew/share/whisper-cpp', '/usr/local/share/whisper-cpp']) {
    const bin = fs.existsSync(dir) && fs.readdirSync(dir).filter((f) => /^ggml-.+\.bin$/.test(f)).sort()[0];
    if (bin) return path.join(dir, bin);
  }
  return null;
}

/** One row per tool: whether it is here, and the outputs it serves; an optional row is never a miss. `fix` installs the voice engine and GSAP. */
export async function doctor({ fix = false } = {}) {
  const rows = [];
  const add = (name, needs, ok, detail, fixHint, extra) => rows.push({ name, needs, ok, detail, fix: ok ? undefined : fixHint, ...extra });
  add('node', OUTPUTS, typeof WebSocket === 'function', process.version, 'Node 22.4 or newer');
  const chrome = findChrome();
  add('chrome', OUTPUTS, Boolean(chrome), chrome ?? 'Chrome for Testing not found', 'npx playwright install chromium');
  let fonts = false;
  try { fonts = (await fetch('https://fonts.googleapis.com/css2?family=Spectral:wght@300&display=block', { signal: AbortSignal.timeout(6000) })).ok; } catch { /* offline */ }
  add('fonts', OUTPUTS, fonts, fonts ? 'Google Fonts reachable' : 'offline: fonts kept from an earlier build still work; new ones fall back to Georgia and Helvetica', 'connect to the internet');
  if (!gsapReady() && fix) await installGsap();
  add('gsap', OUTPUTS, gsapReady(), gsapReady() ? `GSAP ${GSAP.version} in ${gsapDir()}` : 'not installed: scenes written with GSAP will not build', 'node demo.mjs doctor --fix');
  const ff = await which('ffmpeg');
  const x264 = ff ? (await run('ffmpeg', ['-hide_banner', '-encoders'])).toString().includes('libx264') : false;
  add('ffmpeg', ['video'], Boolean(ff && x264), ff ? (x264 ? ff : `${ff} (no libx264)`) : 'missing', 'brew install ffmpeg');
  const edge = path.join(VENV, 'bin', 'edge-tts');
  if (!fs.existsSync(edge) && fix) {
    const py = (await which('python3')) ?? 'python3';
    fs.mkdirSync(HOME, { recursive: true });
    await run(py, ['-m', 'venv', VENV]);
    await run(path.join(VENV, 'bin', 'pip'), ['install', '-q', '--upgrade', 'pip', 'edge-tts']);
  }
  add('voice (edge)', ['video'], fs.existsSync(edge), fs.existsSync(edge) ? edge : 'not installed', 'node demo.mjs doctor --fix');
  const say = await which('say');
  add('voice (mac)', ['video'], Boolean(say), say ? 'say (local, private)' : 'not a Mac', '', { optional: true });
  const whisper = await which('whisper-cli'), model = whisperModel();
  const getModel = `mkdir -p "${path.join(HOME, 'whisper')}" && curl -fL -o "${path.join(HOME, 'whisper', 'ggml-base.en.bin')}" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin`;
  add('transcribe', OUTPUTS, Boolean(whisper && model),
    whisper && model ? `whisper-cli -m "${model}" -f <file> -otxt` : whisper ? 'whisper-cli has no ggml model: recordings need a transcript' : 'no whisper-cli: recordings need a transcript',
    whisper ? getModel : `brew install whisper-cpp${model ? '' : ` && ${getModel}`}`, { model, optional: true });
  return rows;
}

/** Whether every tool the chosen outputs need is here. */
export const ready = (rows, outputs = OUTPUTS) => rows.filter((r) => !r.optional && r.needs.some((n) => outputs.includes(n))).every((r) => r.ok);
