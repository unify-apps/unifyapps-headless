// The video: the story's lines voiced with when each word is said, laid on the spoken clock so every build lands on
// its word, the same page rendered frame by frame from it with a camera and captions, scored, given the sounds of what
// happens on screen, mixed to broadcast loudness, and measured for still stretches; with captions as a file, a preview
// page that plays it, a share copy and a kept version.
import fs from 'node:fs';
import path from 'node:path';
import { openPage } from '../core/chrome.mjs';
import { inlineFonts } from '../core/fonts.mjs';
import { writePage } from '../core/page.mjs';
import { cut } from '../core/story.mjs';
import { spoken, srt } from '../core/timeline.mjs';
import { run, writeJson } from '../core/util.mjs';
import { musicTrack, mux, qa, shareCopy, stillness, voiceTrack } from './mix.mjs';
import { renderVideo } from './render.mjs';
import { sfxTrack } from './sfx.mjs';
import { estimate, voiceLines } from './voice.mjs';

const PREVIEW = { scripts: [path.join(import.meta.dirname, 'preview.js')], styles: [path.join(import.meta.dirname, 'preview.css')] };

/** The cut to make: its name (a build of some scenes never overwrites the whole cut's files) and its scenes. */
export function cutOf(story, name, scenes) {
  return { name: scenes ? `${name}-part` : name, scenes: cut(story, name, { scenes }) };
}

/** The cut's timeline from its voiced lines, or from their estimated length when nothing may be voiced yet. */
export async function videoPlan(story, c, { estimated = false, log = () => {} } = {}) {
  if (estimated) estimate(c.scenes); else await voiceLines(story, c.scenes, { log });
  const plan = spoken(story, c.scenes);
  const dir = path.join(story.dir, 'build', c.name);
  writeJson(path.join(dir, 'plan.json'), plan);
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt(plan));
  return { plan, dir };
}

// a caption page: at most 6 words or 40 characters, breaking after a sentence or a clause
const PAGE = { words: 6, chars: 40 };

/** The spoken words in short pages, each with when it is on screen, for the captions burned into the picture. */
export function captionPages(plan) {
  const pages = [];
  for (const s of plan.scenes) for (const b of s.beats) {
    let cur = [];
    const flush = () => { if (cur.length) pages.push({ from: cur[0].at, to: cur.at(-1).end, words: cur }); cur = []; };
    for (const w of b.words ?? []) {
      const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
      if (cur.length && (cur.length >= PAGE.words || len > PAGE.chars)) flush();
      cur.push(w);
      if (/[.!?;:]$/.test(w.w) || (/,$/.test(w.w) && cur.length >= 3)) flush();
    }
    flush();
  }
  return pages;
}

export async function makeVideo(story, c, { size, workers, music = true, log = () => {} } = {}) {
  const t0 = Date.now();
  const { plan, dir } = await videoPlan(story, c, { log });
  const fonts = await inlineFonts(story.theme);
  const film = story.video.captions === false ? {} : { captions: captionPages(plan) };
  const page = writePage(path.join(dir, 'page.html'), plan, { title: story.title, footer: story.footer, theme: story.theme, ground: story.ground, assetBase: '../../', fonts, film, customer: story.customer });
  const voice = await voiceTrack(plan, path.join(dir, 'voice.wav'));
  const score = music && story.video.music.on !== false ? musicTrack(plan, path.join(dir, 'music.wav'), story.video.music.mood) : null;
  // the sounds of what happens on screen, as the page itself lists them
  const probe = await openPage(page);
  let events;
  try { events = await probe.eval('UA.sfx'); } finally { probe.close(); }
  const sfx = story.video.sfx === false ? null : sfxTrack(events, plan.duration, path.join(dir, 'sfx.wav'));
  log(`plan: ${plan.scenes.length} scenes; rendering`);
  const scale = (size ?? story.video.size) === '4k' ? 2 : 1;
  const r = await renderVideo(page, path.join(dir, 'video.mp4'), { fps: story.video.fps, scale, from: 0, to: plan.duration, workers, log });
  log(`render: ${r.frames} frames on ${r.workers} workers in ${r.seconds.toFixed(0)} s`);
  const out = path.join(story.dir, 'out');
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `${story.slug}-${c.name}`);
  await mux({ video: path.join(dir, 'video.mp4'), voice, music: score, sfx, gain: story.video.music.gain, out: `${base}.mp4` });
  fs.copyFileSync(path.join(dir, 'captions.srt'), `${base}.srt`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${base}.mp4`, '-vn', '-c:a', 'copy', `${base}.m4a`]);
  writePage(`${base}.html`, plan, { title: story.title, footer: story.footer, theme: story.theme, ground: story.ground, assetBase: '../', fonts, player: PREVIEW, film: { audio: `${path.basename(base)}.m4a` }, customer: story.customer });
  const check = await qa(`${base}.mp4`, { width: 1920 * scale, height: 1080 * scale, duration: plan.duration });
  // nothing may stand still for more than 3 s before the end card, which holds still on purpose
  const until = plan.scenes.at(-1).type === 'end' ? plan.scenes.at(-1).start : plan.duration;
  const still = await stillness(path.join(dir, 'video.mp4'), { untilMs: until });
  const builds = plan.scenes.reduce((n, s) => n + s.cues.length - 1, 0), synced = plan.scenes.reduce((n, s) => n + s.synced, 0);
  check.motion = { ...still, wordSynced: builds ? +(synced / builds).toFixed(2) : 1, sounds: events.length };
  check.ok = check.ok && still.longestMs <= 3000;
  const files = { video: `${base}.mp4`, captions: `${base}.srt`, preview: `${base}.html` };
  if (c.name === 'full') {
    files.share = await shareCopy(`${base}.mp4`, `${base}-share.mp4`, plan.duration);
    const vdir = path.join(story.dir, 'versions', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
    fs.mkdirSync(vdir, { recursive: true });
    for (const f of [files.video, files.share, files.captions, path.join(story.dir, 'story.json'), path.join(story.dir, 'facts.json')]) if (fs.existsSync(f)) fs.copyFileSync(f, path.join(vdir, path.basename(f)));
    files.version = vdir;
  }
  return { cut: c.name, duration: plan.duration, seconds: (Date.now() - t0) / 1000, files, qa: check };
}
