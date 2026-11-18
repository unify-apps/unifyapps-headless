#!/usr/bin/env node
/**
 * Ensure a valid platform `_at` cookie, with zero user interaction whenever
 * possible and zero agent debugging ever. One flow for every surface — the
 * page servers, the object / automation / connection CLIs, and the login playbook.
 *
 *   node scripts/login.mjs <tenant-or-any-platform-url> [--check|--ensure|--manual] [--timeout <s>] [--keep] [--quiet]
 *   node scripts/login.mjs <tenant> --logout
 *   node scripts/login.mjs <tenant> --extra-cookies | --clear-extra-cookies
 *
 * --manual takes a pasted cookie on stdin, checks it with the tenant and
 * saves it. It is the backup whenever the browser sign-in cannot finish.
 *
 * --logout asks the tenant to end the session (`POST /auth/logout`) and removes
 * it from this machine, the saved extra cookies with it. The local removal
 * happens even when the tenant refuses or cannot be reached, so a session is
 * never stuck here. Nothing saved is not an error.
 *
 * A sign-in first asks the tenant to hand the session the person's own browser
 * already holds to a listener on 127.0.0.1 (`handoffLogin` below), and only falls
 * to the Chrome-and-CDP flow when the tenant has no such endpoint.
 * UA_HANDOFF_LOGIN=0 skips the handoff.
 *
 * --extra-cookies takes `name=value; ...` on stdin: cookies the tenant's front
 * door needs besides `_at`, such as an access proxy's session. They are checked
 * with the sign-in before anything is saved, then saved for that host and sent
 * with every request to it. An `_at` among them is the sign-in.
 * Only when the person asks for it. --clear-extra-cookies removes them.
 *
 *
 * The UnifyApps Headless Chrome window is for signing in only, and it closes once the
 * cookie is saved. It is a second copy of the person's own browser app, and
 * macOS sends a link clicked in another app (Slack), and a Dock click on that
 * browser, to whichever copy is running. A copy left open took the person's
 * links whenever their own Chrome was closed: they opened in the UnifyApps Headless
 * profile, or seemed to open nowhere. A builder's `[visual]` proof runs in a
 * browser of its own (skills/app-verify/scripts/browser.mjs open-page), which
 * loads the saved cookie itself.
 *
 * Any platform URL works — a builder page, a `/p/<id>/` page, an automation, an
 * object, or a bare host. The window opens on that exact URL, so the post-SSO
 * redirect lands the user where they were headed.
 *
 * --ensure: probe the stored cookie against <host> first; if it still
 * authenticates, exit 0 in under a second without logging in. This is the
 * call the open-page reference (skills/app-design/references/open-page.md) makes up front — login only actually runs when needed.
 * A valid saved cookie returns immediately. Browser discovery and launch happen
 * only when the saved cookie is missing or the tenant's user-context read rejects it.
 *
 * The login itself handles every Chrome state deterministically:
 *   1. A Chrome is still open on our dedicated profile (left by an older
 *      UnifyApps Headless, or by --keep) → REUSE it: its CDP port is read
 *      off the live process args; open a tab on <host> there and poll. A
 *      fresh `spawn` against a held profile would just hand off to that
 *      instance and exit — the "debug endpoint never came up" failure.
 *   2. The port is stale (Chrome gone or unreachable) → kill anything still
 *      holding the profile, then launch fresh with a new debug port.
 *   3. Poll browser-level Storage.getCookies until `_at` for <host> appears —
 *      instant when the profile's SSO session is alive, after one SSO login
 *      the first time.
 *
 * The value lands in the OS secret store (Keychain, DPAPI or Secret Service),
 * or in <UA_HOME>/session/cookies/<host> (chmod 600) on a machine without
 * one. scripts/platform/auth.mjs owns that choice; every surface reads through
 * it. The Chrome profile sits in <UA_HOME>/session.
 * A candidate cookie is only accepted once the target host's /api/user-context
 * names a person for it — the same read every later command's production
 * check makes — so a stale parent-domain cookie, or a short-lived one from the
 * middle of a single sign-on, can never masquerade as a login. A Chrome
 * this run launched is closed when the run ends, signed in or not. A reused
 * one is closed after a sign-in only when its tabs hold nothing but the
 * tenant, the sign-in pages and blank pages; with other pages in it, it is
 * left open with one line saying why. --keep leaves every window open.
 *
 * Zero dependencies: node's fetch for CDP's HTTP endpoints, and a minimal
 * WebSocket client below for the CDP socket (node 20 has no global WebSocket).
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {
  PROFILE_DIR, clearCookie, hostOf, parseExtraCookies, persistCookie, persistExtraCookies, readCookie,
} from "./platform/auth.mjs";
import { tenantFetch, tenantUrl } from "./platform/tenant-fetch.mjs";
import { verifyCookie } from "./platform/user-context.mjs";
import { chromeCandidates } from "./lib/chrome-candidates.mjs";

const args = process.argv.slice(2);
const rawTarget = args.find((a) => !a.startsWith("--")) ?? "";
const host = hostOf(rawTarget);
const openUrl = rawTarget.startsWith("http") ? rawTarget : `https://${host}`;
const timeoutS = Number(args[args.indexOf("--timeout") + 1]) || 240;
const keepOpen = args.includes("--keep");
const checkOnly = args.includes("--check");
const ensureOnly = args.includes("--ensure");
const manualOnly = args.includes("--manual");
const quiet = args.includes("--quiet");
const extraCookies = args.includes("--extra-cookies");
const clearExtraCookies = args.includes("--clear-extra-cookies");
const logout = args.includes("--logout");
const log = (...m) => { if (!quiet) console.error(...m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!host) {
  console.error("usage: node scripts/login.mjs <platform-host-or-url> [--check|--ensure|--manual|--logout|--extra-cookies|--clear-extra-cookies] [--timeout <s>] [--keep] [--quiet]");
  process.exit(2);
}

mkdirSync(PROFILE_DIR, { recursive: true });

const done = (extra = {}) => {
  console.log(JSON.stringify({ ok: true, host, ...extra }));
  process.exit(0);
};

const verificationUnavailable = (verification) => {
  const detail = verification.status ? `HTTP ${verification.status}` : verification.reason ?? "unknown error";
  console.error(`UnifyApps Headless could not verify the saved session for ${host} (${detail}). The cookie was not changed and a new login was not started. Retry when the tenant is reachable.`);
  console.log(JSON.stringify({
    ok: false,
    host,
    verificationUnavailable: true,
    ...(verification.status ? { status: verification.status } : {}),
    ...(verification.reason ? { reason: verification.reason } : {}),
  }));
  process.exit(1);
};

const manualInstructions = () => [
  `Sign in to https://${host} in your browser, then:`,
  "1. Open Developer Tools.",
  "2. Open Application → Cookies.",
  `3. Select ${host}.`,
  "4. Find _at and copy only its Value.",
  "5. Paste that value into Claude.",
  "The value is private. UnifyApps Headless will not repeat it.",
].join("\n");

// Manual recovery reads the credential from stdin so it never appears in a
// process argument or in this script's output. The playbook obtains it from
// the user only after explaining how to find it and pipes it here once.
if (manualOnly) {
  const cookie = readFileSync(0, "utf8").trim().replace(/^_at=/, "");
  if (!cookie) {
    console.error(`${manualInstructions()}\nNo cookie value was provided.`);
    process.exit(1);
  }
  const verification = await verifyCookie(host, cookie);
  if (verification.state === "indeterminate") verificationUnavailable(verification);
  if (verification.state !== "valid") {
    console.error("That cookie is invalid or expired. Copy a fresh _at Value and try again.");
    process.exit(1);
  }
  persistCookie(host, cookie);
  done({ reused: "manual" });
}

// Ends the session on the tenant, rather than only forgetting it here. The
// handoff signs in with the session the person's browser already holds, so the
// two are one session and dropping our copy alone would leave it alive.
if (logout) {
  if (!readCookie(host)) {
    log(`There is no saved sign-in for ${host}.`);
    done({ loggedOut: true, had: false });
  }
  let ended = false;
  let detail;
  try {
    // GET /auth/logout is refused: the tenant blocks it by default.
    const answer = await tenantFetch(host, "/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
    });
    // The 303 is the success: it carries the cookie clears. A 401 means the
    // tenant had already dropped the session, which is the same end state.
    ended = answer.status < 400 || answer.status === 401;
    if (!ended) detail = `HTTP ${answer.status}`;
  } catch (error) {
    detail = error?.code === "AUTH_EXPIRED" ? "the saved sign-in was already gone" : "the tenant could not be reached";
  }
  // Whatever the tenant answered. A session that cannot be dropped while the
  // tenant is unreachable is a session nobody can drop.
  clearCookie(host);
  persistExtraCookies(host, []);
  log(ended
    ? `Signed out of ${host}. The browser you signed in with is signed out too: it was the same session.`
    : `Removed the saved sign-in for ${host}, but could not tell the tenant to end it (${detail}). Sign out in your browser as well.`);
  done({ loggedOut: true, had: true, endedOnTenant: ended, ...(detail ? { detail } : {}) });
}


if (clearExtraCookies) {
  persistExtraCookies(host, []);
  done({ extraCookies: [] });
}

// Extra cookies come from stdin for the same reason as --manual. The tenant
// checks them with the sign-in, sent from memory, and only a set it accepts is
// saved. An `_at` among them is the sign-in; with none saved, it is required.
if (extraCookies) {
  let parsed;
  try { parsed = parseExtraCookies(readFileSync(0, "utf8")); }
  catch (error) { console.error(error.message); process.exit(1); }
  if (!parsed.cookies.length) {
    console.error("No extra cookies were provided. Paste name=value pairs separated by \";\".");
    process.exit(1);
  }
  const cookie = parsed.at ?? readCookie(host);
  if (!cookie) {
    console.error(`There is no sign-in for ${host} to check these cookies with. Paste the _at cookie with them: _at=<value>; name=value; ... Nothing was saved.`);
    process.exit(1);
  }
  const verification = await verifyCookie(host, cookie, { extraCookies: parsed.cookies });
  if (verification.state === "indeterminate") verificationUnavailable(verification);
  if (verification.state !== "valid") {
    console.error(`${host} did not accept the sign-in with these cookies. Nothing was saved.`);
    process.exit(1);
  }
  if (parsed.at) persistCookie(host, parsed.at);
  persistExtraCookies(host, parsed.cookies);
  done({ extraCookies: parsed.cookies.map(({ name }) => name) });
}

// ---------- the handoff: sign in through the person's own browser ----------
// TEMPORARY. This path is here to be tried on a real tenant. Once it holds, it
// becomes the only one and everything below it goes; if it does not, this block
// goes instead. UA_HANDOFF_LOGIN=0 restores the Chrome-and-CDP flow exactly.
const handoffEnabled = () => process.env.UA_HANDOFF_LOGIN !== "0";

const HANDOFF_PATH = "/api/session/ide-handoff";
// How long the handoff gets before the sign-in page follows it. A browser that
// holds a session is redirected in well under a second; this only has to outlast
// a browser that was not running yet. A person who is not signed in sees the
// tenant's bare 401 for this long, so it is kept short.
const SIGN_IN_AFTER_MS = 4_000;

/**
 * Trades the session the person's own browser already holds for this tenant's
 * `_at`, without a second Chrome and without reading a cookie jar: the tenant
 * redirects the browser to a listener on 127.0.0.1 with a single-use code, and
 * the code is redeemed from here.
 *
 * Answers `{ cookie }` on success and `undefined` for every other outcome, so a
 * tenant whose build predates the endpoint falls through to the CDP flow below.
 */
