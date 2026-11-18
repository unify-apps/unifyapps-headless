// The config review report as Markdown, for the person who built the app: verdict first, then
// the scorecard, what to fix in order, and each finding with its rule, evidence and confidence.

const VERDICT = {
  'block-before-ship': 'Block before ship',
  'polish-before-ship': 'Polish before ship',
  'not-evaluable': 'Not evaluable',
  ready: 'Ready',
};
const SOURCE = { platform: "the platform's checks", script: 'the rule script', reviewer: 'the reviewer' };

const pageName = page => page?.label ?? page?.name ?? 'the app';
function spread(places) {
  const byPage = new Map();
  for (const place of places) byPage.set(pageName(place.page), (byPage.get(pageName(place.page)) ?? 0) + 1);
  const top = [...byPage].sort((left, right) => right[1] - left[1]);
  const named = top.slice(0, 4).map(([name, count]) => `${name} (${count})`).join(', ');
  return `${places.length} places on ${byPage.size} page${byPage.size === 1 ? '' : 's'}: ${named}${top.length > 4 ? `, ${top.length - 4} more` : ''}`;
}
const single = item => [item.page?.label ?? item.page?.name, item.target?.name && item.target.name !== item.page?.name ? `${item.target.kind} \`${item.target.name}\`` : null].filter(Boolean).join(', ') || 'the app';
const where = item => (item.places ? spread(item.places) : single(item));
const evidence = item => (item.places ? `${item.evidence} (the first of ${item.places.length}; report.json lists each)` : item.evidence);
const tags = item => [item.severity, `${item.confidence} confidence`, `found by ${SOURCE[item.source]}`,
  item.source === 'reviewer' ? (item.doubleChecked ? 'double-checked' : 'not double-checked') : null, item.rule ? null : 'outside the rulebook', item.new === true ? 'new' : null].filter(Boolean).join(' · ');
const cell = text => String(text ?? '').replace(/\|/gu, '\\|').replace(/\s+/gu, ' ');

function card(item) {
  return [
    `### ${item.ref} · ${item.title}`,
    '',
    tags(item),
    '',
    `- **Where:** ${where(item)}${item.target?.id && item.target.id !== item.page?.id ? ` (\`${item.target.id}\`)` : ''}`,
    `- **Evidence:** ${evidence(item)}`,
    ...(item.fix ? [`- **Fix:** ${item.fix}`] : []),
    '',
  ];
}

const seconds = ms => (ms === null || ms === undefined ? '-' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// The numbers the reviewers judged against: what each automation the pages call took in its last
// runs, and how many records each object they read holds.
function runtimeLines(runtime) {
  if (!runtime || (!runtime.automations.length && !runtime.objects.length)) return [];
  const lines = ['', '## What the pages wait on'];
  if (runtime.automations.length) {
    lines.push('', '| Automation | Last runs | Median | Slowest | Not completed | Called by |', '|---|---|---|---|---|---|');
    // The name comes from the platform's check of the automation; one it could not check is named by the source that calls it.
    const named = entry => entry.name ?? (entry.sources?.[0]?.name ? `the automation behind ${entry.sources[0].name} (${entry.id})` : entry.id);
    for (const entry of runtime.automations) lines.push(`| ${cell(named(entry))} | ${entry.runs} | ${seconds(entry.medianMs)} | ${seconds(entry.maxMs)} | ${entry.failed} | ${cell(entry.pages.map(page => page.name).join(', '))} |`);
  }
  if (runtime.objects.length) {
    lines.push('', '| Object | Records | Read by |', '|---|---|---|');
    for (const entry of runtime.objects) lines.push(`| ${cell(entry.id)} | ${entry.records.toLocaleString('en-US')} | ${cell(entry.pages.map(page => page.name).join(', '))} |`);
  }
  return lines;
}

export function renderReport(report) {
  const { counts } = report;
  const reviewed = report.pages.filter(page => page.reviewed).length;
  const { average } = report.scores;
  const lines = [
    `# ${report.focus === 'perf' ? 'Speed review' : 'Config review'}: ${report.app.name}`,
    '',
    `**${VERDICT[report.verdict]}.** P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2} · P3 ${counts.P3}${report.places > report.findings.length ? `, found in ${report.places} places` : ''}`,
    '',
    `${report.pages.length} pages in scope (${report.scope}), ${reviewed} judged by the reviewer. ${report.app.type} app \`${report.app.id}\`.${average === null ? '' : ` Average platform page score ${average}.`} Run ${report.run}.`,
  ];
  if (report.scopeNote) lines.push('', report.scopeNote);
  if (report.reasons.length) lines.push('', 'Why it is not evaluable:', '', ...report.reasons.map(reason => `- ${reason}`));
  if (report.firstRun === false) lines.push('', 'Findings marked new were not in the last review of this app.');

  // Signs the app was built the wrong way come first: each one is a pattern to change, not one line to fix.
  const built = report.findings.filter(item => item.area === 'BUILD');
  if (built.length) {
    lines.push('', '## How it is built', '', 'Signs these pages will break quietly or be hard to change, even where every setting is valid.', '');
    for (const item of built) lines.push(`- ${item.severity} ${item.title} (${where(item)}) → ${item.ref}`);
  }

  lines.push('', '## Scorecard', '', '| Area | State | Rules checked | Findings |', '|---|---|---|---|');
  for (const row of report.scorecard) lines.push(`| ${row.name} | ${row.state} | ${row.checked} of ${row.rules} | ${row.findings.length ? row.findings.join(', ') : '-'} |`);

  const pages = report.pages.filter(page => page.intent?.summary);
  if (pages.length) {
    lines.push('', '## What each page is for', '', '| Page | Platform score | What it is for |', '|---|---|---|');
    for (const page of pages) lines.push(`| ${cell(page.label)} | ${page.score ?? '-'} | ${cell(page.intent.summary)} |`);
  }
  const loads = report.pages.filter(page => page.load);
  if (loads.length) {
    lines.push('', '## What runs when each page opens', '', '| Page | On open |', '|---|---|');
    for (const page of loads) lines.push(`| ${cell(page.label)} | ${cell(page.load)} |`);
  }
  lines.push(...runtimeLines(report.runtime));

  const blocking = report.findings.filter(item => item.severity === 'P0' || item.severity === 'P1');
  if (blocking.length) {
    lines.push('', '## Fix first', '');
    for (const item of blocking) lines.push(`- [ ] ${item.severity} ${item.title} (${where(item)}) → ${item.ref}`);
  }
  for (const severity of ['P0', 'P1']) {
    const own = report.findings.filter(item => item.severity === severity);
    if (own.length) lines.push('', `## ${severity} (${own.length})`, '', ...own.flatMap(card));
  }
  const minor = report.findings.filter(item => item.severity === 'P2' || item.severity === 'P3');
  if (minor.length) {
    lines.push('', `## P2 and P3 (${minor.length})`, '', '| Ref | Severity | Finding | Where | Evidence |', '|---|---|---|---|---|');
    for (const item of minor) lines.push(`| ${item.ref} | ${item.severity} | ${cell(item.title)} | ${cell(where(item))} | ${cell(evidence(item))} |`);
  }
  if (report.notVerified.length) {
    lines.push('', '## Not verified', '', ...report.notVerified.map(entry => `- ${entry.call ?? entry}: ${cell(entry.error ?? '')}`));
  }
  if (report.later.length) {
    lines.push('', '## Not judged by the reviewer in this run', '', `The platform checks and the rule script covered these pages; the reviewer did not. Run the review again on them: ${report.later.map(page => page.name).join(', ')}.`);
  }
  return `${lines.join('\n')}\n`;
}
