// Turns the three sources of a config review into one list of findings with one shape:
// the platform's own verdicts, the rule-check script, and the reviewer agents.
//   { rule, area, severity, confidence, source, page, target, title, evidence, fix }
import { redactSecrets } from '../../../scripts/lib/redact-secrets.mjs';
import { findingKey } from '../../app-best-practices/scripts/rule-check.mjs';

const IMPACT = { critical: 'P1', medium: 'P2', low: 'P3' };
const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };
const SOURCE_ORDER = { reviewer: 0, script: 1, platform: 2 };
// A rule checked by a tool keeps the tool's exact evidence; a reviewer's copy of it lends only its fix.
const KEEP_ORDER = { platform: 0, script: 1, reviewer: 2 };

// get_page_warnings answers plain sentences; these are the guards it runs, by the rule each restates.
// Matched on wording: a warning the platform rewords keeps its text but loses its rule key.
const WARNING_RULES = [
  [/clears its own state|visibility condition hides/iu, 'state-lost-block-hidden-condition'],
  [/same-axis|virtuali[sz]ed|scrolling list inside/iu, 'list-nested-inside-list-scrolls'],
  [/array method|characters long \(over \d+\)|holds a function/iu, 'heavy-bindings-function-call-array'],
  [/executeScript|script action/iu, 'avoid-executescript-where-native-action'],
];


// A finding no rule names is matched on its area and target: a page reviewer and the app pass,
// which run side by side, describe the same defect in different words. With no target there is
// nothing to match on, so it stays apart.
const mergeKey = item => (item.rule ? findingKey(item) : `${item.area}|${item.target?.id ?? `${item.page?.id ?? 'app'}|${item.title}`}`);

function fromRule(rule, fields) {
  const { severity, confidence, title, fix, area, ...rest } = fields;
  return {
    ...rest,
    rule: rule?.id ?? null,
    area: rule?.area ?? area ?? 'INTENT',
    severity: severity ?? rule?.sev ?? 'P2',
    confidence: confidence ?? 'high',
    title: title ?? rule?.rule,
    fix: fix ?? null,
  };
}

/** The platform's verdicts, mapped to the rulebook rule each one restates. */
export function platformFindings(platform, rules, pagesById) {
  const byCheck = new Map();
  for (const rule of rules.values()) if (rule.check && !byCheck.has(rule.check)) byCheck.set(rule.check, rule);
  const pageOf = id => (pagesById.has(id) ? { id, name: pagesById.get(id) } : null);
  const out = [];
  for (const issue of platform.issues ?? []) {
    const rule = byCheck.get(issue.checkId);
    out.push(fromRule(rule, {
      source: 'platform',
      severity: rule?.sev ?? IMPACT[issue.checkImpact] ?? 'P2',
      title: rule?.rule ?? issue.checkTitle,
      page: pageOf(issue.entityId),
      target: { kind: issue.impactedEntityType, id: issue.impactedEntityId, name: issue.impactedEntityName },
      evidence: `${issue.checkId}: ${issue.checkTitle}`,
      checkTitle: issue.checkTitle,
    }));
  }
  for (const entry of platform.warnings ?? []) {
    for (const warning of entry.warnings ?? []) {
      const text = typeof warning === 'string' ? warning : warning?.message ?? JSON.stringify(warning);
      const ruleId = WARNING_RULES.find(([pattern]) => pattern.test(text))?.[1];
      // Most warnings open with the block they are about: "'b_dBQj3' (Typography) content.value has …".
      const block = /^'(\w+)' \((\w+)\)/u.exec(text);
      const target = block ? { kind: 'block', id: block[1], name: `${block[2]} ${block[1]}` } : { kind: 'page', id: entry.pageId, name: entry.name };
      out.push(fromRule(rules.get(ruleId), { source: 'platform', title: ruleId ? undefined : text, page: pageOf(entry.pageId), target, evidence: text }));
    }
  }
  for (const problem of platform.pathProblems ?? []) {
    const named = /'(e_[\w-]+)'/u.exec(problem.detail ?? '')?.[1];
    // The global page holds app-wide state and never has an address, so the route tree not placing it is no problem.
    if (named?.startsWith('e_global_')) continue;
    const page = named ? pageOf(named) ?? { id: named, name: named } : null;
    out.push(fromRule(rules.get('page-route-tree-has-problems'), { source: 'platform', title: `The route tree reports ${problem.kind.replace(/-/gu, ' ')}`, page, target: page ? { kind: 'page', id: page.id, name: page.name } : { kind: 'navigation', id: problem.kind, name: 'page addresses' }, evidence: `${problem.kind}: ${problem.detail ?? ''}` }));
  }
  for (const entry of platform.danglingRefs ?? []) {
    for (const ref of entry.danglingRefs) {
      const text = typeof ref === 'string' ? ref : JSON.stringify(ref);
      out.push(fromRule(rules.get('dangling-references-dependency-graph'), { source: 'platform', title: 'A reference in the dependency graph names nothing', page: pageOf(entry.pageId), target: { kind: 'page', id: entry.pageId, name: pagesById.get(entry.pageId) ?? entry.pageId }, evidence: `dangling reference ${text.slice(0, 200)}` }));
    }
  }
  return out;
}

