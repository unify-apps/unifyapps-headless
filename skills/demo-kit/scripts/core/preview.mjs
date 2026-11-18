// One scene as its author needs to see it, in seconds, on the clock the film will play it on: each build's frames at
// set points of its real window (from its word to the next build's), the build settled, a strip across the hold for the
// live motion, the layout check, and whether each build's motion finishes inside its window. It writes
// build/scenes/<id>/ with the fingerprints review holds the scene's checks to.
import fs from 'node:fs';
import path from 'node:path';
import { openPage, shot } from './chrome.mjs';
import { fingerprints, sceneBuild } from './design.mjs';
import { inlineFonts } from './fonts.mjs';
import { writePage } from './page.mjs';
import { stepped } from './timeline.mjs';
import { writeJson } from './util.mjs';

// where in each build's window a frame is taken: as it fires, a quarter, half, 85% (its motion should be done), the end
const POINTS = [0, 0.25, 0.5, 0.85, 1];
const HOLD = [0, 1000, 2000, 3000];
const CUT_STEP = 50;

/** A sheet of small frames, three across, each with its caption: one picture of a motion. */
export async function sheet(frames, file, across = 3) {
  const html = `${file}.html`;
  const rows = Math.ceil(frames.length / across);
  fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#1d1d17;display:grid;grid-template-columns:repeat(${across},640px);gap:8px;padding:8px;font:600 16px/1 Helvetica,Arial,sans-serif;color:#d9d3c2}figure{margin:0}img{width:640px;height:360px;display:block;background:#000}figcaption{padding:6px 2px 2px}</style>${frames.map((f) => `<figure><img src="data:image/jpeg;base64,${f.jpg.toString('base64')}"><figcaption>${f.caption}</figcaption></figure>`).join('')}`);
  await shot(html, file, { width: across * 640 + (across + 1) * 8, height: rows * 386 + 8, format: 'jpeg' });
  fs.rmSync(html);
  return file;
}

// the most a build's motion may take of its window: 85% of it, and no more than 0.6 s when the window is under a second
const budget = (w) => Math.min(0.85 * w, w < 1000 ? 600 : Infinity);

/**
 * Writes build/scenes/<id>/: build-<k>.jpg (each build settled, full size), motion-<k>.jpg (frames at set points of
 * each build's window; build 0 from the moment the scene before starts to leave), hold.jpg, meta.json.
 * `clock(list)` gives the plan to play the scenes on (the voice's, voiced or estimated; the deck's even builds without
 * it); `landed`: for each build, the line and word it lands on.
 */
export async function previewScene(story, id, { clock = (list) => stepped(story, list), landed = {}, labels = [] } = {}) {
  const i = story.scenes.findIndex((s) => s.id === id);
  const scene = story.scenes[i], prev = story.scenes[i - 1];
  const dir = sceneBuild(story, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/\.(jpg|html)$/.test(f)) fs.rmSync(path.join(dir, f));
  const fonts = await inlineFonts(story.theme);
  const notes = [];
  // the scene before shows the cut into this one; when it does not build (its author may still be writing it), the
  // scene is shown on its own
  let p, at, plan;
  for (const list of prev ? [[prev, scene], [scene]] : [[scene]]) {
    try {
      plan = await clock(list);
      const page = writePage(path.join(dir, 'page.html'), plan, { title: story.title, footer: story.footer, theme: story.theme, ground: story.ground, inline: story.dir, fonts, customer: story.customer });
      p = await openPage(page); at = list.length - 1; break;
    } catch (e) {
      if (list.length === 1) throw e;
      notes.push(`the scene before (${prev.id}) did not build, so this one is shown on its own: ${e.message}`);
    }
  }
  const issues = [], builds = [];
  try {
    await p.eval("document.getElementById('bar').style.display = 'none'");
    const stops = (await p.stops()).filter((x) => x.scene === at);
    for (const x of stops) {
      // build 0 is the entrance: from the scene before leaving to the first build; every other build, its window
      const from = x.step ? x.cue : x.from, w = Math.max(1, x.next - from);
      const frames = [];
      for (const f of POINTS) {
        const t = Math.round(from + w * f);
        await p.seek(t);
        frames.push({ jpg: await p.frame(80, 'jpeg', 1 / 3), caption: `build ${x.step} · ${Math.round(f * 100)}% · +${((t - from) / 1000).toFixed(2)} s` });
      }
      await p.seek(x.to);
      frames.push({ jpg: await p.frame(80, 'jpeg', 1 / 3), caption: `build ${x.step} · settled` });
      const strip = await sheet(frames, path.join(dir, `motion-${x.step}.jpg`));
      const still = path.join(dir, `build-${x.step}.jpg`);
      fs.writeFileSync(still, await p.frame(90));
      for (const is of (await p.lint()).issues) issues.push({ ...is, step: x.step });
      const took = Math.max(0, x.settles - x.cue);
      if (x.step && !x.last && took > budget(w) + 60) issues.push({ kind: 'overrun', step: x.step, text: `build ${x.step}'s motion takes ${(took / 1000).toFixed(2)} s of a ${(w / 1000).toFixed(2)} s window; finish by ${(budget(w) / 1000).toFixed(2)} s` });
      builds.push({ step: x.step, label: x.step ? labels[x.step - 1] ?? '' : 'entrance', still, strip, window: Math.round(w), took: Math.round(took), landed: landed[x.step] ?? null });
    }
    // the cut in: no text of the scene before lies on this one's while both clearly show
    if (at === 1) {
      const all = await p.stops(), from = all.filter((x) => x.scene === 0).at(-1), to = all.find((x) => x.scene === 1);
      for (let t = from.to; t <= to.to; t += CUT_STEP) {
        await p.seek(t);
        const on = await p.eval('UA.textOnText(0, 1)');
        if (on) { issues.push({ kind: 'cut-overlap', text: on, step: 0 }); break; }
      }
    }
    // the hold: what keeps moving once the last build has landed
    const last = stops.at(-1), hold = [];
    for (const d of HOLD) {
      await p.eval(`UA.seek(${last.to}); UA.drift = ${d}; UA.hold(${last.to}); 1`);
      hold.push({ jpg: await p.frame(80, 'jpeg', 1 / 3), caption: `held · +${d} ms` });
    }
    await p.eval('UA.drift = 0; 1');
    await sheet(hold, path.join(dir, 'hold.jpg'), 2);
  } finally { p.close(); }
  const uniq = [...new Map(issues.map((x) => [`${x.kind}|${x.text}`, x])).values()];
  const meta = { id, type: scene.type, made: new Date().toISOString(), clock: plan.clock, ...fingerprints(story, scene), issues: uniq, notes, builds: builds.map(({ step, label, window, took, landed: l }) => ({ step, label, window, took, landed: l })) };
  writeJson(path.join(dir, 'meta.json'), meta);
  return { id, dir, builds, hold: path.join(dir, 'hold.jpg'), issues: uniq, notes, clock: plan.clock };
}
