#!/usr/bin/env node
/**
 * Runs one playwright-cli command in a browser of the caller's own.
 *
 *   node browser.mjs <browser-folder> <command> [args...]
 *
 * Two kinds of caller drive a browser through it, each in a folder of its own:
 * - a builder proving a `[visual]` task, in `browser/` inside its work folder,
 *   signed in as the person with `open-page` (below);
 * - a test-author helper, in its folder inside the run's private folder,
 *   signed in as the test user with `state-load` of the saved sign-in.
 *
 * The folder is the whole isolation: it names the browser session, holds the
 * on-disk profile, and receives the files playwright-cli writes into its
 * working directory. Callers running side by side therefore never share a
 * browser, a profile, cookies, storage or an output folder, and nothing lands
 * in the solution's working folder by accident.
 *
 * Each command is one run of the pinned `@playwright/cli` through `npx --prefer-offline -y`:
 * the cached copy starts without a registry round trip, and a machine that has never run it
 * still fetches it once.
 *
 * `open` gets `--profile=<folder>/profile` unless it names a profile itself. The profile is on
 * disk because Chrome dies at launch with an in-memory one on managed Macs (mandatory cloud
 * enrollment), which is playwright-cli's default.
 *
 * The browser is Playwright's Chrome for Testing (`--browser=chromium`), never the person's
 * own Chrome app. macOS treats every running copy of one app as that app: a link clicked in
 * Slack, and a Dock click on Chrome, go to a running copy. A copy of their Chrome that we
 * started took their links while their own Chrome was closed, and a hidden one shows
 * nothing at all. Chrome for Testing is another app (`com.google.chrome.for.testing`), so
 * it never gets them. Every `open` installs it first when it is missing (about 100 MB, once
 * per machine; under a second when it is there). `node browser.mjs --install` does only
 * that, with Playwright's download progress on stderr, for the app-test-author skill's
 * Playwright server, which opens the same browser.
 *
 * Every call prints `browser: <folder>` to stderr before it runs, so a caller sees which browser
 * it drove. Callers share Claude's scratchpad, and a script one of them left there under a
 * common name once steered other helpers' calls into its browser with nothing showing it.
 *
 * Commands that reach past the caller's own session are refused: `close-all` and `kill-all`
 * stop every browser, `attach` joins a browser the caller did not start, and a
 * session flag of its own would steer the command at another caller's browser.
 *
 * Commands of its own, for a `[visual]` proof on the tenant:
 *   open-page <url>  Open a builder or preview page signed in as the person who
 *                    ran /ua:setup. The first time, it asks the tenant which
 *                    environment it runs, starts this folder's browser on a
 *                    profile in a private temp folder,
 *                    starts recording data-source calls, and loads the sign-in
 *                    UnifyApps Headless saved. Every time, it loads the URL fresh, waits up
 *                    to 20 s until the page draws its blocks, and checks it
 *                    landed on the page asked for. Prints JSON:
 *                    { ok, url, loadedAt, pageIds, blocks }.
 *   open-page <url> --fake-media
 *                    The same, in a browser with a fake camera and microphone,
 *                    for a page whose blocks use one. Before the browser
 *                    starts it writes `.playwright/cli.config.json` in the
 *                    browser folder (playwright-cli reads it there at launch):
 *                    Chrome's fake media devices and the camera and microphone
 *                    permissions. A browser of this folder already open
 *                    without them is closed and started again. Without the
 *                    flag, a browser that starts removes that file.
 *   calls            The data-source calls the page made since open-page, as
 *                    JSON: [{ name, url, method, status, post, resp, at }],
 *                    post and resp cut to 2000 and 800 characters.
 *   wait-for <text> [cap-ms]
 *                    Wait until the text is on screen, as it shows, case
 *                    included, up to cap-ms (default 10000). A read with a
 *                    cap, never a sleep. Exit 6 when it does not come.
 *   page-shot <width>
 *                    Show the preview at one of the platform's device sizes
 *                    (`DEVICE_SIZES` in scripts/lib/page-jobs.mjs): set the
 *                    window to that size, pick the same size in the preview's
 *                    "Switch variant" menu, wait until the page frame takes
 *                    that width, make the window as tall as the page, and save
 *                    a screenshot of the whole page to `page-<width>.png` in
 *                    the browser folder. It loads the last open-page URL
 *                    fresh first, so the shot shows the page as saved now,
 *                    after any write since — and so it also drops any
 *                    interactive state (a clicked tab, typed text, an open
 *                    dialog) from an earlier command: shoot right after the
 *                    action that produces a state, since page-shot cannot
 *                    capture it (or see --no-reload below). Prints JSON:
 *                    { file, width, height, cut, variantMenu }. A MOBILE or
 *                    DISPLAY app's preview has no variant menu (the platform
 *                    draws one only for a WEB app), so there the shot is the
 *                    window at that size, and variantMenu is false — and
 *                    since there is no menu to match, <width> there is not
 *                    limited to DEVICE_SIZES, only to a plausible viewport
 *                    width (200-3000). Only on a preview URL: the builder
 *                    draws its canvas scaled, so a shot of it shows the page
 *                    at the wrong size.
 *   page-shot <width> --input <name>=<value> [--input <name>=<value> ...]
 *                    The same, with page inputs: each goes on the last
 *                    open-page URL as a query value (the preview reads a
 *                    page input from the query value of its name, for a page
 *                    whose input schema names it), the page is loaded fresh
 *                    and checked as open-page checks it, and then shot. The
 *                    JSON adds { inputs }. Later shots in this browser keep
 *                    those values until the next open-page.
 *   page-shot <width> --no-reload
 *                    The same, but skips the fresh reload: shoots whatever is
 *                    already on screen in this browser instead of discarding
 *                    it. This is the one way to capture an interactive state
 *                    (a clicked tab, typed text, an open dialog) — but the
 *                    shot then shows only what is on screen right now, not
 *                    necessarily what the platform has saved; reach for a
 *                    plain page-shot first, and use this only when the state
 *                    being shown IS the thing to prove. Cannot be combined
 *                    with --input, since an input only takes effect on a
 *                    fresh load.
 *   fit-page         Make the window as tall as the page, so the next
 *                    screenshot holds what is below the fold too. It keeps
 *                    the page as it is, so after a page write run open-page
 *                    again first.
 *                    page-shot and fit-page refuse after an open-page that
 *                    failed, since the page left open is from before it.
 *   close            Close the browser. For an open-page browser it also
 *                    deletes the private folder that holds its sign-in.
 * Everything else is playwright-cli's own command, run as given.
 *
 * In an open-page browser, the commands that print or save the person's
 * sign-in are refused: run-code, state-save, cookie-list, cookie-get, the
 * storage -list and -get commands, request, request-headers, response-headers
 * and tracing. `eval` runs in the page, which cannot read the http-only cookie.
 *
 * Exit codes of open-page: 0 the page drew, and it is the page asked for ·
 * 2 bad arguments · 3 the browser would not start · 4 the page would not load,
 * or the tenant could not be reached · 5 the page landed somewhere else: the
 * sign-in page, another app or another page · 6 the page drew no block in 20 s
 * · 7 the tenant would not say which environment it runs.
 * The message on stderr says what the person or the router does next.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICE_SIZES } from "../../../scripts/lib/page-jobs.mjs";
import { fullPageSize, hasText, isCodeAppRoute, isTenantRoute, pageShown, recordCalls, wrongLanding } from "./page-checks.mjs";

// `calls` (and anything else here printing JSON) can write to a reader that
// closed early, such as a pipe into `head` or a tool that stops reading once
// it has what it wants. Without this, that is an unhandled EPIPE crash;
// Node's own advice is to exit quietly instead, as nothing further could be
// written anyway.
process.stdout.on("error", (err) => { if (err.code === "EPIPE") { process.exit(0); return; } throw err; });

const CLI = "@playwright/cli@0.1.21";
/**
 * How every playwright-cli command is started. `--prefer-offline` makes npx run the copy in
 * its cache without asking the npm registry first, and still fetch it when it is missing. A
 * bare `npx -y` revalidates the package against the registry on every command, and a snapshot
 * or click waited up to 80 s for that answer on a slow network (0.6 s with the flag).
 */
