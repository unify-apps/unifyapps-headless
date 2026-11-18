// Every join of a film as its director and reviewer need to see it: frames across each cut, from just before the scene
// before goes to just after the next has arrived, each with the words being said; any frame with next to nothing on it
// (the scene before gone, this one not yet there); and how long the two scenes are seen on top of each other. It writes
// the sheets into the folder it is given.
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from './chrome.mjs';
import { sheet } from './preview.mjs';

// where across a cut a frame is taken, in ms from the moment the next scene arrives
const AROUND = [-600, -300, 0, 300, 600];
// where across a cut the two scenes are drawn apart and compared, every 100 ms
const APART = [-300, -200, -100, 0, 100, 200, 300, 400, 500];
// a scene is seen at a moment when this share of the frame is drawn by it alone: a heading's few words are about 0.3%,
// one small label under it
const SEEN = 0.002;
// two pictures seen at once for longer than this (ms) on a cut that is not a chosen dissolve is reported
const OVERLAP = 200;
// a frame is bare when less than this share of its pixels differs from the ground alone: a scene's picture covers 1.5%
// and more of it, a heading on its own about 0.3%
const BARE = 0.004;

// in the page: the share of one picture's pixels that differ from another's, both JPEGs as base64
const inkShare = async (a, b) => {
  const px = async (b64) => {
    const im = new Image(); im.src = `data:image/jpeg;base64,${b64}`; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const [p, q] = await Promise.all([px(a), px(b)]);
  let n = 0;
  // 32 of 255 on any channel: past the noise a JPEG adds, short of any drawn part
  for (let i = 0; i < p.length; i += 4) if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > 32) n++;
  return n / (p.length / 4);
};

// in the page: the share of pixels each of two pictures draws, each told from the ground alone (all JPEG, base64)
const drawnShares = async (a, b, g) => {
  const px = async (b64) => {
    const im = new Image(); im.src = `data:image/jpeg;base64,${b64}`; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    return x.getImageData(0, 0, c.width, c.height).data;
  };
  const [p, q, r] = await Promise.all([px(a), px(b), px(g)]);
  const share = (d) => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.max(Math.abs(d[i] - r[i]), Math.abs(d[i + 1] - r[i + 1]), Math.abs(d[i + 2] - r[i + 2])) > 32) n++;
    return n / (d.length / 4);
  };
  return [share(p), share(q)];
};

/** The words being said at t, or the pause, for a frame's caption. */
function saying(plan, t) {
  const words = plan.scenes.flatMap((s) => s.beats.flatMap((b) => b.words ?? []));
  const i = words.findIndex((w) => w.at <= t && t < w.end + 120);
  return i < 0 ? '(pause)' : `"${words.slice(i, i + 3).map((w) => w.w).join(' ')}…"`;
}

/**
 * One sheet per join, NN-<from>-<to>.jpg in `dir`, five frames across its cut. Returns each join with its cut, what it
 * carries, its pause and cut word (a spoken plan's), its sheet, how much of each frame is drawn, the frames (ms from the
 * cut) with next to nothing on them, how long both scenes are seen at once (`overlap`, ms, to 100 ms), and `doubled`
 * when that runs past 200 ms on a cut other than a chosen dissolve.
 */
export async function seams(page, plan, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/\.jpg$/.test(f)) fs.rmSync(path.join(dir, f));
  const p = await openPage(page);
  const out = [];
  try {
    await p.eval("document.getElementById('bar').style.display = 'none'");
    const cuts = await p.eval('UA.list.map((s) => ({ cut: s.cut, carry: s.carry ?? [] }))');
    for (let i = 1; i < plan.scenes.length; i++) {
      const s = plan.scenes[i], prev = plan.scenes[i - 1], frames = [], bare = [], ink = [];
      for (const d of AROUND) {
        const t = Math.max(0, Math.round(s.start + d));
        await p.seek(t);
        const jpg = await p.frame(80, 'jpeg', 1 / 3);
        // the ground alone: no scene, and no mark (on the title it is the picture; elsewhere too faint to count)
        await p.eval("UA.list.forEach((x) => { x.root.style.visibility = 'hidden'; }); document.getElementById('amb').style.visibility = 'hidden'; 1");
        const ground = await p.frame(80, 'jpeg', 1 / 3);
        await p.eval("document.getElementById('amb').style.visibility = ''; 1");
        const share = await p.eval(`(${inkShare})(${JSON.stringify(jpg.toString('base64'))}, ${JSON.stringify(ground.toString('base64'))})`);
        ink.push(Math.round(share * 10000) / 10000);
        // the end card's lockup grows out of an empty frame on purpose
        if (share < BARE && s.type !== 'end') bare.push(d);
        frames.push({ jpg, caption: `${d < 0 ? '−' : '+'}${(Math.abs(d) / 1000).toFixed(1)} s · ${saying(plan, t)}${share < BARE && s.type !== 'end' ? ' · BARE' : ''}` });
      }
      const file = await sheet(frames, path.join(dir, `${String(i).padStart(2, '0')}-${prev.id}-${s.id}.jpg`), 5);
      // how long the two scenes are seen at once: each drawn alone (the mark hidden), both showing something at the same moment
      let run = 0, longest = 0;
      for (const d of APART) {
        const t = Math.max(0, Math.round(s.start + d)), alone = [];
        for (const keep of [i - 1, i, -1]) {
          await p.seek(t);
          await p.eval(`UA.list.forEach((x, k) => { if (k !== ${keep}) x.root.style.visibility = 'hidden'; }); document.getElementById('amb').style.visibility = 'hidden'; 1`);
          alone.push((await p.frame(80, 'jpeg', 1 / 3)).toString('base64'));
        }
        await p.eval("document.getElementById('amb').style.visibility = ''; 1");
        const [a, b] = await p.eval(`(${drawnShares})(${alone.map((x) => JSON.stringify(x)).join(', ')})`);
        run = a >= SEEN && b >= SEEN ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      const overlap = longest * 100;
      out.push({ from: prev.id, to: s.id, ...cuts[i], pause: s.join?.pause ?? null, on: s.join?.on ?? null, sheet: file, ink, bare, overlap, doubled: overlap > OVERLAP && cuts[i].cut !== 'dissolve' });
    }
  } finally { p.close(); }
  return out;
}
