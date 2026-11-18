// The rubric: every check, its weight, how it is scored, and the verdict rules. The judges read
// references/rubric.md, which `node rubric.mjs --write` renders from this file, and score.mjs
// scores from it, so the two never disagree. Every check is decided from what a viewer sees and
// hears in the file itself, never from how the video was made.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = 1;

// A judge or listener score per check: 0, 1 or 2. Points = weight x score / 2.
export const LEVELS = [
  'not met, or a flaw a first-time viewer would notice',
  'met, with minor flaws a viewer notices only on a second look or in a still',
  'fully met: an expert would not change it',
];

export const CRITICAL = {
  cost: 3, // points off the total for each critical defect two judges saw
  max: 12,
  kinds: {
    name: 'a company, product or person named wrongly or misspelled',
    figure: 'a figure that contradicts the brief or another place in the video',
    placeholder: 'placeholder or test text on screen (lorem ipsum, {name}, TODO)',
    broken: 'a broken frame: garbage, a wrong aspect, a half-drawn scene',
    sound: 'a sound fault: a dropout, a pop, a word cut off',
    private: 'private data shown by mistake: real personal details, credentials, someone else\'s data',
  },
};

export const VERDICT = {
  runs: 3, // judges per video
  clear: 1, // share of judge-run pairs the leader wins, for "clear"
  likely: 0.75, // for "likely"; below it the videos are too close and a tie-break runs
};

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
// a measured check scores the number the report shows, so a reader can check the band themselves
const shown = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const min = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Each measured check: the facts in measures.json (and the brief's target length) to a score 0-2, or null when it does not apply. */
const MEASURES = {
  W1(m) {
    const n = m.narration;
    if (!n || !n.words) return null;
    const grade = shown(n.grade);
    const score = grade <= 10 && n.long === 0 ? 2 : grade <= 13 && n.long <= 2 ? 1 : 0;
    return { score, value: `reading grade ${fmt(n.grade)}, ${n.long} sentence${n.long === 1 ? '' : 's'} over 30 words` };
  },
  W5(m) {
    const n = m.narration;
    if (!n || !n.words) return null;
    const wpm = shown(n.wpm, 0);
    const score = wpm >= 130 && wpm <= 170 ? 2 : wpm >= 115 && wpm <= 190 ? 1 : 0;
    return { score, value: `${wpm} words a minute` };
  },
  E5(m) {
    const longestStill = shown(m.dead.longestStill), stillShare = shown(m.dead.stillShare, 2), longestSilence = shown(m.dead.longestSilence);
    const score = longestStill <= 4 && stillShare <= 0.15 && longestSilence <= 2 ? 2
      : longestStill <= 8 && stillShare <= 0.3 && longestSilence <= 4 ? 1 : 0;
    return { score, value: `longest still ${fmt(longestStill)} s, still ${Math.round(stillShare * 100)}% of the time, longest silence ${fmt(longestSilence)} s` };
  },
  E6(m, target) {
    if (!target) return null;
    const d = m.duration;
    const [lo, hi] = target;
    const off = d < lo ? (lo - d) / lo : d > hi ? (d - hi) / hi : 0;
    const score = lo === hi ? (off <= 0.15 ? 2 : off <= 0.3 ? 1 : 0) : (off === 0 ? 2 : off <= 0.15 ? 1 : 0);
    return { score, value: `${min(d)} against ${lo === hi ? min(lo) : `${min(lo)} to ${min(hi)}`}` };
  },
  A1(m) {
    const a = m.audio;
    if (!a) return { score: 0, value: 'no sound track' };
    const lufs = shown(a.lufs), peak = shown(a.peak);
    const score = lufs >= -18 && lufs <= -13 && peak <= -1 ? 2 : lufs >= -23 && lufs <= -11 && peak <= 0 ? 1 : 0;
    return { score, value: `${fmt(lufs)} LUFS, true peak ${fmt(peak)} dBTP` };
  },
  X1(m) {
    const short = Math.min(m.width, m.height);
    const score = m.fps < 24 ? 0 : short >= 1080 ? 2 : short >= 720 ? 1 : 0;
    return { score, value: `${m.width}x${m.height}, ${fmt(m.fps, 2).replace(/\.00$/, '')} fps` };
  },
  X2(m) {
    const n = m.blanks.length;
    return { score: n === 0 ? 2 : n === 1 ? 1 : 0, value: n ? `${n} blank stretch${n === 1 ? '' : 'es'}` : 'none' };
  },
};

export const CATEGORIES = [
  {
    id: 'story', name: 'Story and message', checks: [
      { id: 'S1', name: 'Hook', weight: 4, by: 'judge',
        ask: 'Within the first 10 seconds the video gives the viewer a reason to keep watching that is tied to its message: a problem they have, a question, a surprising fact or a striking picture.',
        levels: ['The first 10 s are a logo, a title, a welcome or an agenda with nothing at stake.', 'A hook arrives, but it is generic ("In today\'s fast-paced world") or lands after 10 s.', 'A specific hook tied to the message lands within 10 s. A logo of 2 s or less before it is fine.'] },
      { id: 'S2', name: 'One message', weight: 4, by: 'judge',
        ask: 'You can write the main message in one sentence of at most 20 words. It is clear, the whole video builds toward it, and it serves the purpose in the brief.',
        levels: ['No single message can be written, or it misses the brief\'s purpose.', 'A message is there, but it competes with other ideas or is only implied.', 'One unmistakable message that serves the brief.'] },
      { id: 'S3', name: 'Structure', weight: 4, by: 'judge',
        ask: 'Each part follows from the one before (for example the problem, then the answer, then the proof), and the viewer always knows why they are seeing what they see.',
        levels: ['A list of features or slides with no thread.', 'One part is loose, out of order, or could be cut without loss.', 'One thread from start to end. No part could be cut without loss.'] },
      { id: 'S4', name: 'Shows, not only tells', weight: 4, by: 'judge',
        ask: 'The main points are shown on screen: the product in use, a concrete example, a before and after, or a number with its context, not only stated in words.',
        levels: ['Mostly statements over generic or decorative pictures.', 'Some main points are only stated.', 'Every main point is shown.'] },
      { id: 'S5', name: 'Ending', weight: 3, by: 'judge',
        ask: 'The ending pays off what the opening set up, gives a clear next step when the brief asks for one, and stops cleanly.',
        levels: ['It stops abruptly, or ends on something unrelated.', 'A summary or a call to action without a payoff, or it trails on after the point has landed.', 'A payoff that answers the opening, then a clean close.'] },
      { id: 'S6', name: 'Covers the brief', weight: 2, by: 'judge', na: 'the brief lists no points the video must include',
        ask: 'Every point the brief says the video must include is in it, said or shown.',
        levels: ['More than one listed point is missing.', 'One listed point is missing or only glanced at.', 'Every listed point is there.'] },
    ],
  },
  {
    id: 'words', name: 'Words', about: 'The narration, or the words on screen when there is no narration.', checks: [
      { id: 'W1', name: 'Plain spoken sentences', weight: 2, by: 'measure', na: 'there is no narration',
        ask: 'The narration reads at school grade 10 or below on the Flesch-Kincaid scale, with no sentence over 30 words.',
        bands: ['Above grade 13, or more than 2 sentences over 30 words.', 'Grade 13 or below, and at most 2 sentences over 30 words.', 'Grade 10 or below, and no sentence over 30 words.'] },
      { id: 'W2', name: 'Concrete words', weight: 3, by: 'judge',
        ask: 'Specific nouns, real numbers and named examples. No empty hype ("seamless", "revolutionary", "unlock", "leverage", "next-generation", "game-changing") and no filler.',
        levels: ['Mostly generic marketing language.', 'Several vague or hype phrases, though the main points are concrete.', 'Concrete throughout, with at most one vague phrase.'] },
      { id: 'W3', name: 'Flow', weight: 3, by: 'judge',
        ask: 'The words read as one voice: each line follows from the one before and sections hand over naturally, with no stock signposts ("Let\'s dive in", "Here\'s how it works") and no abrupt jumps.',
        levels: ['Reads as separate blocks stitched together.', 'A few abrupt jumps or stock signposts.', 'Reads as one piece from start to end.'] },
      { id: 'W4', name: 'Right for the audience', weight: 2, by: 'judge',
        ask: 'It speaks to the audience in the brief about what they care about, at their level: it explains what they would not know and skips what they would.',
        levels: ['Written for someone else: the wrong concerns or the wrong level throughout.', 'Mostly right, with stretches pitched too high, too low or away from their concerns.', 'The right concerns at the right level throughout.'] },
      { id: 'W5', name: 'Speaking pace', weight: 2, by: 'measure', na: 'there is no narration',
        ask: 'The narration runs at 130 to 170 words a minute, the range of clear spoken explanation.',
        bands: ['Under 115 or over 190 words a minute.', '115 to 190 words a minute.', '130 to 170 words a minute.'] },
    ],
  },
  {
    id: 'visual', name: 'Visual design', about: 'Judged on the frames where the picture rests.', checks: [
      { id: 'V1', name: 'Focus', weight: 3, by: 'judge',
        ask: 'Each frame has one clear focal point and the eye knows where to go first: the most important thing is the largest, brightest or highest in contrast.',
        levels: ['Frames often have no clear focus, or several things fight for it.', 'A few frames are busy or their focus is unclear.', 'Every frame has an obvious first place to look.'] },
      { id: 'V2', name: 'Layout', weight: 3, by: 'judge',
        ask: 'Elements line up on shared edges, spacing is even and consistent, and nothing important sits within 5% of the frame\'s edge (the title-safe area).',
        levels: ['Misalignment, uneven spacing or crowded edges in many frames.', 'A few frames with something off the grid, uneven or near the edge.', 'Clean alignment and spacing in every frame.'] },
      { id: 'V3', name: 'Restraint', weight: 3, by: 'judge',
        ask: 'Generous empty space. On-screen text is short, rarely over about 20 words in one frame. Nothing on screen is decoration without a job.',
        levels: ['Crowded frames, paragraphs of text, or decoration everywhere.', 'Some frames are crowded or wordy.', 'Calm, spacious frames throughout.'] },
      { id: 'V4', name: 'Legibility', weight: 3, by: 'judge',
        ask: 'All text is easy to read on a laptop at full screen: large enough (body text at least about 3% of the frame\'s height, 32 px at 1080p) and in strong contrast with what is behind it (4.5 to 1, the WCAG level for body text, as a guide).',
        levels: ['Hard-to-read text appears often, or key text is hard to read.', 'A few small or low-contrast labels.', 'Everything reads at a glance.'] },
      { id: 'V5', name: 'One visual system', weight: 2, by: 'judge',
        ask: 'One look across the whole video: the same type styles, colours that keep one meaning, one style of illustration and of screens. A change of look marks a change of section.',
        levels: ['Styles change from scene to scene for no reason.', 'Mostly one system, with a few stray styles or colours.', 'One coherent system.'] },
      { id: 'V6', name: 'Image quality', weight: 2, by: 'judge',
        ask: 'Pictures and product screens are sharp, with no upscaling blur, compression blocks, banding, stretched or pixelated images, watermarks, or stray system screens (notifications, a desktop, a misplaced cursor).',
        levels: ['Visible quality problems in many frames, or one that spoils a key moment.', 'One or two minor flaws.', 'Clean everywhere.'] },
    ],
  },
  {
    id: 'motion', name: 'Motion', about: 'Anything that moves: graphics, the camera, a cursor. Judged on the strips of frames a tenth of a second apart.', checks: [
      { id: 'M1', name: 'Motion with meaning', weight: 3, by: 'judge',
        ask: 'Movement explains the idea: things travel where the story says they go, grow when they grow and connect when they connect, and each entrance draws the eye to what the words are about. Not one stock fade or slide used on everything.',
        levels: ['Motion is decoration, or one stock entrance on everything.', 'Some moves explain; many are stock.', 'Most moves carry meaning.'] },
      { id: 'M2', name: 'Natural timing', weight: 3, by: 'judge',
        ask: 'Moves speed up and slow down like physical objects (slow in and slow out, one of the classic principles of animation). Nothing moves at a constant mechanical speed, nothing on text or an interface bounces unless the tone calls for it, and most moves are brisk, well under a second.',
        levels: ['Mechanical, sluggish or bouncy motion throughout.', 'Some moves are linear, slow or overshoot.', 'Every move feels natural and brisk.'] },
      { id: 'M3', name: 'Staging', weight: 3, by: 'judge',
        ask: 'The eye is led to one thing at a time: elements arrive in a clear order, and several things never move at once in different directions.',
        levels: ['Many things move at once and the eye cannot follow.', 'A few moments where too much moves at once.', 'Always one clear thing to watch.'] },
      { id: 'M4', name: 'Polish', weight: 3, by: 'judge',
        ask: 'No jitter, stutter or popping. Elements settle and stay settled. No motion without meaning, such as endless floating, a constant slow zoom or a particle background.',
        levels: ['Frequent stutter, popping or restless decorative motion.', 'One or two rough moves or a decorative loop.', 'Smooth and settled throughout.'] },
    ],
  },
  {
    id: 'editing', name: 'Editing and pacing', checks: [
      { id: 'E1', name: 'Rhythm', weight: 3, by: 'judge',
        ask: 'The pace follows the content: brisk through simple points and a beat of rest after an important one. Changes land on the words or the music. Nothing is rushed (several new things inside two seconds) or dragged (one idea held long after it is understood).',
        levels: ['Monotonous, rushed or dragging throughout.', 'A few rushed or dragging stretches.', 'The pace always fits what is said.'] },
      { id: 'E2', name: 'Transitions', weight: 3, by: 'judge',
        ask: 'Every change of scene helps the viewer follow: the eye lands where the next scene\'s action is, and the change keeps the feeling and the rhythm going (Walter Murch\'s rule of six: emotion, story, rhythm, eye-trace). No accidental double exposure, flash or blank frames, and no jarring jumps.',
        levels: ['Many jarring, empty or doubled transitions.', 'One or two rough transitions.', 'Every transition is clean and leads the eye.'] },
      { id: 'E3', name: 'Continuity', weight: 3, by: 'judge',
        ask: 'The video flows as one piece rather than a run of separate cards: ideas and sentences carry across changes of scene, shared elements stay in place or travel, and the background and look stay coherent.',
        levels: ['Feels like a slideshow: each scene starts from nothing.', 'Some scenes join on; others restart from nothing.', 'One continuous piece.'] },
      { id: 'E4', name: 'No padding', weight: 2, by: 'judge',
        ask: 'Nothing is said or shown twice without a reason, and every section earns its time.',
        levels: ['Obvious repetition or filler.', 'One repeated idea or slow section.', 'Tight throughout.'] },
      { id: 'E5', name: 'No dead time', weight: 2, by: 'measure',
        ask: 'The picture never sits completely still for long and the sound never drops out: measured between the first second and the last three (an end card may hold).',
        bands: ['Anything worse than the score of 1.', 'No still stretch over 8 s, still at most 30% of the time, no silence over 4 s.', 'No still stretch over 4 s, still at most 15% of the time, no silence over 2 s.'] },
      { id: 'E6', name: 'Length', weight: 1, by: 'measure', na: 'the brief gives no length',
        ask: 'The length fits the brief.',
        bands: ['Further off.', 'Within 15% outside the brief\'s range, or within 30% of a single length.', 'Inside the brief\'s range, or within 15% of a single length.'] },
    ],
  },
  {
    id: 'together', name: 'Picture and sound together', checks: [
      { id: 'P1', name: 'In sync', weight: 3, by: 'judge', na: 'there is no narration',
        ask: 'Picture and words line up: a thing appears as the voice names it or just before, never seconds later, and changes land on the words.',
        levels: ['Pictures often lag or run ahead of the words by a second or more.', 'A few moments where the picture lags or leads.', 'Picture and words land together throughout.'] },
      { id: 'P2', name: 'Picture adds to the words', weight: 3, by: 'judge',
        ask: 'Picture and words each do their own job: the picture shows what words cannot (the product, the data, the change), on-screen text does not repeat the narration word for word, and the voice never runs long over unrelated or generic pictures.',
        levels: ['The picture mostly repeats the words, or wanders away from them.', 'Some stretches of read-along text or generic pictures.', 'Picture and words complement each other throughout.'] },
      { id: 'P3', name: 'Time to read', weight: 2, by: 'judge',
        ask: 'On-screen text stays long enough to read (about 1 s plus 0.3 s a word), and the viewer is never asked to read a block of text while the voice says something else.',
        levels: ['Text often leaves before it can be read, or competes with the voice.', 'One or two passages too fast or competing.', 'Every piece of text can be read comfortably.'] },
    ],
  },
  {
    id: 'sound', name: 'Sound', about: 'Loudness is measured. The other three need someone to listen; without a listener they are left out of both videos\' totals.', checks: [
      { id: 'A1', name: 'Loudness', weight: 2, by: 'measure',
        ask: 'Integrated loudness of -18 to -13 LUFS, the range online players expect, with true peaks at or below -1 dBTP (EBU R128).',
        bands: ['Outside the score of 1, or no sound track.', '-23 to -11 LUFS, true peak at or below 0 dBTP.', '-18 to -13 LUFS, true peak at or below -1 dBTP.'] },
      { id: 'A2', name: 'Clear voice', weight: 2, by: 'listen', na: 'there is no narration',
        ask: 'Every word is clear over the music and effects, with no hiss, echo, clipping or harsh S sounds.',
        levels: ['Words are lost under the music, or the recording is noisy or distorted.', 'Clear, with a few muddy moments.', 'Every word is clear.'] },
      { id: 'A3', name: 'Delivery', weight: 2, by: 'listen', na: 'there is no narration',
        ask: 'The voice sounds natural and engaged, says names and terms correctly and stresses the right words. It is not flat or robotic.',
        levels: ['Flat, robotic or mispronounced throughout.', 'Natural mostly, with a few odd stresses or names said wrongly.', 'Natural and engaged throughout.'] },
      { id: 'A4', name: 'Music and effects', weight: 2, by: 'listen', na: 'the brief asks for no music',
        ask: 'Music fits the tone and supports without competing, follows the sections and resolves at the end. Each sound effect has a visible cause and none repeats until it grates.',
        levels: ['Music fights the voice or the tone, stops abruptly, or effects grate.', 'Fits, but stays flat or ends abruptly.', 'Fits, supports and resolves.'] },
    ],
  },
  {
    id: 'credibility', name: 'Credibility', checks: [
      { id: 'R1', name: 'Figures hold up', weight: 2, by: 'judge',
        ask: 'Numbers and statements are plausible, the same everywhere they appear, and shown, sourced or labelled as illustrative. No unsupported superlatives ("10x", "best-in-class"). When the brief gives facts, every figure matches them.',
        levels: ['A figure contradicts the brief or itself, or big statements stand unsupported.', 'A figure or statement or two lacks support or a label.', 'Every figure and statement is supported or labelled.'] },
      { id: 'R2', name: 'Believable product', weight: 2, by: 'judge', na: 'the video shows no product',
        ask: 'Product screens and examples look real and consistent: the same interface throughout, realistic data, nothing that contradicts itself.',
        levels: ['Screens look fake or contradict each other.', 'Minor inconsistencies or placeholder-like data.', 'Real-looking and consistent.'] },
      { id: 'R3', name: 'Clean text', weight: 2, by: 'judge',
        ask: 'No spelling or grammar mistakes, wrong names, cut-off words or placeholder text on screen.',
        levels: ['Several mistakes, or one in a heading or a name.', 'One small mistake.', 'None.'] },
    ],
  },
  {
    id: 'technical', name: 'Technical quality', checks: [
      { id: 'X1', name: 'Resolution and frame rate', weight: 2, by: 'measure',
        ask: 'At least 1080 lines on the short side and at least 24 frames a second.',
        bands: ['Below 720 lines, or under 24 frames a second.', 'At least 720 lines.', 'At least 1080 lines.'] },
      { id: 'X2', name: 'No blank frames', weight: 1, by: 'measure',
        ask: 'No stretch of 0.3 s or more where the frame is empty (one flat colour or an empty background), apart from the first and last 1.5 s.',
        bands: ['Two or more blank stretches.', 'One blank stretch.', 'None.'] },
    ],
  },
];

export const CHECKS = CATEGORIES.flatMap((c) => c.checks.map((k) => ({ ...k, category: c.id })));
export const byId = Object.fromEntries(CHECKS.map((k) => [k.id, k]));

/** A measured check's score from the facts, or null when it does not apply. */
export function measure(id, measures, target) {
  return MEASURES[id](measures, target);
}

/** The brief's target length in seconds as [low, high], from a "Length:" line ("2-3 minutes", "90 seconds", "5 min"), or null. */
export function targetLength(brief) {
  const line = /^\s*[-*]?\s*\**length\**\s*:\s*(.+)$/imu.exec(brief ?? '')?.[1];
  if (!line) return null;
  const m = /(\d+(?:\.\d+)?)\s*(?:(?:-|–|—|to)\s*(\d+(?:\.\d+)?))?\s*(h|hours?|m|mins?|minutes?|s|secs?|seconds?)\b/iu.exec(line);
  if (!m) return null;
  const unit = /^h/iu.test(m[3]) ? 3600 : /^m/iu.test(m[3]) ? 60 : 1;
  const lo = Number(m[1]) * unit;
  return [lo, m[2] ? Number(m[2]) * unit : lo];
}

/** references/rubric.md, as the judges read it. */
export function render() {
  const out = [];
  const total = CHECKS.reduce((s, k) => s + k.weight, 0);
  out.push('# The video rubric', '');
  out.push('## Contents', '', '- How a video is scored', ...CATEGORIES.map((c) => `- ${c.name}`), '- Critical defects', '- The verdict', '');
  out.push('## How a video is scored', '');
  out.push(`${CHECKS.length} checks in ${CATEGORIES.length} groups, worth ${total} points. Each check is decided from what a viewer sees and hears in the video, and from the brief. How the video was made, and by whom, never counts: a hand-made video, a tool's and an AI's are held to the same words.`, '');
  out.push('A judge scores a check 0, 1 or 2, and the check earns its weight times the score over 2:', '');
  LEVELS.forEach((l, i) => out.push(`- **${i}**: ${l}.`));
  out.push('');
  out.push('Every score cites where it was seen: a time and a file of the evidence pack. A 2 cites one place it is done well; a 0 or a 1 cites each flaw. A check that does not apply is `na`, but only where the check says when; it is then left out of both videos\' totals, so the two are always scored on the same checks. **Measured** checks are scored by a script from the file; **listened** checks need a person, or are left out of both totals.', '');
  for (const c of CATEGORIES) {
    const w = c.checks.reduce((s, k) => s + k.weight, 0);
    out.push(`## ${c.name}`, '', `${w} points.${c.about ? ` ${c.about}` : ''}`, '');
    for (const k of c.checks) {
      const how = k.by === 'measure' ? 'measured' : k.by === 'listen' ? 'listened' : 'judged';
      out.push(`### ${k.id} ${k.name} (${k.weight} points, ${how})`, '', k.ask, '');
      const rows = k.levels ?? k.bands;
      out.push(`- 2: ${rows[2]}`, `- 1: ${rows[1]}`, `- 0: ${rows[0]}`);
      if (k.na) out.push(`- na: ${k.na}.`);
      out.push('');
    }
  }
  out.push('## Critical defects', '');
  out.push(`Besides the scores, a judge lists every critical defect it sees, with its time and file. Each one that at least two judges report (same kind, within 3 s) costs ${CRITICAL.cost} points of the total, at most ${CRITICAL.max}, and means the video is not ready to send.`, '');
  for (const [k, v] of Object.entries(CRITICAL.kinds)) out.push(`- \`${k}\`: ${v}`);
  out.push('');
  out.push('## The verdict', '');
  out.push(`${VERDICT.runs} judges score each video on its own, never seeing the other. A check's score is the median of the judges'; the scripts add the points. A total is the points earned over the points possible on the checks both videos were scored on, out of 100, less the critical defects.`, '');
  out.push(`Each judge's total of one video is set against each judge's total of the other (${VERDICT.runs * VERDICT.runs} pairs). The leader is **clear** when it wins every pair, **likely** when it wins at least ${Math.round(VERDICT.likely * 100)}% of them. Otherwise the two are too close, and two more judges compare them side by side, once in each order. A video wins the tie-break only when both orders pick it; otherwise it is a tie.`, '');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = render();
  if (process.argv.includes('--write')) fs.writeFileSync(path.join(import.meta.dirname, '..', 'references', 'rubric.md'), text);
  else process.stdout.write(text);
}
