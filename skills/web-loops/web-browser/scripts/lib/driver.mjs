// Runs UnifyApps Headless's own browser (app-verify's browser.mjs) for the WEB checks and reads what it prints.
// Every check is a thin wrapper: one browser folder per test runner, every call one `node browser.mjs
// <folder> <command>`, and the page read through `eval` (run-code, tracing and the cookie and
// storage reads are refused in a signed-in browser). Node 22, no dependencies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpers, pageContext } from './collectors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** app-verify's browser.mjs, beside this skill in the plugin. */
export const BROWSER_MJS = path.resolve(here, '../../../../app-verify/scripts/browser.mjs');

/** The script every call runs. Tests point UA_WEB_BROWSER_SCRIPT at a fake that answers from fixtures. */
export function browserScript(env = process.env) {
  return env.UA_WEB_BROWSER_SCRIPT || BROWSER_MJS;
}

/** What browser.mjs said on stderr, without its `browser: <folder>` line. */
export function messageOf(result) {
  const lines = `${result.stderr ?? ''}`.split('\n').map((line) => line.trim()).filter((line) => line && !/^browser: /u.test(line));
  const out = `${result.stdout ?? ''}`.trim().split('\n').slice(-2).join(' ');
  return lines.slice(-3).join(' ') || out || (result.error ? String(result.error) : `exit ${result.status}`);
}

/** Runs one browser.mjs command in `folder`. Never throws: { status, stdout, stderr, message }. */
export function run(folder, args, { timeoutMs = 120000, env = process.env } = {}) {
  const result = spawnSync(process.execPath, [browserScript(env), folder, ...args.map(String)], {
    encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env,
  });
  const status = result.status ?? 1;
  const out = { status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message ?? null, args: args.map(String) };
  out.message = status === 0 ? '' : messageOf(out);
  return out;
}

/** Thrown when a browser command fails; `code` is browser.mjs's exit code. */
export class BrowserError extends Error {
  constructor(message, code = 1, command = null) {
    super(message);
    this.code = code;
    this.command = command;
  }
}

function must(result, what) {
  if (result.status !== 0) throw new BrowserError(`${what}: ${result.message}`, result.status, result.args[0]);
  return result;
}

