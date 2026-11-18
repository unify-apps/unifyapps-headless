// The story's design notes: design/film.md, the plan of the whole film, and design/<scene id>.md, one card per scene
// with its content, its motion, its lines and four checks. check holds the plan and each card's content to the story;
// review holds every card's checks to fresh evidence, so a scene changed after it was looked at is looked at again.
import fs from 'node:fs';
import path from 'node:path';
import { buildLabels, library, sharedFiles, stepCount } from './scenes.mjs';
import { readJson, sha1 } from './util.mjs';

export const FILM = [
  ['Purpose', 'What the viewer should believe or do after it, and the one thing it must land.'],
  ['Concepts', 'Each idea this film must teach that the viewer may not share: the person\'s own definition word for word, one example, how it is drawn, the scene that first shows it, and the wrong forms it must never take, one per line as Never: "<words>". A film whose terms are all plain to its audience says so here.'],
  ['Audience and setting', 'Who watches, where (a live call, a big screen, a link sent after the call), and what they already know.'],
  ['Length and pace', 'The length asked for, the scene count and seconds per scene it gives, how often the picture changes, and where the film slows down and where it speeds up.'],
  ['The arc', 'The beats in order, each leading into the next and saying why it follows: the hook, their world today, what it costs, the turn, how it works, the proof, what changes, the ask; or for a solution, the problem, how it is done today and where that stops, how it looks with UnifyApps, what changes, the ask.'],
  ['Visual language', 'What ties the film together: the one object or motif that recurs, how the camera behaves, how one scene hands over to the next (what the eye follows across each cut), and the layout (open space, where content sits, when a heading or a panel earns its place).'],
  ['Colour meanings', 'What each colour means in this film, read from its story and its theme: who or what each recurring actor is drawn as, what done, waiting, failing and the key moment look like, and whether the film ever leaves its one ground, and why. Every scene keeps the same meanings.'],
  ['Shared parts', 'The pieces every scene draws the same way (the actors\' badges, chips, the motif object, a product\'s frame), built once in scenes/_<name>.css and _<name>.js before any scene, and what each is for.'],
  ['Story data', 'The one table of names, ids, times and figures every scene shows (each figure with its fact id), so no two scenes disagree and every name is spelt one way.'],
  ['Motion palette', 'Three to five kinds of motion this film owns, which scenes use which, and the one big move kept for the key moment.'],
  ['References', 'Films, launch videos, sites or decks whose motion this borrows from, and exactly what it borrows from each.'],
  ['Scenes', 'One row per scene: | # | id | beat | the idea | the picture | the motion idea | joins the scene before | builds | seconds |'],
];

export const CARD = [
  ['Content', 'The one idea this scene lands. Every word and figure on screen, each figure with its fact id. Why this picture is the clearest way to show the idea.'],
  ['Storyboard', 'The director\'s brief: the picture (its metaphor, what sits where), then each build in order with the word it fires on and its window from the cue sheet, and what arrives or changes in it, and how the scene arrives from the one before and hands over to the next (what is carried across, the words that link them). Concrete enough to build without asking.'],
  ['Motion', 'The author\'s design: how each build moves (the technique, its eases and timing inside its window), the ideas weighed and why this one won, the references it borrows from, and what keeps moving while it holds.'],
  ['Voice', 'The lines, each with the build it brings in, the word it lands on and its window.'],
];

// the four checks every scene passes, in the order a scene is made: two before it is built, two after
export const CHECKS = [
  ['content', 'Content and storyboard thought through: one idea, every word earns its place, every figure has its fact, each build has its word and window, it reads in the time it is on screen'],
  ['motion', 'Motion thought through: the motion says the idea, it differs from the scenes beside it, nothing on the "looks generated" list'],
  ['built', 'Built and checked: margins, padding and alignment clean at every build; every build moves as designed and lands; the live motion holds (D scene)'],
  ['voice', 'Voice matches the motion: each line names what is on screen as it is said, each build lands on its word, no line runs ahead of the picture'],
];

// a section with fewer words than this, once its guidance is taken out, is not written yet
const FILLED = 12;

const designDir = (story) => path.join(story.dir, 'design');
export const hasDesign = (story) => fs.existsSync(designDir(story));
const cardFile = (story, id) => path.join(designDir(story), `${id}.md`);

const section = (heading, guide) => `## ${heading}\n<!-- ${guide} -->\n`;

export function filmTemplate(story) {
  return `# Film plan · ${story.title}\n\n${FILM.map(([h, g]) => section(h, g)).join('\n')}`;
}

