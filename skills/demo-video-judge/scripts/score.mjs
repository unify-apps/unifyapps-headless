#!/usr/bin/env node
// Adds up a run: the measured checks from each pack's measures.json, the median of the judges'
// scores, the listener's when there is one, the critical defects two judges agree on, and the
// verdict with how sure it is. Writes report.md, learnings.md and report.json in the run folder.
//
//   node score.mjs <run dir> [--mine A|B|<video file>]
//
// A judge file that breaks the format is left out and named; a video needs two good judge files.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CATEGORIES, CHECKS, CRITICAL, VERDICT, byId, measure, targetLength } from './rubric.mjs';

const JUDGED = CHECKS.filter((k) => k.by === 'judge');
const LISTENED = CHECKS.filter((k) => k.by === 'listen');

export function seconds(t) {
  if (typeof t === 'number') return t;
  const m = /^\s*(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s*$/.exec(String(t)) ?? /^\s*(\d+(?:\.\d+)?)\s*s?\s*$/.exec(String(t));
  if (!m) return NaN;
  return m.length === 4 ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]);
}
const time = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const one = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function median(list) {
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** What is wrong with one judge file, as a list of plain sentences; empty when it is good. */
export function problems(j, label, pack, duration) {
  const out = [];
  if (!j || typeof j !== 'object') return ['is not a JSON object'];
  if (j.video !== label) out.push(`says video "${j.video}", not "${label}"`);
  const where = (e, what) => {
    const t = seconds(e?.t);
    if (!Number.isFinite(t) || t < 0 || t > duration + 1) out.push(`${what} has a time "${e?.t}" outside the video (0 to ${time(duration)})`);
    const f = String(e?.file ?? '');
    if (!f || path.isAbsolute(f) || f.split(/[\\/]/).includes('..') || !fs.existsSync(path.join(pack, f))) out.push(`${what} names a file "${f}" that is not in the pack`);
  };
  for (const k of JUDGED) {
    const c = j.checks?.[k.id];
    if (!c) { out.push(`has no ${k.id}`); continue; }
    if (c.score === 'na') { if (!k.na) out.push(`${k.id} is na, but ${k.id} always applies`); continue; }
    if (![0, 1, 2].includes(c.score)) { out.push(`${k.id} has score ${JSON.stringify(c.score)}, not 0, 1, 2 or na`); continue; }
    if (!Array.isArray(c.evidence) || !c.evidence.length) out.push(`${k.id} cites no evidence`);
    else c.evidence.forEach((e, i) => where(e, `${k.id} evidence ${i + 1}`));
  }
  for (const [i, c] of (Array.isArray(j.critical) ? j.critical : []).entries()) {
    if (!CRITICAL.kinds[c?.kind]) out.push(`critical ${i + 1} has kind "${c?.kind}", not one of ${Object.keys(CRITICAL.kinds).join(', ')}`);
    where(c, `critical ${i + 1}`);
  }
  if (j.critical !== undefined && !Array.isArray(j.critical)) out.push('critical is not a list');
  return out;
}

/** The critical defects at least two judges saw (same kind, within 3 s); with one judge, its own. */
export function agreedCriticals(runs) {
  const all = runs.flatMap((r, run) => (r.critical ?? []).map((c) => ({ ...c, run, at: seconds(c.t) })));
  const groups = [];
  for (const c of all.sort((a, b) => a.at - b.at)) {
    const g = groups.find((x) => x.kind === c.kind && Math.abs(x.at - c.at) <= 3);
    if (g) { g.items.push(c); g.runs.add(c.run); } else groups.push({ kind: c.kind, at: c.at, items: [c], runs: new Set([c.run]) });
  }
  return groups.filter((g) => g.runs.size >= Math.min(2, runs.length)).map((g) => ({ kind: g.kind, t: time(g.at), seenBy: g.runs.size, note: g.items[0].note, file: g.items[0].file }));
}

/** One video's scores per check: { score, runs, by, value, na } with score null when it does not apply. */
export function scoreVideo({ measures, target, runs, listen }) {
  const out = {};
  for (const k of CHECKS) {
    if (k.by === 'measure') {
      const r = measure(k.id, measures, target);
      out[k.id] = r ? { score: r.score, value: r.value } : { score: null, why: k.na };
    } else if (k.by === 'listen') {
      const c = listen?.checks?.[k.id];
      out[k.id] = !listen ? { score: null, why: 'no one listened' } : c && [0, 1, 2].includes(c.score) ? { score: c.score, note: c.note } : { score: null, why: k.na };
    } else {
      const scores = runs.map((r) => r.checks[k.id].score);
      const numbers = scores.filter((s) => s !== 'na');
      out[k.id] = numbers.length >= scores.length - numbers.length && numbers.length
        ? { score: median(numbers), runs: scores }
        : { score: null, runs: scores, why: k.na };
    }
  }
  return out;
}

const pointsOf = (k, score) => (k.weight * score) / 2;

/** Totals over the checks every video was scored on. `pick` gives a check's score, so one judge's run can be added up on its own. */
export function totals(videos, common, pick = (v, id) => v.scores[id].score) {
  return videos.map((v) => {
    const groups = CATEGORIES.map((c) => {
      const ks = c.checks.filter((k) => common.has(k.id));
      return { id: c.id, name: c.name, possible: ks.reduce((s, k) => s + k.weight, 0), earned: ks.reduce((s, k) => s + pointsOf(k, pick(v, k.id)), 0) };
    });
    const possible = groups.reduce((s, g) => s + g.possible, 0), earned = groups.reduce((s, g) => s + g.earned, 0);
    const total = possible ? (100 * earned) / possible : 0;
    const off = Math.min(CRITICAL.max, CRITICAL.cost * v.criticals.length);
    return { groups, possible, earned, total, off, final: total - off };
  });
}

/** Who leads, and how sure: the share of judge-run pairs the leader wins. */
export function verdict(videos, common, pairs = []) {
  if (videos.length < 2) return null;
  const [a, b] = videos;
  const [ta, tb] = totals(videos, common);
  const perRun = (v) => v.runs.map((r) => totals([v], common, (x, id) => {
    const s = byId[id].by === 'judge' ? r.checks[id].score : x.scores[id].score;
    return s === 'na' ? x.scores[id].score : s;
  })[0].final);
  const ra = perRun(a), rb = perRun(b);
  const lead = ta.final >= tb.final ? 0 : 1;
  let wins = 0;
  for (const x of ra) for (const y of rb) wins += lead === 0 ? (x > y ? 1 : x === y ? 0.5 : 0) : (y > x ? 1 : x === y ? 0.5 : 0);
  const share = wins / (ra.length * rb.length);
  const leader = videos[lead].label, other = videos[1 - lead].label;
  const margin = Math.abs(ta.final - tb.final);
  let level = share >= VERDICT.clear ? 'clear' : share >= VERDICT.likely ? 'likely' : 'too close';
  let tie = null;
  if (level === 'too close' && pairs.length >= 2) {
    const picks = pairs.map((p) => (p.overall === 'first' ? p.first : p.overall === 'second' ? p.second : null));
    tie = { picks, winner: picks[0] && picks.every((x) => x === picks[0]) ? picks[0] : null };
    level = tie.winner ? 'tie-break' : 'tie';
  }
  const winner = level === 'clear' || level === 'likely' ? leader : level === 'tie-break' ? tie.winner : null;
  return { leader, other, winner, level, share, wins, pairs: ra.length * rb.length, margin, runTotals: { [a.label]: ra, [b.label]: rb }, tie };
}

function note(runs, id, want) {
  // the words of a judge whose score sits on the side of the median the learning is about
  for (const r of runs) {
    const c = r.checks[id];
    const text = want === 'works' ? c.works : c.fix;
    if (text) return { text, evidence: c.evidence?.[0] };
  }
  const c = runs.find((r) => r.checks[id].evidence?.length)?.checks[id];
  return c ? { text: c.evidence[0].note, evidence: c.evidence[0] } : null;
}

/** What `from` does better than `to`, check by check, biggest gap first. */
export function learnings(from, to, common) {
  const out = [];
  for (const k of CHECKS) {
    if (!common.has(k.id)) continue;
    const a = from.scores[k.id].score, b = to.scores[k.id].score;
    if (a - b < 0.5) continue;
    const item = { id: k.id, name: k.name, gap: pointsOf(k, a - b), from: a, to: b };
    if (k.by === 'judge') {
      const higher = from.runs.filter((r) => r.checks[k.id].score !== 'na' && r.checks[k.id].score >= a);
      const lower = to.runs.filter((r) => r.checks[k.id].score !== 'na' && r.checks[k.id].score <= b);
      item.does = note(higher.length ? higher : from.runs, k.id, 'works');
      item.instead = note(lower.length ? lower : to.runs, k.id, 'fix');
    } else {
      item.does = { text: from.scores[k.id].value ?? from.scores[k.id].note };
      item.instead = { text: to.scores[k.id].value ?? to.scores[k.id].note };
    }
    out.push(item);
  }
  return out.sort((x, y) => y.gap - x.gap);
}

const cite = (label, e) => (e?.t ? ` (${e.t}, \`${label}/${e.file}\`)` : '');

function reportText(run, videos, common, sums, v, leftOut, mine) {
  const L = videos.map((x) => x.label);
  const out = ['# Video judgement', '', `| | ${L.join(' | ')} |`, `|---|${L.map(() => '---|').join('')}`];
  out.push(`| Video | ${videos.map((x) => `\`${path.basename(x.file)}\`${x.label === mine ? ' (yours)' : ''}`).join(' | ')} |`);
  out.push(`| Judges | ${videos.map((x) => `${x.runs.length}${x.bad.length ? ` (${x.bad.length} left out)` : ''}`).join(' | ')} |`);
  if (videos.some((x) => x.listen)) out.push(`| Listener | ${videos.map((x) => (x.listen ? `${x.listen.listener ?? 'someone'}${x.listen.madeOne ? ', who made one of the videos' : ''}` : 'none')).join(' | ')} |`);
  out.push('');
  if (v) {
    const name = (l) => `${l} (\`${path.basename(videos.find((x) => x.label === l).file)}\`)`;
    const s = Object.fromEntries(videos.map((x, i) => [x.label, sums[i].final]));
    out.push(v.winner
      ? `**${name(v.winner)} is better**, ${one(Math.round(s[v.winner] * 10) / 10)} to ${one(Math.round(s[v.winner === v.leader ? v.other : v.leader] * 10) / 10)}: ${v.level === 'clear' ? `clear, its judges' totals beat the other's in all ${v.pairs} pairs` : v.level === 'likely' ? `likely, its judges' totals beat the other's in ${one(v.wins)} of ${v.pairs} pairs` : 'too close on points; both side-by-side judges picked it'}.`
      : v.level === 'tie' ? `**A tie.** ${one(Math.round(v.margin * 10) / 10)} points apart, and the side-by-side judges did not agree.` : `**Too close to call on points**: ${v.leader} leads by ${v.margin.toFixed(1)}, but its judges' totals beat the other's in only ${one(v.wins)} of ${v.pairs} pairs. Run the side-by-side tie-break.`, '');
  }
  out.push('## Scores', '', `| Group | Points | ${L.join(' | ')} |`, `|---|---:|${L.map(() => '---:|').join('')}`);
  CATEGORIES.forEach((c, i) => { if (sums[0].groups[i].possible) out.push(`| ${c.name} | ${sums[0].groups[i].possible} | ${sums.map((s) => one(s.groups[i].earned)).join(' | ')} |`); });
  out.push(`| **Total, out of 100** | ${sums[0].possible} | ${sums.map((s) => `**${s.total.toFixed(1)}**`).join(' | ')} |`);
  out.push(`| Critical defects | | ${videos.map((x, i) => (x.criticals.length ? `${x.criticals.length} (-${sums[i].off})` : '0')).join(' | ')} |`);
  out.push(`| **Final** | | ${sums.map((s) => `**${s.final.toFixed(1)}**`).join(' | ')} |`, '');
  if (leftOut.length) out.push(`Left out of every total (${leftOut.reduce((s, x) => s + byId[x.id].weight, 0)} points), so the videos are scored on the same checks: ${leftOut.map((x) => `${x.id} ${byId[x.id].name} (${x.why})`).join('; ')}. The total is out of 100 over the rest.`, '');
  if (videos.length === 2) {
    const diffs = CHECKS.filter((k) => common.has(k.id)).map((k) => ({ k, d: pointsOf(k, videos[0].scores[k.id].score - videos[1].scores[k.id].score) })).filter((x) => Math.abs(x.d) >= 0.5).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 8);
    if (diffs.length) {
      out.push('## Where they differ most', '');
      for (const { k, d } of diffs) out.push(`- **${k.id} ${k.name}**: ${d > 0 ? L[0] : L[1]} ahead by ${one(Math.abs(d))} of ${k.weight} points (${L.map((l, i) => `${l} ${one(videos[i].scores[k.id].score)}`).join(', ')}).`);
      out.push('');
    }
  }
  out.push('## The message each video left', '');
  for (const x of videos) out.push(`- ${x.label}: ${x.runs.map((r) => `"${r.message ?? '-'}"`).join(' / ')}`);
  out.push('');
  if (videos.some((x) => x.criticals.length)) {
    out.push('## Critical defects', '');
    for (const x of videos) for (const c of x.criticals) out.push(`- ${x.label} at ${c.t}, ${c.kind} (seen by ${c.seenBy} judges): ${c.note}${cite(x.label, c)}`);
    out.push('');
  }
  const unstable = videos.flatMap((x) => JUDGED.filter((k) => { const s = (x.scores[k.id].runs ?? []).filter((n) => n !== 'na'); return s.includes(0) && s.includes(2); }).map((k) => `${x.label} ${k.id}`));
  if (unstable.length) out.push(`Judges disagreed from 0 to 2 on: ${unstable.join(', ')}. Read those checks in the table before relying on them.`, '');
  out.push('## Every check', '', `| Check | Points | ${L.map((l) => `${l} score | ${l} points`).join(' | ')} |`, `|---|---:|${L.map(() => '---:|---:|').join('')}`);
  for (const k of CHECKS) {
    const cells = videos.map((x) => {
      const s = x.scores[k.id];
      const shown = s.score === null ? 'na' : `${one(s.score)}${s.runs ? ` (${s.runs.join(', ')})` : s.value ? ` (${s.value})` : ''}`;
      return `${shown} | ${common.has(k.id) ? one(pointsOf(k, s.score)) : '-'}`;
    });
    out.push(`| ${k.id} ${k.name} | ${k.weight} | ${cells.join(' | ')} |`);
  }
  out.push('');
  const bad = videos.flatMap((x) => x.bad.map((b) => `- ${x.label}, \`${b.file}\`: ${b.problems.join('; ')}`));
  if (bad.length) out.push('## Judge files left out', '', ...bad, '');
  if (v?.tie) out.push('## Tie-break', '', `Side by side, in each order: ${v.tie.picks.map((p) => p ?? 'same').join(' and ')}.`, '');
  out.push(`Files: \`report.md\`, \`learnings.md\`, \`report.json\` in \`${run}\`.`, '');
  return out.join('\n');
}

