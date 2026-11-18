#!/usr/bin/env node
// UnifyApps stories from a story folder: one story.json and facts.json made into an HTML deck, slides or a video.
// Node 22 and Chrome for Testing; the video also needs ffmpeg and a voice.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { shot } from './core/chrome.mjs';
import { findInInputs, howToRead, splitInputs, where } from './core/inputs.mjs';
import { OUTPUTS, doctor, ready } from './core/tools.mjs';
import { hasDesign, review, scaffoldDesign } from './core/design.mjs';
import { inlineFonts } from './core/fonts.mjs';
import { writePage } from './core/page.mjs';
import { previewScene } from './core/preview.mjs';
import { seams } from './core/seams.mjs';
import { buildLabels, library } from './core/scenes.mjs';
import { CUTS, check, cut, readFacts, readStory, scaffold } from './core/story.mjs';
import { cueSheet, cueText, spoken, stepped } from './core/timeline.mjs';
import { UsageError, mmss, run } from './core/util.mjs';
import { makeDeck } from './deck/index.mjs';
import { makeSlides } from './slides/index.mjs';
import { cutOf, makeVideo, videoPlan } from './video/index.mjs';
import { estimate, timeLines, voiceId } from './video/voice.mjs';

const layout = (issues) => (issues.length ? `layout: ${issues.length} issue(s)\n${issues.map((i) => `  ${i.scene} build ${i.step}: ${i.kind} "${i.text}"${i.px ? ` (${i.px}px)` : ''}`).join('\n')}` : 'layout: clean');
const open = (f) => run('open', [f]).catch(() => null);

