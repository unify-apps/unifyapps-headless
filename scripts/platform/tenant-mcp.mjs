/** Calls one tool on a tenant MCP route from the CLI, and verifies the tenant's direct MCP gateway or a user-provided replacement. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeTenant, UaError } from '../lib/contracts.mjs';
import { defaultTenantMcpUrl, validatedMcpBaseUrl } from '../lib/mcp-url.mjs';
import { readCookie as readSavedCookie } from './auth.mjs';
import { writeConfig as writeSavedConfig } from '../workspace/session-registry.mjs';
import { tenantToolContext, createBridge } from '../mcp-bridge.mjs';

const unreachable = (host, message) => new UaError('PLATFORM_UNREACHABLE', message, { host });

/**
 * One tool call on a tenant MCP route (`/mcp/solution` unless `route` names another, such as
 * `/mcp/object`), made by the CLI itself through the bridge's own code: the same base, headers,
 * cookie and JSON or SSE reply reading. Answers the tool's own JSON. A failed call throws AUTH_EXPIRED or
 * PLATFORM_UNREACHABLE. A call the signed-in person's role may not make throws
 * PERMISSION_REQUIRED, with or without `answerRefusals`: the bridge reads llm-tools' refusal for
 * the AGENT_LLM_TOOLS permission before this sees the reply, so no caller retries it as an
 * outage. Any other call the tool refused throws PLATFORM_UNREACHABLE too, unless
 * `answerRefusals` asks for the tool's own answer back, `{ ok: false, … }` with the platform's
 * status, for a caller that tells a missing record or a stale write from an outage.
 * Explicit IDs name the call; otherwise its session comes from CLAUDE_CODE_SESSION_ID,
 * and its solution from that session in the same folder.
 */
export async function callTenantTool({ host, route = '/mcp/solution', name, args, sessionId, solutionId, cwd, home, request = fetch, answerRefusals = false }) {
  const tenant = normalizeTenant(host);
  const forward = createBridge(route, {
    request,
    context: () => {
      const context = tenantToolContext({ host: tenant, sessionId, solutionId, cwd, home });
      return { ...context, cookie: context.cookie ?? (process.env.UA_FAKE === '1' ? 'fake-cookie' : null) };
    },
  });
  const replies = await forward({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { host: tenant, ...args } } });
  const reply = replies.find((item) => item?.id === 1);
  if (!reply) throw unreachable(tenant, `${name} gave no answer.`);
  // A tenant whose llm-tools predates this tool answers -32602 "Tool <name> not found"; it is up, just older.
  const missingTool = () => new UaError('PLATFORM_UNREACHABLE', `${tenant} does not have the ${name} tool yet.`, { host: tenant, missingTool: name });
  // The module gate refuses every call the same way, whatever the tool: a real, named
  // refusal, not an outage. Folding it into PLATFORM_UNREACHABLE lost that message to a
  // generic "cannot reach" — a signed-in, reachable tenant read as down.
  const moduleDisabled = (message) => new UaError('MODULE_DISABLED', message, { host: tenant });
  const moduleGate = /does not have the `UA_MCP_TOOLS` module enabled/u;
  if (/\bTool \S+ not found\b/u.test(reply.error?.message ?? '')) throw missingTool();
  if (moduleGate.test(reply.error?.message ?? '')) throw moduleDisabled(reply.error.message);
  if (reply.error) throw unreachable(tenant, `${name} failed: ${reply.error.message ?? 'MCP error.'}`);
  const text = (reply.result?.content ?? []).find((item) => item?.type === 'text')?.text;
  if (reply.result?.isError) {
    if (moduleGate.test(text ?? '')) throw moduleDisabled(text);
    if (!answerRefusals) throw unreachable(tenant, `${name} failed: ${text ?? 'tool error.'}`);
    // Some tenants answer an unknown tool as a tool error rather than an MCP error.
    if (/\bTool \S+ not found\b/u.test(text ?? '')) throw missingTool();
    // A refusal in plain words (an argument the tool's schema refused) has no status to act on.
    let answer;
    try { answer = JSON.parse(text); } catch { answer = null; }
    return { ...(answer && typeof answer === 'object' ? answer : { result: 'error', message: text ?? 'tool error.' }), ok: false };
  }
  try { return JSON.parse(text); }
  catch { throw unreachable(tenant, `${name} did not answer JSON.`); }
}

const DEFAULT_MANIFEST = fileURLToPath(new URL('../../.mcp.json', import.meta.url));
const MANUAL_URL_PROMPT = 'The following MCP URL is not working. Would you wish to provide it yourself?';

