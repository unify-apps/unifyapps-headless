/** One call, two answers: who is signed in on a tenant, and which environment
 * that tenant runs. `GET /api/user-context` is the call the platform's own UI
 * makes (`useGetCurrentUserDetails` in the platform front end), and it carries
 * both — so a solution open pays for it once, and login accepts only a cookie
 * that this same read accepts.
 *
 * WHO, for a saved session: the email names the author of a plan or PRD this
 * session writes, and the person in a permission refusal; it stays on this
 * machine's session state. Identity is never worth failing a command for:
 * `fetchUserIdentity` answers `null` rather than throwing.
 *
 * WHICH ENVIRONMENT: the production refusal that used to live here now runs on
 * the server (the `enable_nebula_tools` tenant flag gates the llm-tools MCP
 * routes; direct platform calls are ungated). `knownEnvironment` still reports
 * what a tenant answered, for display, but nothing in this file blocks a
 * request on it.
 *
 * The answer is cached in memory for that tenant and authenticated cookie, for
 * one hour, and never written to disk. A
 * file cache would be a bypass: the sessions index is the person's own file
 * and a verdict stored there could simply be edited. The hour limit matters
 * for a long-lived bridge process, which can outlive one hour by itself and
 * must not keep trusting a verdict for a tenant that has since moved.
 */
import { tenantFetch, USER_CONTEXT_PATH } from './tenant-fetch.mjs';
import { UaError, normalizeTenant } from '../lib/contracts.mjs';
import { createHash } from 'node:crypto';
import { readCookie } from './auth.mjs';

const TIMEOUT_MS = 15_000;
// A 5xx is asked again twice, 1 s and then 3 s later (the same waits as
// `withRetry`). The read changes nothing, and a short tenant hiccup must not
// stop work. A lost connection is not asked again here: each try can wait the
// full 15 s, and the callers' own retry already asks again.
const SERVER_ERROR_WAITS_MS = [1000, 3000];
// A long-lived bridge process outlives any one verdict: a tenant reclassified
// mid-process (moved, or its environment renamed) must be asked again.
const VERDICT_TTL_MS = 60 * 60 * 1000;
const seen = new Map();
// Requests sent side by side share one question, so a process asks once.
const asking = new Map();

const unconfirmed = (tenant, why) =>
  `UnifyApps Headless could not confirm which environment ${tenant} runs (${why}), so it will not change anything there.`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One `GET /api/user-context`, with a 5xx asked again. Answers the last
 * response and its JSON body (`undefined` when it has none). */
async function askTenant(tenant, { cookie, extraCookies, fetchImpl }) {
  for (let attempt = 0; ; attempt++) {
    let response;
    try {
      response = await tenantFetch(tenant, USER_CONTEXT_PATH, {
        method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'content-type': 'application/json' },
      }, { ...(cookie ? { cookie } : {}), ...(extraCookies ? { extraCookies } : {}), ...(fetchImpl ? { fetchImpl } : {}) });
    } catch (error) {
      if (error instanceof UaError) throw error;
      throw new UaError('PLATFORM_UNREACHABLE', `UnifyApps Headless could not reach ${tenant} to confirm which environment it runs.`,
        { host: tenant, reason: error?.name === 'TimeoutError' ? 'timeout' : 'network' });
    }
    if (response.status >= 500 && attempt < SERVER_ERROR_WAITS_MS.length) {
      await sleep(SERVER_ERROR_WAITS_MS[attempt]);
      continue;
    }
    let body;
    if (response.ok) { try { body = await response.json(); } catch { body = undefined; } }
    return { status: response.status, ok: response.ok, body };
  }
}

function identityOf(body) {
  const user = body?.user && typeof body.user === 'object' ? body.user : {};
  // `email` is the login address; `contactDetails.email` is the same value on
  // every tenant seen so far, and is read as the fallback rather than assumed.
  const email = [user.email, user.contactDetails?.email, user.username]
    .find(value => typeof value === 'string' && value.includes('@'));
  const userId = user.id ?? user.userId;
  return {
    ...(email ? { email } : {}),
    ...(userId === undefined || userId === null ? {} : { userId: String(userId) }),
    ...(typeof user.name === 'string' && user.name ? { name: user.name } : {}),
  };
}

