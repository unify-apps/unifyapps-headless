import fs from 'node:fs';
import path from 'node:path';
import { UA_HOME, readConfig, readRegistry, solutionsForTenant, sessionsForSolution, tenantMcp, paths, workspaceAssociations } from '../workspace/local.mjs';
import { claudeApp, readHandoff } from '../workspace/handoff.mjs';
import { normalizeTenant, UaError } from '../lib/contracts.mjs';
import { extractLinks } from '../lib/entity-target.mjs';

function resolve(flags) {
  if (typeof flags.request !== 'string' || !flags.request.trim()) throw new UaError('USAGE', 'state resolve needs --request "<text>".');
  const links = extractLinks(flags.request);
  return { data: { links, request: flags.request }, message: `Found ${links.length} link${links.length === 1 ? '' : 's'}.` };
}

export async function run(command, args, flags, ctx = {}) {
  if (command === 'resolve') return resolve(flags);
  if (command !== 'next') throw new UaError('USAGE', 'Use state next or state resolve.');
  const config = readConfig(), tenant = normalizeTenant(flags.tenant);
  const options = [], seen = new Set();
  const add = (host, why) => { if (host && !seen.has(host)) { seen.add(host); options.push({ host, why }); } };
  add(config.lastTenant, 'last used');
  const registry = readRegistry();
  const rootAssociations = !tenant ? workspaceAssociations(ctx.cwd).filter(item => item.scope === 'root') : [];
  const folderAssociation = rootAssociations.find(item => item.tenant) ?? null;
  const folderSolution = folderAssociation ? {
    tenant: folderAssociation.tenant,
    id: folderAssociation.solutionId,
    name: folderAssociation.solutionName,
  } : null;
  // A folder copied from another machine has no .sessions state, so
  // associationAt cannot derive a tenant, even though records/solution.json
  // already holds a solution id from an earlier setup. Say so, rather than
  // asking for a tenant with no hint the id is already on disk.
  const knownSolution = !folderSolution ? rootAssociations.find(item => item.solutionId) ?? null : null;
  const handoffRead = folderSolution || tenant ? null : readHandoff(ctx.cwd, Date.now(), undefined, ctx.sessionId);
  const handoff = handoffRead?.state === 'valid' ? handoffRead.handoff : null;
  const handoffError = handoffRead?.state === 'invalid' ? handoffRead.reason
    : handoffRead?.state === 'claimed' ? 'another Claude session already claimed it' : null;
  for (const entry of Object.values(registry.sessions).sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))) add(entry.tenant, 'recent session');
  const folder = path.join(UA_HOME, 'session', 'cookies');
  if (fs.existsSync(folder)) for (const file of fs.readdirSync(folder, { withFileTypes: true })) if (file.isFile()) add(file.name, 'saved login');
  let selected = null;
  if (flags.solution) {
    selected = Object.values(registry.sessions).find(entry => entry.key === flags.solution || entry.solutionId === flags.solution && entry.tenant === tenant);
    if (!selected) throw new UaError('NOT_FOUND', { host: tenant });
    if (selected.tenant !== tenant) throw new UaError('TENANT_MISMATCH', { urlHost: selected.tenant, tenant });
  }
  // Tenant tools need no startup verification: the bridge resolves the saved or
  // default base per call, and the first real tool call proves it works.
  const mcp = tenantMcp(tenant);
  const next = folderSolution ? 'continue_solution' : handoff ? 'handoff' : !tenant ? 'ask_tenant' : !flags['after-login'] ? 'login'
    : !flags.solution ? 'pick_solution' : 'ready';
  return { data: {
    next, app: claudeApp(),
    tenantOptions: options, folderSolution, handoff, ...(handoffError ? { handoffError } : {}), cachedSolutions: tenant ? solutionsForTenant(tenant).slice(0, 3).map(({ key, id, name, lastUsed, storage }) => ({ key, id, name, lastUsed, storage })) : [],
    tenantMcp: mcp,
    storage: tenant && config.tenantStorage[tenant] ? { mode: config.tenantStorage[tenant].storage, missing: config.tenantStorage[tenant].missing, checkedAt: config.tenantStorage[tenant].checkedAt } : null,
    home: folderAssociation?.home ?? (selected ? paths(ctx.cwd, selected.key).home : null),
    claudeSessionId: ctx.sessionId ?? null,
    otherSessions: selected ? sessionsForSolution(tenant, selected.solutionId, { excludeSessionId: ctx.sessionId }) : [],
    ...(knownSolution ? { knownSolution: { id: knownSolution.solutionId, name: knownSolution.solutionName } } : {}),
  }, message: ({ continue_solution: `Continue ${folderSolution?.name}.`, handoff: `Continue the solution chosen in another session on ${handoff?.tenant}.`,
    ask_tenant: knownSolution ? `Choose a tenant. records/solution.json already holds solution ${knownSolution.solutionId} (${knownSolution.solutionName}) from an earlier setup — if that is still right, say which tenant it is on.` : 'Choose a tenant.',
    login: `Sign in to ${tenant}.`, pick_solution: 'Choose a solution.', ready: 'Ready to work.' })[next] };
}