/**
 * The failing checks of the automations the pages call, one per check and node. An automation
 * belongs to no one page, so the finding names the automation and, in its evidence, the pages that wait on it.
 */
export function automationFindings(platform, rules) {
  const byCheck = new Map([...rules.values()].filter(rule => rule.check).map(rule => [rule.check, rule]));
  return (platform.workflowIssues ?? []).map(row => {
    const rule = byCheck.get(row.checkId);
    const callers = (row.pages ?? []).map(page => page.name).join(', ');
    return fromRule(rule, {
      source: 'platform',
      area: 'AUTO',
      severity: rule?.sev ?? IMPACT[row.checkImpact] ?? 'P2',
      title: rule?.rule ?? row.checkTitle,
      page: null,
      target: { kind: 'automation node', id: row.impactedEntityId, name: `${row.impactedEntityName ?? row.impactedEntityId} in ${row.automationName}` },
      evidence: `${row.checkTitle ?? row.checkId} on ${row.automationName} (${row.automationId})${callers ? `, which ${callers} call` : ''}`,
      fix: row.checkDescription ?? null,
      category: row.checkCategory ?? null,
    });
  });
}

export function scriptFindings(script, rules) {
  return (script.findings ?? []).map(item => fromRule(rules.get(item.rule), { ...item, source: 'script' }));
}

const pick = (value, allowed) => (Object.hasOwn(allowed, value) ? value : undefined);
const text = value => (typeof value === 'string' && value ? redactSecrets(value) : undefined);
const ref = value => (value && typeof value === 'object' && typeof value.id === 'string' ? { kind: value.kind, id: value.id, name: value.name } : null);
// The app pass names a finding's page itself; a finding on the app as a whole has none.
const pageOfReview = (item, review) => ref(item.page) ?? (review.page?.id === 'app' ? null : ref(review.page));

/**
 * A reviewer's findings, after the second model's check when it ran. A reviewer's file is model
 * output: only the known fields are kept, an unknown severity or confidence falls back to the
 * rule's, and any secret the evidence quotes from the config is masked.
 */
export function reviewerFindings(review, rules) {
  return (review?.findings ?? []).map(item => {
    const rule = item.rule ? rules.get(item.rule) : null;
    return fromRule(rule, {
      source: 'reviewer',
      area: typeof item.area === 'string' ? item.area : undefined,
      severity: pick(item.severity, SEVERITY_ORDER),
      confidence: pick(item.confidence, CONFIDENCE_ORDER) ?? 'medium',
      title: text(item.title),
      evidence: text(item.evidence) ?? '',
      fix: text(item.fix),
      page: pageOfReview(item, review),
      target: ref(item.target),
    });
  });
}