async function handoffLogin(tenant, { timeoutS: deadlineS }) {
  // Every sign-in pays for this probe, including on the tenants that fall through
  // to Chrome, so a tenant that never answers must not hold one up.
  const briefly = (url, init) => fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });

  // Probed before a browser opens. A tenant without the endpoint would otherwise
  // leave the person watching a tab that can never come back. The 401 is the
  // endpoint refusing an unauthenticated read, which is what proves it is there.
  try {
    const probe = await briefly(tenantUrl(tenant, HANDOFF_PATH));
    if (probe.status !== 401) return undefined;
  } catch { return undefined; }

  const state = crypto.randomBytes(24).toString("base64url");
  const server = http.createServer();
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  }).catch(() => undefined);
  if (!port) return undefined;

  const shut = () => new Promise((resolve) => server.close(() => resolve()));

  let signInTimer;
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), deadlineS * 1000);
    timer.unref();
    server.on("request", (req, res) => {
      const asked = new URL(req.url, "http://127.0.0.1");
      if (asked.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const offered = Buffer.from(asked.searchParams.get("state") ?? "");
      const mine = Buffer.from(state);
      if (offered.length !== mine.length || !crypto.timingSafeEqual(offered, mine)) {
        res.writeHead(400).end("state mismatch");
        return;
      }
      // Back to the tenant, rather than a page of ours. The browser has to be
      // navigated here for the code to arrive at all, so the only choice is where
      // it lands afterwards, and a raw 127.0.0.1 URL is not it.
      res.writeHead(302, { location: tenantUrl(tenant, "/"), "cache-control": "no-store" }).end();
      clearTimeout(timer);
      clearTimeout(signInTimer);
      resolve(asked.searchParams.get("code") ?? undefined);
    });

    // `start` is a cmd builtin, not a program, so Windows needs the shell and the
    // empty "" that `start` otherwise eats as the new window's title.
    const [opener, ...lead] = process.platform === "darwin" ? ["open"]
      : process.platform === "win32" ? ["cmd", "/c", "start", ""]
      : ["xdg-open"];
    const openInBrowser = (href) => {
      const browser = spawn(opener, [...lead, href], { stdio: "ignore", detached: true });
      // No opener on this machine kills the process instead of raising: without a
      // listener, a detached spawn's error is thrown. Fall through to Chrome instead.
      browser.on("error", () => { clearTimeout(timer); clearTimeout(signInTimer); resolve(undefined); });
      browser.unref();
    };

    // The handoff itself, first. A browser that already holds a session is
    // redirected to the listener by it, with no page to look at and nothing to
    // press, which is the whole point of this path.
    const handoff = new URL(tenantUrl(tenant, HANDOFF_PATH));
    handoff.searchParams.set("port", String(port));
    handoff.searchParams.set("state", state);

    // A browser with no session gets a bare 401 from it, because /api is served
    // by the API, not by the pages, and nothing there sends anyone to a login
    // page. The sign-in page cannot go first either: it is a public page that
    // renders its form whether or not the person is already signed in, so
    // leading with it would ask every person to sign in again. So: the handoff,
    // then the sign-in page for whoever the handoff could not answer.
    const signIn = new URL(tenantUrl(tenant, "/login"));
    // `returnTo` stays a relative path, because the sign-in page drops an
    // absolute one. Its own query has to arrive encoded as part of the value.
    // Left raw, Next reads `port` and `state` as siblings of `returnTo` instead.
    signIn.searchParams.set("returnTo", `${HANDOFF_PATH}?port=${port}&state=${state}`);

    openInBrowser(handoff.href);
    signInTimer = setTimeout(() => {
      log(`Not signed in to ${tenant} in that browser. Opening its sign-in page.`);
      log(`SIGN_IN_LINK ${signIn.href}`);
      openInBrowser(signIn.href);
    }, SIGN_IN_AFTER_MS);
    signInTimer.unref();

    log(`Opening ${tenant} in your own browser. If you are already signed in there is nothing ` +
      `to do and this finishes by itself; if you are not, the sign-in page follows. ` +
      `UnifyApps Headless waits up to ${Math.round(deadlineS / 60)} minutes, and you can paste ` +
      `the tenant cookie (_at) in this chat instead.`);
    // The two links the person can paste themselves when no tab opens: the first
    // finishes at once in a browser that is signed in, the second signs in first.
    log(`HANDOFF_LINK ${handoff.href}`);
    log(`SIGN_IN_LINK ${signIn.href}`);
  });

  clearTimeout(signInTimer);
  await shut();
  if (!code) return undefined;

  // Not tenantFetch. That attaches the saved cookie, and the whole point here is
  // that there is not one yet. tenantUrl still checks the host before the call.
  const redeemUrl = new URL(tenantUrl(tenant, "/auth/set-cookie-from-token"));
  redeemUrl.searchParams.set("token", code);
  let redeemed;
  try { redeemed = await briefly(redeemUrl, { method: "POST" }); }
  catch { return undefined; }
  if (!redeemed.ok) return undefined;

  const cookie = (redeemed.headers.getSetCookie?.() ?? []).join("; ").match(/(?:^|[;\s])_at=([^;]+)/)?.[1];
  if (!cookie) return undefined;

  const verification = await verifyCookie(tenant, cookie);
  return verification.state === "valid" ? { cookie } : undefined;
}