// Each command: what it takes, what it does, whether it needs a story folder (and a story that passes its checks), and
// what it runs. `run` answers with { code, json, text }.
const COMMANDS = {
  doctor: {
    usage: 'doctor [--for deck,slides,video] [--fix]', about: 'the tools each output needs, and how to get a missing one; --fix installs the voice engine',
    async run({ values }) {
      const outputs = values.for ? values.for.split(',').map((s) => s.trim()) : OUTPUTS;
      const bad = outputs.filter((o) => !OUTPUTS.includes(o));
      if (bad.length) throw new UsageError(`--for takes ${OUTPUTS.join(', ')}; not ${bad.join(', ')}`);
      const rows = (await doctor({ fix: values.fix })).filter((r) => r.needs.some((n) => outputs.includes(n)));
      const ok = ready(rows, outputs);
      return { code: ok ? 0 : 1, json: { ok, outputs, rows }, text: rows.map((r) => `${r.ok ? 'ok  ' : r.optional ? 'opt ' : 'MISS'} ${r.name.padEnd(13)} ${r.detail}${r.fix ? `  ->  ${r.fix}` : ''}`).join('\n') };
    },
  },
  new: {
    usage: 'new <dir> --title "<title>"', about: 'start a story folder: story.json, facts.json, assets/, inputs/, and design/ with the film plan to write first', folder: 'new',
    run: ({ dir, values }) => { scaffold(dir, values); scaffoldDesign(readStory(dir)); return { json: { dir }, text: `started ${dir}` }; },
  },
  inputs: {
    usage: 'inputs <dir> <files, folders or zips...>', about: 'the material as parts small enough to read whole (inputs/parts/): zips unpacked, pages without their embedded media, films as frame sheets; check holds inputs/notes.md to every part', folder: 'dir',
    run({ dir, rest }) {
      const r = splitInputs(dir, rest.filter((a) => !a.startsWith('--')));
      const text = [
        ...r.parts.map((p) => `${p.id.padEnd(4)} ${where(p).padEnd(58)} ${howToRead(p)}`),
        ...r.skipped.map((x) => `not read  ${x.file}: ${x.why}`),
        `${r.parts.length} part(s). Read every one in full, in order, and write what it says under "## P<n>" in inputs/notes.md; check refuses the story until each part has its notes.`,
      ].join('\n');
      return { json: r, text };
    },
  },
  find: {
    usage: 'find <dir> <words...>', about: 'lines of the material holding all the words, with part, file and line: look a name, figure or system up before guessing it', folder: 'dir',
    run({ dir, rest }) {
      const words = rest.filter((a) => !a.startsWith('--'));
      const hits = findInInputs(dir, words);
      return { code: hits.length ? 0 : 1, json: { hits }, text: hits.length ? hits.join('\n') : `nothing in the material holds: ${words.join(' ')}` };
    },
  },
  scenes: {
    usage: 'scenes', about: 'the scene types and what each needs',
    run() {
      const out = Object.entries(library()).map(([name, d]) => ({ name, needs: d.need ?? [], max: d.max ?? {} }));
      return { json: out, text: out.map((s) => `${s.name.padEnd(13)} needs ${s.needs.join(', ') || '-'}${Object.keys(s.max).length ? `  (max ${Object.entries(s.max).map(([k, v]) => `${v} ${k}`).join(', ')})` : ''}`).join('\n') };
    },
  },
  check: {
    usage: 'check <dir>', about: 'scene data, line mapping, a source for every figure, the film plan and each scene\'s card; the video\'s estimated length per cut, held to video.length', folder: 'story',
    run({ story, facts }) {
      const r = check(story, facts);
      const lengths = r.errors.length || r.pending.length ? {} : Object.fromEntries(CUTS.map((name) => [name, spoken(story, estimate(cut(story, name))).duration]));
      if (lengths.full) r.errors.push(...lengthProblems(story, lengths.full));
      const waiting = r.pending.length ? [`pending: ${r.pending.length} scene(s) not written yet; everything else passes once no error is left, and their authors write them next`] : [];
      const text = [...r.errors.map((e) => `error: ${e}`), ...r.pending.map((p) => `pending: ${p}`), ...r.warnings.map((w) => `warning: ${w}`), ...(r.errors.length ? [] : r.pending.length ? waiting : [`ok: ${story.scenes.length} scenes · a video would run ${Object.entries(lengths).map(([k, v]) => `${k} ${mmss(v)}`).join(' · ')}`])].join('\n');
      return { code: r.errors.length || r.pending.length ? 1 : 0, json: { ok: !r.errors.length && !r.pending.length, ...r, estimate: lengths, voice: voiceId(story.video.voice), engine: story.video.voice.engine }, text };
    },
  },
  design: {
    usage: 'design <dir>', about: 'design/film.md, the plan of the whole film, and a card for every scene in story.json that has none (content, motion, voice and four checks); never overwrites one', folder: 'story',
    run({ story }) {
      const made = scaffoldDesign(story);
      return { json: { made }, text: made.length ? `wrote ${made.map((f) => path.relative(story.dir, f)).join(', ')}` : 'every scene already has its card' };
    },
  },
  scene: {
    usage: 'scene <dir> <id>[,<id>...] [--deck]', about: 'one scene as its author sees it, in build/scenes/<id>/, on the voice\'s clock (its voiced lines, else their estimate; --deck: the deck\'s even builds): frames at set points of each build\'s window, each build settled, a strip across its hold, the layout check, the word each build lands on, and any build whose motion overruns its window', folder: 'story',
    async run({ story, facts, rest, values, log }) {
      const ids = rest.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(',')).map((x) => x.trim()).filter(Boolean);
      if (!ids.length) throw new UsageError('scene needs the scene ids: scene <dir> <id>[,<id>...]');
      const r = check(story, facts, { only: new Set(ids) });
      for (const w of r.warnings) log(`warning: ${w}`);
      const all = [...r.errors, ...r.pending];
      if (all.length) throw new UsageError(`the scene does not pass its checks:\n- ${all.join('\n- ')}`);
      // the voice's clock: lines already voiced keep their real timing, the rest their estimate; nothing is sent
      const full = cut(story, 'full');
      let voiced = 0;
      const clock = async (list) => {
        if (values.deck) return stepped(story, list);
        const timed = full.filter((x) => list.some((s) => s.id === x.id));
        voiced = await timeLines(story, timed);
        return spoken(story, timed);
      };
      const out = [];
      for (const id of ids) {
        const s = story.scenes.find((x) => x.id === id);
        const own = await clock([s]);
        out.push(await previewScene(story, id, { clock, landed: own.scenes[0]?.landed ?? {}, labels: buildLabels(s) }));
      }
      const pace = values.deck ? 'the deck\'s even builds' : voiced ? 'the voice (voiced lines)' : 'the voice\'s estimated pace (run `plan <dir> --cut full` to voice the lines)';
      const text = [`clock: ${pace}`, ...out.flatMap((x) => [
        `${x.id}   ${x.dir}`,
        ...x.notes.map((n) => `  note: ${n}`),
        ...x.builds.map((b) => `  build ${b.step}  ${b.step ? (b.landed ? `on "${b.landed.word}" (line ${b.landed.line})` : 'no word names it: rephrase its line or pin one with {braces}') : 'entrance'}  ·  window ${(b.window / 1000).toFixed(2)} s, motion ${(b.took / 1000).toFixed(2)} s  ·  ${path.basename(b.still)}  ${path.basename(b.strip)}`),
        `  hold      ${path.basename(x.hold)}`,
        `  ${layout(x.issues.map((i) => ({ ...i, scene: x.id })))}`,
      ])].join('\n');
      return { code: out.some((x) => x.issues.length) ? 1 : 0, json: out, text };
    },
  },
  review: {
    usage: 'review <dir>', about: 'every scene\'s four checks (content, motion, built, voice) as its card ticks them, held to fresh evidence; exits 1 until all hold', folder: 'story',
    run({ story }) {
      if (!hasDesign(story)) return { code: 1, json: { ok: false }, text: 'this story has no design notes: run `design <dir>` first' };
      const r = review(story);
      const text = [...r.plan.map((p) => `plan  ${p}`), ...r.rows.map((x) => (x.open.length ? `open  ${x.id.padEnd(16)} ${x.open.join('\n      '.padEnd(24))}` : `ok    ${x.id}`)), r.ok ? `ok: all ${r.rows.length} scenes hold their four checks` : `${r.rows.filter((x) => x.open.length).length} of ${r.rows.length} scene(s) open`].join('\n');
      return { code: r.ok ? 0 : 1, json: r, text };
    },
  },
  deck: {
    usage: 'deck <dir> [--open]', about: 'out/<slug>.html: the presentation in one file; a still of every build, the layout check, storyboard.html', folder: 'story', checked: true,
    async run({ story, values, log }) {
      const r = await makeDeck(story, { log });
      if (values.open) await open(r.file);
      return {
        code: r.issues.length ? 1 : 0,
        json: { file: r.file, mb: r.mb, scenes: story.scenes.length, builds: r.count, issues: r.issues, sheets: r.sheets, storyboard: r.storyboard },
        text: `deck      ${r.file} (${r.mb} MB, ${story.scenes.length} scenes, ${r.count} builds)\nsheets    ${r.sheets.join(', ')}\nstoryboard ${r.storyboard}\n${layout(r.issues)}`,
      };
    },
  },
  slides: {
    usage: 'slides <dir> [--open]', about: 'out/<slug>.pptx: the deck in PowerPoint\'s own text, shapes and pictures, one slide per scene, each build a click with its motion, lines as speaker notes', folder: 'story', checked: true,
    async run({ story, values, log }) {
      const r = await makeSlides(story, { log });
      if (values.open) await open(r.file);
      return { code: r.issues.length ? 1 : 0, json: r, text: `slides    ${r.file} (${r.slides} slides, ${r.clicks} clicks, ${r.mb} MB)\n${layout(r.issues)}` };
    },
  },
  video: {
    usage: 'video <dir> --cut <c> [--scenes a,b] [--size 4k] [--no-music] [--workers N] [--open]', about: 'out/<slug>-<cut>.mp4, captions and a preview page; for full, a share copy and a kept version', folder: 'story', checked: true,
    async run({ story, values, log }) {
      const c = cutFrom(story, values);
      // the whole film is made once every scene holds its checks; samples and parts are made while scenes are worked on
      if (c.name === 'full' && hasDesign(story) && !review(story).ok) throw new UsageError('the full video waits until every scene holds its four checks: run `review <dir>` and close what it lists');
      const r = await makeVideo(story, c, { size: values.size, workers: values.workers ? +values.workers : undefined, music: !values['no-music'], log });
      if (values.open) await open(r.files.preview);
      const q = r.qa;
      return {
        code: q.ok ? 0 : 1, json: r,
        text: [`${r.cut}: ${mmss(r.duration)} · ${q.width}x${q.height} ${q.fps} fps · ${q.mb} MB · ${q.lufs} LUFS · peak ${q.peak} dB · ${q.ok ? 'checks pass' : 'CHECK FAILED'}`,
          `motion: nothing moves in ${Math.round(q.motion.frozenShare * 100)}% of the picture (${q.motion.stills} stretches, longest ${(q.motion.longestMs / 1000).toFixed(1)} s, at most 3 s) · ${Math.round(q.motion.wordSynced * 100)}% of builds on their word · ${q.motion.sounds} sounds`, ...Object.entries(r.files).map(([k, v]) => `${k.padEnd(9)} ${v}`), `built in ${r.seconds.toFixed(0)} s`].join('\n'),
      };
    },
  },
  plan: {
    usage: 'plan <dir> --cut <c> [--estimate]', about: 'the video\'s timeline, voiced (--estimate: at the voice\'s pace, nothing sent), and its cue sheet: each build\'s time, window and words, for the scenes\' authors. Runs before the scenes are written, on their planned builds', folder: 'story', checked: 'before-scenes',
    async run({ story, values, log }) {
      const c = cutFrom(story, values);
      const { plan, dir } = await videoPlan(story, c, { estimated: values.estimate, log });
      const sheet = cueSheet(plan);
      fs.writeFileSync(path.join(dir, 'cues.json'), `${JSON.stringify(sheet, null, 2)}\n`);
      fs.writeFileSync(path.join(dir, 'cues.md'), cueText(sheet, { voiced: !values.estimate }));
      const short = (s) => s.builds.slice(1).map((b) => (b.window / 1000).toFixed(1)).join(' ');
      const rows = plan.scenes.map((s, i) => `${mmss(s.start).padStart(5)}  ${s.id.padEnd(14)} ${s.type.padEnd(16)} ${s.ground.padEnd(5)} ${String(s.cues.length - 1).padStart(2)} builds  windows ${short(sheet[i]) || '-'} s`);
      return {
        json: { cut: c.name, duration: plan.duration, estimated: Boolean(values.estimate), plan: path.join(dir, 'plan.json'), cues: path.join(dir, 'cues.md'), scenes: sheet },
        text: `${rows.join('\n')}\n${c.name}: ${mmss(plan.duration)}${values.estimate ? ' (estimated, not voiced)' : ''}\ncue sheet: ${path.join(dir, 'cues.md')}`,
      };
    },
  },
  seams: {
    usage: 'seams <dir> [--cut <c>] [--estimate]', about: 'every join between two scenes, in build/<cut>/seams/: frames across its cut with the words said there, its pause, its cut and what it carries, any frame with next to nothing on it, and how long both scenes are seen at once (the full cut unless --cut names another)', folder: 'story', checked: true,
    async run({ story, values, log }) {
      const c = cutFrom(story, { ...values, cut: values.cut ?? 'full' });
      const { plan, dir } = await videoPlan(story, c, { estimated: values.estimate, log });
      const page = writePage(path.join(dir, 'seams', 'page.html'), plan, { title: story.title, footer: story.footer, theme: story.theme, ground: story.ground, inline: story.dir, fonts: await inlineFonts(story.theme), customer: story.customer });
      const joins = await seams(page, plan, path.join(dir, 'seams'));
      const sec = (ms) => `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(1)} s`;
      const rows = joins.map((j) => `${`${j.from} → ${j.to}`.padEnd(30)} ${j.pause != null ? `pause ${(j.pause / 1000).toFixed(2)} s` : 'no voice'.padEnd(13)} · ${j.cut}${j.carry.length ? ` carrying ${j.carry.join(', ')}` : ''}${j.on ? ` · cut on "${j.on.word}"` : ''} · both seen ${(j.overlap / 1000).toFixed(1)} s  ${path.basename(j.sheet)}${j.bare.length ? `  bare at ${j.bare.map(sec).join(', ')}` : ''}${j.doubled ? '  DOUBLED' : ''}`);
      const bare = joins.filter((j) => j.bare.length).length, doubled = joins.filter((j) => j.doubled).length;
      const notes = [
        ...(bare ? [`${bare} with a bare frame: the scene before is gone and this one has not arrived; arrive with the opening picture on screen, carry an element across, or keep it if the film means the pause`] : []),
        ...(doubled ? [`${doubled} doubled: both scenes seen on top of each other for more than 0.2 s; a scene that stays past its cut (its own exit or a long tween) is the usual cause`] : []),
      ];
      return { code: bare || doubled ? 1 : 0, json: { cut: c.name, dir: path.join(dir, 'seams'), joins }, text: [...rows, `${joins.length} joins in ${path.join(dir, 'seams')}`, ...notes].join('\n') };
    },
  },
  shot: {
    usage: 'shot <dir> <page.html> [--out <name>.png] [--width 1440] [--height 900] [--scale 2]', about: 'a PNG of a screen mock-up written as HTML, into assets/ (--scale 2: <name>@2x.png, sharp under a zoom)', folder: 'any',
    async run({ dir, rest, values }) {
      const html = rest.find((a) => !a.startsWith('--') && /\.html?$/.test(a));
      if (!html) throw new UsageError('shot needs the mock-up page: shot <dir> <page.html>');
      if (!fs.existsSync(html)) throw new UsageError(`no page at ${html}`);
      const scale = +(values.scale ?? 1);
      const name = (values.out ?? `${path.basename(html).replace(/\.html?$/, '')}.png`).replace(/(@\dx)?\.png$/, scale > 1 ? `@${scale}x.png` : '.png');
      const out = path.join(dir, 'assets', name);
      await shot(path.resolve(html), out, { width: +(values.width ?? 1440), height: +(values.height ?? 900), scale });
      return { json: { image: out }, text: `saved ${out}` };
    },
  },
};

