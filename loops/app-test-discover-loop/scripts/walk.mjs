#!/usr/bin/env node
/**
 * Runs several browser commands in one call, so one walk step costs one turn.
 *
 *   node walk.mjs <browser-folder> <command...> [-- <command...>]... [--lines <n>] [--last <n>]
 *
 * Every command is one `browser.mjs <browser-folder> <command...>` call
 * (`skills/app-verify/scripts/browser.mjs`), run in order and separated by
 * `--`. The output of each is printed under a `## <n>` heading, cut to
 * `--lines` lines (30), except the last command, cut to `--last` lines (150):
 * the last command is the read the next decision needs, so it keeps the most.
 * A command that exits non-zero stops the chain; the ones after it are
 * listed as not run, and this script exits with that code. playwright-cli's
 * own echo of the code it ran and the `browser: <folder>` line are dropped,
 * so the output is what the page showed and nothing else.
 *
 * `generate-locator <ref>` (playwright-cli's own) is never cut and keeps
 * everything it prints: its answer is the locator a survey line records as
 * the control's hook (traversal.md, The survey files), and a cut or dropped
 * line would lose it.
 *
 * A step is an action, its readiness wait and the scoped read of its effect,
 * in that order, for example:
 *
 *   node walk.mjs "$FOLDER" click f1e42 -- wait-for "Saved" -- find "status pill"
 *
 * It never sleeps: a wait is `wait-for <text> [cap-ms]`, a read with a cap.
 *
 * Two commands are this script's own, each one `eval`:
 *   shell               reads the platform shell (the side navigation, the page
 *                       header outside the module's own header view, the
 *                       breadcrumb bar) and prints the controls found there, so
 *                       the walk lists them once as chrome and never numbers
 *                       them (traversal.md, Platform chrome); `shell: false` on
 *                       an app with no shell.
 *   links               lists every same-origin link the page shows (its path and
 *                       label), so an app with no page list still seeds the page
 *                       queue from its landing surface (parallel-walk.md, The map).
 *   log-requests on     installs the page-side request log a creation walk runs
 *   log-requests read   under, and reads and clears it: method, path, body keys,
 *                       status, response id and duration of every same-origin
 *                       request that is not a GET; never a header or a cookie
 *                       (traversal.md, Creation walks and the request log).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BROWSER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../skills/app-verify/scripts/browser.mjs");
const DEFAULT_LINES = 30;
const DEFAULT_LAST = 150;

/**
 * The platform's shell, read in the page. The platform marks it: `is-platform-shell` on the
 * body, the side navigation at `[data-testid="nav-root"]`, the manager page header at
 * `header[data-testid="manager-page-header"]` with the module's own controls inside
 * `[data-testid="page-header-view"]` (New solution sits there; the AI FDE button does not),
 * and the breadcrumb bar at `nav[aria-label="breadcrumbs"]`. Every control in those regions,
 * minus the module's own header view, is chrome. It reads the DOM only.
 */
export const SHELL_CHROME = `() => {
  const nav = document.querySelector('[data-testid="nav-root"], [data-nav-root]');
  const shell = document.body.classList.contains('is-platform-shell') || Boolean(nav);
  if (!shell) return { shell: false, chrome: [] };
  const seen = new Set();
  const chrome = [];
  const text = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const hookOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const navItem = el.getAttribute('data-nav-item');
    if (navItem) return '[data-nav-item="' + navItem + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return tag + '[aria-label="' + aria.replace(/"/g, '\\\\"') + '"]';
    const testid = el.getAttribute('data-testid');
    if (testid && !/^nav-(item|group)$/.test(testid)) return '[data-testid="' + testid + '"]';
    const href = el.getAttribute('href');
    if (href) return 'a[href="' + href + '"]';
    const label = text(el);
    if (label) return tag + ':has-text("' + label.replace(/"/g, '\\\\"') + '")';
    return testid ? '[data-testid="' + testid + '"]' : tag;
  };
  const add = (el, region) => {
    const hook = hookOf(el);
    const key = region + '|' + hook + '|' + text(el);
    if (seen.has(key)) return;
    seen.add(key);
    chrome.push({ region, hook, label: text(el) });
  };
  const controls = 'a[href], button, [role="button"], [role="link"], [role="tab"], [role="menuitem"], input, select, textarea';
  if (nav) for (const el of nav.querySelectorAll(controls)) add(el, 'side navigation');
  const header = document.querySelector('header[data-testid="manager-page-header"]') || [...document.querySelectorAll('header')].find((el) => !el.closest('main'));
  const own = header && header.querySelector('[data-testid="page-header-view"]');
  if (header) for (const el of header.querySelectorAll(controls)) { if (own && own.contains(el)) continue; add(el, 'page header'); }
  for (const bar of document.querySelectorAll('nav[aria-label="breadcrumbs"], nav[aria-label="breadcrumb"], nav[aria-label="Breadcrumb"]')) for (const el of bar.querySelectorAll(controls)) add(el, 'breadcrumb bar');
  return { shell: true, chrome };
}`;

