#!/usr/bin/env node
/**
 * Makes one tenant HTTP call in-process, so the session cookie never sits in
 * a shell argv (readable by any local process through `ps`) and is never
 * printed anywhere an agent or a transcript could pick it up. A function
 * only, with no command line. Its caller is the native-push-notifications
 * skill's script, for the two calls no tool makes (the platform automation
 * lookup and run); tenant tools go through the MCP bridge.
 *
 * `path` must be a plain tenant path (starts with `/`, no `//`, `\`, or
 * scheme) so the cookie can only reach the signed-in tenant, never a host or
 * redirect target someone else names. Errors carry a `code`: `USAGE`,
 * `NO_SESSION`, `AUTH_EXPIRED` (401/403), `NETWORK_ERROR`, `TOO_LARGE`; a
 * non-2xx HTTP status alone is not treated as failure here.
 */
import { hostOf, readCookie } from './platform/auth.mjs';
import { tenantFetch } from './platform/tenant-fetch.mjs';
import { UaError } from './lib/contracts.mjs';

const MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

function fail(message, code) {
  return Object.assign(new Error(message), { code });
}

function validatedPath(pathname) {
  const value = String(pathname ?? '');
  if (!value.startsWith('/')) throw fail('The path must start with "/".', 'USAGE');
  if (value.includes('//') || value.includes('\\') || /^\/[a-z][a-z0-9+.-]*:/iu.test(value)) {
    throw fail('The path must be a plain tenant path, never a full URL or a scheme.', 'USAGE');
  }
  return value;
}

async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw fail('Response exceeded the size cap.', 'TOO_LARGE');
    return text;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw fail('Response exceeded the size cap.', 'TOO_LARGE'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

/** The call itself. `fetchImpl` and `getCookie` are injection points for tests. */
export async function platformCall(host, method, pathname, {
  body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BYTES,
  fetchImpl = fetch, getCookie = readCookie,
} = {}) {
  const tenant = hostOf(host);
  if (!tenant) throw fail('A tenant host, a method and a path are required.', 'USAGE');
  const cleanPath = validatedPath(pathname);
  const cookie = getCookie(tenant);
  if (!cookie) throw fail(`No saved UnifyApps Headless session for ${tenant}. Sign in again through /ua:setup.`, 'NO_SESSION');
  let response;
  try {
    response = await tenantFetch(tenant, cleanPath, {
      method, signal: AbortSignal.timeout(timeoutMs), headers,
      ...(body === undefined ? {} : { body }),
    }, { cookie, fetchImpl });
  } catch (error) {
    if (error instanceof UaError) throw fail(error.message, 'USAGE');
    throw fail(`Request to ${tenant} failed: ${error.message}`, 'NETWORK_ERROR');
  }
  if (response.status === 401 || response.status === 403) {
    throw fail(`Signed out of ${tenant}. Sign in again through /ua:setup.`, 'AUTH_EXPIRED');
  }
  return { status: response.status, text: await readCapped(response, maxBytes) };
}