export function cardTemplate(scene, n) {
  return `# ${n} · ${scene.id}\n\n${CARD.map(([h, g]) => section(h, g)).join('\n')}\n## Checklist\n${CHECKS.map(([, text]) => `- [ ] ${text}`).join('\n')}\n`;
}

/** Writes the plan and a card for every scene that has none; never touches one already there. Returns the new files. */
export function scaffoldDesign(story) {
  const made = [];
  fs.mkdirSync(designDir(story), { recursive: true });
  const write = (file, text) => { if (!fs.existsSync(file)) { fs.writeFileSync(file, text); made.push(file); } };
  write(path.join(designDir(story), 'film.md'), filmTemplate(story));
  story.scenes.forEach((s, i) => write(cardFile(story, s.id), cardTemplate(s, i + 1)));
  return made;
}

/** The sections of a markdown file by their `## ` heading, each one's text without its guidance comments. */
function sections(text) {
  const out = {};
  let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { cur = m[1]; out[cur] = ''; } else if (cur) out[cur] += `${line}\n`;
  }
  for (const k of Object.keys(out)) out[k] = out[k].replace(/<!--[\s\S]*?-->/g, '').trim();
  return out;
}

const words = (s) => (String(s).match(/[\p{L}\p{N}]+/gu) ?? []).length;
const filled = (s) => words(s) >= FILLED;

/** Which of the four checks a card ticks, by key; each check is the n-th box under ## Checklist. */
function ticks(sec) {
  const boxes = [...(sec.Checklist ?? '').matchAll(/^\s*[-*]\s*\[([ xX])\]/gm)].map((m) => m[1] !== ' ');
  return Object.fromEntries(CHECKS.map(([key], i) => [key, Boolean(boxes[i])]));
}

/** Layout issues the card overrules on purpose: lines `- overruled <kind>: <why>` under ## Checklist. */
function overruled(sec) {
  return new Set([...(sec.Checklist ?? '').matchAll(/^\s*[-*]\s*overruled\s+([a-z-]+)\s*:\s*\S/gim)].map((m) => m[1].toLowerCase()));
}