// the length the person chose, as video.length in seconds; the whole film may run a fifth either way
function lengthProblems(story, ms) {
  const want = Number(story.video.length);
  if (!want) return [];
  const off = ms / 1000 / want - 1;
  return Math.abs(off) > 0.2 ? [`the full video would run ${mmss(ms)}, ${off > 0 ? 'over' : 'under'} the ${mmss(want * 1000)} asked for (video.length) by more than a fifth: ${off > 0 ? 'cut scenes or lines' : 'add scenes or builds'} as the film plan's pace says`] : [];
}

function cutFrom(story, values) {
  const scenes = values.scenes ? values.scenes.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const name = values.cut ?? (scenes ? 'full' : null);
  if (!name) throw new UsageError(`--cut is required (${CUTS.join(', ')})`);
  return cutOf(story, name, scenes);
}

const HELP = `Usage: node demo.mjs <command> [story folder] [options]

${Object.values(COMMANDS).map((c) => `  ${c.usage.padEnd(44)} ${c.about}`).join('\n')}

Every output reads story.json and facts.json and runs check first. Slides are read from the deck's page.
Video cuts: sample (20-30 s: look, voice and music), short (every scene in one line each), full.
--json answers with one JSON line.`;

const OPTIONS = { deck: { type: 'boolean' }, fix: { type: 'boolean' }, for: { type: 'string' }, json: { type: 'boolean' }, title: { type: 'string' }, cut: { type: 'string' }, scenes: { type: 'string' }, estimate: { type: 'boolean' }, size: { type: 'string' }, workers: { type: 'string' }, 'no-music': { type: 'boolean' }, open: { type: 'boolean' }, out: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' }, scale: { type: 'string' }, help: { type: 'boolean', short: 'h' } };

async function main(argv) {
  const [name, maybeDir, ...rest] = argv;
  const positional = maybeDir && !maybeDir.startsWith('--') ? maybeDir : undefined;
  const { values } = parseArgs({ args: positional ? rest : [maybeDir, ...rest].filter(Boolean), allowPositionals: true, options: OPTIONS });
  if (!name || values.help || name === 'help') { console.log(HELP); return 0; }
  const cmd = COMMANDS[name];
  if (!cmd) throw new UsageError(`unknown command "${name}"\n\n${HELP}`);
  const log = (msg) => { if (!values.json) console.log(msg); };
  const ctx = { values, rest, log };
  if (cmd.folder) {
    if (!positional) throw new UsageError(`${name} needs a story folder`);
    ctx.dir = path.resolve(positional);
  }
  if (cmd.folder === 'story') {
    ctx.story = readStory(ctx.dir);
    ctx.facts = readFacts(ctx.dir);
  }
  if (cmd.checked) {
    const r = check(ctx.story, ctx.facts);
    for (const w of r.warnings) log(`warning: ${w}`);
    // the voice and its cue sheet come before the scenes are written; every output needs them all
    const all = [...r.errors, ...(cmd.checked === 'before-scenes' ? [] : r.pending)];
    if (all.length) throw new UsageError(`the story does not pass its checks:\n- ${all.join('\n- ')}`);
  }
  const r = await cmd.run(ctx);
  if (values.json) console.log(JSON.stringify(r.json));
  else console.log(r.text);
  return r.code ?? 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  if (e instanceof UsageError) { console.error(e.message); process.exitCode = 2; }
  else { console.error(`error: ${e.message}`); if (process.env.DEMO_KIT_DEBUG) console.error(e.stack); process.exitCode = 1; }
});
