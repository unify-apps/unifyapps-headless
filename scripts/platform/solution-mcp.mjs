// One tool call on the tenant's `solution` MCP server, made by the CLI itself,
// for the reads whose answers belong on disk and not in the chat: `get_solution`
// (a solution with every plan, spec and document, hundreds of KB for a big one)
// behind `solution open` and `solution refresh`, and `search_solutions` and
// `find_entity_solutions` behind setup, which add the folders on this machine
// to each answer. The call goes through the bridge's own code: the same base,
// headers, cookie, production check and JSON or SSE reply reading.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UaError, normalizeTenant, norm } from '../lib/contracts.mjs';
import { fakeEntityApi } from './service-fake.mjs';
import { createService } from './service.mjs';
import { callTenantTool } from './tenant-mcp.mjs';

/** The tool's own JSON answer, from the tenant's `solution` route. A failed call throws: AUTH_EXPIRED,
 * PERMISSION_REQUIRED or PLATFORM_UNREACHABLE. `sessionId` and `solutionId` name the call, as the
 * bridge does, when the caller has them. */
export async function callSolutionTool(host, name, args, { sessionId, solutionId, home, request } = {}) {
  const fake = process.env.UA_FAKE === '1';
  return callTenantTool({ host, name, args, sessionId, solutionId, home,
    request: request ?? (fake ? fakeSolutionTools(normalizeTenant(host)) : fetch) });
}

// UA_FAKE only: answers the three tools from the fake platform's store file, so a
// test never sends a request out of the process. `search_solutions` reads the
// store's e_solution records; `find_entity_solutions` returns the answer seeded
// in the store under `entityFinds["<kind>:<id>"]` or `entityFinds["name:<name>"]`;
// its `suggested` rows carry `via` rows { kind, id, name, link }, as the tenant's do.
// `get_solution` makes the same five reads the real tool makes, with the real
// service's `get` and paged `search` on the fake entity API, so its failure knobs
// (a dead login, a network failure) apply to it too. `UA_FAKE_SOLUTION_TOOLS=missing`
// answers every tool as an older llm-tools would, "Tool <name> not found".
function fakeSolutionTools(host) {
  const home = process.env.UA_HOME ?? path.join(os.homedir(), '.unifyapps-solutions');
  const file = path.join(home, 'session', 'fake', `${host}.json`);
  const store = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } };
  const answer = (id, value) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value) }] } }),
    { headers: { 'content-type': 'application/json' } });
  const toolNotFound = (id, message) => new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message } }),
    { headers: { 'content-type': 'application/json' } });
  return async (_url, init = {}) => {
    const { id, params: { name, arguments: args = {} } } = JSON.parse(init.body);
    if (process.env.UA_FAKE_SOLUTION_TOOLS === 'missing') return toolNotFound(id, `Tool ${name} not found`);
    if (name === 'get_solution') {
      const fakeService = createService({ host, api: fakeEntityApi(host, { home }) });
      try {
        const solution = await fakeService.get('e_solution', args.id);
        const [plans, specs, documents, assets] = await Promise.all([
          fakeService.search('solution_builder_plan', 'solutionId', args.id), fakeService.search('solution_spec', 'solutionId', args.id),
          fakeService.search('solution_document', 'solutionId', args.id), fakeService.search('solution_linked_assets', 'solution_id', args.id)]);
        return answer(id, { ok: true, result: 'ok', id: args.id, solution, plans, specs, documents, assets,
          counts: { plans: plans.length, specs: specs.length, documents: documents.length, assets: assets.length }, message: `Read solution ${args.id}.` });
      } catch (error) {
        // The real tool answers through the bridge: a dead login is the bridge's 401, a missing record its not_found.
        if (error?.code === 'AUTH_EXPIRED') return new Response('{}', { status: 401 });
        if (error?.code === 'NOT_FOUND') return answer(id, { ok: false, result: 'not_found', id: args.id, message: `No solution \`${args.id}\` on this tenant.` });
        return answer(id, { ok: false, result: 'error', id: args.id, message: `Could not read solution ${args.id}: ${error.message}` });
      }
    }
    if (name === 'search_solutions') {
      const wanted = norm(args.name);
      const rows = Object.values(store().records ?? {}).filter((record) => record?.entityType === 'e_solution'
        && norm(record.properties?.name).includes(wanted))
        .map((record) => ({ id: record.id, name: record.properties?.name ?? null, exact: norm(record.properties?.name) === wanted }));
      rows.sort((a, b) => Number(b.exact) - Number(a.exact));
      return answer(id, { result: 'ok', matches: rows.slice(0, 10) });
    }
    if (name === 'find_entity_solutions') {
      const key = args.name !== undefined ? `name:${args.name}` : `${args.kind}:${args.id}`;
      return answer(id, store().entityFinds?.[key] ?? { result: 'ok', entity: null, candidates: [], notFound: false, direct: [], suggested: [], warnings: [] });
    }
    return new Response('{}', { status: 404 });
  };
}
