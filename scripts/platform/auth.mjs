// Per-tenant authentication. Service calls never start the login flow.
// Whether a cookie works is `verifyCookie` in `user-context.mjs`: the same read
// `fetchUserContext` makes, so a cookie login accepts is one every command accepts.
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeTenant } from '../lib/contracts.mjs';
import { defaultTenantMcpUrl } from '../lib/mcp-url.mjs';
import { cookieStore, writePrivateFile } from './secret-store.mjs';

const home = process.env.UA_HOME ?? path.join(os.homedir(), '.unifyapps-solutions');
export const SESSION_DIR = path.join(home, 'session');
export const PROFILE_DIR = path.join(SESSION_DIR, 'chrome-profile');
export const COOKIE_DIR = path.join(SESSION_DIR, 'cookies');
export const hostOf = (value) => normalizeTenant(value);
export const cookieFileFor = (host) => path.join(COOKIE_DIR, normalizeTenant(host));
// RFC 6265 cookie-octet. The Keychain write quotes the value, which is only
// safe because this excludes `"` and `\`.
const COOKIE_VALUE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

// A custom UA_HOME is a separate session (the QA runs rely on that), so its
// store entry must not overwrite the one the default home uses for that host.
const storeKey = (tenant) => process.env.UA_HOME
  ? `${tenant}#${createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 12)}`
  : tenant;

function readCookieFile(host) {
  try { return readFileSync(cookieFileFor(host), 'utf8').trim().replace(/^_at=/, '') || undefined; }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

// Falls back to the file when the store has nothing: that is where a session
// saved before the store existed lives, and where persistCookie leaves one
// when the store refused it. A valid file is moved into the store on the way.
export function readCookie(host) {
  const tenant = normalizeTenant(host);
  const store = cookieStore(COOKIE_DIR);
  const stored = store?.read(storeKey(tenant));
  if (stored) return stored;
  const legacy = readCookieFile(tenant);
  if (!legacy || !COOKIE_VALUE.test(legacy)) return undefined;
  if (store && store.write(storeKey(tenant), legacy)) rmSync(cookieFileFor(tenant), { force: true });
  return legacy;
}

/** Saves the cookie and answers where it went: the store's label, or 'a private file'. */
export function persistCookie(host, value) {
  const cookie = String(value).trim().replace(/^_at=/, '');
  if (!COOKIE_VALUE.test(cookie)) throw new Error('Invalid cookie value.');
  const tenant = normalizeTenant(host);
  const store = cookieStore(COOKIE_DIR);
  if (store?.write(storeKey(tenant), cookie)) {
    rmSync(cookieFileFor(tenant), { force: true });
    return store.label;
  }
  // An older value left in the store would shadow the file readCookie falls back to.
  if (store) {
    store.remove(storeKey(tenant));
    console.error(`UnifyApps Headless could not save the session for ${tenant} in ${store.label}, so it is kept in a private file instead.`);
  }
  writePrivateFile(cookieFileFor(tenant), cookie);
  return 'a private file';
}

/** Removes a tenant's saved sign-in, from wherever `readCookie` would find it. */
export function clearCookie(host) {
  const tenant = normalizeTenant(host);
  // Both places, not whichever one holds it: a store entry left behind would
  // shadow the file, and a file left behind comes back the next time the store
  // is unavailable.
  cookieStore(COOKIE_DIR)?.remove(storeKey(tenant));
  rmSync(cookieFileFor(tenant), { force: true });
  extraCache.delete(tenant);
}

// Extra cookies a tenant's front door needs besides `_at`, such as an access
// proxy's own session cookies. Saved only when the person asks for it
// (`login.mjs <host> --extra-cookies`) and sent by `tenantFetch` with every
// request to that host. The values go in the secret store beside the sign-in;
// this file names them, so a host with none never wakes the store. When the
// store refuses, the file holds the values instead, as `persistCookie` does.
export const extraCookiesFileFor = (host) => path.join(COOKIE_DIR, 'extra', normalizeTenant(host));
const extraStoreKey = (tenant) => `${storeKey(tenant)}#extra`;
// RFC 6265 cookie-name: a token.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Parses a pasted cookie string (`a=1; b=2`, or one pair per line) into its
 * pairs. `_at` comes back on its own as `at`, because it is the sign-in and
 * is never saved as an extra. Throws on a pair that is not a valid cookie.
 */
export function parseExtraCookies(text) {
  const byName = new Map();
  let at;
  for (const part of String(text ?? '').split(/[;\r\n]+/u)) {
    const pair = part.trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = eq > 0 ? pair.slice(0, eq).trim() : '';
    const value = eq > 0 ? pair.slice(eq + 1).trim() : '';
    if (!COOKIE_NAME.test(name) || !COOKIE_VALUE.test(value)) {
      throw new Error(`Not a cookie: "${name || pair.slice(0, 20)}". Paste name=value pairs separated by ";".`);
    }
    if (name === '_at') at = value;
    else byName.set(name, value);
  }
  return { cookies: [...byName].map(([name, value]) => ({ name, value })), at };
}

const joinCookies = (cookies) => cookies.map(({ name, value }) => `${name}=${value}`).join('; ');

// tenantFetch reads the extras on every request, and a store read starts a
// process, so the pairs are kept until the file changes.
const extraCache = new Map();

/** The saved extra cookies for a host, as pairs. Empty when none were saved. */
export function readExtraCookies(host) {
  const tenant = normalizeTenant(host);
  const file = extraCookiesFileFor(tenant);
  let stamp;
  try { const { mtimeMs, size } = statSync(file); stamp = `${mtimeMs}:${size}`; }
  catch (error) { if (error.code === 'ENOENT') { extraCache.delete(tenant); return []; } throw error; }
  const cached = extraCache.get(tenant);
  if (cached?.stamp === stamp) return cached.cookies;
  let cookies = [];
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const text = typeof saved.cookies === 'string' ? saved.cookies : cookieStore(COOKIE_DIR)?.read(extraStoreKey(tenant));
    cookies = parseExtraCookies(text).cookies;
  } catch { cookies = []; }
  extraCache.set(tenant, { stamp, cookies });
  return cookies;
}