const NPX_ARGS = ["--prefer-offline", "-y", CLI];
const REFUSED = new Set(["close-all", "kill-all", "attach", "detach"]);
// In a browser signed in as the person, these print or save the sign-in. A
// text check like this stops the plain ways, not a determined shell.
const REFUSED_SIGNED_IN = new Set([
  "open", "run-code", "state-save", "cookie-list", "cookie-get",
  "localstorage-list", "localstorage-get", "sessionstorage-list", "sessionstorage-get",
  "request", "request-headers", "response-headers", "tracing-start", "tracing-stop",
]);
const SESSION_FLAG = /^(-s|--session)(=|$)/u;
const BROWSER_FLAG = /^--browser(=|$)/u;
const PROFILE_FLAG = /^--(profile|persistent)(=|$)/u;

/** Where open-page keeps a browser's profile, and so the person's sign-in. */
export const PROOF_PREFIX = "ua-proof-browser-";
export const STALE_MS = 12 * 60 * 60 * 1000;

// Budgets. Each is one measured expectation, not a tuning knob.
const LOAD_CAP_MS = 15000;   // the builder's load event; a page still loading past this is judged on what it shows
const DRAW_CAP_MS = 20000;   // the builder canvas draws its first block 3-10 s after load; past this it is not coming
const DRAW_POLL_MS = 300;
const PAINT_BEAT_MS = 600;   // one frame past the first blocks, so images and fonts have painted
const MAX_HEIGHT = 16000;    // Chrome will not capture a taller image
const WAIT_CAP_MS = 10000;   // a data-source round trip on the preview route finishes well inside this
const VARIANT_CAP_MS = 5000; // the preview's variant menu opens, and its frame takes the picked width, within a second of a click
const FIT_ROUNDS = 4;        // a page settles in 2 measures; more means it grows with the window and never will
// A seed height for a width with no DEVICE_SIZES entry (a MOBILE or DISPLAY preview, which has
// no variant menu to size against). fitHeight re-measures the real content and resizes to it
// within a round or two, so this only has to be a plausible starting viewport, not the right one.
const DEFAULT_SHOT_HEIGHT = 800;
const MIN_SHOT_WIDTH = 200;
const MAX_SHOT_WIDTH = 3000;
/** Every width page-shot will actually try to shoot: a DEVICE_SIZES entry, or any plausible
 * viewport width for a preview with no variant menu. main() uses this to know whether to
 * require an opened page before calling pageShot; pageShot uses it to refuse anything else. */
