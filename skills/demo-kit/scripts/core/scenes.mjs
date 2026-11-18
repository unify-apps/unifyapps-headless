// Reads the scenes a story page uses, so the planner counts steps and checks data with the same definitions: the kit's
// own library, and the scenes a story writes for itself in its scenes/ folder.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { RUNTIME } from './util.mjs';

let kit = null;
const own = new Map();

const filesIn = (dir, test) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(test).sort().map((f) => path.join(dir, f)) : []);
const jsIn = (dir) => filesIn(dir, (f) => f.endsWith('.js') && !f.startsWith('_'));

/** The kit's scene files, then the story's own (`<story>/scenes/*.js`), in the order the page loads them. */
export function sceneFiles(dir) {
  return [...jsIn(path.join(RUNTIME, 'scenes')), ...(dir ? storySceneFiles(dir) : [])];
}

export const storySceneFiles = (dir) => jsIn(path.join(dir, 'scenes'));

/**
 * The parts a film shares across its scenes (`<story>/scenes/_<name>.css` and `_<name>.js`): the badges, chips, the
 * motif and the product's shell every scene draws the same way. The page loads them before the story's scenes.
 */
export const sharedFiles = (dir) => ({
  css: filesIn(path.join(dir, 'scenes'), (f) => f.startsWith('_') && f.endsWith('.css')),
  js: filesIn(path.join(dir, 'scenes'), (f) => f.startsWith('_') && f.endsWith('.js')),
});

function kitLibrary() {
  if (kit) return kit;
  const defs = {};
  const sandbox = { UA: { scene: (name, def) => { defs[name] = def; } } };
  vm.createContext(sandbox);
  for (const f of sceneFiles()) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
  kit = defs;
  return defs;
}

/**
 * A story's own scenes: each file defines one scene named as the file. It runs after the kit's, so it may build on a
 * kit scene (`{ ...UA.scenes.flow, anim(c, d, U) { … } }`). Problems loading it come back as words, never a crash.
 */
function storyLibrary(dir) {
  const files = storySceneFiles(dir), shared = sharedFiles(dir);
  const sig = [...files, ...shared.js, ...shared.css].map((f) => `${f}:${fs.statSync(f).mtimeMs}`).join('|');
  const hit = own.get(dir);
  if (hit?.sig === sig) return hit;
  const base = kitLibrary(), defs = {}, problems = [];
  for (const f of shared.js) problems.push(...sourceProblems(path.basename(f, '.js'), fs.readFileSync(f, 'utf8'), {}));
  for (const f of shared.css) { const css = fs.readFileSync(f, 'utf8'); problems.push(...sourceProblems(path.basename(f, '.css'), css, { css }).map((p) => p.replace(/\.js uses/, '.css uses'))); }
  for (const f of files) {
    const name = path.basename(f, '.js'), found = [];
    const sandbox = { UA: { scenes: { ...base }, scene: (n, def) => found.push([n, def]), EASE: {}, film: {} } };
    vm.createContext(sandbox);
    try {
      // the film's shared parts load first, so a scene may build on them
      for (const sf of shared.js) vm.runInContext(fs.readFileSync(sf, 'utf8'), sandbox, { filename: sf, timeout: 1000 });
      vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f, timeout: 1000 });
    } catch (e) { problems.push(`scenes/${name}.js does not load: ${e.message}`); continue; }
    if (found.length !== 1 || found[0][0] !== name) { problems.push(`scenes/${name}.js must define exactly one scene, UA.scene('${name}', { … }); it defines ${found.map(([n]) => `"${n}"`).join(', ') || 'none'}`); continue; }
    if (base[name]) { problems.push(`scenes/${name}.js is named like the kit's scene "${name}"; give it a name of its own`); continue; }
    const def = found[0][1];
    for (const k of ['steps', 'build']) if (typeof def?.[k] !== 'function') problems.push(`scenes/${name}.js: ${k}(data) is required`);
    problems.push(...sourceProblems(name, fs.readFileSync(f, 'utf8'), def));
    defs[name] = { ...def, own: true };
  }
  const out = { sig, defs, problems };
  own.set(dir, out);
  return out;
}