export function declaredMcpEndpoints(manifestFile = DEFAULT_MANIFEST) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); }
  catch (error) { throw new Error(`Cannot read the plugin MCP manifest: ${error.message}`); }
  const endpoints = [];
  for (const server of Object.values(manifest?.mcpServers ?? {})) {
    for (const argument of Array.isArray(server?.args) ? server.args : []) {
      for (const match of String(argument).matchAll(/(?:^|[\s"'])(\/mcp\/[a-z-]+)(?=$|[\s"'])/gu)) {
        if (!endpoints.includes(match[1])) endpoints.push(match[1]);
      }
    }
  }
  if (!endpoints.length) throw new Error('The plugin declares no remote MCP endpoints.');
  return endpoints;
}

function setupError(message, { host, attempts = [], url, secret } = {}) {
  const clean = text => secret ? String(text).split(String(secret)).join('[redacted]') : String(text);
  const details = { host, manualUrlPrompt: MANUAL_URL_PROMPT, attempts: attempts.map(attempt => ({ ...attempt,
    ...(attempt.error ? { error: clean(attempt.error) } : {}),
  })), ...(url ? { url } : {}) };
  return new UaError('MCP_SETUP_FAILED', clean(message), details);
}

function fakeRequest() {
  return async (_url, options = {}) => {
    if (process.env.UA_FAKE_MCP_FAIL === 'probe') return new Response('{}', { status: 503 });
    const message = JSON.parse(options.body);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'fake_read', inputSchema: { type: 'object' } }] } }),
      { headers: { 'content-type': 'application/json' } });
  };
}

export async function setupTenantMcp(host, {
  url: suppliedUrl,
  request,
  readCookie = readSavedCookie,
  writeConfig = writeSavedConfig,
  manifestFile = DEFAULT_MANIFEST,
} = {}) {
  const tenant = normalizeTenant(host);
  if (!tenant) throw new UaError('USAGE', 'Tenant is required.');
  let url;
  try { url = validatedMcpBaseUrl(suppliedUrl ?? defaultTenantMcpUrl(tenant), tenant); }
  catch (error) { throw setupError(error.message, {
    host: tenant,
    attempts: [{ phase: 'validation', check: 'base-url', ok: false, notAttempted: true, cause: 'INVALID_URL', error: error.message }],
  }); }
  const cookie = process.env.UA_FAKE === '1' ? readCookie(tenant) ?? 'fake-cookie' : readCookie(tenant);
  if (!cookie) throw setupError(`Signed out of ${tenant}. Sign in again to continue.`, {
    host: tenant, url,
    attempts: [{ phase: 'authentication', check: 'saved-login', url, ok: false, notAttempted: true, cause: 'AUTH_REQUIRED', error: 'No saved authentication cookie.' }],
  });
  const send = request ?? (process.env.UA_FAKE === '1' ? fakeRequest() : fetch);

  let endpoints;
  try { endpoints = declaredMcpEndpoints(manifestFile); }
  catch (error) { throw setupError(error.message, { host: tenant, url, secret: cookie,
    attempts: [{ phase: 'configuration', check: 'manifest', ok: false, notAttempted: true, cause: 'INVALID_MANIFEST', error: error.message }],
  }); }
  const attempts = await Promise.all(endpoints.map(async (endpoint, index) => {
    const id = `ua-mcp-setup-${index + 1}`;
    const fullUrl = `${url}${endpoint}`;
    const base = { phase: 'probe', endpoint, method: 'POST', url: fullUrl, check: 'tools/list' };
    let status;
    try {
      const forward = createBridge(endpoint, {
        context: () => ({ tenant, url, cookie }),
        request: async (...args) => {
          const probeResponse = await send(...args);
          status = probeResponse.status;
          return probeResponse;
        },
      });
      const replies = await forward({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
      const reply = replies.find(item => item?.id === id);
      if (reply?.error) return { ...base, ok: false, status, cause: 'RPC_ERROR',
        error: `${reply.error.code ?? 'unknown'}: ${reply.error.message ?? 'MCP error.'}` };
      if (!reply || !Array.isArray(reply.result?.tools)) {
        return { ...base, ok: false, status, cause: 'INVALID_TOOLS_LIST', error: 'Response did not contain a tools array.' };
      }
      return { ...base, ok: true, status, toolCount: reply.result.tools.length };
    } catch (error) {
      const cause = status === 401 || status === 403 ? 'AUTH_EXPIRED'
        : status && status >= 400 ? `HTTP_${status}`
          : error instanceof SyntaxError ? 'INVALID_JSON' : error?.code ?? 'NETWORK_ERROR';
      return { ...base, ok: false, ...(status === undefined ? {} : { status }), cause: String(cause),
        error: error?.message ?? 'MCP probe request failed.' };
    }
  }));
  if (attempts.some(attempt => !attempt.ok)) {
    throw setupError('One or more tenant MCP endpoints failed tools/list.', { host: tenant, attempts, url, secret: cookie });
  }
  writeConfig({ tenantMcpUrls: { [tenant]: url } });
  return { host: tenant, url, attempts };
}