function learningsText(videos, common, mine) {
  if (videos.length < 2) {
    const [x] = videos;
    const lost = CHECKS.filter((k) => common.has(k.id) && x.scores[k.id].score < 2).map((k) => ({ k, lost: pointsOf(k, 2 - x.scores[k.id].score) })).sort((p, q) => q.lost - p.lost);
    const out = ['# Learnings', '', 'Where the video loses points, most first: what would earn the next score, and where.', ''];
    for (const { k, lost: l } of lost) {
      const s = x.scores[k.id];
      const fix = k.by === 'judge' ? note(x.runs.filter((r) => r.checks[k.id].score !== 'na' && r.checks[k.id].score <= s.score), k.id, 'fix') : { text: `${s.value ?? s.note ?? ''}. ${k.ask}` };
      out.push(`- **${k.id} ${k.name}**, ${one(l)} point${l === 1 ? '' : 's'} lost (score ${one(s.score)}): ${fix?.text ?? '-'}${cite(x.label, fix?.evidence)}`);
    }
    if (!lost.length) out.push('It scored 2 on every check.');
    return `${out.join('\n')}\n`;
  }
  const out = ['# Learnings', '', 'What each video does better than the other, check by check, biggest gap in points first. Each line says what the stronger one does and where, then what the other did instead.', ''];
  const order = mine ? [videos.find((x) => x.label !== mine), videos.find((x) => x.label === mine)] : videos;
  for (const [i, from] of order.entries()) {
    const to = order[1 - i];
    const title = mine ? (from.label === mine ? `What the other video can take from yours (${from.label})` : `What to take from the other video (${from.label}) into yours (${to.label})`) : `What ${from.label} does better (for ${to.label})`;
    const items = learnings(from, to, common);
    out.push(`## ${title}`, '');
    if (!items.length) { out.push('Nothing: it is level or behind on every check.', ''); continue; }
    for (const it of items) {
      out.push(`### ${it.id} ${it.name}: ${one(it.gap)} point${it.gap === 1 ? '' : 's'} ahead (${one(it.from)} against ${one(it.to)})`, '');
      if (it.does) out.push(`- ${from.label}: ${it.does.text}${cite(from.label, it.does.evidence)}`);
      if (it.instead) out.push(`- ${to.label}: ${it.instead.text}${cite(to.label, it.instead.evidence)}`);
      out.push('');
    }
  }
  const both = CHECKS.filter((k) => k.by === 'judge' && common.has(k.id) && videos.every((x) => x.scores[k.id].score <= 1));
  if (both.length) {
    out.push('## Neither does well yet', '');
    for (const k of both) out.push(`- **${k.id} ${k.name}**: ${videos.map((x) => `${x.label}: ${note(x.runs, k.id, 'fix')?.text ?? '-'}`).join(' ')}`);
    out.push('');
  }
  return out.join('\n');
}

