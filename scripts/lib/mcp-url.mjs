import { normalizeTenant } from './contracts.mjs';

export function defaultTenantMcpUrl(host) {
  const tenant = normalizeTenant(host);
  return tenant ? `https://${tenant}/llm-tools` : null;
}

// A tenant gateway can serve MCP under a path. Preserve it when adding the
// individual server paths, and never accept credentials or query parameters.
// The bridge sends the tenant's session cookie to this URL, so it must be the
// tenant host or one of its subdomains, never a host someone else controls.
export function validatedMcpBaseUrl(value, host) {
  const tenant = normalizeTenant(host);
  if (!tenant) throw new Error('The MCP URL needs the tenant it belongs to.');
  const input = typeof value === 'string' ? value.trim() : '';
  let url;
  try {
    if (!input || /[\s\\]/u.test(input)) throw new Error();
    url = new URL(input);
  } catch { throw new Error('The MCP URL must be a valid HTTPS base URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('The MCP URL must use HTTPS without credentials, a custom port, query parameters, or a fragment.');
  }
  if (url.hostname !== tenant && !url.hostname.endsWith(`.${tenant}`)) {
    throw new Error(`The MCP URL must be on ${tenant} or one of its subdomains.`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`;
}