// ---------- a minimal WebSocket client (RFC 6455, plain ws:// to 127.0.0.1) ----------

function wsFrame(op, payload) {
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | op, 0x80 | len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, body]);
}

function connectWs(wsUrl) {
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: u.hostname, port: Number(u.port || 80) });
    const handlers = { message: () => {} };
    const send = (op, payload) => { if (!sock.destroyed) sock.write(wsFrame(op, payload)); };
    const api = {
      send: (text) => send(0x1, Buffer.from(text)),
      onmessage: (fn) => { handlers.message = fn; },
      close: () => { try { send(0x8, Buffer.alloc(0)); } catch {} sock.end(); },
    };
    let buf = Buffer.alloc(0);
    let upgraded = false;
    let parts = [];
    sock.on("error", reject);
    sock.once("connect", () => {
      const key = crypto.randomBytes(16).toString("base64");
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const end = buf.indexOf("\r\n\r\n");
        if (end === -1) return;
        const status = buf.subarray(0, end).toString().split("\r\n")[0];
        buf = buf.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/.test(status)) { sock.destroy(); reject(new Error(`websocket upgrade refused: ${status}`)); return; }
        upgraded = true;
        resolve(api);
      }
      for (;;) {
        if (buf.length < 2) return;
        const fin = (buf[0] & 0x80) !== 0;
        const op = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (masked) off += 4;
        if (buf.length < off + len) return;
        let payload = buf.subarray(off, off + len);
        if (masked) {
          const mask = buf.subarray(off - 4, off);
          payload = Buffer.from(payload);
          for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
        }
        buf = buf.subarray(off + len);
        if (op === 0x8) { sock.end(); return; }
        if (op === 0x9) { send(0xa, payload); continue; }
        if (op === 0xa) continue;
        parts.push(payload);
        if (fin) { const text = Buffer.concat(parts).toString(); parts = []; handlers.message(text); }
      }
    });
  });
}

