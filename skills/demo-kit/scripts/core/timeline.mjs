// The story's two clocks. Spoken (a video): the voice runs through the film, with a breath between lines and, where
// one scene hands over to the next, the pause the scene's last line asks for; the next scene arrives once the one before
// has been read and has said its last word, or on the word its `cutOn` names, so a sentence can run across the cut.
// Every build fires on the line that names it, and a scene holds on its last build long enough to be read. Stepped (a
// deck, stills, slides): every build gets the same room, and the page stops after each.
import { buildLabels, settleTime, stepCount } from './scenes.mjs';

// land: how long before its word a build starts, so it arrives as the word is said
// join: the pause between one scene's last word and the next scene's first, when that last line sets no pause of its own;
// link: shorter, when the next scene's first line runs on from the last ("And…", "So…", "That's why…");
// turn: longer, when the next scene changes ground, a new chapter
// after: how long a scene stays once its last word is said before the next arrives (a cut on a word may come sooner)
// lead: in a long pause, the most the next scene arrives ahead of its first word
// minHold: a scene's last build is read, then the film moves on; trim the words, never stretch the picture
export const TIMING = { open: 900, lead: 650, gap: 380, join: 700, link: 400, turn: 1100, after: 350, early: 150, minHold: 1900, tail: 3200, silent: 4200, spread: 900, land: 250 };
export const STEPPED = { build: 2600, rest: 900, sceneGap: 250 };
// how long before the next scene arrives each kind of cut starts taking a scene away (the page's own cuts)
const LEAVES = { fade: 60, dissolve: 250, push: 380, whip: 380, blur: 380, cut: 250 };

/**
 * The builds each line of a scene brings in, in order. A line's `step` pins it; with one more line than builds, line 1
 * introduces the scene and each next line brings the next build; with as many, each brings one; with fewer, the builds
 * are shared out across the lines. An introducing line brings none.
 */
export function lineBuilds(lines, n) {
  if (!n || !lines.length) return { mode: 'none', builds: lines.map(() => []) };
  if (lines.some((b) => b.step != null)) return { mode: 'pinned', builds: lines.map((b) => [b.step].flat().filter((x) => x != null)) };
  if (lines.length >= n + 1) return { mode: 'intro', builds: lines.map((_, j) => (j >= 1 && j <= n ? [j] : [])) };
  if (lines.length === n) return { mode: 'each', builds: lines.map((_, j) => [j + 1]) };
  return {
    mode: 'spread',
    builds: lines.map((_, j) => {
      const a = Math.floor((j * n) / lines.length) + 1, z = Math.floor(((j + 1) * n) / lines.length);
      return Array.from({ length: z - a + 1 }, (__, i) => a + i);
    }),
  };
}

const norm = (w) => String(w).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
const STOP = new Set('the a an and or of to in on for with from by your our their this that these those is are was be been it its at as we you they them more than into out over then so just all each every one'.split(' '));
const NUMBER = /^(?:\d[\d,.]*\w*|zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|percent)$/;
// two words name the same thing when they share their first five letters, or one (four letters or more) begins the other
const sameStem = (a, b) => a.slice(0, 5) === b.slice(0, 5) || (b.length >= 4 && a.startsWith(b)) || (a.length >= 4 && b.startsWith(a));

/** Each word of a line, with when it is said: matched in order to the voice's own words, which may drop punctuation. */
export function timeWords(text, words = []) {
  let j = 0;
  return String(text).split(/\s+/).filter(Boolean).map((w) => {
    let k = j;
    while (k < words.length && k < j + 3 && norm(words[k].w) !== norm(w)) k++;
    const hit = words[k] && norm(words[k].w) === norm(w) ? k : Math.min(j, words.length - 1);
    j = hit + 1;
    return { w, at: words[hit]?.at ?? 0, end: words[hit]?.end ?? 0 };
  });
}

/** The first word from `from` on that names a build: a shared stem with its label, or any number for a label with one. */
export function findWord(tokens, label, from = 0) {
  const want = String(label ?? '').split(/\s+/).map(norm).filter((w) => w.length > 2 && !STOP.has(w) && !/\d/.test(w));
  const numeric = /\d/.test(String(label ?? ''));
  for (let i = from; i < tokens.length; i++) {
    const w = norm(tokens[i].w);
    if ((numeric && NUMBER.test(w)) || (w.length > 2 && !STOP.has(w) && want.some((x) => sameStem(w, x)))) return i;
  }
  return -1;
}

/** The build each line belongs to, for notes: the first it brings in, or the one on screen when it is said. */
function noteBuilds(builds) {
  let on = 0;
  return builds.map((ks) => (on = ks.length ? ks[0] : on));
}