function readCard(story, id) {
  const file = cardFile(story, id);
  return fs.existsSync(file) ? sections(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * What check holds a designed story to (one with a design/ folder): the film plan written in full, and every scene
 * with its card and its content thought through. `only` limits the cards to some scene ids.
 */
export function designProblems(story, { only } = {}) {
  if (!hasDesign(story)) return [];
  const out = [];
  const film = path.join(designDir(story), 'film.md');
  if (!fs.existsSync(film)) out.push('design/film.md is missing: run `D design <dir>` and write the film plan before the scenes');
  else {
    const sec = sections(fs.readFileSync(film, 'utf8'));
    const empty = FILM.map(([h]) => h).filter((h) => !filled(sec[h] ?? ''));
    if (empty.length) out.push(`design/film.md: write ${empty.map((h) => `"${h}"`).join(', ')}; the plan of the whole film comes before its scenes`);
  }
  for (const s of story.scenes) {
    if (only && !only.has(s.id)) continue;
    const sec = readCard(story, s.id);
    if (!sec) { out.push(`scene "${s.id}" has no card: run \`D design <dir>\` and think its content through in design/${s.id}.md`); continue; }
    if (!filled(sec.Content ?? '')) out.push(`design/${s.id}.md: write its "Content", the one idea and every word and figure on screen, before the scene is built`);
    if (!filled(sec.Storyboard ?? '')) out.push(`design/${s.id}.md: write its "Storyboard", the picture and each build on its word, before the scene is built`);
    else out.push(...buildWordProblems(s, sec.Storyboard));
  }
  return out;
}

const plain = (s) => ` ${String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/**
 * A storyboard's "Build 2, on "bottleneck"" must name a word the scene's lines say: a card that fires a build on one
 * word while the voice says another leaves the picture of what the voice names undrawn.
 */
function buildWordProblems(s, storyboard) {
  if (!s.say.length) return [];
  const said = plain(s.say.map((b) => b.text).join(' '));
  return [...storyboard.matchAll(/\bbuild\s+(\d+)\b[^\n]*?\bon\s+["“]([^"”\n]+)["”]/gi)]
    .filter(([, , word]) => plain(word).trim() && !said.includes(plain(word)))
    .map(([, k, word]) => `design/${s.id}.md: build ${k} fires on "${word}", which no line of the scene says; make the card and the line name the same thing`);
}

/** The wrong forms of the film's concepts: lines `Never: "<words>"` under film.md's ## Concepts. */
export function forbiddenForms(story) {
  const film = path.join(designDir(story), 'film.md');
  if (!fs.existsSync(film)) return [];
  const text = sections(fs.readFileSync(film, 'utf8')).Concepts ?? '';
  return [...text.matchAll(/never\s*:\s*["“]([^"”\n]+)["”]/gi)].map((m) => m[1].trim()).filter((w) => plain(w).trim());
}

/** Whether a line or a screen's text says one of the forbidden forms, matched on words, whatever the case or punctuation. */
export const saysForm = (text, form) => plain(text).includes(plain(form));

/** The story's own scene file for a scene, when it has one. */
const ownFile = (story, s) => (library(story.dir)[s.type]?.own ? path.join(story.dir, 'scenes', `${s.type}.js`) : null);

/**
 * Fingerprints of what a scene's look and its voice are made from: the look from its data, its ground and cut, its
 * scene file and the theme; the voice from its lines and what each build shows. A change to either makes its evidence
 * stale.
 */
export function fingerprints(story, s) {
  const file = ownFile(story, s), shared = sharedFiles(story.dir);
  const parts = [...shared.css, ...shared.js].map((f) => fs.readFileSync(f, 'utf8'));
  const look = sha1(JSON.stringify([s.type, s.ground, s.cut ?? null, s.hold ?? 0, s.data, story.theme, file ? fs.readFileSync(file, 'utf8') : null, parts]));
  const voice = sha1(JSON.stringify([s.say.map((b) => [b.text, b.step ?? null, b.pins ?? null]), s.short ?? null, stepCount(s), buildLabels(s)]));
  return { look, voice };
}

export const sceneBuild = (story, id) => path.join(story.dir, 'build', 'scenes', id);

/**
 * Every scene's four checks, as the card ticks them and the evidence holds them: a box counts once the work it
 * names is done and its evidence is fresh. `ok` when the plan is written and every check of every scene holds.
 */
export function review(story) {
  const rows = [];
  const plan = designProblems(story).filter((p) => p.startsWith('design/film.md'));
  for (const s of story.scenes) {
    const sec = readCard(story, s.id);
    const row = { id: s.id, type: s.type, own: Boolean(ownFile(story, s)), open: [] };
    if (!sec) { row.open.push('no card: run `D design <dir>`'); rows.push(row); continue; }
    const t = ticks(sec);
    if (!filled(sec.Content ?? '') || !filled(sec.Storyboard ?? '')) row.open.push('content: write the card\'s Content and Storyboard');
    else if (!t.content) row.open.push('content: think it through, then tick its box');
    if (!filled(sec.Motion ?? '')) row.open.push('motion: write the card\'s Motion');
    else if (!t.motion) row.open.push('motion: think it through, then tick its box');
    if (!library(story.dir)[s.type]) { row.open.push(`built: no scene "${s.type}" loads; run \`D check <dir>\``); rows.push(row); continue; }
    const metaFile = path.join(sceneBuild(story, s.id), 'meta.json');
    const meta = fs.existsSync(metaFile) ? readJson(metaFile) : null;
    const now = fingerprints(story, s);
    if (!meta) row.open.push(`built: run \`D scene <dir> ${s.id}\` and look at its stills and motion strips`);
    else if (meta.look !== now.look) row.open.push(`built: changed since \`D scene\` last showed it; run it again and look`);
    else {
      const skip = overruled(sec), left = (meta.issues ?? []).filter((i) => !skip.has(i.kind));
      if (left.length) row.open.push(`built: ${left.length} layout issue(s) open (${[...new Set(left.map((i) => i.kind))].join(', ')}); fix them, or overrule one under the checklist as "- overruled <kind>: <why>"`);
      else if (!t.built) row.open.push('built: look at every still and motion strip, then tick its box');
    }
    // a scene with no lines (an end card under the music) has nothing for its voice to match
    if (!s.say.length) { rows.push(row); continue; }
    if (!filled(sec.Voice ?? '')) row.open.push('voice: write the card\'s Voice');
    else if (meta && meta.voice !== now.voice) row.open.push('voice: the lines changed since `D scene` last timed them; run it again');
    else if (!t.voice) row.open.push('voice: check each build lands on its word, then tick its box');
    rows.push(row);
  }
  return { ok: !plan.length && rows.every((r) => !r.open.length), plan, rows };
}