export function load(run) {
  const key = JSON.parse(fs.readFileSync(path.join(run, 'key.json'), 'utf8'));
  const brief = fs.readFileSync(path.join(run, 'brief.md'), 'utf8');
  const target = targetLength(brief);
  const dir = path.join(run, 'judge');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const videos = Object.entries(key.videos).sort(([a], [b]) => a.localeCompare(b)).map(([label, info]) => {
    const pack = path.join(run, label);
    const measures = JSON.parse(fs.readFileSync(path.join(pack, 'measures.json'), 'utf8'));
    const runs = [], bad = [];
    for (const f of files.filter((x) => new RegExp(`^${label}-\\d+\\.json$`).test(x)).sort()) {
      let j = null, p;
      try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); p = problems(j, label, pack, measures.duration); } catch (e) { p = [`is not valid JSON (${e.message})`]; }
      if (p.length) bad.push({ file: `judge/${f}`, problems: p }); else runs.push(j);
    }
    const lf = path.join(run, `listen-${label}.json`);
    const listen = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, 'utf8')) : null;
    return { label, file: info.file, pack, measures, runs, bad, listen };
  });
  const pairs = files.filter((x) => /^pair-\d+\.json$/.test(x)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return { key, target, videos, pairs };
}

export function score(run, { mine } = {}) {
  const { key, target, videos, pairs } = load(run);
  const short = videos.filter((x) => x.runs.length < 2);
  if (short.length) {
    const lines = short.map((x) => `${x.label} has ${x.runs.length} good judge file${x.runs.length === 1 ? '' : 's'} of the 2 it needs${x.bad.length ? `: ${x.bad.map((b) => `${b.file} ${b.problems.join('; ')}`).join(' | ')}` : ''}`);
    return { ok: false, message: lines.join('\n') };
  }
  for (const x of videos) {
    x.scores = scoreVideo({ measures: x.measures, target, runs: x.runs, listen: x.listen });
    x.criticals = agreedCriticals(x.runs);
  }
  const common = new Set(CHECKS.filter((k) => videos.every((x) => x.scores[k.id].score !== null)).map((k) => k.id));
  const leftOut = CHECKS.filter((k) => !common.has(k.id)).map((k) => ({ id: k.id, why: videos.map((x) => x.scores[k.id].why).find(Boolean) ?? 'not scored' }));
  const sums = totals(videos, common);
  const v = verdict(videos, common, pairs);
  const mineLabel = mine && (videos.find((x) => x.label === mine || path.resolve(x.file) === path.resolve(mine))?.label ?? null);
  fs.writeFileSync(path.join(run, 'report.md'), reportText(run, videos, common, sums, v, leftOut, mineLabel));
  fs.writeFileSync(path.join(run, 'learnings.md'), learningsText(videos, common, mineLabel));
  const json = {
    rubric: 1, transcript: key.transcript, verdict: v, leftOut,
    videos: videos.map((x, i) => ({ label: x.label, file: x.file, judges: x.runs.length, leftOutJudges: x.bad, total: sums[i].total, final: sums[i].final, criticals: x.criticals, groups: sums[i].groups, scores: x.scores, learnings: videos.length === 2 ? learnings(x, videos[1 - i], common) : [] })),
  };
  fs.writeFileSync(path.join(run, 'report.json'), `${JSON.stringify(json, null, 1)}\n`);
  return { ok: true, videos, sums, verdict: v, leftOut, mine: mineLabel };
}

