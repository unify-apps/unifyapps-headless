// The story folder and its story.json: reading it, starting one, choosing a cut, and the checks that must pass
// before anything is made from it.
import fs from 'node:fs';
import path from 'node:path';
import { designProblems, forbiddenForms, hasDesign, saysForm } from './design.mjs';
import { library, sceneFiles, sceneProblems, stepCount, storySceneProblems } from './scenes.mjs';
import { readingProblems } from './inputs.mjs';
import { resolveTheme, themeProblems } from './theme.mjs';
import { UsageError, readJson, writeJson } from './util.mjs';

export const CUTS = ['sample', 'short', 'full'];
const GROUNDS = ['paper', 'deep'];
// how a scene may be cut into: a fade (the default, a quick dissolve), a slow dissolve, a push through the lens, a whip,
// a blur swap on one stage, or a hard cut that leaves the entrance to the scene's own motion
const CUTS_INTO = ['fade', 'dissolve', 'push', 'whip', 'blur', 'cut'];
const HYPE = /\b(revolutionary|game-?changing|cutting-?edge|seamless(?:ly)?|unlock(?:s|ing)?|world-?class|best-?in-?class)\b/i;
// figures the team has retired; never in a story
const RETIRED = [/11,?000\+?\s*(capabilit|integration|connector)/i];
// settings that belong to one output, written at the top of story.json by mistake
const VIDEO_KEYS = ['voice', 'music', 'size', 'fps', 'cuts', 'length'];
// scenes that say an idea in words; the rest draw it (a flow, their systems, figures, a change, the product, a plan)
const TEXT_SCENES = ['statement', 'quote', 'points'];
// the kit scenes a designed story still takes as they are: the brand's title and end cards, a product screen used the
// way a person uses it, and the UnifyApps standard diagrams (ua-*); every other scene is written for the story
const KIT_KEPT = ['title', 'end', 'screen'];
// what a story is, as the person's answer to the loop's second question says: a client's use case, a product demo, an
// overview of UnifyApps, a teaser
const KINDS = ['use-case', 'demo', 'overview', 'teaser'];
// An overview explains what UnifyApps is, so it shows every standard diagram, in the company deck's order, unless the
// person asked to leave one out: story.json's "without" names that scene with their words.
export const OVERVIEW = ['ua-eighty', 'ua-code-first', 'ua-n-plus-n', 'ua-assembly', 'ua-platform', 'ua-four-ideas', 'ua-engagement', 'ua-principles', 'ua-close'];

export function readStory(dir) {
  const file = path.join(dir, 'story.json');
  if (!fs.existsSync(file)) throw new UsageError(`no story.json in ${dir}`);
  const raw = readJson(file);
  const story = { ...raw, dir: path.resolve(dir) };
  story.slug ??= path.basename(story.dir);
  story.footer ??= 'Agentic Automation for the Enterprise';
  story.theme = resolveTheme(raw.theme);
  story.ground ??= 'paper';
  const video = raw.video ?? {};
  // the default name is an edge voice's; the Mac's `say` takes its own voice names, and Samantha with none (voiceId)
  const voice = { engine: 'edge', rate: '+3%', pitch: '+0Hz', ...(video.voice ?? {}) };
  voice.name ??= voice.engine === 'say' ? undefined : 'andrew';
  story.video = { fps: 30, size: '1080p', ...video, voice, music: { on: true, mood: 'warm', gain: 0.4, ...(video.music ?? {}) } };
  story.scenes = (raw.scenes ?? []).map((s, i) => ({
    id: s.id ?? `s${i + 1}`, type: s.type, dir: story.dir, builds: s.builds, ground: s.ground ?? story.ground, cut: s.cut, cutOn: s.cutOn, data: s.data ?? {}, hold: s.hold ?? 0, short: s.short, silent: s.silent,
    say: (s.say ?? []).map((b) => pinWords(typeof b === 'string' ? { text: b } : { ...b })),
  }));
  return story;
}