const isShotWidth = (w) => DEVICE_SIZES.some((s) => s.width === Number(w))
  || (Number.isInteger(Number(w)) && Number(w) >= MIN_SHOT_WIDTH && Number(w) <= MAX_SHOT_WIDTH);

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

/** npx from PATH first, then the one installed beside this node, as `run-node.sh` machines have it. */
function resolveNpx() {
  const name = process.platform === "win32" ? "npx.cmd" : "npx";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, name))) return path.join(dir, name);
  }
  const beside = path.join(path.dirname(process.execPath), name);
  return fs.existsSync(beside) ? beside : name;
}

const keyOf = (folder) => crypto.createHash("sha256").update(folder).digest("hex").slice(0, 12);

/** Stable per folder, distinct between folders, and short enough to read in `playwright-cli list`. */
export const sessionName = (folder) => `ua-${keyOf(folder)}`;

/** The private temp folder that holds an open-page browser's profile. */
export const proofFolderFor = (folder, tmp = os.tmpdir()) => path.join(tmp, `${PROOF_PREFIX}${keyOf(folder)}`);

/**
 * What `open-page --fake-media` writes for playwright-cli to read at launch: Chrome's fake
 * camera and microphone, with no permission prompt, and both permissions granted to the page.
 * Without it a camera or microphone block gets `NotAllowedError`.
 */
export const FAKE_MEDIA_CONFIG = Object.freeze({
  browser: {
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    contextOptions: { permissions: ["camera", "microphone"] },
  },
});

/**
 * What the last open-page in `folder` loaded. open-page removes it first and
 * writes it only when the page drew, so after a failed open-page page-shot and
 * fit-page refuse rather than shoot the page an earlier call left open, which
 * is from before the last write.
 */
export const lastOpenFile = (folder) => path.join(folder, ".ua-open-page.json");

/** The page the last open-page loaded, or null when none answered ok since its last try. */
export function lastOpened(folder) {
  try {
    return JSON.parse(fs.readFileSync(lastOpenFile(folder), "utf8"));
  } catch {
    return null;
  }
}

/** Where playwright-cli looks for its config when it runs in `folder`. */
export const fakeMediaConfigFile = (folder) => path.join(folder, ".playwright", "cli.config.json");

const isLink = (file) => { try { return fs.lstatSync(file).isSymbolicLink(); } catch { return false; } };

/**
 * Writes FAKE_MEDIA_CONFIG into the browser folder (`on`), or removes the file when it holds
 * exactly that config (`off`), so the next browser that starts there gets what was asked for.
 * A link in place of the folder or the file is refused: it would send the write elsewhere.
 */
export function setFakeMedia(folder, on) {
  const dir = path.dirname(fakeMediaConfigFile(folder));
  const file = fakeMediaConfigFile(folder);
  if (isLink(dir) || isLink(file)) throw new Error(`${isLink(dir) ? dir : file} is a link; remove it and run open-page again`);
  const text = `${JSON.stringify(FAKE_MEDIA_CONFIG)}\n`;
  if (on) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, text);
    return;
  }
  let current = null;
  try { current = fs.readFileSync(file, "utf8"); } catch { return; }
  if (current === text) fs.rmSync(file, { force: true });
}

/** Runs playwright-cli in this folder's session. `capture` keeps its output for this script. */
function cli(folder, args, { capture = false } = {}) {
  return spawnSync(resolveNpx(), [...NPX_ARGS, `-s=${sessionName(folder)}`, ...args], {
    cwd: folder,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  });
}

const outputOf = (run) => `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().split("\n").slice(-3).join(" ");

/** Runs one function in playwright-cli's process and answers its JSON value. */
function runCode(folder, source) {
  // From a file, so no shell ever quotes the code.
  const file = path.join(folder, ".ua-run-code.js");
  fs.writeFileSync(file, source);
  try {
    const run = cli(folder, ["--raw", "run-code", `--filename=${path.basename(file)}`], { capture: true });
    if (run.error) throw new Error(`could not start playwright-cli: ${run.error.message}`);
    if (run.status !== 0) throw new Error(outputOf(run) || `playwright-cli exited ${run.status}`);
    try { return JSON.parse(run.stdout); } catch { throw new Error(outputOf(run) || "no answer"); }
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/** The line `--install` prints before it starts, so a slow first download is not silent. */
export const INSTALL_NOTICE = "Getting Playwright's Chrome for Testing ready for UnifyApps Headless's browsers. The first time on this machine it downloads the browser, which can take several minutes on a slow network; Playwright's progress follows.";

/**
 * Installs Chrome for Testing when it is missing; quick when it is there. With
 * `progress`, Playwright's own download output goes to stderr as it comes,
 * after INSTALL_NOTICE; otherwise it is kept and shown only on a failure.
 */
function installBrowser(cwd, { progress = false } = {}) {
  if (progress) process.stderr.write(`${INSTALL_NOTICE}\n`);
  const run = spawnSync(resolveNpx(), [...NPX_ARGS, "install-browser", "chrome-for-testing"], {
    cwd, encoding: "utf8", stdio: progress ? ["ignore", 2, 2] : ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
  });
  if (run.error || run.status !== 0) {
    const detail = run.error?.message ?? (progress ? `playwright-cli exited ${run.status}, see its output above` : outputOf(run));
    fail(`Could not install Playwright's Chrome for Testing: ${detail}. Mark the visual proof UNVERIFIED — no browser to open.`, 3);
  }
  if (/downloaded to/u.test(`${run.stdout ?? ""}${run.stderr ?? ""}`)) process.stderr.write("Installed Playwright's Chrome for Testing for UnifyApps Headless's browsers, once for this machine.\n");
}

