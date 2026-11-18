// Shared surface CLI context and transport. Authentication is explicit.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeForCwd, readState, assertStarted } from '../workspace/local.mjs';
import { normalizeTenant, UaError } from '../lib/contracts.mjs';
import { readCookie, tenantMcpFor } from './auth.mjs';
import { tenantFetch, USER_AGENT } from './tenant-fetch.mjs';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function die(message, code = 1) { console.error(String(message)); process.exit(code); }
export function resolveTenant(argv, { allowSolutionMismatch = false } = {}) {
  const i = argv.indexOf('--tenant');
  let explicit;
  if (i >= 0) { explicit = argv[i + 1]; argv.splice(i, 2); if (!explicit || explicit.startsWith('--')) die('Tenant is required.', 2); }
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  const binding = homeForCwd(process.cwd(), sessionId), state = binding ? readState(binding.home, sessionId) : null;
  const tenant = normalizeTenant(explicit ?? state?.tenant);
  if (!tenant) die('Run /ua:setup first.');
  if (!allowSolutionMismatch && state?.tenant && state.tenant !== tenant) die(`This solution belongs to ${state.tenant}.`);
  const mcp = tenantMcpFor(tenant);
  return { tenant, name: tenant, baseUrl: `https://${tenant}`, cookie: readCookie(tenant), mcpTier: mcp.tier, home: binding?.home };
}
export function assertWritable(tenant) {
  try { assertStarted(tenant.home); }
  catch (error) { die(error.message); }
}
export function makeApi(tenant) {
  return async (pathname, body, method = body === undefined ? 'GET' : 'POST') => {
    // Read each time so an explicit login takes effect in long-lived callers.
    const cookie = readCookie(tenant.tenant) ?? tenant.cookie;
    let response;
    try {
      response = await tenantFetch(tenant.tenant, pathname, {
        method, signal: AbortSignal.timeout(30_000),
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }, { cookie });
    } catch (error) {
      if (error instanceof UaError) throw error;
      throw new UaError('PLATFORM_UNREACHABLE', { host: tenant.tenant });
    }
    if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', { host: tenant.tenant });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { ok: response.ok, status: response.status, body: data, text };
  };
}
/**
 * Read one attached file off a tenant. Not JSON, and not served by the tenant.
 *
 * `/api/file/download/<path>` answers 303 with a signed cloud-storage URL, so
 * `makeApi` cannot fetch it — it refuses every redirect. This reads the
 * location and fetches it with NO cookie, because a signed URL needs none and
 * `_at` must never leave the tenant.
 */
export function makeDownload(tenant) {
  return async (pathname) => {
    const cookie = readCookie(tenant.tenant) ?? tenant.cookie;
    let response;
    try {
      response = await tenantFetch(tenant.tenant, pathname, {
        redirect: 'manual', signal: AbortSignal.timeout(30_000),
      }, { cookie });
    } catch (error) {
      if (error instanceof UaError) throw error;
      throw new UaError('PLATFORM_UNREACHABLE', { host: tenant.tenant });
    }
    if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', { host: tenant.tenant });
    const location = response.headers.get('location');
    if (!location) return { ok: response.ok, status: response.status, text: await response.text() };
    if (!location.startsWith('https://')) return { ok: false, status: response.status, text: '' };
    let file;
    try { file = await fetch(location, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) }); }
    catch { throw new UaError('PLATFORM_UNREACHABLE', { host: new URL(location).host }); }
    return { ok: file.ok, status: file.status, text: await file.text() };
  };
}

export const pretty = (value) => JSON.stringify(value, null, 2);
