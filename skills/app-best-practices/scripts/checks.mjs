// Every automated check, by rulebook id. A check's severity, area and app type come from
// rules.json, never from here, so the rulebook stays the one place a rule is defined.
// A page check is `run(page, app) → [{ target, evidence, confidence? }]`; an app check
// (`scope: 'app'`) is `run(app) → [{ page, target, evidence }]`. Targets name what to fix.
import { codeChecks } from './checks/code.mjs';
import { compChecks } from './checks/comp.mjs';
import { dataChecks } from './checks/data.mjs';
import { intChecks } from './checks/int.mjs';
import { layoutChecks } from './checks/layout.mjs';
import { navChecks } from './checks/nav.mjs';
import { perfChecks } from './checks/perf.mjs';
import { secChecks } from './checks/sec.mjs';
import { stateChecks } from './checks/state.mjs';
import { themeChecks } from './checks/theme.mjs';

export const CHECKS = [...intChecks, ...dataChecks, ...perfChecks, ...codeChecks, ...stateChecks, ...compChecks, ...layoutChecks, ...navChecks, ...themeChecks, ...secChecks];