/**
 * The request log a creation walk runs under (traversal.md, Creation walks and the request
 * log). It wraps `fetch` and `XMLHttpRequest` in the page and keeps, for every same-origin
 * request that is not a GET: the method, the path, the keys of a JSON body (never a value),
 * the status, the id the response carried and how long it took. It reads no header and no
 * cookie, so it can run in the signed-in browser the wrapper otherwise shields. A page script
 * does not survive a navigation, so the walk installs it again after each one.
 */
export const REQUEST_LOG_ON = `() => {
  if (window.__uaRequests) return { installed: true, already: true };
  const log = [];
  window.__uaRequests = log;
  const sameOrigin = (url) => { try { return new URL(url, location.href).origin === location.origin; } catch { return false; } };
  const pathOf = (url) => { try { const parsed = new URL(url, location.href); return parsed.pathname + parsed.search; } catch { return String(url); } };
  const jsonKeys = (text) => { try { const json = JSON.parse(text); return json && typeof json === 'object' && !Array.isArray(json) ? Object.keys(json).slice(0, 20) : []; } catch { return []; } };
  // The keys of whatever body the page sent, and only the keys: a JSON string, URL-encoded
  // params, form data, a Blob holding JSON, or the body of a Request handed to fetch.
  const keysOf = async (body) => {
    try {
      if (body == null) return [];
      if (typeof body === 'string') return jsonKeys(body);
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return [...new Set(body.keys())].slice(0, 20);
      if (typeof FormData !== 'undefined' && body instanceof FormData) return [...new Set(body.keys())].slice(0, 20);
      if (typeof Blob !== 'undefined' && body instanceof Blob) return jsonKeys(await body.text());
      if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return jsonKeys(new TextDecoder().decode(body));
    } catch {}
    return [];
  };
  const idOf = (text) => { try { const json = JSON.parse(text); const found = json && (json.id ?? (json.data && json.data.id) ?? json.entityId); return found == null ? null : String(found); } catch { return null; } };
  const record = (method, url, bodyKeys, started, status, text) => {
    if (!sameOrigin(url)) return;
    log.push({ method, path: pathOf(url), bodyKeys, status, responseId: idOf(text), durationMs: Date.now() - started, at: new Date(started).toISOString() });
  };
  const fetch0 = window.fetch;
  window.fetch = async function (input, init) {
    const started = Date.now();
    const isRequest = input && typeof input === 'object' && typeof input.url === 'string';
    const method = String((init && init.method) || (isRequest && input.method) || 'GET').toUpperCase();
    const url = isRequest ? input.url : String(input);
    const watched = method !== 'GET' && sameOrigin(url);
    let bodyKeys = [];
    if (watched) {
      if (init && init.body != null) bodyKeys = await keysOf(init.body);
      else if (isRequest && typeof input.clone === 'function') { try { bodyKeys = jsonKeys(await input.clone().text()); } catch {} }
    }
    const response = await fetch0.apply(this, arguments);
    if (watched) {
      let text = '';
      try { text = (await response.clone().text()).slice(0, 20000); } catch {}
      record(method, url, bodyKeys, started, response.status, text);
    }
    return response;
  };
  const open0 = XMLHttpRequest.prototype.open;
  const send0 = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__ua = { method: String(method).toUpperCase(), url: String(url) }; return open0.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__ua;
    if (meta && meta.method !== 'GET' && sameOrigin(meta.url)) {
      const started = Date.now();
      const keys = keysOf(body);
      this.addEventListener('loadend', () => { keys.then((bodyKeys) => record(meta.method, meta.url, bodyKeys, started, this.status, String(this.responseText || '').slice(0, 20000))).catch(() => {}); });
    }
    return send0.apply(this, arguments);
  };
  return { installed: true };
}`;

/**
 * The same-origin links the page shows, each once: its path (query and hash kept, since a page may
 * be a query on another) and its label. It reads `href` attributes only, never a value typed in a
 * field, so the main session can seed the page queue of a code app or the platform from it.
 */