// ---------- CDP helpers ----------

async function probeEndpoint(port) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    return (await res.json()).webSocketDebuggerUrl;
  } catch {
    return undefined;
  }
}

async function connectCdp(wsUrl) {
  const ws = await connectWs(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.onmessage((text) => {
    const msg = JSON.parse(text);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return {
    ws,
    cdp: (method, params = {}) =>
      new Promise((res) => {
        const id = nextId++;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      }),
  };
}

// ---------- find-or-launch Chrome on OUR profile ----------

/** A previous run's Chrome still holding the profile. Its debug port is read
 *  off the live process args (`--remote-debugging-port=N` next to our
 *  `--user-data-dir`), because Chrome no longer reliably writes
 *  DevToolsActivePort when the port was fixed at launch. */
async function reuseExisting() {
  const candidates = new Set();
  try {
    const port = Number(readFileSync(path.join(PROFILE_DIR, "DevToolsActivePort"), "utf8").split("\n")[0]);
    if (port) candidates.add(port);
  } catch { /* file absent on modern Chrome */ }
  try {
    const procs = spawnSync("pgrep", ["-fl", PROFILE_DIR]).stdout?.toString() ?? "";
    for (const match of procs.matchAll(/--remote-debugging-port=(\d+)/g)) {
      candidates.add(Number(match[1]));
    }
  } catch { /* pgrep unavailable → fresh launch path handles it */ }
  for (const port of candidates) {
    const wsUrl = await probeEndpoint(port);
    if (wsUrl) {
      log(`reusing the Chrome window already open on this profile (port ${port}).`);
      return { wsUrl, port, launched: undefined };
    }
  }
  return undefined;
}

const onPath = (name) =>
  (process.env.PATH ?? "").split(path.delimiter).map((dir) => path.join(dir, name)).find((f) => existsSync(f));
function findChrome() {
  for (const candidate of chromeCandidates(process.platform, process.env)) {
    const found = path.isAbsolute(candidate) ? (existsSync(candidate) ? candidate : undefined) : onPath(candidate);
    if (found) return found;
  }
  return undefined;
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

async function launchFresh() {
  // Anything still holding the profile at this point is a zombie (its debug
  // endpoint did not answer) — a new launch against a held profile hands off
  // and exits, so clear it first.
  spawnSync("pkill", ["-f", PROFILE_DIR]);
  await sleep(400);

  const chrome = findChrome();
  if (!chrome) {
    console.error(`No supported browser was found.\n${manualInstructions()}`);
    process.exit(1);
  }
  const port = await freePort();
  const child = spawn(
    chrome,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${PROFILE_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      openUrl,
    ],
    // Detached + unref so the window can outlive this script.
    { stdio: "ignore", detached: true },
  );
  child.unref();
  let died = false;
  child.on("exit", () => { died = true; });

  for (let attempt = 0; attempt < 50 && !died; attempt++) {
    const wsUrl = await probeEndpoint(port);
    if (wsUrl) return { wsUrl, port, launched: child };
    await sleep(200);
  }
  console.error("Chrome started but its debug endpoint never came up (or the window was closed).");
  process.exit(1);
}

// A reused window may be sitting on some other page. If a tab on the target
// host is already open, focus it; otherwise open one on the exact URL — so the
// user lands where they were headed, never a stack of duplicate tabs.
async function focusOrOpenTab(activeSession, activeCdp) {
  const wantPath = rawTarget.startsWith("http") ? new URL(openUrl).pathname : undefined;
  let acted = false;
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${activeSession.port}/json/list`)).json();
    const pages = tabs.filter((tab) => tab.type === "page" && typeof tab.url === "string");
    const samePage = wantPath
      ? pages.find((tab) => { try { const u = new URL(tab.url); return u.host === host && u.pathname.startsWith(wantPath); } catch { return false; } })
      : undefined;
    const sameHost = pages.find((tab) => { try { return new URL(tab.url).host === host; } catch { return false; } });
    if (samePage) {
      // The exact page is already open — just bring it forward.
      await activeCdp("Target.activateTarget", { targetId: samePage.id });
      acted = true;
    } else if (!wantPath && sameHost) {
      // Only a host was asked for and a platform tab exists — no new tab needed.
      await activeCdp("Target.activateTarget", { targetId: sameHost.id });
      acted = true;
    }
  } catch { /* fall through to a fresh tab */ }
  // Exact page wanted but not open (or no platform tab at all): open it as its
  // own tab — never navigate an existing tab out from under the user — and
  // bring it forward too.
  if (!acted) {
    const created = await activeCdp("Target.createTarget", { url: openUrl });
    if (created.result?.targetId) await activeCdp("Target.activateTarget", { targetId: created.result.targetId });
  }
}

// The sign-in happens in this window, not in the person's own Chrome, so a
// fresh window is brought to the front: left behind other windows, it looks
// as if nothing opened, and the person waits for a step that never comes.
async function bringToFront(activeSession, activeCdp) {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${activeSession.port}/json/list`)).json();
    const page = tabs.find((tab) => tab.type === "page");
    if (page) await activeCdp("Target.activateTarget", { targetId: page.id });
  } catch { /* the window still works from behind other windows */ }
}

// The pages a sign-in passes through. Anything else in a reused window is a
// page the person opened there, often a link macOS sent to this copy.
const IDP_HOSTS = ["accounts.google.com", "login.microsoftonline.com", "login.okta.com"];
const signInPage = (url) => {
  if (!url || url === "about:blank" || url.startsWith("chrome://")) return true;
  try {
    const pageHost = new URL(url).host;
    return pageHost === host || IDP_HOSTS.some((idp) => pageHost === idp || pageHost.endsWith(`.${idp}`));
  } catch { return false; }
};

/**
 * Closes the Chrome this sign-in used, so it never outlives the sign-in: see
 * the header for the links it took while it stayed open. A reused window that
 * holds other pages is the person's to close.
 */
async function closeSignInChrome(activeSession, activeCdp) {
  if (keepOpen) return;
  if (!activeSession.launched) {
    let pages = [];
    try {
      pages = (await (await fetch(`http://127.0.0.1:${activeSession.port}/json/list`)).json()).filter((tab) => tab.type === "page");
    } catch { return; }
    if (!pages.every((tab) => signInPage(tab.url))) {
      log("The UnifyApps Headless Chrome window is still open with other pages in it, so UnifyApps Headless left it open. Quit it when you are done: while it runs, links you click in other apps can open there instead of in your own browser.");
      return;
    }
  }
  try { await Promise.race([activeCdp("Browser.close"), sleep(2000)]); } catch {}
  try { activeSession.launched?.kill(); } catch {}
}

// --check never touches the browser: it gives guided flows a decision point
// where they can offer browser or manual-cookie login before either begins.
// The skip-login fast path also belongs to --ensure. A run without either flag
// is an explicit "get me a fresh session" and must always reach the browser —
// the earlier unconditional check made forced re-logins exit early on a probe
// that lied, which read as "script insists cookie valid" while every entity
// call 401'd.
if (checkOnly || ensureOnly) {
  if (process.env.UA_FAKE === "1" && process.env.UA_FAKE_AUTH !== "dead") done({ reused: "fake" });
  const cookie = readCookie(host);
  if (cookie) {
    const verification = await verifyCookie(host, cookie);
    if (verification.state === "valid") {
      // Re-save what just validated so it sits in the OS store, not the old file.
      persistCookie(host, cookie);
      log(`saved session for ${host} is still valid — continuing.`);
      done({ reused: "cookie" });
    }
    if (verification.state === "indeterminate") verificationUnavailable(verification);
  }
  if (checkOnly) {
    console.log(JSON.stringify({ ok: false, host, loginRequired: true }));
    process.exit(3);
  }
  log("stored cookie missing or rejected by the tenant — logging in.");
}

if (handoffEnabled()) {
  const handed = await handoffLogin(host, { timeoutS });
  if (handed) {
    const savedIn = persistCookie(host, handed.cookie);
    log(`logged in on ${host} through your own browser — session saved in ${savedIn}`);
    done({ reused: "handoff" });
  }
}


const session = (await reuseExisting()) ?? (await launchFresh());
const { ws, cdp } = await connectCdp(session.wsUrl);

if (session.launched) await bringToFront(session, cdp);
else await focusOrOpenTab(session, cdp);

// Nothing here reads a key: the poll below notices the sign-in by itself.
log(`Not signed in to ${host}. Sign in through the UnifyApps Headless Chrome window that just opened. ` +
  "It is a separate window from your own Chrome, so it needs its own sign-in, and it closes by itself once you are signed in. " +
  `UnifyApps Headless notices the sign-in by itself; there is nothing to press. It waits up to ${Math.round(timeoutS / 60)} minutes. ` +
  "If you cannot sign in, paste the tenant cookie (_at) in this chat instead.");

// ---------- poll for the cookie ----------

const domainMatches = (cookieDomain) => {
  const domain = cookieDomain.replace(/^\./, "");
  return host === domain || host.endsWith(`.${domain}`);
};

const deadline = Date.now() + timeoutS * 1000;
let found;
let verificationFailure;
let polls = 0;
// The `_at` cookie can live on the parent domain (.unifyapps.com), so a
// STALE cookie from another host's session matches by domain the moment the
// tab opens. A candidate only counts once the target host's user-context read
// names a person for it — until then, keep polling: the user is still logging
// in and the platform will overwrite the cookie when they finish.
let lastRejected;
while (Date.now() < deadline) {
  const reply = await cdp("Storage.getCookies");
  const candidate = (reply.result?.cookies ?? []).find(
    (c) => c.name === "_at" && domainMatches(c.domain),
  );
  if (candidate && candidate.value !== lastRejected) {
    const verification = await verifyCookie(host, candidate.value);
    if (verification.state === "valid") {
      found = candidate;
      break;
    }
    if (verification.state === "indeterminate") {
      verificationFailure = verification;
      break;
    }
    lastRejected = candidate.value;
    log("a session cookie is present but the tenant does not accept it yet — waiting for a fresh login…");
  }
  // Tight polling at first (the already-logged-in case lands in a second or
  // two), relaxed once it is clearly waiting on a human.
  await sleep(polls++ < 20 ? 500 : 2000);
}

if (verificationFailure) {
  if (session.launched && !keepOpen) {
    try { await Promise.race([cdp("Browser.close"), sleep(2000)]); } catch {}
    try { session.launched.kill(); } catch {}
  }
  try { ws.close(); } catch {}
  verificationUnavailable(verificationFailure);
}

if (!found) {
  console.error(`Login did not finish on ${host}.\n${manualInstructions()}`);
  // Close only a Chrome this run launched; a reused window is the user's.
  if (session.launched && !keepOpen) {
    try { await Promise.race([cdp("Browser.close"), sleep(2000)]); } catch {}
    try { session.launched.kill(); } catch {}
  }
  try { ws.close(); } catch {}
  process.exit(1);
}

const savedIn = persistCookie(host, found.value);
log(`logged in on ${host} — session saved in ${savedIn}`);

await closeSignInChrome(session, cdp);
try { ws.close(); } catch {}
done({ reused: session.launched ? undefined : "window", expires: found.expires });