/** Replaces the host's extra cookies with these pairs; none removes them. */
export function persistExtraCookies(host, cookies) {
  const tenant = normalizeTenant(host);
  const file = extraCookiesFileFor(tenant);
  const store = cookieStore(COOKIE_DIR);
  extraCache.delete(tenant);
  if (!cookies.length) {
    store?.remove(extraStoreKey(tenant));
    rmSync(file, { force: true });
    return;
  }
  const names = cookies.map(({ name }) => name);
  if (store?.write(extraStoreKey(tenant), joinCookies(cookies))) {
    writePrivateFile(file, JSON.stringify({ names }));
    return;
  }
  if (store) {
    store.remove(extraStoreKey(tenant));
    console.error(`UnifyApps Headless could not save the extra cookies for ${tenant} in ${store.label}, so they are kept in a private file instead.`);
  }
  writePrivateFile(file, JSON.stringify({ names, cookies: joinCookies(cookies) }));
}
// `tier` only ever picked the tenant MCP base URL below; it is a hostname guess,
// not a decision about whether UnifyApps Headless may touch a tenant.
export function tenantMcpFor(value) {
  const tenant = normalizeTenant(value);
  if (!tenant) return { tenant: null, tier: null, mcpUrl: null };
  const tier = /\.uat\.unifyapps\.com$/u.test(tenant) ? 'uat' : 'prod';
  let config = {};
  try { config = JSON.parse(readFileSync(path.join(home, 'sessions.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const mcpUrl = config.tenantMcpUrls?.[tenant] ?? defaultTenantMcpUrl(tenant);
  return { tenant, tier, mcpUrl };
}
