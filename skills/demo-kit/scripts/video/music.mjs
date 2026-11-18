// The film's score, composed from its plan: a warm pad that changes chord with the scenes, a soft arpeggio when a
// scene has energy, a bass under the busier scenes, a swell into every scene change, and accents (a low hit, a
// riser, a shimmer) on the beats the script marks. Everything is computed, nothing sampled, and the same plan
// always gives the same audio.

export const SR = 48000;

const ENERGY = { title: 0.3, statement: 0.35, quote: 0.3, end: 0.35, points: 0.55, screen: 0.5, cta: 0.5, 'before-after': 0.6, timeline: 0.6, platform: 0.6, flow: 0.65, hub: 0.65, stats: 0.7 };
// D major, voiced low and open. The progression walks I vi IV V and resolves on I at the end card.
const CHORDS = {
  D: [50, 57, 61, 66], Bm: [47, 54, 57, 62], G: [43, 50, 54, 59], A: [45, 52, 57, 62], Em: [52, 59, 62, 67], Fsm: [54, 57, 61, 66],
};
const PROGRESSION = ['D', 'Bm', 'G', 'A', 'D', 'Fsm', 'G', 'A'];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function noiseSource(seed = 7) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1; };
}

// a band-limited sawtooth, read by phase
const TABLE = (() => {
  const n = 4096, t = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) { let v = 0; for (let h = 1; h <= 10; h++) v += Math.sin((2 * Math.PI * h * i) / n) / h; t[i] = v * 0.55; }
  return t;
})();
const saw = (ph) => { const x = (ph - Math.floor(ph)) * 4096, i = x | 0; return TABLE[i] + (TABLE[i + 1] - TABLE[i]) * (x - i); };

/** sections: one per scene, each with its chord(s) and energy. */
export function scorePlan(plan) {
  const sec = [];
  let k = 0;
  plan.scenes.forEach((s, i) => {
    const last = i === plan.scenes.length - 1;
    const e = ENERGY[s.type] ?? 0.5;
    const t0 = s.start / 1000 - (i ? 0.35 : 0), t1 = s.end / 1000 - 0.35;
    if (last || s.type === 'end') { sec.push({ t0, t1, chord: 'D', e }); return; }
    if (i === 0) k = 0;
    const len = t1 - t0;
    if (len > 9) { const mid = t0 + len / 2; sec.push({ t0, t1: mid, chord: PROGRESSION[k++ % 8], e }); sec.push({ t0: mid, t1, chord: PROGRESSION[k++ % 8], e }); }
    else sec.push({ t0, t1, chord: PROGRESSION[k++ % 8], e });
  });
  if (sec.length) sec.at(-1).t1 = plan.duration / 1000;
  const accents = [];
  plan.scenes.forEach((s, i) => {
    if (s.ground === 'deep' && i > 0) accents.push({ kind: 'boom', t: s.start / 1000 + 0.15 });
    if (s.type === 'stats') s.cues.slice(1).forEach((c) => accents.push({ kind: 'shimmer', t: c / 1000 + 0.15 }));
    if (s.type === 'end') { accents.push({ kind: 'boom', t: s.start / 1000 + 0.2 }); accents.push({ kind: 'shimmer', t: s.start / 1000 + 0.4 }); }
    for (const b of s.beats) if (b.accent) accents.push({ kind: b.accent, t: b.at / 1000 });
  });
  return { sections: sec, accents, bpm: 96 };
}

