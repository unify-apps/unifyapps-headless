// Voices each line of a cut, one clip per line, cached by its words and voice so an unchanged line is never sent again,
// with when each word is spoken (the word clock). `edge` uses Microsoft's online neural voices, which report every word
// (the text leaves the laptop); `say` uses the Mac's own voices (it does not), and its words are timed by their length.
import fs from 'node:fs';
import path from 'node:path';
import { VENV, duration, pool, run, sha1 } from '../core/util.mjs';

const EDGE_VOICE = path.join(import.meta.dirname, 'edge_voice.py');

export const VOICES = {
  andrew: 'en-US-AndrewMultilingualNeural', ava: 'en-US-AvaMultilingualNeural', brian: 'en-US-BrianMultilingualNeural', emma: 'en-US-EmmaMultilingualNeural',
  sonia: 'en-GB-SoniaNeural', ryan: 'en-GB-RyanNeural', neerja: 'en-IN-NeerjaNeural', prabhat: 'en-IN-PrabhatNeural',
};

// a mood nudges pace and pitch a little; whole sentences carry the rest
const MOOD = { calm: [-4, -1], warm: [0, 0], confident: [1, -1], upbeat: [4, 2], tension: [-2, -2], punch: [-3, -3], question: [0, 2] };

const pct = (s) => parseInt(String(s).replace('%', ''), 10) || 0;
const hzv = (s) => parseInt(String(s).replace('Hz', ''), 10) || 0;

export function voiceId(voice) {
  return voice.engine === 'say' ? voice.name ?? 'Samantha' : VOICES[voice.name] ?? voice.name;
}

// where a line's clip and its word clock are kept: by its words, its voice and its mood's pace and pitch
function clipOf(story, b) {
  const v = story.video.voice;
  const [dr, dp] = MOOD[b.mood] ?? [0, 0];
  const rate = `${pct(v.rate) + dr >= 0 ? '+' : ''}${pct(v.rate) + dr}%`, pitch = `${hzv(v.pitch) + dp >= 0 ? '+' : ''}${hzv(v.pitch) + dp}Hz`;
  const key = sha1(JSON.stringify([v.engine, voiceId(v), rate, pitch, b.text]));
  const dir = path.join(story.dir, 'build', 'voice');
  return { dr, rate, pitch, file: path.join(dir, `${key}.${v.engine === 'say' ? 'wav' : 'mp3'}`), timed: path.join(dir, `${key}.words.json`) };
}

/**
 * Times every line without sending anything: a line already voiced takes its voiced length and word clock from the
 * cache, the rest their estimate. Answers how many were voiced.
 */
export async function timeLines(story, scenes) {
  let voiced = 0;
  estimate(scenes);
  for (const b of scenes.flatMap((s) => s.say)) {
    const { file, timed } = clipOf(story, b);
    if (!fs.existsSync(file) || !fs.existsSync(timed)) continue;
    try { b.dur = await duration(file); b.words = JSON.parse(fs.readFileSync(timed, 'utf8')); voiced++; } catch { /* keep the estimate */ }
  }
  return voiced;
}

export async function voiceLines(story, scenes, { log = () => {} } = {}) {
  const dir = path.join(story.dir, 'build', 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const lines = scenes.flatMap((s) => s.say);
  const v = story.video.voice;
  const py = path.join(VENV, 'bin', 'python');
  if (v.engine === 'edge' && !fs.existsSync(path.join(VENV, 'bin', 'edge-tts'))) throw new Error('the voice engine is not installed: run `demo.mjs doctor --fix`');
  let sent = 0;
  // three at a time: the online service starts refusing connections under more
  await pool(lines, 3, async (b) => {
    const { dr, rate, pitch, file, timed } = clipOf(story, b);
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000 || (v.engine === 'edge' && !fs.existsSync(timed))) {
      for (let attempt = 1; ; attempt++) {
        try {
          if (v.engine === 'say') {
            const wpm = Math.round(180 * (1 + (pct(v.rate) + dr) / 100));
            await run('say', ['-v', voiceId(v), '-r', String(wpm), '--file-format=WAVE', '--data-format=LEI16@48000', '-o', file, b.text]);
          } else {
            await run(py, [EDGE_VOICE, voiceId(v), rate, pitch, b.text, file, timed]);
          }
          if (fs.statSync(file).size < 1000) throw new Error('empty audio');
          sent++;
          break;
        } catch (e) {
          fs.rmSync(file, { force: true });
          if (attempt >= 6) throw new Error(`could not voice "${b.text.slice(0, 50)}…": ${e.message}`);
          await new Promise((r) => setTimeout(r, 1200 * 2 ** (attempt - 1)));
        }
      }
    }
    b.file = file;
    b.dur = await duration(file);
    b.words = v.engine === 'edge' ? JSON.parse(fs.readFileSync(timed, 'utf8')) : estimateWords(b.text, b.dur);
  });
  log(`voice: ${lines.length} lines (${sent} new, ${lines.length - sent} from the cache), ${voiceId(v)}`);
  return scenes;
}

/** Without voicing: a line's length at the measured pace of the neural voices (about 2.6 words a second). */
export function estimate(scenes) {
  for (const s of scenes) for (const b of s.say) { b.dur = Math.round((b.text.split(/\s+/).filter(Boolean).length / 2.6) * 1000 + 250); b.words = estimateWords(b.text, b.dur); }
  return scenes;
}

/** When each word falls in a line that reports no words: shared out by length, a long word taking longer. */
export function estimateWords(text, dur) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2);
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  const lead = 60, span = Math.max(0, dur * 0.94 - lead);
  let at = lead;
  return words.map((w, i) => { const d = (span * weight[i]) / total; const out = { w, at: Math.round(at), end: Math.round(at + d * 0.9) }; at += d; return out; });
}
