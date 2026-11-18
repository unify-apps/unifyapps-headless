/**
 * What browser.mjs checks about a tenant page. Imported, never run.
 *
 * Three kinds of function live here:
 * - `pageShown`, `fullPageSize` and `hasText` run INSIDE the page. Each is sent there as
 *   its source text (`fn.toString()`), so it uses nothing from outside its own
 *   body.
 * - `recordCalls` runs inside playwright-cli's own process, through
 *   `run-code`, so it too is sent as source text. That sandbox has no `URL`.
 * - The landing checks (`interfaceOf` to `wrongLanding`) run in Node.
 */

/**
 * Whether the page has drawn: where the window is, the `data-page-id` of each
 * page root it draws (a page or a module), and how many blocks
 * (`data-block-id`) those roots hold.
 */
export function pageShown() {
  const roots = [...document.querySelectorAll('[data-page-id]')];
  const pageIds = [...new Set(roots.map((r) => r.getAttribute('data-page-id')).filter(Boolean))].slice(0, 10);
  // A code app draws no block: its page has drawn when the body holds an element of its own.
  const rendered = Boolean(document.body && document.body.querySelector(':not(script):not(style):not(link):not(noscript)'));
  return { href: location.href, path: location.pathname, pageIds, blocks: roots.reduce((n, r) => n + r.querySelectorAll('[data-block-id]').length, 0), rendered };
}

/** True for a Code Builder app's preview (`/agent-api/preview/b/<appId>/<branch>/...`), which draws no block. */
export function isCodeAppRoute(u) {
  try { return /^\/agent-api\/preview\/b\/[^/]+\/[^/]+(\/|$)/u.test(new URL(u).pathname); } catch { return false; }
}

/**
 * The CSS size that shows the whole page at once: the window's width, and its
 * height plus what the page's tallest scroller hides. A UnifyApps page scrolls
 * inside `main.ua-page-workspace`, not the document, so a taller window is the
 * only way to show what is below the fold.
 *
 * Only a scroller that holds the page counts: one that contains a page root
 * (`data-page-id`), or is one, or the page's body, which fills the window
 * below the page's header: at least half the window tall and wide, down to
 * the window's bottom edge. The body is how a page whose root is a full-height
 * Stack scrolls, and how a navigation frame or a module preview, which draws
 * a page root around `main.ua-page-workspace`, scrolls its page. A block that
 * scrolls inside itself, such as a list of 1,815 rows in a narrow rail or a
 * chat history above its input, keeps its own scroll in the shot as it does
 * for the person. Counting it grew the window to the 16000 px limit and
 * filled the shot with empty page. With no page root drawn, every scroller
 * counts.
 */
export function fullPageSize() {
  const scrolls = (n) => {
    const style = getComputedStyle(n);
    return /(auto|scroll)/.test(style.overflowY || style.overflow || '') && n.scrollHeight > n.clientHeight + 1;
  };
  const room = (n) => n.scrollHeight - n.clientHeight;
  const roots = [...document.querySelectorAll('[data-page-id]')];
  // A module drawn inside a page has a root of its own; only the outer ones name the page.
  const pages = roots.filter((r) => !roots.some((other) => other !== r && other.contains(r)));
  const isBody = (n) => {
    if (typeof n.getBoundingClientRect !== 'function') return false;
    const box = n.getBoundingClientRect();
    return box.bottom >= innerHeight - 2 && box.height >= innerHeight / 2 && box.width >= innerWidth / 2;
  };
  const holdsPage = (n) => !pages.length || pages.some((r) => n.contains(r)) || isBody(n);
  const tallest = [...document.querySelectorAll('*')].filter((n) => scrolls(n) && holdsPage(n)).sort((a, b) => room(b) - room(a))[0];
  const hidden = Math.max(tallest ? room(tallest) : 0, document.scrollingElement ? room(document.scrollingElement) : 0);
  return { width: innerWidth, height: innerHeight + hidden };
}

/**
 * Whether `wanted` shows in the page's visible text, `screen` (the body's
 * `innerText`, which leaves out scripts and hidden blocks and applies CSS
 * `text-transform`). Runs of spaces count as one, and case counts: a match
 * that ignored case passed on other text with the same letters (a toast that
 * never showed, "Cr 0" that `find` did not see). An uppercase label is matched
 * as it shows, in capitals.
 */
export function hasText(screen, wanted) {
  const plain = (t) => String(t).replace(/\s+/g, ' ').trim();
  return plain(screen).includes(plain(wanted));
}