// A frame must come from the film clock alone, and the deck must play offline under a strict security policy: what a
// scene file may not hold, and why, in the words check prints. Code is read without its comments; style is read from
// the scene's css and the markup its build writes.
const CODE = [
  [/\bset(?:Timeout|Interval)\s*\(|\brequestAnimationFrame\s*\(/, 'a timer; move it on the clock with c.tw, c.gs, c.tick or c.live'],
  [/\bMath\.random\s*\(|\bgsap\.utils\.random\s*\(/, 'a random number; use c.rand(), which draws the same scatter every frame'],
  [/\b(?:Date\.now|performance\.now)\s*\(|\bnew Date\s*\(/, 'the wall clock; time comes from c.t(k) and the ms tick() and live() hand you'],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bimport\s*\(|\bnew\s+(?:Worker|WebSocket)\b/, 'a network call; the deck plays offline'],
  [/\bgsap\.(?:to|from|fromTo|timeline|delayedCall|ticker)\b/, 'a GSAP tween on the wall clock; add it to c.gs (or c.loops for endless motion), the scene\'s timelines on the film clock; gsap.set is fine'],
  [/\bon(?:Start|Complete|Repeat|ReverseComplete|Interrupt)\s*:|\.(?:call|add)\s*\(\s*(?:\([^)]*\)\s*=>|function\b)/, 'a GSAP callback, which a frame drawn out of order skips or repeats; make the change a tween or a .set at its time on c.gs'],
];
const STYLE = [
  [/(?:^|[;{\s"'])transition(?:-[a-z]+)?\s*:/m, 'a CSS transition; animate with c.tw, which the clock drives'],
  [/(?:^|[;{\s"'])animation(?:-[a-z]+)?\s*:|@keyframes/m, 'a CSS animation; animate with c.tw, which the clock drives'],
];
const REMOTE = [/url\(\s*['"]?https?:|(?:src|href)\s*=\s*\\?['"]https?:|@import/, 'a file from the internet; put a picture in assets/ and name it in data'];

const uncommented = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function sourceProblems(name, src, def) {
  const code = uncommented(src), style = `${def?.css ?? ''}\n${def?.build?.toString() ?? ''}`;
  return [
    ...CODE.filter(([re]) => re.test(code)).map(([, why]) => why),
    ...STYLE.filter(([re]) => re.test(style)).map(([, why]) => why),
    ...(REMOTE[0].test(src) ? [REMOTE[1]] : []),
  ].map((why) => `scenes/${name}.js uses ${why}`);
}

/** Every scene a story can use: the kit's, and with `dir` its own. */
export function library(dir) {
  return dir ? { ...kitLibrary(), ...storyLibrary(dir).defs } : kitLibrary();
}

/** Problems with the story's own scene files, in plain words: empty when every one loads and keeps the clock rules. */
export function storySceneProblems(dir) {
  return storyLibrary(dir).problems;
}

/** Problems with one scene's data, in plain words; empty when it can be built. */
export function sceneProblems(scene) {
  const def = library(scene.dir)[scene.type];
  if (!def) return [`scene "${scene.id}": no scene type "${scene.type}" (one of the kit's ${Object.keys(kitLibrary()).join(', ')}, or scenes/${scene.type}.js written for this story)`];
  const out = [];
  const d = scene.data ?? {};
  for (const key of def.need ?? []) {
    if (d[key] == null || (Array.isArray(d[key]) && !d[key].length)) out.push(`scene "${scene.id}" (${scene.type}): data.${key} is required`);
  }
  for (const [key, max] of Object.entries(def.max ?? {})) {
    if (Array.isArray(d[key]) && d[key].length > max) out.push(`scene "${scene.id}" (${scene.type}): data.${key} has ${d[key].length}, at most ${max}`);
  }
  // what one scene type checks for itself, such as the title's openings
  for (const p of def.problems?.(d) ?? []) out.push(`scene "${scene.id}" (${scene.type}): ${p}`);
  if (def.own) {
    let n;
    try { n = def.steps(d); } catch (e) { out.push(`scene "${scene.id}" (${scene.type}): steps(data) throws: ${e.message}`); return out; }
    if (!Number.isInteger(n) || n < 0) out.push(`scene "${scene.id}" (${scene.type}): steps(data) must return a whole number of builds, not ${JSON.stringify(n)}`);
    const labels = def.labels?.(d);
    if (n > 0 && (!Array.isArray(labels) || labels.length !== n)) out.push(`scene "${scene.id}" (${scene.type}): labels(data) must give one string per build (${n}), naming what each shows, so each lands on the word that says it`);
  }
  return out;
}

/** How long the scene's entrance takes before it can be read (ms); 1.5 s when the scene does not say. */
export function settleTime(scene) {
  return library(scene.dir)[scene.type]?.settle?.(scene.data ?? {}) ?? 1500;
}

/**
 * The scene's builds: its file's steps(data), or, for a scene its author has not written yet, the `builds` the story
 * plans for it, so its lines can be voiced and timed before it exists.
 */
export function stepCount(scene) {
  const def = library(scene.dir)[scene.type];
  if (def) return def.steps(scene.data ?? {});
  if (Number.isInteger(scene.builds)) return scene.builds;
  throw new Error(`scene "${scene.id}": no scene "${scene.type}" yet, and no "builds" planned for it`);
}

/** What each build shows, in words, so a line's word that names it can be found: one string per build. */
export function buildLabels(scene) {
  return library(scene.dir)[scene.type]?.labels?.(scene.data ?? {}) ?? [];
}
