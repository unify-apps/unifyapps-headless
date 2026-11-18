// The orchestrator board, from <run>/board.json (formats.md "Board"):
//   { goal, platform, scope, publish, platformQueue, limits, finished,
//     jobs: [{ job, pages, issuesOpen, state, agent, attempt, since, lastFile, requestIds }] }
// written as board.md, and with --html as a self-contained board.html. Deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { missing, plural } from './output.mjs';
import { readJson, writeText } from './paths.mjs';

export const STATES = ['waiting', 'auditing', 'reproducing', 'building', 'queued for test', 'testing', 'reopened', 'platform', 'deploying', 'publish approval', 'object approval', 'passed', 'accepted', 'escalated'];
const COLUMNS = [['job', 'job'], ['pages', 'pages'], ['issuesOpen', 'issues open'], ['state', 'state'], ['agent', 'agent'], ['attempt', 'attempt'], ['since', 'since'], ['lastFile', 'last file']];

const cell = (value) => (Array.isArray(value) ? value.join(', ') : value ?? '—');
const escapeMd = (value) => String(cell(value)).replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
const escapeHtml = (value) => String(cell(value)).replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function boardCounts(jobs) {
  const byState = {};
  for (const job of jobs) byState[job.state ?? 'unknown'] = (byState[job.state ?? 'unknown'] ?? 0) + 1;
  const open = jobs.reduce((sum, job) => sum + (Number(job.issuesOpen) || 0), 0);
  return { jobs: jobs.length, issuesOpen: open, byState };
}

export function renderBoardMarkdown(board, runId) {
  const jobs = board.jobs ?? [];
  const counts = boardCounts(jobs);
  const lines = [`# Board — ${runId}${board.goal ? ` (${board.goal})` : ''}`, ''];
  lines.push(`- Jobs: ${counts.jobs} · issues open: ${counts.issuesOpen} · ${Object.entries(counts.byState).sort().map(([state, count]) => `${state} ${count}`).join(' · ') || 'none'}`);
  if (board.publish) lines.push(`- Publish: ${board.publish}`);
  if (board.platformQueue != null) lines.push(`- Platform queue: ${board.platformQueue}`);
  lines.push('', `| ${COLUMNS.map(([, title]) => title).join(' | ')} |`, `|${COLUMNS.map(() => '---').join('|')}|`);
  for (const job of jobs) lines.push(`| ${COLUMNS.map(([key]) => escapeMd(job[key])).join(' | ')} |`);
  return `${lines.join('\n')}\n`;
}

export function renderBoardHtml(board, runId) {
  const jobs = board.jobs ?? [];
  const counts = boardCounts(jobs);
  const head = COLUMNS.map(([, title]) => `<th>${escapeHtml(title)}</th>`).join('');
  const body = jobs.map((job) => `<tr>${COLUMNS.map(([key]) => `<td${key === 'state' ? ` data-state="${escapeHtml(job.state)}"` : ''}>${escapeHtml(job[key])}</td>`).join('')}</tr>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loops board</title>
<style>
:root{color-scheme:light;--page:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;--line:#e1e0d9;--good:#0ca30c;--warn:#fab219;--bad:#d03b3b}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink-2:#c3c2b7;--line:#2c2c2a}}
:root[data-theme="dark"]{color-scheme:dark;--page:#0d0d0d;--surface:#1a1a19;--ink:#fff;--ink-2:#c3c2b7;--line:#2c2c2a}
body{margin:0;padding:24px 16px;background:var(--page);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}p{color:var(--ink-2);margin:0 0 16px}
.wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px}
td[data-state="passed"],td[data-state="accepted"]{color:var(--good)}td[data-state="reopened"],td[data-state="escalated"]{color:var(--bad)}
</style></head><body><main>
<h1>Board — ${escapeHtml(runId)}${board.goal ? ` (${escapeHtml(board.goal)})` : ''}</h1>
<p>${counts.jobs} jobs · ${counts.issuesOpen} issues open · ${Object.entries(counts.byState).sort().map(([state, count]) => `${escapeHtml(state)} ${count}`).join(' · ')}${board.publish ? ` · publish: ${escapeHtml(board.publish)}` : ''}</p>
<div class="wrap"><table><thead><tr>${head}</tr></thead><tbody>
${body}
</tbody></table></div></main></body></html>
`;
}

export function renderBoard({ run, html = false }) {
  const file = path.join(run.dir, 'board.json');
  if (!fs.existsSync(file)) throw missing(`no board.json in ${run.dir} (the orchestrator writes it after every event)`);
  const board = readJson(file);
  if (!board || !Array.isArray(board.jobs)) throw missing(`${file} has no jobs[]`);
  const markdown = renderBoardMarkdown(board, run.id);
  writeText(path.join(run.dir, 'board.md'), markdown);
  const out = { markdown: path.join(run.dir, 'board.md') };
  if (html) {
    out.html = path.join(run.dir, 'board.html');
    writeText(out.html, renderBoardHtml(board, run.id));
  }
  const counts = boardCounts(board.jobs);
  return { data: { ...out, counts }, text: html ? `Board: ${out.html}\n${plural(counts.jobs, 'job')}, ${plural(counts.issuesOpen, 'issue')} open.` : markdown.trimEnd() };
}