export function compose(plan, { mood = 'warm' } = {}) {
  const dur = plan.duration / 1000 + 0.5;
  const N = Math.ceil(dur * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const { sections, accents, bpm } = scorePlan(plan);
  const bright = mood === 'bright' ? 1.25 : mood === 'calm' ? 0.75 : 1;
  const eighth = 60 / bpm / 2;

  // ── pad and bass, section by section with overlapping fades ──
  const dry = new Float32Array(N); // the part that goes through the reverb
  for (const s of sections) {
    const notes = CHORDS[s.chord];
    const a = Math.max(0, Math.floor((s.t0 - 0.6) * SR)), b = Math.min(N, Math.floor((s.t1 + 1.6) * SR));
    const att = 1.4, rel = 1.6;
    const cutoff = (500 + 1300 * s.e) * bright, alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
    let lp = 0, lpB = 0;
    const ph = notes.map((_, n) => [0.13 + n * 0.07, 0.61]);
    const inc = notes.map((m) => [hz(m) / SR, (hz(m) * 1.004) / SR]);
    const bassOn = s.e >= 0.55, bInc = hz(notes[0] - 12) / SR;
    let bph = 0;
    for (let i = a; i < b; i++) {
      const t = i / SR;
      const env = Math.min(1, Math.max(0, (t - (s.t0 - 0.6)) / att)) * Math.min(1, Math.max(0, (s.t1 + 1.6 - t) / rel));
      let v = 0;
      for (let n = 0; n < notes.length; n++) { const p = ph[n]; v += saw(p[0]) + saw(p[1]); p[0] += inc[n][0]; p[1] += inc[n][1]; }
      lp += alpha * (v * 0.06 - lp);
      let out = lp * env * (0.7 + 0.3 * s.e);
      if (bassOn) { bph += bInc; const bs = Math.sin(2 * Math.PI * bph) + 0.25 * Math.sin(4 * Math.PI * bph); lpB += 0.02 * (bs - lpB); out += lpB * 0.09 * env; }
      dry[i] += out;
    }
  }

  // ── arpeggio: plucked chord tones an octave up, in eighths, while a scene has energy ──
  for (const s of sections) {
    if (s.e < 0.5) continue;
    const notes = CHORDS[s.chord].map((m) => m + 12);
    const order = [0, 2, 1, 3, 2, 1];
    let k = 0;
    for (let t = Math.ceil(s.t0 / eighth) * eighth; t < s.t1 - 0.2; t += eighth, k++) {
      if (k % 8 === 7) continue; // a breath in every bar
      const f = hz(notes[order[k % order.length]]), amp = 0.05 * s.e * bright * (k % 2 ? 0.75 : 1);
      const i0 = Math.floor(t * SR), len = Math.floor(0.45 * SR), pan = k % 2 ? 0.35 : -0.35;
      for (let j = 0; j < len && i0 + j < N; j++) {
        const x = j / SR, env = Math.exp(-x * 9) * Math.min(1, x * 400);
        const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * x));
        const v = tri * env * amp;
        L[i0 + j] += v * (1 - pan) * 0.7; R[i0 + j] += v * (1 + pan) * 0.7;
        dry[i0 + j] += v * 0.5;
      }
    }
  }

  // ── accents ──
  const noise = noiseSource(11);
  for (const ac of accents) {
    const i0 = Math.floor(ac.t * SR);
    if (ac.kind === 'whoosh') {
      // filtered noise swelling into the cut
      const len = Math.floor(1.1 * SR), start = i0 - Math.floor(0.8 * SR);
      let bp1 = 0, bp2 = 0;
      for (let j = 0; j < len; j++) {
        const i = start + j; if (i < 0 || i >= N) continue;
        const x = j / len, f = 300 + 2600 * x * x, w = (2 * Math.PI * f) / SR, q = 0.18;
        const n = noise(); bp1 += w * (n - bp1 - q * bp2); bp2 += w * bp1;
        const env = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 2;
        const v = bp2 * env * 0.18;
        L[i] += v * (1 - x * 0.6); R[i] += v * (0.4 + x * 0.6);
      }
    } else if (ac.kind === 'boom') {
      const len = Math.floor(1.8 * SR);
      let ph = 0;
      for (let j = 0; j < len && i0 + j < N; j++) {
        const x = j / SR, f = 42 + 38 * Math.exp(-x * 5);
        ph += f / SR;
        const v = Math.sin(2 * Math.PI * ph) * Math.exp(-x * 2.3) * 0.32 + (j < 600 ? noise() * 0.05 * (1 - j / 600) : 0);
        L[i0 + j] += v; R[i0 + j] += v;
      }
    } else if (ac.kind === 'riser') {
      const len = Math.floor(1.6 * SR), start = i0 - len;
      let ph = 0, lp = 0;
      for (let j = 0; j < len; j++) {
        const i = start + j; if (i < 0 || i >= N) continue;
        const x = j / len; ph += (200 + 900 * x * x) / SR;
        lp += 0.08 * (noise() - lp);
        const v = (Math.sin(2 * Math.PI * ph) * 0.05 + lp * 0.16) * x * x;
        L[i] += v; R[i] += v; dry[i] += v * 0.6;
      }
    } else if (ac.kind === 'shimmer') {
      const parts = [[1760, 0.05], [2637, 0.035], [3520, 0.02]];
      const len = Math.floor(2.2 * SR);
      for (let j = 0; j < len && i0 + j < N; j++) {
        const x = j / SR; let v = 0;
        for (const [f, a] of parts) v += Math.sin(2 * Math.PI * f * x) * a;
        v *= Math.exp(-x * 2.2) * Math.min(1, x * 200) * bright;
        L[i0 + j] += v * 0.6; R[i0 + j] += v * 0.6; dry[i0 + j] += v;
      }
    }
  }

  // ── a small hall: four combs and two all-passes per side, slightly apart for width ──
  const reverb = (input, ms) => {
    const out = new Float32Array(N);
    for (const d of ms.combs) {
      const D = Math.floor((d * SR) / 1000), buf = new Float32Array(D); let p = 0, lp = 0;
      for (let i = 0; i < N; i++) { const y = buf[p]; lp += 0.3 * (y - lp); buf[p] = input[i] + lp * 0.8; out[i] += y * 0.25; p = (p + 1) % D; }
    }
    for (const d of ms.alls) {
      const D = Math.floor((d * SR) / 1000), buf = new Float32Array(D); let p = 0;
      for (let i = 0; i < N; i++) { const b = buf[p], x = out[i]; const y = -x + b; buf[p] = x + b * 0.5; out[i] = y; p = (p + 1) % D; }
    }
    return out;
  };
  const wl = reverb(dry, { combs: [29.7, 37.1, 41.1, 43.7], alls: [5.0, 1.7] });
  const wr = reverb(dry, { combs: [30.9, 36.3, 40.3, 44.9], alls: [5.3, 1.9] });
  for (let i = 0; i < N; i++) { L[i] += dry[i] * 0.8 + wl[i] * 0.42; R[i] += dry[i] * 0.8 + wr[i] * 0.42; }

  // fades, then a peak of -3 dBFS
  const fi = 1.2 * SR, fo = 4 * SR;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    const g = Math.min(1, i / fi) * Math.min(1, (N - i) / fo);
    L[i] *= g; R[i] *= g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = peak > 0 ? 0.708 / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= norm; R[i] *= norm; }
  return [L, R];
}
