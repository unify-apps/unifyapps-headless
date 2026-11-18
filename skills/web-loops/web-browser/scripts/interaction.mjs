#!/usr/bin/env node
// The interaction check, the WEB counterpart of the MOBILE touch feedback check: for every interactive element of a page (buttons,
// links, fields, clickable rows and cards), a hover look, a visible focus ring, a pointer cursor,
// keyboard reach and focus order. Drives UnifyApps Headless's browser (app-verify's browser.mjs) and prints
// issues. Node 22, no dependencies.
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { command, evalIn, probeTarget } from './lib/driver.mjs';
import { cleanup, installFocusLog, installHoverLog, readFocusLog, readHoverLog, surveyInteractive } from './lib/collectors.mjs';
import { interactionFindings, readFocusWalk } from './lib/interaction.mjs';
import { COMMON_HELP, COMMON_OPTIONS, UsageError, browserLine, finish, main, preparePage, readCommon, writeEvidence } from './lib/cli.mjs';

const HELP = `Usage:
  node interaction.mjs --browser <folder> --out-dir <dir> [--url <preview url>] [--width 1440]
      [--max 60] [--max-tabs 80] [--no-hover] [--no-keyboard] [--active] [common flags]

Marks every interactive element of the app (native controls, ARIA widget roles, tabindex ≥ 0, the
outermost cursor:pointer element), hovers each one and reads its look 250 ms later, then presses Tab
through the page and reads where focus lands and how it shows. Issues (check interaction, code PR):
  W1 no hover look · W2 no visible focus indicator · W3 no pointer cursor · W4 not reachable by
  keyboard, or a keyboard trap · W5 focus order against the reading order · W6 no pressed look (--active)
Evidence: <out-dir>/interaction-<width>.json (the survey, the hover log, the focus log).
Hover opens what opens on hover (menus, tooltips); nothing is clicked, so nothing is written.

${COMMON_HELP}`;

const FIELD_TAGS = new Set(['input', 'textarea', 'select']);

export async function runInteraction(argv, { env = process.env } = {}) {
  const { values } = parseArgs({
    args: argv, allowPositionals: false,
    options: { ...COMMON_OPTIONS, max: { type: 'string' }, 'max-tabs': { type: 'string' }, 'no-hover': { type: 'boolean' }, 'no-keyboard': { type: 'boolean' }, active: { type: 'boolean' } },
  });
  if (values.help) return { help: HELP };
  const common = readCommon(values, { defaultCheck: 'interaction' });
  const max = values.max ? Number(values.max) : 60;
  const maxTabs = values['max-tabs'] ? Number(values['max-tabs']) : 80;
  if (!(max > 0) || !(maxTabs > 0)) throw new UsageError('--max and --max-tabs take positive numbers');
  const prepared = preparePage(common, { env });
  const { folder } = common;

  // preparePage left the mouse in the window's bottom-right corner, off the controls, while resting looks are read.
  const corner = prepared.settle?.viewport ? [Math.max(0, prepared.settle.viewport.w - 2), Math.max(0, prepared.settle.viewport.h - 2)] : [0, 0];
  const survey = evalIn(folder, surveyInteractive, { max }, { env });
  const where = { inFrame: survey.inFrame, frameIndex: survey.frameIndex };

  const hoverFailed = [];
  let hoverLog = [];
  if (!values['no-hover']) {
    evalIn(folder, installHoverLog, {}, { env });
    for (const probe of survey.probes) {
      if (probe.disabled || FIELD_TAGS.has(probe.tag)) continue;
      const hovered = command(folder, ['hover', probeTarget(probe.n, where)], { env, check: false, timeoutMs: 30000 });
      if (hovered.status !== 0) {
        hoverFailed.push(probe.n);
        command(folder, ['press', 'Escape'], { env, check: false });
      }
    }
    command(folder, ['mousemove', ...corner], { env, check: false });
    hoverLog = evalIn(folder, readHoverLog, {}, { env });
  }

  let focusLog = [];
  let presses = 0;
  if (!values['no-keyboard']) {
    evalIn(folder, installFocusLog, {}, { env });
    const focusable = survey.probes.filter((probe) => probe.focusable && !probe.disabled).map((probe) => probe.n);
    const cap = Math.min(maxTabs, (survey.focusableInApp ?? focusable.length) + 20);
    while (presses < cap) {
      command(folder, ['press', 'Tab'], { env });
      presses++;
      if (presses % 10 === 0 || presses === cap) {
        focusLog = evalIn(folder, readFocusLog, {}, { env });
        const walk = readFocusWalk(focusLog, { presses, focusable });
        if (walk.complete || walk.stuck) break;
      }
    }
    focusLog = evalIn(folder, readFocusLog, {}, { env });
  }
  evalIn(folder, cleanup, {}, { env });

  const label = common.width ?? 'current';
  const evidence = writeEvidence(common, `interaction-${label}.json`, { width: common.width, opened: prepared.opened, setWidth: prepared.width, survey, hoverLog, hoverFailed, focusLog, presses });
  const result = interactionFindings({ survey, hoverLog, hoverFailed, focusLog, presses, evidence: (n) => `${evidence.rel}#n${n}`, active: Boolean(values.active) });
  const notes = [...result.notes];
  if (survey.truncated) notes.push(`${survey.found} interactive elements, the first ${max} checked (--max)`);
  if (hoverFailed.length) notes.push(`hover could not reach ${hoverFailed.length} element(s): n${hoverFailed.join(', n')} (covered by another element, or moved)`);
  return finish(common, {
    findings: result.findings, notes, title: `Issues — ${common.check} (WEB interaction) · ${common.page.name ?? common.page.id ?? 'page'} @ ${label}`,
    browserLine: browserLine(prepared, common.width), opened: prepared.opened,
    extra: { evidence: evidence.rel, probes: survey.probes.length, found: survey.found, walk: result.walk, width: prepared.width },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exit(await main(() => runInteraction(process.argv.slice(2))));
}
