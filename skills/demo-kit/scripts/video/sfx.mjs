// The sounds of what happens on screen: a soft pop as a build lands, a cursor's click, a key, a whoosh into each scene.
// The page lists them (UA.sfx, each at the moment its picture happens); each is made here from noise and sine by
// formula, seeded, so the same story always sounds the same. A repeated sound rotates through a few takes.
import { writeWav } from '../core/util.mjs';
import { SR } from './music.mjs';

const rng = (seed) => {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/** A band-pass filter (RBJ biquad) whose centre can move per sample. */
function bandpass(q) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f0) => {
    const w = (2 * Math.PI * f0) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const y = ((al * x) - (al * x2) - (-2 * Math.cos(w)) * y1 - (1 - al) * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

// Each sound: its samples, and `peak`, how far into them the hit lands; the hit plays one frame after its picture.
const SOUNDS = {
  pop(take, r) {
    const n = Math.round(0.09 * SR), out = new Float32Array(n), f = [920, 1040, 860][take % 3];
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 0.2 * Math.sin(2 * Math.PI * f * t * (1 - t * 1.8)) * Math.exp(-t / 0.022) + 0.05 * (r() * 2 - 1) * Math.exp(-t / 0.002); }
    return { out, peak: 0.004 };
  },
  click(take, r) {
    const n = Math.round(0.05 * SR), out = new Float32Array(n), bp = bandpass(1.6);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 0.55 * bp(r() * 2 - 1, 3200 + take * 300) * Math.exp(-t / 0.006) + 0.12 * Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.01); }
    return { out, peak: 0.002 };
  },
  key(take, r) {
    const n = Math.round(0.03 * SR), out = new Float32Array(n), bp = bandpass(2.2);
    for (let i = 0; i < n; i++) { const t = i / SR; out[i] = 0.32 * bp(r() * 2 - 1, [2600, 3100, 2300, 3500][take % 4]) * Math.exp(-t / 0.005); }
    return { out, peak: 0.002 };
  },
  // a whoosh is noise through a band-pass that sweeps up, under an envelope that swells into the cut and falls away
  whoosh(take, r) {
    const n = Math.round(0.62 * SR), out = new Float32Array(n), bp = bandpass(1.1), top = 0.72;
    for (let i = 0; i < n; i++) {
      const p = i / n, env = p < top ? (p / top) ** 2.2 : Math.exp(-(p - top) / 0.06);
      out[i] = 0.5 * env * bp(r() * 2 - 1, 280 * (3800 / 280) ** p);
    }
    return { out, peak: top * 0.62 };
  },
};

// how loud each sound sits under the voice
const LEVEL = { pop: 0.55, click: 0.9, key: 0.5, whoosh: 0.7 };

/** Writes the sound effects of `events` ({ kind, at, take } at their picture's moment) to a stereo WAV. */
export function sfxTrack(events, durationMs, file) {
  const N = Math.ceil((durationMs / 1000 + 0.5) * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const frame = 1000 / 30;
  events.forEach((e, i) => {
    const make = SOUNDS[e.kind];
    if (!make) return;
    const { out, peak } = make(e.take ?? i, rng(i * 7919 + Math.round(e.at)));
    const start = Math.round(((e.at + frame) / 1000 - peak) * SR);
    // takes sit a little left or right, so a run of the same sound does not stack in one spot
    const pan = [0, -0.25, 0.2, -0.1][(e.take ?? i) % 4], g = LEVEL[e.kind] ?? 0.5;
    for (let k = 0; k < out.length; k++) {
      const j = start + k;
      if (j < 0 || j >= N) continue;
      L[j] += out[k] * g * (1 - pan);
      R[j] += out[k] * g * (1 + pan);
    }
  });
  writeWav(file, [L, R], SR);
  return file;
}