/** One finding per rule, page and target: a platform or script finding wins over a reviewer's, and keeps its fix. */
export function dedupe(findings) {
  const kept = new Map();
  for (const item of findings) {
    const key = mergeKey(item);
    const held = kept.get(key);
    if (!held) kept.set(key, item);
    else if (KEEP_ORDER[item.source] < KEEP_ORDER[held.source]) kept.set(key, { ...item, fix: item.fix ?? held.fix });
    else if (!held.fix && item.fix) kept.set(key, { ...held, fix: item.fix });
  }
  return [...kept.values()];
}

const pageCount = places => new Set(places.map(place => place.page?.id ?? 'app')).size;

function grouped(items) {
  if (items.length === 1) return items[0];
  const places = items.map(({ page, target, evidence }) => ({ page, target, evidence }));
  const onePage = pageCount(places) === 1 ? items[0].page : null;
  const newness = items.some(item => item.new === true) ? true : items.every(item => item.new === null) ? null : false;
  return { ...items[0], page: onePage, target: null, evidence: items[0].evidence, places, new: newness };
}

// A sign of how the app is built is one pattern to change however many pages show it. Each page
// reviewer and the app pass see only their part of it, so their findings join here.
const isSign = item => item.source === 'reviewer' && item.area === 'BUILD' && item.rule;
// A perf reviewer sees an automation or an object only from its own page, so the same slow
// automation behind several pages comes back once per page; it is one thing to fix.
const isShared = item => item.source === 'reviewer' && item.lens === 'perf' && ['automation', 'object'].includes(item.target?.kind);
const groupKey = item => (isSign(item) ? `sign|${item.rule}`
  : isShared(item) ? `shared|${item.rule ?? item.title}|${item.target.id}`
    : `${item.source}|${item.rule ?? item.title}|${item.severity}`);

// The app pass leads when it saw the sign, since it wrote its title for the whole app; else the
// worst place does. The sign takes its worst severity, and one unsure place keeps it for the
// person to read first.
function joinedSign(items) {
  const sorted = [...items].sort((left, right) => (Number(Boolean(left.page)) - Number(Boolean(right.page)))
    || (SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]));
  const worst = items.map(item => item.severity).sort((left, right) => SEVERITY_ORDER[left] - SEVERITY_ORDER[right])[0];
  const leastSure = items.map(item => item.confidence).sort((left, right) => CONFIDENCE_ORDER[right] - CONFIDENCE_ORDER[left])[0];
  return { ...grouped(sorted), severity: worst, confidence: leastSure };
}

/**
 * One platform or script finding per rule and severity, holding every place it was found: a check
 * that flags 126 hidden blocks is one thing to fix, not 126. A reviewer's sign of how the app is
 * built is one finding per rule, and a perf reviewer's finding on an automation or object is one
 * per rule and target. A reviewer's other findings stay one by one.
 */
export function groupRepeats(findings) {
  const groups = new Map();
  const order = [];
  for (const item of findings) {
    if (item.source === 'reviewer' && !isSign(item) && !isShared(item)) { order.push([item]); continue; }
    const key = groupKey(item);
    if (!groups.has(key)) { groups.set(key, []); order.push(groups.get(key)); }
    groups.get(key).push(item);
  }
  return order.map(items => (isSign(items[0]) || isShared(items[0]) ? joinedSign(items) : grouped(items)));
}

/** Worst first; within a severity, new before old, then surer, then a reviewer's own finding (it carries a fix) before the script's and the platform's. */
export function rank(findings) {
  return [...findings].sort((left, right) => (SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity])
    || (Number(right.new === true) - Number(left.new === true))
    || (CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence])
    || (SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source]));
}

/**
 * `new` is true for a finding the last report of this app did not hold, and null when that report
 * did not cover the finding's page (no last report, or a run on other pages).
 */
export function markNew(findings, previous) {
  const covered = new Set((previous?.pages ?? []).map(page => page.id));
  // The last report's findings are grouped, so a repeated one is keyed by each of its places.
  const before = new Set((previous?.findings ?? []).flatMap(item => (item.places ?? [item]).map(place => findingKey({ ...item, ...place }))));
  return findings.map(item => {
    const seen = previous && (!item.page || covered.has(item.page.id));
    return { ...item, new: seen ? !before.has(findingKey(item)) : null };
  });
}
