// On a MOBILE app, app-page-quality's page audit checks the rules of this rulebook marked
// `pageAudit` in rules.json with their U, P or X id. This runs it over the pages already loaded
// and answers each finding as a hit `{ rule, page, found }` that rule-check turns into a finding.
import { auditContext } from '../../app-page-quality/scripts/page-audit.mjs';

const SEVERITY_ORDER = ['P0', 'P1', 'P2', 'P3'];
// The audit calls a finding advisory below its own threshold (2-4 on-load sources, a 200 KB image):
// that is a P2 at most, so it never blocks the builder gate or a release.
const capAdvisory = sev => SEVERITY_ORDER[Math.max(SEVERITY_ORDER.indexOf(sev), 2)];

/** `mobileAudit(app, rules, pageIds?) → { checked, hits, errors }`; empty for a WEB app. */
export async function mobileAudit(app, rules, pageIds = null) {
  const result = { checked: [], hits: [], errors: [] };
  if (app.type !== 'MOBILE') return result;
  const byAuditId = new Map([...rules.values()].filter(rule => rule.pageAudit).map(rule => [rule.pageAudit, rule]));
  result.checked = [...byAuditId.values()].map(rule => rule.id);
  for (const page of app.pages) {
    if (pageIds && !pageIds.includes(page.id)) continue;
    try {
      const report = await auditContext({ page: page.record, dataSources: page.dataSources, appDataSources: page.appDataSources, appInterface: app.record }, { probe: null });
      for (const error of report.errors) result.errors.push({ rule: error.rule, page: page.id, message: error.message });
      for (const found of report.findings) {
        // A finding whose rule is left out of the rulebook (sources disagree) is not reported.
        const rule = byAuditId.get(found.rule);
        if (!rule) continue;
        result.hits.push({ rule, page, found: {
          severity: found.severity === 'advisory' ? capAdvisory(rule.sev) : rule.sev,
          target: { kind: 'block', id: found.blockId, name: found.blockName ?? found.blockId },
          evidence: [found.path, found.detail].filter(Boolean).join(': '),
          fix: found.fix ?? null,
        } });
      }
    } catch (error) {
      result.errors.push({ rule: 'page audit', page: page.id, message: error.message });
    }
  }
  return result;
}