/**
 * Records every data-source call the browser makes from now on: the page's
 * `…/workflow/execute/node?name=<source>` requests, under `/api/`, or under
 * `/api-endpoint/external/` on a public app's live address. Each record keeps
 * the source's name, the HTTP status and the start of the request and reply
 * (2000 and 800 characters). The reply is read before the page gets it,
 * because a page that moves to a new document (a Save whose onSuccess
 * navigates) makes Chrome drop the reply. A call is waited for as long as it
 * takes, as it is without the recorder. Records are kept on the browser
 * context, so they survive a new document; `calls` reads them. Running it
 * twice changes nothing.
 */
export async function recordCalls(page) {
  const context = page.context();
  if (context.uaCalls) return 'already recording';
  const calls = context.uaCalls = [];
  // A node's request and reply bodies can carry a live session token (a custom-login
  // automation's own sign-in), an API key or another secret the node was handed. Every
  // likely-secret field is replaced before the text is kept or shown, never just
  // truncated — truncation alone still prints a secret that happens to sit early.
  const SECRET_KEY = /^(authorization|cookie|set-cookie|token|sessiontoken|session_token|apikey|api_key|secretkey|secret_key|secret|password|passwd|accesstoken|access_token|refreshtoken|refresh_token|clientsecret|client_secret|bearer)$/i;
  const redactValue = (value) => {
    if (Array.isArray(value)) return value.map(redactValue);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, v] of Object.entries(value)) out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactValue(v);
      return out;
    }
    return value;
  };
  const redact = (text) => {
    if (!text) return text;
    try {
      return JSON.stringify(redactValue(JSON.parse(text)));
    } catch {
      // Not JSON, or cut off mid-value: redact the raw text's own secret-shaped spots.
      return text
        .replace(/("(?:authorization|cookie|set-cookie|token|sessionToken|session_token|apiKey|api_key|secretKey|secret_key|secret|password|passwd|accessToken|access_token|refreshToken|refresh_token|clientSecret|client_secret)"\s*:\s*)"[^"]*"/gi, '$1"[redacted]"')
        .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1[redacted]')
        .replace(/(_at=)[^;&\s]+/gi, '$1[redacted]');
    }
  };
  // The platform's own chrome runs this node on every page, signed-in or not — it is
  // never one of the page's own data sources, and running on every call interleaves it
  // with the page's real calls with nothing to tell them apart.
  const PLATFORM_NODES = new Set(['fetchUserPreferences']);
  const record = async (route) => {
    const request = route.request();
    const name = (/[?&]name=([^&#]*)/.exec(request.url()) || [])[1];
    const decodedName = name ? decodeURIComponent(name) : null;
    if (decodedName && PLATFORM_NODES.has(decodedName)) { await route.continue(); return; }
    const call = { name: decodedName, url: request.url(), method: request.method(), status: null, post: redact(request.postData() || '').slice(0, 2000), resp: null, at: new Date().toISOString() };
    calls.push(call);
    let response;
    try {
      // No time limit, as the page has none without the recorder: Playwright's
      // own 30 s default aborted a callable that ran longer, so its rows never
      // reached the page and every shot showed the loading state.
      response = await route.fetch({ timeout: 0 });
    } catch (error) {
      // Never send it again: a second POST would run the automation twice.
      call.resp = `failed: ${error.message}`;
      await route.abort('failed').catch(() => {});
      return;
    }
    const body = await response.text().catch((error) => `unreadable: ${error.message}`);
    call.status = response.status();
    call.resp = redact(body).slice(0, 800);
    await route.fulfill({ response, body });
  };
  // Glob patterns, not a RegExp: a RegExp made in this sandbox is not one to Playwright.
  await context.route('**/api/workflow/execute/node*', record);
  await context.route('**/api-endpoint/external/workflow/execute/node*', record);
  return 'recording';
}

/** The app id in a platform URL's `/interfaces/<id>` segment, or null. */
export function interfaceOf(u) {
  try { return (new URL(u).pathname.match(/\/interfaces\/([^/?#]+)/) || [])[1] ?? null; } catch { return null; }
}

/** True for the tenant's own builder or preview address (`/p/<n>/interfaces/...`), the
 * only shape that always needs UnifyApps Headless's saved sign-in. A PUBLIC app's live address
 * (`liveUrl`, `pageUrls`) is on another host with no such route, and needs none. */
export function isTenantRoute(u) {
  try { return /\/p\/[^/]+\/interfaces\//u.test(new URL(u).pathname); } catch { return false; }
}

/** True when a landed URL is a sign-in page. */
export function onSignIn(u) {
  try { return /^\/(login|signin|sign-in)(\/|$)/.test(new URL(u).pathname); } catch { return false; }
}

/** The page part of a builder or preview URL: what follows `/builder/` or `/preview/`, or null.
 * A Code Builder app's preview has no `/interfaces/<id>` segment at all — its address is
 * `/agent-api/preview/b/<appId>/<branch>/...` — so that shape is read too, `page` being
 * whatever the app's own route puts after the branch (empty for the branch's root). */
export function pageOf(u) {
  try {
    const path = new URL(u).pathname;
    const app = path.match(/\/interfaces\/[^/]+\/(builder|preview)\/(.+?)\/?$/);
    if (app) return { route: app[1], page: decodeURIComponent(app[2]) };
    const code = path.match(/\/agent-api\/preview\/b\/[^/]+\/[^/]+(?:\/(.*))?\/?$/);
    return code ? { route: 'preview', page: decodeURIComponent(code[1] ?? '') } : null;
  } catch { return null; }
}

/** The id a URL asks for by id (`…/page/<pageId>` or `…/module/<moduleId>`), or null. */
function idAskedFor(u) {
  return (pageOf(u)?.page.match(/^(?:page|module)\/([^/]+)$/) || [])[1] ?? null;
}

/**
 * Whether `landed` shows the page `requested` asked for, by URL alone. A
 * request with no page part, or one by id (`…/builder/page/<pageId>`, which
 * the platform redirects to the page's path), is met by any page of the same
 * app on the same route; `wrongLanding` then checks the id on the page. A
 * request by path is met only by that path: a page id or an unknown slug in
 * place of the path opens the app's default page instead.
 */
export function samePage(requested, landed) {
  const want = pageOf(requested);
  if (!want) return true;
  const got = pageOf(landed);
  if (!got || got.route !== want.route) return false;
  if (idAskedFor(requested)) return true;
  return got.page === want.page;
}

/**
 * One line saying why a landing is not the page asked for, or null when it is.
 * `shownPageIds` are the `data-page-id`s the landed page draws: a request by
 * id is met only when its id is among them.
 */
export function wrongLanding(requested, landed, shownPageIds = []) {
  const wantedApp = interfaceOf(requested);
  const host = new URL(requested).host;
  if (onSignIn(landed) && !wantedApp) {
    return `${host} opened its own sign-in page: ${landed}. A published app's address has a sign-in for the app's users, and your browser holds only the tenant's sign-in, so nothing was captured. A browser proof opens the tenant's preview route instead: https://<tenant>/p/0/interfaces/<app>/preview/<path>. A publish is proved by the publish_app reply or list_interface_versions. Do not ask the person to sign in.`;
  }
  if (onSignIn(landed)) {
    return `The sign-in UnifyApps Headless saved for ${host} did not work: the page opened ${landed}. Ask the person to sign in again — the router runs the login step of /ua:setup without --check — then run open-page again. Until then, mark the visual proof UNVERIFIED — UnifyApps Headless's saved sign-in has run out.`;
  }
  if (wantedApp && interfaceOf(landed) !== wantedApp) {
    return `The page is on ${landed}, not on interfaces/${wantedApp}. Nothing was captured.`;
  }
  if (/\/(builder|preview)\//.test(new URL(requested).pathname) && !pageOf(landed)) {
    return `The page is on ${landed}, not on a page of the builder or preview. Nothing was captured.`;
  }
  if (!samePage(requested, landed)) {
    return `The page opened ${landed}, not the page ${requested} asked for, so nothing was captured. Either the URL is wrong, or the app sent you there itself. A wrong URL: a builder or preview URL takes the page's path from get_page_paths (its slug for a page at the root: …/builder/<slug>), or its id as …/builder/page/<pageId>; a page id in place of the path opens the app's default page. The app itself: an onPageLoad that navigates, such as the app's own sign-in or a guard page, moves a page you asked for by its right path. Then do what that page asks in this browser (snapshot, fill, click), and run open-page on your URL again.`;
  }
  const id = idAskedFor(requested);
  if (id && shownPageIds.length && !shownPageIds.includes(id)) {
    return `${requested} opened ${landed}, which draws ${shownPageIds.join(', ')}, not ${id}, so nothing was captured. The page route opens the app's default page for an id that is not one of its pages. A module opens at …/builder/module/<moduleId> or …/preview/module/<moduleId>.`;
  }
  return null;
}