/** A line with its {pinned words} taken out of the text: `pins` holds the index of each braced word, in order. */
function pinWords(line) {
  const raw = String(line.text ?? '');
  const pins = [...raw.matchAll(/\{([^{}]+)\}/g)].map((m) => {
    const before = raw.slice(0, m.index).replace(/[{}]/g, '').trim();
    return before ? before.split(/\s+/).length - (/\s$/.test(raw.slice(0, m.index)) ? 0 : 1) : 0;
  });
  return { ...line, text: raw.replace(/[{}]/g, ''), ...(pins.length && { pins }) };
}

/** A new story folder: story.json with a title and an end card, an empty facts.json, assets/ and inputs/. */
export function scaffold(dir, { title }) {
  if (fs.existsSync(path.join(dir, 'story.json'))) throw new UsageError(`${dir} already has a story.json`);
  for (const d of ['assets', 'inputs', 'out']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  writeJson(path.join(dir, 'story.json'), {
    title: title ?? 'Untitled story',
    theme: 'unifyapps',
    scenes: [
      { id: 'title', type: 'title', data: { kicker: 'UnifyApps', title: title ?? 'Untitled story', em: '' }, say: ['One line that sets up the story.'] },
      { id: 'end', type: 'end', data: { title: 'Agentic Automation', em: 'for the Enterprise' }, say: [] },
    ],
  });
  writeJson(path.join(dir, 'facts.json'), { facts: [] });
  return dir;
}

export function readFacts(dir) {
  const file = path.join(dir, 'facts.json');
  if (!fs.existsSync(file)) return [];
  const f = readJson(file);
  return Array.isArray(f) ? f : f.facts ?? [];
}

/** The scenes and lines of one cut. `sample` and `short` say each scene's one-line `short` (or its first line). */
export function cut(story, name, { scenes } = {}) {
  if (!CUTS.includes(name) && !scenes) throw new UsageError(`cut must be one of ${CUTS.join(', ')}`);
  let list = story.scenes;
  const ids = scenes ?? (name === 'sample' ? story.video.cuts?.sample ?? defaultSample(story) : null);
  if (ids) {
    const missing = ids.filter((id) => !story.scenes.some((s) => s.id === id));
    if (missing.length) throw new UsageError(`no scene ${missing.join(', ')} in story.json`);
    list = ids.map((id) => story.scenes.find((s) => s.id === id));
  }
  const brief = name === 'sample' || name === 'short';
  return list.map((s) => ({ ...s, say: brief && s.say.length ? [{ ...s.say[0], text: s.short ?? s.say[0].text, step: undefined }] : s.say }));
}

function defaultSample(story) {
  const content = story.scenes.find((s) => !['title', 'end', 'statement', 'quote'].includes(s.type));
  return [...new Set([story.scenes[0], content, story.scenes.find((s) => s.type === 'end')].filter(Boolean).map((s) => s.id))];
}

// a figure: digits with their unit; not a code or an id such as INV-4821, PO#22 or S3
// (a lone digit with no unit, "step 2", is not a claim; "2 weeks" is)
const UNIT = String.raw`(?:\s?(?:%|×|\+)|(?:x|k|m|bn)\b|\s?(?:ms|secs?|seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|wks?|months?|years?|lakhs?|crores?|million|billion)\b)`;
const FIGURE = new RegExp(String.raw`(?<![\p{L}\d#_-])(?:[$€£₹]\s?)?\d[\d,.]*${UNIT}?(?![\p{L}\d_-])`, 'giu');
// a number after an acronym or a name word ("SOC 2", "ISO 27001", "Type 2", "Fortune 100") names a thing, not a figure
const NAMED = /\b(?:[A-Z]{2,}|Type|Tier|Level|Fortune|Global)\s$/;
const norm = (s) => String(s).toLowerCase().replace(/[\s,]/g, '').replace(/×/g, 'x');
const key = (fig) => norm(fig).replace(/[.]$/, '');
// a lone digit or a year is not a claim
const isClaim = (fig) => !/^\d$/.test(fig) && !/^(19|20)\d\d$/.test(fig);
// a figure's trailing comma or full stop belongs to the sentence ("SOC 2, GDPR"; "in 2 weeks.")
const figures = (s) => [...String(s ?? '').matchAll(FIGURE)].filter((m) => !NAMED.test(m.input.slice(Math.max(0, m.index - 12), m.index))).map((m) => m[0].trim().replace(/[.,]+$/, ''));
const factFigures = (f) => new Set([...figures(f.value), ...figures(f.claim), ...(f.value == null ? [] : [f.value])].map(key));

// a cut on a word: one word, said in the scene's own first line or in the last line of the scene before it
function cutOnProblems(story, s) {
  const i = story.scenes.indexOf(s), before = story.scenes[i - 1];
  const words = (line) => String(line?.text ?? '').split(/\s+/).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const want = String(s.cutOn).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (typeof s.cutOn !== 'string' || !want || /\s/.test(s.cutOn.trim())) return [`scene "${s.id}": cutOn is ${JSON.stringify(s.cutOn)}; it names one word the cut lands on`];
  if (!before) return [`scene "${s.id}": cutOn needs a scene before it to cut from`];
  if (words(s.say[0]).includes(want) || words(before.say.at(-1)).includes(want)) return [];
  return [`scene "${s.id}": cutOn "${s.cutOn}" is in neither its first line nor the last line of "${before.id}"; name a word one of them says`];
}

/**
 * Every check a story must pass before anything is made from it: scene data, line mapping, a source for every figure,
 * and for a designed story its plan and cards. `only` (a set of scene ids) checks those scenes and the story's own
 * settings, so one scene can be looked at while others are still being written.
 */
export function check(story, facts, { only } = {}) {
  // the material is read in full before anything is written from it
  const errors = [...themeProblems(story.theme), ...readingProblems(story.dir)], warnings = [];
  for (const k of VIDEO_KEYS) if (k in story) errors.push(`"${k}" belongs under "video" in story.json`);
  if (only) for (const id of only) if (!story.scenes.some((s) => s.id === id)) errors.push(`no scene "${id}" in story.json`);
  const mine = story.scenes.filter((s) => !only || only.has(s.id));
  const types = new Set(mine.map((s) => s.type));
  // the film's shared parts are every scene's; a scene file only the scenes that use it
  errors.push(...storySceneProblems(story.dir).filter((p) => { const name = p.match(/^scenes\/(.+?)\.(?:js|css)\b/)?.[1]; return name?.startsWith('_') || types.has(name); }));
  const ids = new Set();
  for (const s of story.scenes) {
    if (ids.has(s.id)) errors.push(`two scenes are called "${s.id}"`);
    ids.add(s.id);
  }
  // in a designed story, a scene whose file its author has not written yet waits for it; everything else is checked
  const lib = library(story.dir), designed = hasDesign(story);
  const waiting = new Set(mine.filter((s) => designed && !lib[s.type] && /^[a-z0-9][a-z0-9-]*$/.test(s.type ?? '') && !fs.existsSync(path.join(story.dir, 'scenes', `${s.type}.js`))).map((s) => s.id));
  const pending = mine.filter((s) => waiting.has(s.id)).map((s) => `scene "${s.id}": scenes/${s.type}.js is not written yet`);
  for (const s of mine) {
    if (!GROUNDS.includes(s.ground)) errors.push(`scene "${s.id}": ground is ${JSON.stringify(s.ground)}; it must be "paper" or "deep"`);
    if (s.cut != null && !CUTS_INTO.includes(s.cut)) errors.push(`scene "${s.id}": cut is ${JSON.stringify(s.cut)}; it must be one of ${CUTS_INTO.join(', ')}`);
    if (s.cutOn != null) errors.push(...cutOnProblems(story, s));
    if (!waiting.has(s.id)) errors.push(...sceneProblems(s));
    // the director plans how many builds a written scene has, so its lines are voiced and timed before it exists
    if (designed && !library()[s.type]) {
      if (!Number.isInteger(s.builds) || s.builds < 0) errors.push(`scene "${s.id}": plan its builds in story.json ("builds": N, from its storyboard), so its lines can be voiced and timed before its author writes it`);
      else if (lib[s.type] && !waiting.has(s.id)) {
        let n = null;
        try { n = lib[s.type].steps(s.data ?? {}); } catch { /* sceneProblems says why */ }
        if (n != null && n !== s.builds) errors.push(`scene "${s.id}": scenes/${s.type}.js has ${n} builds, and story.json plans ${s.builds}; the storyboard and its lines are timed to ${s.builds}`);
      }
    }
  }
  errors.push(...designProblems(story, { only }));
  if (errors.length) return { errors, warnings, pending };
  const figs = facts.map(factFigures);
  const known = new Set(figs.flatMap((x) => [...x]));
  const forms = forbiddenForms(story), seen = new Set();
  for (const s of mine) {
    const n = waiting.has(s.id) ? null : stepCount(s), own = library()[s.type]?.covers ? standardFigures(s.type) : new Set();
    if (!s.say.length && !s.silent && !['title', 'end'].includes(s.type)) warnings.push(`scene "${s.id}" has no lines`);
    if (n != null) {
      for (const b of s.say) for (const k of [b.step].flat().filter((x) => x != null)) if (k < 1 || k > n) errors.push(`scene "${s.id}": a line asks for step ${k}, the scene has ${n}`);
      if (n > 0 && s.say.length && s.say.length < Math.ceil(n / 3)) warnings.push(`scene "${s.id}": ${n} steps on ${s.say.length} line(s); each line will carry several builds`);
    }
    // figures: in what is said, and in what is shown
    const texts = [...s.say.map((b) => ({ where: 'lines', text: b.text })), ...(s.short ? [{ where: 'short line', text: s.short }] : []), ...shown(s.data)];
    for (const { where, text } of texts) {
      for (const fig of figures(text).filter(isClaim)) if (!known.has(key(fig)) && !own.has(key(fig))) errors.push(`scene "${s.id}" ${where}: "${fig}" has no entry in facts.json`);
      if (HYPE.test(text)) warnings.push(`scene "${s.id}" ${where}: hype word "${text.match(HYPE)[0]}"`);
      for (const r of RETIRED) if (r.test(text)) errors.push(`scene "${s.id}" ${where}: a retired claim ("${text.match(r)[0]}")`);
      for (const form of forms) if (saysForm(text, form)) errors.push(`scene "${s.id}" ${where}: says "${form}", a form design/film.md § Concepts rules out`);
    }
    const said = new Set(texts.flatMap((t) => figures(t.text).filter(isClaim).map(key)));
    for (const x of said) seen.add(x);
    const illus = facts.filter((f, i) => f.kind === 'illustrative' && [...figs[i]].some((x) => said.has(x)));
    if (illus.length && !/illustrative/i.test(s.data.footnote ?? '')) errors.push(`scene "${s.id}" shows illustrative figures (${illus.map((f) => f.value).join(', ')}); its footnote must say so`);
    if ((s.type === 'stats' || s.data.open === 'question') && !s.data.footnote) errors.push(`scene "${s.id}" (${s.type}) needs a footnote naming the source of its figures`);
  }
  for (const f of facts) if (!f.source) errors.push(`fact "${f.id ?? f.value}" has no source`);
  // a figure made up to show an idea is worked out from something real, so it holds up when a viewer does the sum
  for (const f of facts) if (f.kind === 'illustrative' && !String(f.basis ?? '').trim()) errors.push(`fact "${f.id ?? f.value}" is illustrative and has no "basis": write how it is worked out (volume × time × people, from what the person gave or a published rate), or take the figure out`);
  if (!only) facts.forEach((f, i) => { if (figs[i].size && ![...figs[i]].some((x) => seen.has(x))) warnings.push(`fact "${f.id ?? f.value}" is shown in no scene; take it out of facts.json`); });
  errors.push(...customerProblems(story));
  // how the scenes sit together is a question for the whole story, not one scene being looked at
  if (!only) errors.push(...(designed ? ownProblems(story) : richnessProblems(story)), ...sameTypeProblems(story), ...standardProblems(story), ...kindProblems(story));
  if (story.kind == null) warnings.push('story.json has no "kind" (use-case, demo, overview or teaser); an overview of UnifyApps must say "kind": "overview"');
  if (!designed) warnings.push('this story has no design notes; run `D design <dir>` to plan the film and design each scene before it is made again');
  return { errors, warnings, pending };
}

/** A story made before design notes is shown, not read out: at most half its content scenes say an idea in words. */
function richnessProblems(story) {
  const content = story.scenes.filter((s) => !['title', 'end'].includes(s.type));
  const text = content.filter((s) => TEXT_SCENES.includes(s.type));
  return content.length >= 4 && text.length * 2 > content.length ? [`${text.length} of ${content.length} content scenes only say their idea in words (${text.map((s) => s.id).join(', ')}); draw it instead: flow, hub, stats, before-after, platform, screen or timeline`] : [];
}

/** No two scenes in a row are of one type (a product demo's screens excepted). */
function sameTypeProblems(story) {
  const out = [];
  story.scenes.forEach((s, i) => {
    const prev = story.scenes[i - 1];
    if (prev && prev.type === s.type && s.type !== 'screen') out.push(`scenes "${prev.id}" and "${s.id}" are both ${s.type}; no two scenes in a row are of one type`);
  });
  return out;
}

/**
 * A designed story's scenes are written for it: each content scene is its own file in scenes/, with motion of its own,
 * designed on its card. The kit's title and end cards, its product screen and the UnifyApps standard diagrams are
 * taken as they are.
 */
function ownProblems(story) {
  const lib = library(story.dir), kit = Object.values(library());
  const out = [];
  for (const s of story.scenes) {
    const def = lib[s.type];
    if (!def || KIT_KEPT.includes(s.type) || def.covers) continue;
    if (!def.own) out.push(`scene "${s.id}" uses the kit's ${s.type} scene; write one for this story from its card (scenes/<name>.js defining UA.scene('<name>', …), and "type": "<name>"); the kit's scenes are examples to learn from, not a library to fill`);
    else if (def.anim && kit.some((k) => k.anim === def.anim)) out.push(`scenes/${s.type}.js takes the kit's motion as it is; give it an anim(c, d, U) of its own, as its card designs it`);
  }
  return out;
}

// A UnifyApps standard diagram (the 80/20, the N+N problem, the assembly-first architecture, the Enterprise Context
// Graph...) is shown by its own scene, never drawn again by hand: a scene of another type whose words name one is
// refused, with the scene to use. Each standard scene lists the phrases it covers.
function standardProblems(story) {
  const lib = library(), standards = Object.entries(lib).filter(([, d]) => d.covers?.length);
  const out = [];
  for (const s of story.scenes) {
    if (lib[s.type]?.covers) continue;
    const words = shown(s.data ?? {}).map((x) => x.text).join(' \n ');
    for (const [type, d] of standards) {
      const hit = d.covers.map((re) => words.match(re)?.[0]).find(Boolean);
      if (hit) out.push(`scene "${s.id}" (${s.type}) draws "${hit}", which the standard scene ${type} shows: use { "type": "${type}", "data": {} } instead`);
    }
  }
  return out;
}

// A story made for a customer shows their logo beside ours (the title, every footer, the end card), in every output:
// story.json names them and the logo file found in the material or downloaded from their own site. A use-case story is
// always made for one.
const LOGO = /\.(svg|png|jpe?g|webp)$/i;
function customerProblems(story) {
  const c = story.customer;
  if (c == null) return story.kind === 'use-case' ? ['a use-case story is made for a customer: add "customer": { "name": "<customer>", "logo": "assets/<their logo>" }, the logo from the material or their own site'] : [];
  const out = [];
  if (!String(c.name ?? '').trim()) out.push('"customer" needs the customer\'s "name"');
  if (!c.logo) out.push('"customer" needs "logo": the customer\'s logo in assets/, from the material or downloaded from their own site, shown beside ours on every scene');
  for (const k of ['logo', 'logoOnDeep']) {
    if (!c[k]) continue;
    if (/^[a-z]+:/i.test(c[k])) out.push(`"customer.${k}" is a link; download the logo into assets/ and name that file, so every output works offline`);
    else if (!LOGO.test(c[k])) out.push(`"customer.${k}" must be an SVG, PNG, JPEG or WebP file, not ${c[k]}`);
    else if (!fs.existsSync(path.resolve(story.dir, c[k]))) out.push(`"customer.${k}": ${c[k]} is not in the story folder; save the logo in assets/`);
  }
  return out;
}

function kindProblems(story) {
  if (story.kind == null) return [];
  if (!KINDS.includes(story.kind)) return [`"kind" is ${JSON.stringify(story.kind)}; it must be one of ${KINDS.join(', ')}`];
  if (story.kind !== 'overview') return [];
  const out = [], without = story.without ?? {}, types = story.scenes.map((s) => s.type);
  const asked = (type) => typeof without[type] === 'string' && without[type].trim() !== '';
  for (const type of Object.keys(without)) {
    if (!OVERVIEW.includes(type)) out.push(`"without" names ${type}; it only takes the scenes an overview shows by default (${OVERVIEW.join(', ')})`);
    else if (!asked(type)) out.push(`"without": ${type} needs the person's own words asking to leave it out`);
  }
  for (const type of OVERVIEW) {
    if (!types.includes(type) && !asked(type)) out.push(`an overview shows ${type} by default: add { "type": "${type}", "data": {} }, or, only if the person asked to leave it out, name it in "without" with their words`);
  }
  const shown = OVERVIEW.filter((t) => types.includes(t));
  if (shown.some((t, i) => i && types.indexOf(t) < types.indexOf(shown[i - 1]))) out.push(`an overview shows its standard scenes in the company deck's order: ${shown.join(', ')}`);
  return out;
}

// A standard scene shows the company's standard deck word for word, so its lines may say the figures its own file
// holds (outside its CSS) with no fact of their own; any other figure still needs one.
function standardFigures(type) {
  const file = sceneFiles().find((f) => path.basename(f) === `${type}.js`);
  const src = fs.readFileSync(file, 'utf8').replace(/css:\s*`[\s\S]*?`/, '');
  return new Set(figures(src).filter(isClaim).map(key));
}

// the strings a scene puts on screen, with numbers from stats values
function shown(data) {
  const out = [];
  const walk = (v, key) => {
    if (['image', 'url', 'zoom', 'mark', 'layout', 'mode', 'frame', 'unit', 'x', 'y', 'cy', 'rx', 'ry', 'min', 'max', 'decimals', 'from', 'at', 'footnote'].includes(key)) return;
    if (typeof v === 'string') out.push({ where: `data.${key}`, text: v });
    else if (typeof v === 'number' && key === 'value') out.push({ where: 'data.value', text: String(v) });
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      if (typeof v.value === 'number') out.push({ where: `data.${key}`, text: `${v.prefix ?? ''}${v.value.toLocaleString('en-US')}${v.suffix ?? ''}${v.unit ? ` ${v.unit}` : ''}` });
      for (const [k, x] of Object.entries(v)) if (k !== 'value' || typeof x !== 'number') walk(x, k);
    }
  };
  walk(data, '');
  return out;
}
