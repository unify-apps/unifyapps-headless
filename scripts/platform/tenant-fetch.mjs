// The only place a tenant cookie is attached to a request. A tenant's cookie
// goes to that tenant's host, or to a subdomain of it when the caller names a
// base on one (the MCP service), and nowhere else.
//
// Whether a tenant serves these tools at all is decided server-side, by the
// `enable_nebula_tools` tenant flag on its MCP routes. This file sends whatever
// it is asked to send.
import fs from 'node:fs';
import { normalizeTenant, UaError } from '../lib/contracts.mjs';
import { readCookie, readExtraCookies } from './auth.mjs';

export const USER_CONTEXT_PATH = '/api/user-context';

// Node's fetch sends `User-Agent: node`. Some tenants sit behind a WAF that
// refuses a User-Agent under 6 characters (403, AAHDR0011), which broke
// sign-in and left every MCP bridge with no tools. So every request names us.
const version = (() => {
  try { return JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; }
  catch { return 'unknown'; }
})();
export const USER_AGENT = `UnifyAppsHeadless/${version}`;

// Joining strings is not enough: "https://<host>" + "@evil.com/x" is a URL
// whose host is evil.com. So the finished URL is parsed and its host checked.
export function tenantUrl(tenant, pathname, { base } = {}) {
  const host = normalizeTenant(tenant);
  if (!host) throw new UaError('USAGE', 'A tenant is required.');
  const value = String(pathname ?? '');
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    throw new UaError('USAGE', `The tenant path must start with a single "/".`);
  }
  const root = new URL(base ?? `https://${host}`);
  const url = new URL(root.origin + root.pathname.replace(/\/+$/u, '') + value);
  const onHost = url.hostname === host || (base !== undefined && url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !onHost) {
    throw new UaError('USAGE', `The ${host} login is sent only to ${host}.`);
  }
  return url.href;
}

/**
 * fetch() with the tenant's cookie. `cookie` is for callers that already hold
 * the session (the MCP bridge, tests); otherwise the saved one is read. The
 * host's saved extra cookies ride along after `_at`; `extraCookies` sends
 * these pairs instead, for login to check a set before it saves it.
 * A redirect is refused unless the caller asks for `manual`, which never
 * follows it, so the cookie cannot ride a redirect to another host.
 */
export async function tenantFetch(tenant, pathname, init = {}, { base, cookie, extraCookies, fetchImpl = fetch } = {}) {
  const host = normalizeTenant(tenant);
  const url = tenantUrl(host, pathname, { base });
  const value = cookie ?? readCookie(host);
  if (!value) throw new UaError('AUTH_EXPIRED', { host });
  const extra = (extraCookies ?? readExtraCookies(host)).map(({ name, value: v }) => `; ${name}=${v}`).join('');
  return fetchImpl(url, {
    ...init,
    redirect: init.redirect === 'manual' ? 'manual' : 'error',
    headers: { 'user-agent': USER_AGENT, ...init.headers, cookie: `_at=${value}${extra}` },
  });
}