function isOpen(folder) {
  const run = cli(folder, ["list", "--json"], { capture: true });
  try { return JSON.parse(run.stdout).browsers.some((b) => b.name === sessionName(folder) && b.status === "open"); } catch { return false; }
}

// Windows has no process.getuid and reports uid 0 for every file, so owner checks only run where uids exist.
const ownedByMe = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();

/**
 * Closes and deletes this user's open-page browsers untouched for 12 hours: a
 * builder that stopped before `close` must not leave the person's sign-in in
 * a running browser for long. One that cannot be removed never blocks a proof.
 */
export function removeStaleProofFolders(tmp = os.tmpdir(), now = Date.now(), closeBrowser = closeFor) {
  for (const name of fs.readdirSync(tmp)) {
    if (!name.startsWith(PROOF_PREFIX)) continue;
    const full = path.join(tmp, name);
    try {
      const stat = fs.lstatSync(full);
      if (!stat.isDirectory() || !ownedByMe(stat)) continue;
      const touched = Math.max(stat.mtimeMs, ...["profile", "browser.json"].map((part) => {
        try { return fs.statSync(path.join(full, part)).mtimeMs; } catch { return 0; }
      }));
      if (now - touched < STALE_MS) continue;
      const { folder } = JSON.parse(fs.readFileSync(path.join(full, "browser.json"), "utf8"));
      if (folder && fs.existsSync(folder)) closeBrowser(folder);
    } catch { /* gone, or never written: delete it all the same */ }
    try { fs.rmSync(full, { recursive: true, force: true }); } catch {}
  }
}

function closeFor(folder) {
  cli(folder, ["close"], { capture: true });
}

/** Makes this folder's private folder (0700, this user's own) and answers it with what it records. */
function prepareProofFolder(folder) {
  const own = proofFolderFor(folder);
  if (!fs.existsSync(own)) removeStaleProofFolders();
  fs.mkdirSync(own, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(own);
  // A folder planted under our name by someone else, or a link, would expose the sign-in.
  if (!stat.isDirectory() || !ownedByMe(stat)) fail(`refused: ${own} is not a folder of this user`);
  fs.chmodSync(own, 0o700);
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(path.join(own, "browser.json"), "utf8")); } catch {}
  return { own, saved };
}

/**
 * Loads the person's saved `_at` cookie, and any extra cookies saved for the
 * host, into the browser the way the tenant sets it: on <host> only, path /,
 * secure and http-only. The values go through a 0600 file in the private
 * folder that is deleted at once, never a process argument, which any local
 * user can read.
 */