// a first line that runs on from the scene before: it opens on a word that links it to what was just said
const LINKS = /^(?:and|so|but|then|that|that's|which|because|yet|instead|still)\b/i;

/** Where a scene's `cutOn` word is said: in its own first line (index into `own`), else in the scene before's last. */
export function cutWord(word, own = [], before = []) {
  const at = (ws) => (word ? ws.findIndex((x) => norm(x.w) === norm(word)) : -1);
  const j = at(own);
  return j >= 0 ? { line: 'own', i: j } : at(before) >= 0 ? { line: 'before', i: at(before) } : null;
}

export function spoken(story, scenes, T = TIMING) {
  const out = [];
  // the scene before, as the join needs it: when it said its last word, the pause after it, when its picture may go
  let before = null;
  scenes.forEach((s, i) => {
    const n = stepCount(s);
    let start = 0, cursor = T.open, join = null;
    if (before) {
      cursor = before.spoke + (before.pause ?? (s.ground !== before.ground ? T.turn : LINKS.test(s.say[0]?.text ?? '') ? T.link : T.join));
      const own = s.say[0] ? timeWords(s.say[0].text, s.say[0].words) : [], last = before.words;
      const on = cutWord(s.cutOn, own, last), carried = on?.line === 'before';
      const word = on && (carried ? last[on.i].at : cursor + own[on.i].at);
      let at = on ? word : Math.max(before.spoke + T.after, cursor - T.lead);
      // the scene before is read before it goes, and says its last word first unless the cut lands inside that line;
      // the voice waits with the picture, so a cut on a word stays on it
      const earliest = carried ? before.needs : Math.max(before.needs, before.spoke + T.after);
      if (at < earliest) { if (!carried) cursor += earliest - at; at = earliest; }
      if (carried) cursor = Math.max(cursor, at);
      start = Math.round(at);
      out[i - 1].end = start;
      join = {
        pause: s.say.length && before.said ? Math.round(cursor - before.spoke) : null,
        on: on && { word: (carried ? last : own)[on.i].w, line: on.line, ...(carried && at > word && { late: Math.round(at - word) }) },
      };
    }
    const { mode, builds } = lineBuilds(s.say, n);
    const notes = noteBuilds(builds);
    const labels = buildLabels(s);
    const beats = s.say.map((b, j) => {
      const at = cursor;
      cursor += b.dur + (b.pause ?? T.gap);
      const words = timeWords(b.text, b.words);
      return { text: b.text, at, end: at + b.dur, file: b.file, accent: b.accent, build: notes[j], pins: b.pins, words: words.map((w) => ({ w: w.w, at: at + w.at, end: at + w.end })) };
    });
    const cues = [start];
    const place = (k, at) => { cues[k] = Math.max(at, cues[k - 1] ?? start); };
    // a build lands on the word that names it: a {pinned} word, else the first word sharing its label's stem
    const synced = new Set(), landed = {};
    beats.forEach((b, j) => {
      let from = 0;
      builds[j].forEach((k, i2) => {
        const idx = b.pins?.[i2] ?? findWord(b.words, labels[k - 1], from);
        if (idx == null || idx < 0 || !b.words[idx]) return;
        place(k, b.words[idx].at - T.land);
        synced.add(k);
        landed[k] = { line: j + 1, word: b.words[idx].w };
        from = idx + 1;
      });
    });
    // when in its line a build fires: on the line's first word, a beat in, or spread across the line
    const when = {
      pinned: (b, j, i2, m) => b.at - T.early + i2 * Math.min(T.spread, (b.end - b.at) / m),
      intro: (b) => b.at - T.early,
      each: (b, j, i2, m, k) => b.at + (k === 1 ? 700 : -T.early),
      spread: (b, j, i2, m) => b.at + (j === 0 ? 500 : -T.early) + (i2 * (b.end - b.at) * 0.85) / m,
    }[mode];
    if (when) beats.forEach((b, j) => builds[j].forEach((k, i2, ks) => { if (!synced.has(k)) place(k, when(b, j, i2, ks.length, k)); }));
    // a build no line asked for comes in after the one before it
    for (let k = 1; k <= n; k++) if (cues[k] == null) cues[k] = (cues[k - 1] ?? start) + T.spread;
    const spoke = beats.at(-1)?.end ?? start + T.silent;
    // long enough for its last build to be read, and for its entrance to finish and be read
    const needs = Math.max(cues[n] + T.minHold, start + settleTime(s) + T.minHold) + (s.hold ?? 0) * 1000;
    const end = i === scenes.length - 1 ? Math.max(needs, spoke + T.tail, start + T.silent) : null;
    out.push({ id: s.id, type: s.type, ground: s.ground, cut: s.cut, data: s.data, start, end, cues, beats, synced: synced.size, landed, ...(join && { join }) });
    before = { spoke, said: beats.length > 0, pause: s.say.at(-1)?.pause, needs, ground: s.ground, words: beats.at(-1)?.words ?? [] };
  });
  return { slug: story.slug, title: story.title, dir: story.dir, clock: 'spoken', duration: out.at(-1)?.end ?? 0, fps: story.video.fps, scenes: out };
}

/** The deck's clock: no voice. The page itself works out where each build has settled (UA.stops). */
export function stepped(story, scenes, T = STEPPED) {
  let t = 0;
  const scenesOut = scenes.map((s) => {
    const n = stepCount(s);
    const start = t;
    const first = start + settleTime(s);
    const cues = [start, ...Array.from({ length: n }, (_, k) => first + k * T.build)];
    const end = (n ? cues[n] + T.build : first + T.rest) + T.sceneGap;
    const notes = noteBuilds(lineBuilds(s.say, n).builds);
    t = end;
    return { id: s.id, type: s.type, ground: s.ground, cut: s.cut, data: s.data, start, end, cues, beats: s.say.map((b, j) => ({ text: b.text, build: notes[j] })) };
  });
  return { slug: story.slug, title: story.title, dir: story.dir, clock: 'stepped', duration: t, scenes: scenesOut };
}

/**
 * Every build of a spoken plan with its window: when it fires (ms from the scene's start), how long until the next build
 * (the last one: until the scene starts to leave), the word it lands on, and the words said inside the window, each
 * at its ms from the build. Build 0 is the scene's entrance. What a scene's author times its motion to.
 */
export function cueSheet(plan) {
  return plan.scenes.map((s, i) => {
    const words = s.beats.flatMap((b) => b.words ?? []), n = s.cues.length - 1, prev = plan.scenes[i - 1];
    const leave = s.end - (LEAVES[plan.scenes[i + 1]?.cut] ?? LEAVES.fade);
    const builds = s.cues.map((c, k) => {
      const next = k < n ? s.cues[k + 1] : leave;
      return {
        build: k, at: Math.round(c - s.start), window: Math.max(0, Math.round(next - c)), word: k ? s.landed?.[k]?.word ?? null : null,
        words: words.filter((w) => w.at >= c - 150 && w.at < next).map((w) => ({ w: w.w, at: Math.round(w.at - c) })),
      };
    });
    // the join from the scene before: its last line and this one's first, the pause between them, and the words each
    // says across the cut
    const join = prev && {
      from: prev.id, pause: s.join?.pause ?? null, on: s.join?.on ?? null, last: prev.beats.at(-1)?.text ?? null, first: s.beats[0]?.text ?? null,
      early: words.filter((w) => w.at < s.start).map((w) => w.w), late: prev.beats.flatMap((b) => b.words ?? []).filter((w) => w.at >= s.start).map((w) => w.w),
    };
    return { id: s.id, type: s.type, start: Math.round(s.start), end: Math.round(s.end), builds, ...(join && { join }) };
  });
}

/**
 * The cue sheet as the text an author reads: per build its time, window, word and the words with their offsets; then
 * every join, the scene before's last line beside the next one's first, to read the voice across the film.
 */
export function cueText(sheet, { voiced } = {}) {
  const sec = (ms) => (ms / 1000).toFixed(2);
  const tail = (t) => (t ? `"${t.split(/\s+/).length > 6 ? '…' : ''}${t.split(/\s+/).slice(-6).join(' ')}"` : '(no line)');
  const head = (t) => (t ? `"${t.split(/\s+/).slice(0, 6).join(' ')}${t.split(/\s+/).length > 6 ? '…' : ''}"` : '(no line)');
  const joins = sheet.filter((s) => s.join).map(({ id, join: j }) => [
    `- ${j.from} → ${id}${j.pause != null ? ` · pause ${sec(j.pause)} s` : ''}: ${tail(j.last)} → ${head(j.first)}`,
    ...(j.on ? [`  cut on "${j.on.word}", in ${j.on.line === 'own' ? `${id}'s first line` : `${j.from}'s last line`}${j.on.late ? ` (${sec(j.on.late)} s after it: ${j.from} is read first)` : ''}`] : []),
    ...(j.early.length ? [`  heard over ${j.from}: ${j.early.join(' ')}`] : []),
    ...(j.late.length ? [`  heard over ${id}: ${j.late.join(' ')}`] : []),
  ].join('\n'));
  return [`# Cue sheet (${voiced ? 'voiced' : 'estimated at the voice\'s pace'})`, '',
    ...sheet.flatMap((s) => [`## ${s.id} · from ${sec(s.start)} s · ${sec(s.end - s.start)} s`,
      ...s.builds.map((b) => `- build ${b.build}${b.build ? '' : ' (entrance)'} at +${sec(b.at)} s, window ${sec(b.window)} s${b.word ? `, on "${b.word}"` : ''}: ${b.words.map((w) => `${w.w}@${sec(w.at)}`).join(' ') || '(no words)'}`), '']),
    ...(joins.length ? ['## Joins', '', ...joins, ''] : []),
  ].join('\n');
}

/** SubRip captions, one per line as it is spoken. */
export function srt(p) {
  const ts = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(Math.round(ms % 1000)).padStart(3, '0')}`; };
  const lines = p.scenes.flatMap((s) => s.beats);
  return lines.map((b, i) => `${i + 1}\n${ts(b.at)} --> ${ts(b.end)}\n${b.text}\n`).join('\n');
}
