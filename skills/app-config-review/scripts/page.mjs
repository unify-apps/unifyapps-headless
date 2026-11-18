// The review as one web page for the people who fix the app: the verdict, what to fix first with
// its evidence and fix, then the rest, the pages read and what was not checked. Published as an
// artifact; report.md stays the file copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSecrets } from '../../../scripts/lib/redact-secrets.mjs';

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'report-page.html');

// Config quoted as evidence can hold a person's email or a phone or account number; a shared page keeps only enough to find it.
// A number counts when it has 10 or more digits, written plain or with spaces, dashes, dots or brackets
// (+1 415-555-0100, 4111 1111 1111 1111); an ISO date is not one.
const longNumber = match => {
  const digits = match.replace(/\D/gu, '');
  return digits.length >= 10 && !/^\d{4}-\d{2}-\d{2}/u.test(match) ? `${digits.slice(0, 2)}…${digits.slice(-2)}` : match;
};
export const scrub = text => String(text ?? '')
  .replace(/([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[a-z]{2,})/giu, (match, first, domain) => (domain.toLowerCase() === 'example.com' ? match : `${first}…@${domain}`))
  .replace(/(?<![\w+])(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d[\d .-]{6,}\d(?!\w)/gu, longNumber);

// Stored config ids (b_TcYhR, var_jYcSF, e_6ac7…) mean nothing in the builder, which shows names.
// report.json keeps them for the agent that fixes the app; the page shows the builder name from raw/names.json.
const ID = new RegExp(String.raw`\b(?:b|var|func|evt|act|ds|e)_[A-Za-z0-9]+\b`, 'gu');
export function named(text, names) {
  const source = String(text ?? '');
  let shown = '';
  let at = 0;
  for (const match of source.matchAll(ID)) {
    const name = names.get(match[0]);
    let start = match.index;
    let end = start + match[0].length;
    let swap = name ?? match[0];
    // Reviewers quote "ordersTable (b_x)"; with the id swapped that would read "ordersTable (ordersTable)".
    const before = source.slice(at, start);
    if (name && before.endsWith(`${name} (`) && source[end] === ')') [start, end, swap] = [start - 2, end + 1, ''];
    else if (name && before.endsWith(`${name} `)) [start, swap] = [start - 1, ''];
    shown += source.slice(at, start) + swap;
    at = end;
  }
  return shown + source.slice(at);
}

// The platform's check codes (CHECK_2, WF_CHECK_4) mean nothing to the people fixing the app; say the check instead.
const CHECK = /\b(?:WF_|AGENT_)?CHECK_\d+\b/gu;
const checkWords = findings => new Map(findings.filter(item => item.checkTitle)
  .map(item => [/^\S+(?=:)/u.exec(item.evidence ?? '')?.[0], item.title]).filter(([code]) => code));

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
// A target named like its page is the page itself.
const shownTarget = (target, page) => (target?.name && target.name !== page?.name ? target : null);
// A platform check's title is worth showing only when it says more than the rule it maps to.
const why = item => (item.checkTitle && item.checkTitle.toLowerCase() !== String(item.title).toLowerCase() ? item.checkTitle : null);
// The label of findings tied to no page; the template sorts and labels on it.
export const WHOLE_APP = 'The whole app';

/** What the page shows, from report.json: no rule keys, names in place of config ids, every quoted value scrubbed. */
export function pageData(report, { names: cached = {} } = {}) {
  const names = new Map(Object.entries(cached));
  for (const page of report.pages) if (/^e_/u.test(page.id)) names.set(page.id, page.label ?? page.name);
  // A page the plan never named (a module, a page out of scope) arrives with its id as its name.
  const pageName = page => scrub(page?.label ?? names.get(page?.id) ?? names.get(page?.name) ?? page?.name ?? WHOLE_APP);
  const checks = checkWords(report.findings);
  const say = text => scrub(named(redactSecrets(String(text ?? '')), names))
    .replace(CHECK, code => (checks.has(code) ? `check "${checks.get(code)}"` : 'check'));
  const sayClip = (text, max) => cut(say(text), max);
  const gapText = ({ call, error }) => [call, error].filter(Boolean).join(': ');
  const gaps = [...new Set([...report.reasons, ...report.notVerified.map(gapText)].filter(Boolean).map(text => cut(say(text), 300)))];
  return {
    app: { id: report.app.id, name: scrub(report.app.name).trim(), type: report.app.type },
    appPage: WHOLE_APP,
    run: report.run,
    verdict: report.verdict,
    counts: report.counts,
    places: report.places,
    pageCount: report.pages.length,
    score: report.scores?.average ?? null,
    pages: report.pages.filter(page => page.reviewed).map(page => ({ name: scrub(page.label ?? page.name), score: page.score, intent: page.intent?.summary ? say(page.intent.summary) : null })),
    later: report.later.map(page => scrub(page.name)),
    gaps,
    findings: report.findings.map(item => ({
      ref: item.ref,
      sev: item.severity,
      built: item.area === 'BUILD',
      title: sayClip(item.title, 240),
      source: item.source,
      confidence: item.confidence,
      checked: item.doubleChecked === true,
      isNew: item.new === true,
      page: item.places ? null : pageName(item.page),
      target: item.places || !shownTarget(item.target, item.page) ? null : say(`${item.target.kind} ${item.target.name}`),
      why: why(item) && say(why(item)),
      // A platform check's evidence is only its id and title.
      evidence: item.checkTitle ? null : sayClip(item.evidence, 500),
      fix: item.fix ? sayClip(item.fix, 500) : null,
      places: item.places?.map(place => [pageName(place.page), shownTarget(place.target, place.page) ? sayClip(place.target.name, 60) : '']) ?? null,
    })),
  };
}

export function renderPage(report, options) {
  const data = JSON.stringify(pageData(report, options)).replace(/</gu, '\\u003c');
  const title = `${scrub(report.app.name).trim().replace(/[<&]/gu, '')} ${report.focus === 'perf' ? 'speed review' : 'review'}`;
  // Functions, so a $' or __DATA__ in the app name is never read as a pattern.
  return fs.readFileSync(TEMPLATE, 'utf8')
    .replace('__DATA__', () => data)
    .replace('__TITLE__', () => title);
}