async function readContext(tenant, options) {
  const { status, ok, body } = await askTenant(tenant, options);
  if (status === 401 || status === 403) throw new UaError('AUTH_EXPIRED', undefined, { host: tenant });
  // A tenant that keeps failing is down, not hiding what it runs: the answer is
  // the same as a lost connection, and nothing is sent to it either way.
  if (status >= 500) {
    throw new UaError('PLATFORM_UNREACHABLE',
      `${tenant} answered HTTP ${status} ${SERVER_ERROR_WAITS_MS.length + 1} times when UnifyApps Headless asked which environment it runs, so UnifyApps Headless sent it nothing else. It may be down for a moment; try again in a few minutes.`,
      { host: tenant, status });
  }
  if (!ok) throw new UaError('ENVIRONMENT_UNCONFIRMED', unconfirmed(tenant, `HTTP ${status}`), { host: tenant, status });
  if (body === undefined) throw new UaError('ENVIRONMENT_UNCONFIRMED', unconfirmed(tenant, 'the answer was not readable'), { host: tenant });
  return remember(tenant, options.cookieKey, identityOf(body), typeof body?.environment === 'string' ? body.environment : '');
}

/**
 * The signed-in person and the tenant's environment, in one read.
 * Throws when the tenant cannot be asked — the gate needs that; identity does not.
 */
export async function fetchUserContext(host, { cookie, extraCookies, fetchImpl } = {}) {
  const tenant = normalizeTenant(host);
  const value = cookie ?? (process.env.UA_FAKE === '1' ? 'fake-cookie' : readCookie(tenant));
  const cookieKey = createHash('sha256').update(value ?? '').digest('hex');
  const cached = seen.get(tenant);
  if (cached?.cookieKey === cookieKey && Date.now() - cached.at < VERDICT_TTL_MS) return cached.answer;
  if (process.env.UA_FAKE === '1') {
    // The fake platform has no tenant to ask. These are test switches, not an
    // escape: they do nothing unless the whole platform is already faked.
    if (process.env.UA_FAKE_AUTH === 'dead') throw new UaError('AUTH_EXPIRED', undefined, { host: tenant });
    const environment = process.env.UA_FAKE_ENVIRONMENT || 'uat';
    return remember(tenant, cookieKey, { email: `someone@${tenant}`, userId: '1', name: 'Someone' }, environment);
  }
  const key = `${tenant}:${cookieKey}`;
  if (!asking.has(key)) {
    asking.set(key, readContext(tenant, { cookie: value, extraCookies, cookieKey, fetchImpl }).finally(() => asking.delete(key)));
  }
  return asking.get(key);
}

/** The environment a tenant answered at the gate earlier in this process, or null when
 * the gate has not asked it yet. It never asks, so it never sends a request. */
export function knownEnvironment(host) {
  const cached = seen.get(normalizeTenant(host));
  return cached && Date.now() - cached.at < VERDICT_TTL_MS ? cached.answer.environment ?? null : null;
}

function remember(tenant, cookieKey, identity, environment) {
  const answer = { ...identity, environment };
  seen.set(tenant, { at: Date.now(), cookieKey, answer });
  return answer;
}

/** `{ email, userId, name }` for the signed-in person, or `null`. Never throws. */
export async function fetchUserIdentity(host, options) {
  let context;
  try { context = await fetchUserContext(host, options); }
  catch { return null; }
  const { email, userId, name } = context;
  if (!email && userId === undefined) return null;
  return { ...(email ? { email } : {}), ...(userId ? { userId } : {}), ...(name ? { name } : {}) };
}

/**
 * Whether `cookie` is a working sign-in on `host`, read the same way
 * `fetchUserContext` reads, so a cookie login accepts is one every command
 * accepts. `valid` needs
 * an answer that names a person: during a single sign-on the platform can set a
 * short-lived cookie that answers 200 with no person in it, and login keeps
 * waiting for the one that replaces it. A 5xx, another non-2xx answer or a lost
 * connection is `indeterminate`: it says nothing about the cookie itself.
 * Not cached, since login asks about each new cookie it sees. `extraCookies`
 * are sent instead of the host's saved ones, so a set is checked before it is saved.
 */
export async function verifyCookie(host, cookie, { extraCookies } = {}) {
  if (process.env.UA_FAKE === '1') {
    return process.env.UA_FAKE_AUTH === 'dead'
      ? { state: 'invalid', status: 401 }
      : { state: 'valid', status: 200 };
  }
  if (!cookie) return { state: 'invalid' };
  let answer;
  try { answer = await askTenant(normalizeTenant(host), { cookie, extraCookies }); }
  catch (error) { return { state: 'indeterminate', reason: error?.details?.reason ?? 'network' }; }
  if (answer.status === 401) return { state: 'invalid', status: answer.status };
  if (!answer.ok) return { state: 'indeterminate', status: answer.status };
  const { email, userId } = identityOf(answer.body);
  return { state: email || userId ? 'valid' : 'invalid', status: answer.status };
}