// The end of the JSON value that starts at `start` in `text`, string escapes respected; -1 when it never closes.
function closingIndex(text, start) {
  const open = text[start];
  if (open === '"') {
    for (let at = start + 1; at < text.length; at++) {
      if (text[at] === '\\') { at++; continue; }
      if (text[at] === '"') return at;
    }
    return -1;
  }
  let depth = 0;
  let inString = false;
  for (let at = start; at < text.length; at++) {
    const char = text[at];
    if (inString) {
      if (char === '\\') at++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') { depth--; if (depth === 0) return at; }
  }
  return -1;
}

/**
 * The JSON value a playwright-cli `eval --raw` (or `calls`, `open-page`, `page-shot`) printed.
 * It may come alone, quoted once more (an eval that returned JSON.stringify(...)), after a
 * `### Result` header, or followed by a snapshot link. Throws when there is none.
 */
export function extractJson(text) {
  let value = String(text ?? '');
  for (let depth = 0; depth < 3; depth++) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) throw new Error('no output to read');
    try {
      value = JSON.parse(trimmed);
      if (typeof value === 'string' && !/^\s*[[{"]/u.test(value)) return value;
      continue;
    } catch { /* not JSON as a whole */ }
    const start = trimmed.search(/[[{"]/u);
    if (start < 0) {
      const first = trimmed.split('\n')[0].trim();
      try { return JSON.parse(first); } catch { throw new Error(`no JSON in the output: ${trimmed.slice(0, 120)}`); }
    }
    let found = null;
    for (let at = start; at < trimmed.length && found === null; at++) {
      if (!'[{"'.includes(trimmed[at])) continue;
      const end = closingIndex(trimmed, at);
      if (end < 0) continue;
      try { found = { value: JSON.parse(trimmed.slice(at, end + 1)) }; } catch { /* keep looking */ }
    }
    if (!found) throw new Error(`no JSON in the output: ${trimmed.slice(0, 120)}`);
    value = found.value;
    if (typeof value === 'string' && !/^\s*[[{"]/u.test(value)) return value;
  }
  return value;
}

/** The source of one `eval`: the page context and the helpers, then `collector(ctx, H, opts)`. */
export function inPageSource(collector, opts = {}) {
  return `async () => { const H = (${helpers})(); const ctx = (${pageContext})(H); return await (${collector})(ctx, H, ${JSON.stringify(opts)}); }`;
}

/** Runs a collector in the page and answers its JSON value. */
export function evalIn(folder, collector, opts = {}, { timeoutMs = 120000, env } = {}) {
  const result = must(run(folder, ['eval', inPageSource(collector, opts), '--raw'], { timeoutMs, env }), 'eval');
  return extractJson(result.stdout);
}

/** Runs `(el) => …` on one element (a snapshot ref such as f1e12, or a selector) and answers its JSON value. */
export function evalOn(folder, fnSource, target, { env } = {}) {
  const result = must(run(folder, ['eval', fnSource, target, '--raw'], { env }), 'eval');
  return extractJson(result.stdout);
}

/**
 * The block of the element `eval … <ref>` is given, whether it is inside the page root (inPage), and
 * whether it is inside the app at all (inApp): the app root is the page root's `.interface-theme`
 * ancestor, as collectors' pageContext finds it. The builder preview's own chrome (its toolbar, the
 * "Switch variant" menu) is outside it, and so is everything in a document whose app sits in a frame.
 */
export const BLOCK_OF_ELEMENT = "(el) => { const b = el.closest('[data-block-id]'); const doc = el.ownerDocument; const page = doc.querySelector('[data-page-id]'); let inApp = true; if (page) inApp = (page.closest('.interface-theme') || page).contains(el); else for (const f of doc.querySelectorAll('iframe')) { try { if (f.contentDocument && f.contentDocument.querySelector('[data-page-id]')) inApp = false; } catch (e) { /* another origin */ } } return { blockId: b ? b.getAttribute('data-block-id') : null, blockType: b ? b.getAttribute('data-block-type') : null, inPage: Boolean(el.closest('[data-page-id]')), inApp }; }";

/**
 * `open-page <url>`: loads the draft fresh, signed in, and waits until it draws its blocks.
 * Answers { ok: true, url, loadedAt, pageIds, blocks } or { ok: false, code, message } with
 * browser.mjs's exit code (3 no browser, 4 no load, 5 wrong landing or signed out, 6 no block,
 * 7 the tenant would not say its environment) — the meanings are
 * app-verify's browser-walk.
 */
export function openPage(folder, url, { env } = {}) {
  const result = run(folder, ['open-page', url], { timeoutMs: 180000, env });
  if (result.status !== 0) return { ok: false, code: result.status, message: result.message };
  try { return { ...extractJson(result.stdout), ok: true }; } catch (error) { return { ok: false, code: 1, message: error.message }; }
}

/** `page-shot <width>`: the preview at one of the platform's device sizes, the whole page in the shot. */
export function pageShot(folder, width, { env } = {}) {
  const result = must(run(folder, ['page-shot', width], { timeoutMs: 120000, env }), `page-shot ${width}`);
  return extractJson(result.stdout);
}

/** The data-source calls recorded since the first open-page in this browser: [{ name, url, method, status, post, resp, at }]. */
export function calls(folder, { env } = {}) {
  const result = must(run(folder, ['calls'], { env }), 'calls');
  const value = extractJson(result.stdout);
  return Array.isArray(value) ? value : [];
}

/** One playwright-cli command passed through as given (`press Tab`, `hover <target>`, `resize 460 900`). */
export function command(folder, args, { env, timeoutMs = 60000, check = true } = {}) {
  const result = run(folder, args, { env, timeoutMs });
  return check ? must(result, args[0]) : result;
}

/** The link a playwright-cli command printed for a file it saved, e.g. `- [Snapshot](x.yml)`. */
export function linkedFile(text) {
  const hit = /\]\(([^)\s]+)\)/u.exec(String(text ?? ''));
  return hit ? hit[1] : null;
}

/** `snapshot --filename=<name>`: the page's accessibility tree with refs, as text. */
export function snapshot(folder, name = 'snapshot.yml', { env } = {}) {
  const result = must(run(folder, ['snapshot', `--filename=${name}`], { env }), 'snapshot');
  const candidates = [path.join(folder, name), linkedFile(result.stdout)].filter(Boolean).map((file) => (path.isAbsolute(file) ? file : path.join(folder, file)));
  for (const file of candidates) if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (/^\s*- /mu.test(result.stdout)) return result.stdout;
  throw new BrowserError(`snapshot: no file at ${candidates.join(' or ')}`, 1, 'snapshot');
}

/**
 * The playwright target of an element a collector marked with `data-ua-probe`. A page inside a
 * same-origin iframe is reached through the frame.
 */
export function probeTarget(n, { inFrame = false, frameIndex = -1 } = {}) {
  const own = `[data-ua-probe="${n}"]`;
  return inFrame && frameIndex >= 0 ? `iframe >> nth=${frameIndex} >> internal:control=enter-frame >> ${own}` : own;
}
