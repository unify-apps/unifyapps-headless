// A headless Chrome for Testing driven over the DevTools protocol: open the story page, move its clock, take frames.
// No packages: Node's own WebSocket. Never the person's own Chrome app, so it cannot take their links.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function findChrome() {
  if (process.env.DEMO_KIT_CHROME) return process.env.DEMO_KIT_CHROME;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
    for (const d of dirs) {
      for (const rel of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const f = path.join(root, d, rel);
        if (fs.existsSync(f)) return f;
      }
    }
  }
  return null;
}

class Session {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString());
      if (m.id && this.waiting.has(m.id)) { const { resolve, reject } = this.waiting.get(m.id); this.waiting.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.waiting.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

/** A headless Chrome with one page at width x height times scale; resolves with its DevTools session. */
async function launch({ width = 1920, height = 1080, scale = 1 } = {}) {
  const bin = findChrome();
  if (!bin) throw new Error('no Chrome for Testing found: run `demo.mjs doctor`');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-story-'));
  const proc = spawn(bin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files',
    `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  const close = () => { try { ws?.close(); } catch { /* closed */ } try { proc.kill('SIGKILL'); } catch { /* gone */ } try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chrome still writing its profile as it dies: a stray temp folder is harmless */ } };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    // the port file can land a moment before the endpoint answers, longer when several Chromes start at once
    let targets;
    for (let i = 0; !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { if (i >= 80) throw new Error(`Chrome for Testing did not answer on its debugging port in 12 s (${e.message})`); await new Promise((r) => setTimeout(r, 150)); }
    }
    ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    const s = new Session(ws);
    await s.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    return { s, close };
  } catch (e) { close(); throw e; }
}

/** Opens `page` (a story page) at 1920x1080 times `scale`, with no player, waits until it is built, and returns a driver. */
export async function openPage(page, { scale = 1 } = {}) {
  const { s, close } = await launch({ scale });
  try {
    await s.send('Page.navigate', { url: `${pathToFileURL(page).href}?render` });
    const t0 = Date.now();
    for (;;) {
      const st = await s.eval('window.__bootError ? "error:" + window.__bootError : (window.UA && UA.ready === true ? "ready" : "wait")').catch(() => 'wait');
      if (st === 'ready') break;
      if (st.startsWith('error:')) throw new Error(`the story page failed to build: ${st.slice(6)}`);
      if (Date.now() - t0 > 45000) throw new Error('the story page did not finish loading in 45 s (fonts offline?)');
      await new Promise((r) => setTimeout(r, 120));
    }
    return {
      seek: (ms) => s.eval(`UA.seek(${ms}),1`),
      lint: () => s.eval('UA.lint()'),
      stops: () => s.eval('UA.stops()'),
      text: (i) => s.eval(`UA.text(${Number(i)})`),
      eval: (expr) => s.eval(expr),
      /** The frame as it is now; `size` scales it (0.25 gives a 480x270 thumbnail). */
      async frame(quality = 92, format = 'jpeg', size = 1) {
        const clip = size === 1 ? undefined : { x: 0, y: 0, width: 1920, height: 1080, scale: size };
        const r = await s.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), ...(clip && { clip }), optimizeForSpeed: true, captureBeyondViewport: false });
        return Buffer.from(r.data, 'base64');
      },
      /** A part of the frame, in its pixels times `scale`; with a clear page behind it, a PNG keeps what is not drawn clear. */
      async capture({ x, y, w, h }, format = 'png', scale = 1) {
        const r = await s.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 90 } : {}), clip: { x, y, width: w, height: h, scale }, captureBeyondViewport: false });
        return Buffer.from(r.data, 'base64');
      },
      clear: () => s.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }),
      close,
    };
  } catch (e) { close(); throw e; }
}

/** A picture of a local HTML page (a screen mock-up, a contact sheet) at width x height, once its fonts and pictures have loaded. */
export async function shot(file, out, { width = 1440, height = 900, format = 'png', scale = 1 } = {}) {
  const { s, close } = await launch({ width, height, scale });
  try {
    await s.send('Page.navigate', { url: pathToFileURL(file).href });
    await s.eval('new Promise((r) => { const go = () => document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((d) => { i.onload = i.onerror = d; })))).then(() => setTimeout(r, 150)); document.readyState === "complete" ? go() : addEventListener("load", go); })');
    const r = await s.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 85 } : {}), captureBeyondViewport: false });
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return out;
  } finally { close(); }
}
