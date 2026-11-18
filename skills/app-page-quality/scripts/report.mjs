/** Assembles and renders one page's audit report from its findings. */

function compareFindings(a, b) {
  if (a.severity !== b.severity) return a.severity === 'blocking' ? -1 : 1;
  if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
  return 0;
}

/**
 * `buildReport({ page, app, walk, findings, candidates, images, thresholds, onLoadSources, unprobed, errors }) → Report`.
 * `onLoadSources` is the caller's own `sourceFacts(context)` count (rules-data.mjs owns what "on
 * load" means); `thresholds` is accepted for signature stability but unused — every
 * threshold-driven decision is already baked into the findings' own severities by the time they
 * reach this module. `unreached` lists the blocks the page references that the walk never
 * reached, so no rule ran on them; `notes` the walk's structural notes (a block more than one
 * parent lists, a blockIds loop), which are not findings; `errors` each rule that threw, as
 * `{ rule, message }`, so the page was not fully audited.
 */
export function buildReport({ page, app, walk, findings, candidates, images, thresholds, onLoadSources = 0, unprobed = 0, errors = [] }) {
  void thresholds;
  const sorted = [...findings].sort(compareFindings);
  const blocking = sorted.filter(finding => finding.severity === 'blocking').length;
  const unreached = walk.unreached ?? [];
  const notes = walk.notes ?? [];
  return {
    page: { id: page?.id ?? null, name: page?.properties?.name ?? null, version: page?.version ?? null },
    app: { id: app?.id ?? null, appType: app?.properties?.manifest?.type ?? null },
    summary: {
      blocking, advisory: sorted.length - blocking, blocks: walk.order.length, onLoadSources, unprobed,
      unreached: unreached.length, notes: notes.length, errors: errors.length,
    },
    findings: sorted,
    candidates: candidates ?? { interactions: [], navigation: [], lists: [], writes: [], heavy: [], functionBound: [] },
    images: images ?? [],
    unreached,
    notes,
    errors,
  };
}

const UNREACHED_NAMED = 10;

/**
 * One line per finding, grouped under `Blocking (n)` and `Advisory (n)`; the advisory heading adds
 * `Unprobed (n)` when images could not be measured. A rule that threw opens the report with a
 * `Not fully audited` line, a page the walk did not reach whole with a `Partly audited` line
 * naming the blocks it missed, and each walk note follows as a `Note:` line.
 */
export function renderReport(report) {
  const lines = [];
  for (const error of report.errors ?? []) lines.push(`Not fully audited: ${error.rule} failed: ${error.message}`);
  const unreached = report.unreached ?? [];
  if (unreached.length > 0) {
    const named = unreached.slice(0, UNREACHED_NAMED).join(', ') + (unreached.length > UNREACHED_NAMED ? ', …' : '');
    const one = unreached.length === 1;
    lines.push(`Partly audited: ${unreached.length} block${one ? '' : 's'} the page references ${one ? 'was' : 'were'} never reached, so no rule checked ${one ? 'it' : 'them'}: ${named}`);
  }
  for (const note of report.notes ?? []) lines.push(`Note: ${note.detail}`);
  const render = (title, list, suffix = '') => {
    lines.push(`${title} (${list.length})${suffix}`);
    for (const finding of list) {
      lines.push(`${finding.severity} ${finding.rule} ${finding.blockName} [${finding.blockId}] ${finding.path}: ${finding.detail} → ${finding.fix}`);
    }
  };
  render('Blocking', report.findings.filter(finding => finding.severity === 'blocking'));
  const unprobed = report.summary.unprobed ? ` · Unprobed (${report.summary.unprobed})` : '';
  render('Advisory', report.findings.filter(finding => finding.severity === 'advisory'), unprobed);
  return lines.join('\n');
}
