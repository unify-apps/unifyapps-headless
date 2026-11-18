#!/usr/bin/env node
// Compares a WEB page's measured.json with its design spec at the same width: native-visual-check's
// match and gap rows at ±2 px, typography, colours and radii judged from computed styles. Writes
// gaps.json and, when asked, the issues and the HTML report. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { markdownTable, parseAccept, summaryLine } from '../../../native-loops/native-visual-check/scripts/gap-table.mjs';
import { assertSpec, assertMeasured, blocksFrom, outlineNodes, readJson, writeJson } from '../../../native-loops/native-visual-check/scripts/lib/schemas.mjs';
import { counts, displayNamesFrom, evidencePath, numberIssues, pageCell, writeOutputs } from '../../web-browser/scripts/lib/issues.mjs';
import { specPath, gapFindings, webGaps, WEB_TOLERANCE } from './lib/gaps.mjs';

const HELP = `Usage:
  node gap-table.mjs (--spec <file> | --store <design/<app-id>> --screen <screen> --width <px>)
      --measured <pass>/measured.json --out <pass>/gaps.json
      [--blocks blocks.json] [--outline outline.json] [--verdicts visual-verdicts.json] [--accept "7:<words>"]...
      [--regions a,b] [--tolerance 2] [--pass n] [--max-passes n] [--page-name N] [--page-id e_…]
      [--issues-json issues.json] [--issues issues.md] [--group 1] [--start 1] [--run <run folder>]
      [--report pass-report.html [--figma <design picture.png>]] [--json]

The spec of a WEB screen is one per width: <store>/specs/<screen>@<width>.json
(loops.design.spec/1, device.widthPt = the width, every value in CSS px). Rows are native-visual-check's
(w, h, gaps, insets, centring, text, fill, visual) at ±2 px; fontSize, lineHeight, fontWeight, color,
letterSpacing and radius are judged from the computed style (judge "computed"), the block config kept
as "config". Open rows become issues (check ui, code UI): missing and off by more than 4 px are
major, within 4 px minor, extra text minor.
Exit codes: 0 verdict match, 4 verdict off, 1 error, 2 usage.`;

export async function runGapTable(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      spec: { type: 'string' }, store: { type: 'string' }, screen: { type: 'string' }, width: { type: 'string' }, measured: { type: 'string' }, out: { type: 'string' },
      blocks: { type: 'string' }, outline: { type: 'string' }, verdicts: { type: 'string' }, accept: { type: 'string', multiple: true }, regions: { type: 'string' },
      tolerance: { type: 'string' }, pass: { type: 'string', default: '1' }, 'max-passes': { type: 'string' }, 'page-name': { type: 'string' }, 'page-id': { type: 'string' },
      'issues-json': { type: 'string' }, issues: { type: 'string' }, group: { type: 'string', default: '1' }, start: { type: 'string', default: '1' }, run: { type: 'string' },
      report: { type: 'string' }, figma: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) return { code: 0, text: HELP };
  const specFile = values.spec ?? (values.store && values.screen && values.width ? specPath(values.store, values.screen, values.width) : null);
  if (!specFile || !values.measured || !values.out) return { code: 2, text: 'gap-table needs --spec (or --store, --screen and --width), --measured and --out. Run with --help.' };
  if (!fs.existsSync(specFile)) return { code: 1, text: `no spec at ${specFile}: the design store holds one per width for a WEB screen (specs/<screen>@<width>.json); a width with no spec is not compared` };
  const spec = assertSpec(readJson(specFile));
  const measured = assertMeasured(readJson(values.measured));
  const notes = [];
  const width = measured.device?.screen?.w;
  if (spec.device?.widthPt && width && Math.abs(spec.device.widthPt - Number(String(measured.device.model).replace(/\D+/gu, '') || width)) > 1) {
    notes.push(`the spec is for a ${spec.device.widthPt}px wide screen and the page was measured at ${measured.device.model}`);
  }
  const blocksJson = values.blocks ? readJson(values.blocks) : null;
  const tolerance = { ...WEB_TOLERANCE, ...(values.tolerance ? { pt: Number(values.tolerance) } : {}) };
  const gaps = webGaps({
    spec, measured, blocks: blocksJson ? blocksFrom(blocksJson) : [], outline: values.outline ? outlineNodes(readJson(values.outline)) : [],
    verdicts: values.verdicts ? readJson(values.verdicts) : null, accept: parseAccept(values.accept ?? []),
    regions: values.regions ? values.regions.split(',').map((item) => item.trim()).filter(Boolean) : null, tolerance, pass: Number(values.pass),
  });
  gaps.notes = notes;
  writeJson(values.out, gaps);
  const written = { gaps: values.out };
  const run = values.run ? path.resolve(values.run) : null;
  const findings = gapFindings(gaps, { evidence: evidencePath(path.resolve(values.out), run), specFile: path.basename(specFile), spec });
  const page = { name: values['page-name'] ?? spec.page?.name ?? null, id: values['page-id'] ?? spec.page?.id ?? null };
  const issues = numberIssues(findings, { check: 'ui', code: 'UI', group: values.group, start: Number(values.start), page, displayNames: blocksJson ? displayNamesFrom(blocksJson) : new Map() });
  Object.assign(written, writeOutputs({
    issues, page: pageCell(page), json: values['issues-json'] ?? null, md: values.issues ?? null, title: `Issues — ui (WEB visual check, pass ${gaps.pass}) · ${spec.page?.name ?? 'page'} @ ${width ?? '?'}px`,
    header: [['Stage', 'UI check, visual check (WEB)'], ['Browser', `Chrome for Testing (UnifyApps Headless's browser) · preview route, saved draft · ${measured.device?.model ?? '?'}`], ['Design source', `${path.basename(specFile)} (${spec.device?.widthPt ?? '?'}px wide)`], ['Time', new Date().toISOString()]],
    notReached: notes,
  }));
  if (values.report) {
    try {
      const { writeReport } = await import('../../../native-loops/native-visual-check/scripts/lib/report.mjs');
      written.report = writeReport({ spec, measured, gaps, passDir: path.dirname(path.resolve(values.measured)), out: values.report, figmaPng: values.figma && fs.existsSync(values.figma) ? values.figma : null, link: false, regions: gaps.regions });
    } catch (error) { notes.push(`report not written: ${error.message}`); }
  }
  const line = summaryLine(gaps, { pageName: values['page-name'] ?? spec.page?.name ?? null, maxPasses: values['max-passes'] ? Number(values['max-passes']) : null });
  const summary = { ...written, summary: gaps.summary, line, issues: counts(issues), notes };
  return { code: gaps.summary.verdict === 'match' ? 0 : 4, text: values.json ? JSON.stringify(summary) : [line, markdownTable(gaps), ...Object.entries(written).map(([key, file]) => `${key}: ${file}`), ...notes].join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  runGapTable(process.argv.slice(2)).then(({ code, text }) => {
    (code === 0 || code === 4 ? process.stdout : process.stderr).write(`${text}\n`);
    process.exit(code);
  }, (error) => { process.stderr.write(`${error.message}\n`); process.exit(1); });
}