function main() {
  const args = process.argv.slice(2);
  const run = args.find((a) => !a.startsWith('--'));
  const mine = args.includes('--mine') ? args[args.indexOf('--mine') + 1] : undefined;
  if (!run || !fs.existsSync(path.join(run, 'key.json'))) { console.error('usage: score.mjs <run dir> [--mine A|B|<video file>]'); process.exit(1); }
  const r = score(run, { mine });
  if (!r.ok) { console.error(r.message); process.exit(2); }
  const { videos, sums, verdict: v } = r;
  console.log(`| Group | ${videos.map((x) => x.label).join(' | ')} |`);
  CATEGORIES.forEach((c, i) => { if (sums[0].groups[i].possible) console.log(`| ${c.name} (${sums[0].groups[i].possible}) | ${sums.map((s) => one(s.groups[i].earned)).join(' | ')} |`); });
  console.log(`| Final | ${sums.map((s) => s.final.toFixed(1)).join(' | ')} |`);
  for (const x of videos) if (x.bad.length) console.log(`left out: ${x.bad.map((b) => `${b.file} (${b.problems.join('; ')})`).join(' | ')}`);
  if (v) {
    console.log(v.level === 'tie-break' ? `winner: ${v.winner} (tie-break: both side-by-side judges picked it; ${v.margin.toFixed(1)} points apart)`
      : v.winner ? `winner: ${v.winner} (${v.level}: its judges' totals beat the other's in ${one(v.wins)} of ${v.pairs} pairs)`
        : v.level === 'tie' ? 'a tie: the side-by-side judges did not agree' : `too close: ${v.leader} leads by ${v.margin.toFixed(1)}, run the tie-break`);
  }
  console.log(`report: ${path.join(run, 'report.md')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
