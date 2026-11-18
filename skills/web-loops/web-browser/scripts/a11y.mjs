#!/usr/bin/env node
// Accessibility of a WEB page: accessible names of buttons, links and images (from the
// accessibility snapshot), form labels, text contrast (WCAG AA), heading order and ARIA used
// wrongly (from the DOM). Drives UnifyApps Headless's browser (app-verify's browser.mjs) and prints issues.
// Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BLOCK_OF_ELEMENT, evalIn, evalOn, snapshot } from './lib/driver.mjs';
import { collectA11y } from './lib/collectors.mjs';
import { parseSnapshot } from './lib/snapshot.mjs';
import { a11yFindings, refsToResolve } from './lib/a11y.mjs';
import { evidencePath } from './lib/issues.mjs';
import { COMMON_HELP, COMMON_OPTIONS, browserLine, finish, main, preparePage, readCommon, writeEvidence } from './lib/cli.mjs';

const HELP = `Usage:
  node a11y.mjs --browser <folder> --out-dir <dir> [--url <preview url>] [--width 1440] [--max-refs 30] [common flags]

Reads the page's accessibility snapshot and its DOM, then writes issues (check a11y, code AY):
  W7 a control or image with no accessible name · W8 a field with no label (placeholder only is
  minor) · W9 text contrast under WCAG AA (4.5:1, 3:1 for large text) · W10 a skipped heading
  level · W11 ARIA used wrongly (no such role, a widget the keyboard cannot reach, aria-hidden
  over focusable content, a control inside a control, a clickable element with no role)
Evidence: <out-dir>/a11y-<width>.snapshot.yml and a11y-<width>.json. Repeats of one problem on
one page fold into one issue that counts them.

${COMMON_HELP}`;

export async function runA11y(argv, { env = process.env } = {}) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, options: { ...COMMON_OPTIONS, 'max-refs': { type: 'string' } } });
  if (values.help) return { help: HELP };
  const common = readCommon(values, { defaultCheck: 'a11y' });
  const maxRefs = values['max-refs'] ? Number(values['max-refs']) : 30;
  const prepared = preparePage(common, { env });
  const { folder } = common;
  const label = common.width ?? 'current';

  const text = snapshot(folder, `a11y-${label}.snapshot.yml`, { env });
  fs.mkdirSync(common.outDir, { recursive: true });
  const snapshotFile = path.join(common.outDir, `a11y-${label}.snapshot.yml`);
  fs.writeFileSync(snapshotFile, text);
  const nodes = parseSnapshot(text);

  // Snapshot findings carry a ref, not a block: ask the page which block each ref is in.
  const refBlocks = new Map();
  const refs = refsToResolve(nodes);
  for (const ref of refs.slice(0, maxRefs)) {
    try { refBlocks.set(ref, evalOn(folder, BLOCK_OF_ELEMENT, ref, { env })); } catch { /* the ref went stale: the issue keeps the ref */ }
  }
  const dom = evalIn(folder, collectA11y, {}, { env });
  const evidence = writeEvidence(common, `a11y-${label}.json`, { width: common.width, opened: prepared.opened, setWidth: prepared.width, refBlocks: Object.fromEntries(refBlocks), dom });
  const result = a11yFindings({ nodes, dom, refBlocks, evidence: { snapshot: evidencePath(snapshotFile, common.run), dom: evidence.rel } });
  const notes = [...result.notes];
  if (refs.length > maxRefs) notes.push(`${refs.length - maxRefs} snapshot findings kept their ref without a block id (--max-refs)`);
  return finish(common, {
    findings: result.findings, notes, title: `Issues — ${common.check} (WEB a11y) · ${common.page.name ?? common.page.id ?? 'page'} @ ${label}`,
    browserLine: browserLine(prepared, common.width), opened: prepared.opened,
    extra: { evidence: [evidencePath(snapshotFile, common.run), evidence.rel], checked: result.counts, width: prepared.width },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runA11y(process.argv.slice(2))));
}