export const PAGE_LINKS = `() => {
  const seen = new Set();
  const links = [];
  for (const el of document.querySelectorAll('a[href]')) {
    let url;
    try { url = new URL(el.getAttribute('href'), location.href); } catch { continue; }
    if (url.origin !== location.origin || /^(javascript|mailto|tel):/.test(url.protocol)) continue;
    const target = url.pathname + url.search;
    if (seen.has(target)) continue;
    seen.add(target);
    links.push({ path: target, label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60) });
  }
  return { at: location.pathname + location.search, links };
}`;

/** Reads the requests the log holds since the last read, and clears it. */
export const REQUEST_LOG_READ = `() => {
  const log = window.__uaRequests;
  if (!log) return { installed: false, requests: [] };
  return { installed: true, requests: log.splice(0) };
}`;

/** This script's own commands, each expanded to the browser.mjs command that does it. */
export function expandStep(step) {
  if (step[0] === "shell") return ["eval", SHELL_CHROME];
  if (step[0] === "links") return ["eval", PAGE_LINKS];
  if (step[0] === "log-requests") {
    if (step[1] === "on") return ["eval", REQUEST_LOG_ON];
    if (step[1] === "read") return ["eval", REQUEST_LOG_READ];
    throw new Error("log-requests takes on or read");
  }
  return step;
}

function usage(message) {
  process.stderr.write(`${message}\nusage: node walk.mjs <browser-folder> <command...> [-- <command...>]... [--lines <n>] [--last <n>]\n`);
  process.exit(2);
}

/** Splits argv into the folder, the steps and the two caps. `--lines` and `--last` may sit anywhere. */
export function parseArgs(argv) {
  const caps = { lines: DEFAULT_LINES, last: DEFAULT_LAST };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--lines" || arg === "--last") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} takes a whole number of lines`);
      caps[arg.slice(2)] = value;
    } else rest.push(arg);
  }
  const [folder, ...tail] = rest;
  if (!folder) throw new Error("the browser folder is missing");
  const steps = [];
  let current = [];
  for (const arg of tail) {
    if (arg === "--") { if (current.length) steps.push(current); current = []; }
    else current.push(arg);
  }
  if (current.length) steps.push(current);
  if (!steps.length) throw new Error("no command given");
  return { folder, steps, ...caps };
}

/** Commands whose output is shown whole: never cut, and playwright-cli's code echo kept. */
export const UNCUT = new Set(["generate-locator"]);

/** How many lines of a step's output are shown: all of an uncut command, else the cap for its place. */
export function capFor(step, isLast, { lines = DEFAULT_LINES, last = DEFAULT_LAST } = {}) {
  if (UNCUT.has(step[0])) return Infinity;
  return isLast ? last : lines;
}

/** Drops playwright-cli's echo of the code it ran (unless `keepCode`) and browser.mjs's folder line. */
export function cleanOutput(text, { keepCode = false } = {}) {
  const out = [];
  let skipping = false;
  let fences = 0;
  for (const line of text.split("\n")) {
    if (!keepCode && !skipping && /^### Ran Playwright code/.test(line)) { skipping = true; fences = 0; continue; }
    if (skipping) { if (/^```/.test(line) && ++fences === 2) skipping = false; continue; }
    if (/^browser: /.test(line)) continue;
    out.push(line);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

/** Keeps the first `cap` lines and says how many were cut. */
export function cut(lines, cap) {
  if (lines.length <= cap) return lines;
  return [...lines.slice(0, cap), `… ${lines.length - cap} more lines`];
}

function runStep(folder, step) {
  const started = Date.now();
  let expanded;
  try { expanded = expandStep(step); } catch (error) { return { code: 2, ms: 0, lines: [error.message] }; }
  const run = spawnSync(process.execPath, [BROWSER, folder, ...expanded], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const ms = Date.now() - started;
  if (run.error) return { code: 1, ms, lines: [`could not start browser.mjs: ${run.error.message}`] };
  return { code: run.status ?? 1, ms, lines: cleanOutput(`${run.stdout ?? ""}${run.stderr ?? ""}`, { keepCode: UNCUT.has(step[0]) }) };
}

function main() {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); } catch (error) { usage(error.message); }
  const { folder, steps, lines, last } = parsed;
  let exitCode = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (exitCode !== 0) { process.stdout.write(`## ${i + 1} ${step.join(" ")}\nnot run\n`); continue; }
    const result = runStep(folder, step);
    const isLast = i === steps.length - 1;
    process.stdout.write(`## ${i + 1} ${step.join(" ")} (exit ${result.code}, ${result.ms} ms)\n`);
    const shown = cut(result.lines, capFor(step, isLast, { lines, last }));
    if (shown.length) process.stdout.write(`${shown.join("\n")}\n`);
    if (result.code !== 0) { exitCode = result.code; process.stdout.write(`stopped at ${i + 1}: exit ${result.code}\n`); }
  }
  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