function loadSignIn(folder, own, host, cookie, extra = []) {
  const file = path.join(own, "sign-in.json");
  fs.rmSync(file, { force: true });
  fs.writeFileSync(file, JSON.stringify({
    cookies: [{ name: "_at", value: cookie }, ...extra].map(({ name, value }) => (
      { name, value, domain: host, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "None" }
    )),
    origins: [],
  }), { mode: 0o600, flag: "wx" });
  try {
    const run = cli(folder, ["state-load", file], { capture: true });
    if (run.status !== 0) fail(`Could not put the saved sign-in into the browser: ${outputOf(run)}. Mark the visual proof UNVERIFIED — the browser would not take the sign-in.`, 3);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Loads `href` fresh, then waits until the page draws a block (a code app:
 * any element of its own) that is still there `PAINT_BEAT_MS` later, or
 * lands on a sign-in page. One read of "drawn" can catch a single render
 * frame mid-hydration, before the block it saw is replaced or removed; a
 * second read after the paint beat must see the same block count (or the
 * same rendered flag, for a code app) at the same path before the draw
 * counts as done.
 */
function loadAndWait(folder, href) {
  const codeApp = isCodeAppRoute(href);
  return runCode(folder, `async page => {
  const shown = ${pageShown};
  const codeApp = ${codeApp};
  const drawn = (at) => at.blocks > 0 || (codeApp && at.rendered);
  try { await page.goto(${JSON.stringify(href)}, { waitUntil: 'load', timeout: ${LOAD_CAP_MS} }); }
  catch (error) { if (!/Timeout/.test(error.message)) return { error: error.message.split('\\n')[0] }; }
  const loadedAt = new Date().toISOString();
  let seen = null, stable = null;
  for (const end = Date.now() + ${DRAW_CAP_MS}; Date.now() < end; await page.waitForTimeout(${DRAW_POLL_MS})) {
    // A read made while a redirect swaps the document fails; the next one sees the new page.
    try { seen = await page.evaluate(shown); } catch { continue; }
    if (/^\\/(login|signin|sign-in)(\\/|$)/.test(seen.path)) break;
    if (!drawn(seen)) continue;
    const first = seen;
    await page.waitForTimeout(${PAINT_BEAT_MS});
    let confirm;
    try { confirm = await page.evaluate(shown); } catch { continue; }
    seen = confirm;
    if (drawn(confirm) && confirm.blocks === first.blocks && Boolean(confirm.rendered) === Boolean(first.rendered) && confirm.path === first.path) {
      stable = confirm;
      break;
    }
  }
  const at = stable || seen || { href: page.url(), pageIds: [], blocks: 0, rendered: false };
  return { url: at.href, pageIds: at.pageIds, blocks: at.blocks, rendered: Boolean(at.rendered), loadedAt };
}`);
}

async function openPage(folder, raw, { fakeMedia = false } = {}) {
  fs.rmSync(lastOpenFile(folder), { force: true });
  let url;
  try { url = new URL(raw); } catch { fail(`not a URL: ${raw}`); }
  if (url.protocol !== "https:") fail(`open-page takes the tenant's https address of a builder or preview page, not ${raw}`);
  const host = url.host;
  const pluginScripts = path.resolve(import.meta.dirname, "../../../scripts");
  const { fetchUserContext } = await import(path.join(pluginScripts, "platform/user-context.mjs"));
  const { readCookie, readExtraCookies } = await import(path.join(pluginScripts, "platform/auth.mjs"));
  const signedOut = (why) => `${why} Ask the person to sign in again — the router runs the login step of /ua:setup without --check — then run open-page again. Until then, mark the visual proof UNVERIFIED — UnifyApps Headless's saved sign-in for ${host} has run out.`;
  const cookie = readCookie(host);
  // A builder or preview URL is the tenant's own and always needs the saved sign-in.
  // A PUBLIC app's live address (liveUrl, pageUrls) needs none by design — it is on
  // its own host with its own sign-in, if any, for the app's users, never UnifyApps Headless's.
  // Only refuse outright when the URL is plainly the tenant's: a URL on some other
  // host that happens to have no saved cookie either lands on its own page, or on its
  // own sign-in, which wrongLanding already explains without asking anyone to sign
  // in to UnifyApps Headless.
  if (!cookie && isTenantRoute(url.href)) fail(signedOut(`UnifyApps Headless has no saved sign-in for ${host}.`), 5);
  if (cookie) {
    try {
      await fetchUserContext(host);
    } catch (error) {
      if (error?.code === "AUTH_EXPIRED") fail(signedOut(`The sign-in UnifyApps Headless saved for ${host} did not work there.`), 5);
      if (error?.code === "PLATFORM_UNREACHABLE") fail(`${error.message} Mark the visual proof UNVERIFIED — the tenant could not be reached.`, 4);
      fail(error?.message ?? String(error), 7);
    }
  }

  const { own, saved } = prepareProofFolder(folder);
  let fresh = false;
  let open = isOpen(folder);
  // A browser keeps the devices it started with, so one started without fake media starts again.
  if (open && fakeMedia && !saved.fakeMedia) { closeFor(folder); open = false; }
  if (!open) {
    try { setFakeMedia(folder, fakeMedia); } catch (error) { fail(`refused: ${error.message}`); }
    installBrowser(folder);
    const run = cli(folder, ["open", "--browser=chromium", `--profile=${path.join(own, "profile")}`], { capture: true });
    if (run.error || run.status !== 0) fail(`The browser would not start: ${run.error?.message ?? outputOf(run)}. Mark the visual proof UNVERIFIED — no browser to open ${raw} in.`, 3);
    fresh = true;
  }
  fs.writeFileSync(path.join(own, "browser.json"), JSON.stringify({
    folder, session: sessionName(folder), host, fakeMedia: fresh ? fakeMedia : Boolean(saved.fakeMedia),
  }));
  try {
    runCode(folder, String(recordCalls));
    if (cookie && (fresh || saved.host !== host)) loadSignIn(folder, own, host, cookie, readExtraCookies(host));
  } catch (error) {
    fail(`The browser would not get ready: ${error.message}. Mark the visual proof UNVERIFIED — the browser would not start.`, 3);
  }

  let shown;
  try {
    shown = loadAndWait(folder, url.href);
    // A sign-in that ran out mid-run may have been renewed since: load the saved one once more.
    if (!fresh && /^\/(login|signin|sign-in)(\/|$)/u.test(new URL(shown.url ?? url.href).pathname)) {
      loadSignIn(folder, own, host, readCookie(host) ?? cookie, readExtraCookies(host));
      shown = loadAndWait(folder, url.href);
    }
  } catch (error) {
    fail(`Could not load ${raw}: ${error.message}. Mark the visual proof UNVERIFIED — the page would not load.`, 4);
  }
  if (shown.error) fail(`Could not load ${raw}: ${shown.error}. Mark the visual proof UNVERIFIED — the page would not load.`, 4);
  const wrong = wrongLanding(url.href, shown.url, shown.pageIds);
  if (wrong) fail(wrong, 5);
  if (isCodeAppRoute(url.href)) {
    // A code app's preview draws no block; it has drawn when its body holds an element of its own.
    if (!shown.rendered) fail(`${shown.url} drew nothing within ${DRAW_CAP_MS / 1000} s. Take a screenshot and read it once; open-page once more. The same result again is UNVERIFIED with this line.`, 6);
  } else if (!shown.blocks && /\/(builder|preview)\//u.test(url.pathname)) {
    fail(`${shown.url} drew no block within ${DRAW_CAP_MS / 1000} s. Take a screenshot and read it once; open-page once more. The same result again is UNVERIFIED with this line.`, 6);
  }
  fs.writeFileSync(lastOpenFile(folder), JSON.stringify({ url: shown.url, loadedAt: shown.loadedAt }));
  process.stdout.write(`${JSON.stringify({ ok: true, ...shown })}\n`);
}

/** Stops page-shot and fit-page when no open-page answered ok since the last one that failed. */
function requireOpened(folder, command) {
  if (lastOpened(folder)) return;
  fail(`${command} takes the page the last open-page loaded, and the last open-page did not load one (or none ran in this browser). A shot now would show the page from before that call, maybe from before your last write. Run open-page again; when it answers ok, run ${command} again.`, 1);
}

function printCalls(folder) {
  let calls;
  try { calls = runCode(folder, "async page => page.context().uaCalls || null"); } catch (error) { fail(`Could not read the calls: ${error.message}`, 1); }
  if (!calls) fail("This browser records no calls: open the page with open-page first.", 1);
  process.stdout.write(`${JSON.stringify(calls, null, 1)}\n`);
}

function waitFor(folder, text, capArg) {
  const cap = Number(capArg) > 0 ? Number(capArg) : WAIT_CAP_MS;
  let seen;
  try {
    seen = runCode(folder, `async page => {
  const started = Date.now();
  try {
    await page.waitForFunction((t) => !!document.body && (${hasText})(document.body.innerText, t), ${JSON.stringify(text)}, { timeout: ${cap}, polling: 300 });
    return { ok: true, ms: Date.now() - started };
  } catch { return { ok: false, ms: Date.now() - started }; }
}`);
  } catch (error) { fail(`Could not read the page: ${error.message}`, 1); }
  if (!seen.ok) fail(`"${text}" not on screen within ${cap} ms`, 6);
  process.stdout.write(`"${text}" on screen after ${seen.ms} ms\n`);
}

/** `--input name=value` pairs, in order, as `{ name: value }`; a later pair for a name wins. Throws on a pair with no name or no `=`. */
export function parseInputs(args) {
  const inputs = {};
  for (let at = 0; at < args.length; at++) {
    if (args[at] !== "--input") throw new Error(`page-shot takes only --input <name>=<value> after the width, not ${args[at]}`);
    const pair = args[++at] ?? "";
    const split = pair.indexOf("=");
    if (split < 1) throw new Error(`--input takes <name>=<value>, not ${JSON.stringify(pair)}`);
    inputs[pair.slice(0, split)] = pair.slice(split + 1);
  }
  return inputs;
}

/** `url` with each input set as a query value, replacing one of the same name. */
export function withInputs(url, inputs) {
  const next = new URL(url);
  for (const [name, value] of Object.entries(inputs)) next.searchParams.set(name, value);
  return next.href;
}

// Loads the last open-page URL again with the inputs as query values and checks
// the landing, so the shot shows the page with them.
function loadWithInputs(folder, inputs) {
  const href = withInputs(lastOpened(folder).url, inputs);
  let shown;
  try { shown = loadAndWait(folder, href); } catch (error) { fail(`Could not load ${href}: ${error.message}. Mark the visual proof UNVERIFIED — the page would not load.`, 4); }
  if (shown.error) fail(`Could not load ${href}: ${shown.error}. Mark the visual proof UNVERIFIED — the page would not load.`, 4);
  const wrong = wrongLanding(href, shown.url, shown.pageIds);
  if (wrong) fail(wrong, 5);
  if (!shown.blocks) fail(`${shown.url} drew no block within ${DRAW_CAP_MS / 1000} s. Take a screenshot and read it once; run page-shot once more.`, 6);
  fs.writeFileSync(lastOpenFile(folder), JSON.stringify({ url: shown.url, loadedAt: shown.loadedAt }));
}

/**
 * Resizes the viewport across up to `rounds` measurements to show the whole
 * page, the way `measure` and `resize` are wired to do it, then re-measures
 * once more against the viewport actually left in place. A page whose inner
 * scroller keeps requiring more height as the window grows never converges
 * within that round budget (the comment on `FIT_ROUNDS` names exactly this
 * case); without the final re-measure, `cut` would be judged against the
 * loop's last measurement, taken BEFORE its last resize, and could read
 * false for a shot that still hides real content below the fold.
 *
 * Runs on both sides of the CDP boundary (playwright-cli's own process calls
 * `measure`/`resize`, which themselves cross into the page), so like
 * `fullPageSize` it is sent to the generated script as source text and must
 * use nothing outside its own body.
 */
export async function fitHeight({ measure, resize, startHeight, maxHeight, rounds }) {
  let height = startHeight, size;
  for (let round = 0; round < rounds; round++) {
    size = await measure();
    if (size.height <= height || height >= maxHeight) break;
    height = Math.min(size.height, maxHeight);
    await resize(height);
  }
  const finalSize = await measure();
  return { height, cut: finalSize.height > height || finalSize.height > maxHeight };
}

function pageShot(folder, widthArg, inputs = {}, { noReload = false } = {}) {
  const device = DEVICE_SIZES.find((s) => s.width === Number(widthArg));
  const sizes = () => DEVICE_SIZES.map((s) => `${s.width} (${s.label} ${s.width} x ${s.height})`).join(", ");
  // DEVICE_SIZES is only the WEB preview's "Switch variant" menu labels (see the doc comment on
  // DEVICE_SIZES in scripts/lib/page-jobs.mjs). A MOBILE or DISPLAY app's preview draws no variant
  // menu at all, so it is shot at whatever viewport width is asked for — that case is not known
  // until the page is loaded and checked for the menu, below, so an unlisted width is only
  // refused here when it is not even a plausible viewport width.
  if (!isShotWidth(widthArg)) {
    fail(`usage: node browser.mjs <browser-folder> page-shot <width>: a whole number from ${MIN_SHOT_WIDTH} to ${MAX_SHOT_WIDTH}, or (for a WEB preview's "Switch variant" menu) one of ${sizes()}`);
  }
  const width = device ? device.width : Number(widthArg);
  const height = device ? device.height : DEFAULT_SHOT_HEIGHT;
  // Only set when the width is one of the variant menu's own labels: used below to pick that
  // item in the menu, and to refuse a width the menu does not offer when the menu exists.
  const item = device ? `${device.label} (${device.width} x ${device.height})` : null;
  const file = path.join(folder, `page-${width}.png`);
  const hasInputs = Object.keys(inputs).length > 0;
  if (noReload && hasInputs) {
    fail("page-shot --no-reload cannot also set --input: an input only takes effect on a fresh load. Drop --no-reload, or drop the --input values.", 2);
  }
  // Fresh by default: a shot of the page open since the last open-page showed the draft from
  // before a write made after it, with nothing in the JSON to say so. This reload also
  // discards any interactive state (a clicked tab, typed text, an opened dialog) from
  // earlier commands in this session — page-shot cannot capture a transient UI state; shoot
  // immediately after the action that produces it, not after this call reloads — or pass
  // --no-reload to shoot the page exactly as it stands now instead. A --no-reload shot shows
  // what is on screen at this moment, not necessarily what the platform has saved.
  if (!noReload) loadWithInputs(folder, inputs);
  let shot;
  try {
    shot = runCode(folder, `async page => {
  // run-code has no URL here, so the path is cut from the address by hand.
  if (/\\/builder\\//.test(page.url().split(/[?#]/)[0])) return { builder: true };
  await page.setViewportSize({ width: ${width}, height: ${height} });
  const menu = page.locator('[aria-label="Switch variant"]').first();
  await menu.waitFor({ timeout: ${VARIANT_CAP_MS} }).catch(() => {});
  // Only a WEB app's preview draws the variant menu: a MOBILE or DISPLAY app's
  // preview draws its own fixed frame, so the window at this size is the shot.
  const variantMenu = await menu.count() > 0;
  if (!variantMenu && !/\\/preview\\//.test(page.url().split(/[?#]/)[0])) return { noMenu: page.url() };
  // The allowlist of widths (DEVICE_SIZES) only exists to match this menu's own labels: a
  // width with no such label (item is null) cannot be picked in a menu that is actually there.
  if (variantMenu && !${JSON.stringify(item)}) return { notAVariantSize: true };
  if (variantMenu) {
    if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
    const items = page.locator('[role="tooltip"] li');
    await items.first().waitFor({ timeout: ${VARIANT_CAP_MS} }).catch(() => {});
    // A tablet or mobile tab, once picked, stays picked across loads and lists no laptop or desktop size.
    const desktopTab = page.locator('[role="tooltip"] button[value="desktop"][data-selected="false"]');
    if (await desktopTab.count()) {
      await desktopTab.first().click();
      await page.locator('[role="tooltip"] button[value="desktop"][data-selected="true"]').waitFor({ timeout: ${VARIANT_CAP_MS} }).catch(() => {});
    }
    const texts = (await items.allInnerTexts()).map((t) => t.trim());
    const at = texts.findIndex((t) => t.startsWith(${JSON.stringify(item)}));
    if (at < 0) return { items: texts };
    await items.nth(at).click();
    // A pick adds its class beside the default min-w-[1440px], which stays, so only the computed width says it took.
    try {
      await page.waitForFunction((w) => [...document.querySelectorAll('[class*="min-w-["]')]
        .some((e) => e.getAttribute('class').includes('min-w-[' + w + 'px]') && getComputedStyle(e).minWidth === w + 'px'), ${width}, { timeout: ${VARIANT_CAP_MS} });
    } catch { return { noFrame: true }; }
  }
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // A taller window can make the page taller too (1366 x 709 measured 765, which
  // still hid 11 px), so measure again until nothing is hidden.
  const { height, cut } = await (${fitHeight})({
    measure: () => page.evaluate(${fullPageSize}),
    resize: (h) => page.setViewportSize({ width: ${width}, height: h }),
    startHeight: ${height},
    maxHeight: ${MAX_HEIGHT},
    rounds: ${FIT_ROUNDS},
  });
  await page.waitForTimeout(${PAINT_BEAT_MS});
  await page.screenshot({ path: ${JSON.stringify(file)} });
  return { file: ${JSON.stringify(file)}, width: ${width}, height, cut, variantMenu };
}`);
  } catch (error) { fail(`Could not take the shot: ${error.message}`, 1); }
  if (shot.builder) {
    fail("page-shot takes the preview, not the builder, which draws the canvas scaled: open-page the same page's …/preview/… URL and run it again.");
  }
  if (shot.noMenu) {
    fail(`${shot.noMenu} is not a preview and has no "Switch variant" menu. page-shot takes the platform preview once open-page answers ok there: open-page the page's …/preview/… URL and run it again.`, 1);
  }
  if (shot.notAVariantSize) {
    fail(`This preview draws a "Switch variant" menu (a WEB app), which only offers ${sizes()}. page-shot ${width} is not one of them.`, 1);
  }
  if (shot.items) {
    fail(`The "Switch variant" menu has no "${item}" item. It shows: ${shot.items.join(", ") || "no items"}.`, 1);
  }
  if (shot.noFrame) {
    fail(`The preview's frame did not take ${width} px within ${VARIANT_CAP_MS / 1000} s of picking "${item}". Take a screenshot and read it once; run page-shot ${width} once more.`, 1);
  }
  process.stdout.write(`${JSON.stringify(hasInputs ? { ...shot, inputs } : shot)}\n`);
}

function fitPage(folder) {
  let size;
  try {
    size = runCode(folder, `async page => {
  const size = await page.evaluate(${fullPageSize});
  const height = Math.min(size.height, ${MAX_HEIGHT});
  await page.setViewportSize({ width: size.width, height });
  // Re-measure against the viewport actually set, the same as page-shot's fit
  // loop: a page whose inner scroller grows with the window can still hide
  // content after this single resize, which the pre-resize measurement alone
  // would miss.
  const finalSize = await page.evaluate(${fullPageSize});
  return { width: size.width, height, cut: finalSize.height > height || finalSize.height > ${MAX_HEIGHT} };
}`);
  } catch (error) { fail(`Could not size the window: ${error.message}`, 1); }
  process.stdout.write(`window ${size.width}×${size.height}${size.cut ? " (cut at the limit)" : ""}\n`);
}

async function main() {
  if (process.argv[2] === "--install") {
    installBrowser(os.tmpdir(), { progress: true });
    process.stdout.write("Chrome for Testing is installed.\n");
    return;
  }
  const [folderArg, ...args] = process.argv.slice(2);
  if (!folderArg || args.length === 0) {
    fail("usage: node browser.mjs <browser-folder> <command> [args...]  (open-page <url> [--fake-media], calls, wait-for <text>, page-shot <width> [--input <name>=<value>]... [--no-reload], fit-page, or a playwright-cli command), or node browser.mjs --install");
  }
  const [command] = args;
  // A flag may come before playwright-cli's command (`--raw run-code …`), so a
  // refused command is looked for in every argument, not only the first.
  const reaching = args.find((arg) => REFUSED.has(arg));
  if (reaching) {
    fail(`refused: \`${reaching}\` reaches other callers' browsers; use \`close\` for your own`);
  }
  if (args.some((arg) => SESSION_FLAG.test(arg))) {
    fail("refused: the browser folder names the session; drop the -s/--session flag");
  }
  const folder = path.resolve(folderArg);
  const signedIn = fs.existsSync(proofFolderFor(folder));
  const leaking = signedIn ? args.find((arg) => REFUSED_SIGNED_IN.has(arg)) : undefined;
  if (leaking) {
    fail(leaking === "open"
      ? "refused: this browser is open and signed in as the person; go to a page with `open-page <url>`"
      : `refused: \`${leaking}\` can print or save the person's sign-in, which this browser holds; read the page with snapshot, eval or calls instead`);
  }
  fs.mkdirSync(folder, { recursive: true });
  process.stderr.write(`browser: ${folder}\n`);

  // open-page already checks this before it loads anything. Every other
  if (command === "open-page") {
    const rest = args.slice(1);
    const fakeMedia = rest.includes("--fake-media");
    const other = rest.filter((arg) => arg !== "--fake-media");
    if (other.length !== 1 || other[0].startsWith("--")) fail("usage: node browser.mjs <browser-folder> open-page <url> [--fake-media]");
    return openPage(folder, other[0], { fakeMedia });
  }
  if (command === "calls") return printCalls(folder);
  if (command === "wait-for") {
    if (!args[1]) fail("usage: node browser.mjs <browser-folder> wait-for <text> [cap-ms]");
    return waitFor(folder, args[1], args[2]);
  }
  if (command === "fit-page") { requireOpened(folder, "fit-page"); return fitPage(folder); }
  if (command === "page-shot") {
    // A wrong width is named before anything else, so that check needs no browser.
    const rest = args.slice(2);
    const noReload = rest.includes("--no-reload");
    let inputs;
    try { inputs = parseInputs(rest.filter((arg) => arg !== "--no-reload")); }
    catch (error) { fail(`usage: node browser.mjs <browser-folder> page-shot <width> [--input <name>=<value>]... [--no-reload]: ${error.message}`); }
    if (noReload && Object.keys(inputs).length > 0) {
      fail("page-shot --no-reload cannot also set --input: an input only takes effect on a fresh load. Drop --no-reload, or drop the --input values.", 2);
    }
    if (isShotWidth(args[1])) requireOpened(folder, "page-shot");
    return pageShot(folder, args[1], inputs, { noReload });
  }

  const extra = [];
  if (command === "open") {
    if (!args.some((arg) => BROWSER_FLAG.test(arg))) {
      installBrowser(folder);
      extra.push("--browser=chromium");
    }
    if (!args.some((arg) => PROFILE_FLAG.test(arg))) extra.push(`--profile=${path.join(folder, "profile")}`);
  }
  const run = cli(folder, [...args, ...extra]);
  if (run.error) fail(`could not start playwright-cli: ${run.error.message}`, 1);
  if (command === "close" && signedIn) fs.rmSync(proofFolderFor(folder), { recursive: true, force: true });
  process.exit(run.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
