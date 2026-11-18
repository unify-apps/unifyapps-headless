#!/usr/bin/env node
/**
 * The device a test runs as, and how a walk's browser becomes it. Test Studio runs a case as one
 * device, the builder's device switcher's type and model, compiled into the script as its size and,
 * for a tablet or phone, a user agent and touch. A builder app picks its layout from the user agent
 * the server gets, so a walk at the size alone sees the desktop layout and writes steps no run sees.
 *
 *   node device.mjs list                       every model of every type, its size, and the default
 *   node device.mjs resolve <type> [model]     one device, as `get_app_run_viewport` answers one:
 *                                              { "runViewport", "runDevice" }
 *   node device.mjs config <source> <out>      writes the playwright-cli config a helper browser
 *                                              opens with (`open about:blank --config=<out>`)
 *   node device.mjs code <source>              prints the function for one `browser_run_code_unsafe`
 *                                              call that makes the MCP browser's current tab the device
 *
 * A source is a JSON file holding a size and a device under either name: the run file's `viewport`
 * and `device`, or `get_app_run_viewport`'s and `get_test_case`'s `runViewport` and `runDevice`. A
 * device the tools answered keeps their user agent; one with only a type and model gets its size
 * and emulation from the table below. No device means a size only, which is how the platform and a
 * case saved before devices run.
 *
 * The table copies the device sizes and user agents Test Studio offers (read 2026-10-12). When a
 * tool answers a device, its answer wins over this copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEVICES = {
  desktop: {
    default: "laptop1440x834",
    models: {
      laptop1366x709: { width: 1366, height: 709 },
      laptop1440x834: { width: 1440, height: 834 },
      desktop1680x1050: { width: 1680, height: 1050 },
      desktop1920x1080: { width: 1920, height: 1080 },
      desktop2560x1440: { width: 2560, height: 1440 },
    },
  },
  tablet: {
    default: "ipadPro12.9V",
    models: {
      ipadMiniV: { width: 744, height: 1133 },
      ipadMiniH: { width: 1133, height: 744 },
      // The platform's iPad Pro 11" ids name the opposite orientation of their sizes; kept as it has them.
      ipadProV: { width: 1194, height: 834 },
      ipadProH: { width: 834, height: 1194 },
      "ipadPro12.9V": { width: 1024, height: 1366 },
      "ipadPro12.9H": { width: 1366, height: 1024 },
      androidTabletV: { width: 800, height: 1280 },
      androidTabletH: { width: 1280, height: 800 },
    },
  },
  mobile: {
    default: "iphone14Pro",
    models: {
      iphone14Pro: { width: 390, height: 830 },
      iphone14: { width: 390, height: 830 },
      iphone8: { width: 375, height: 667 },
      iphoneX: { width: 375, height: 812 },
      googlePixel6Pro: { width: 376, height: 816 },
      googlePixel: { width: 324, height: 576 },
      galaxyS8: { width: 360, height: 740 },
    },
  },
};

// One Android Chromium user agent per type, whatever engine runs the test: "Mobile" in it is what
// tells a phone from a tablet. Desktop has none: it runs as a plain browser at a size.
const EMULATION = {
  tablet: {
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36",
    isMobile: true,
    hasTouch: true,
  },
  mobile: {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Mobile Safari/537.36",
    isMobile: true,
    hasTouch: true,
  },
};

const isSize = (size) => Number.isInteger(size?.width) && Number.isInteger(size?.height) && size.width > 0 && size.height > 0;

/** The models of every type, for a person who names a device in words. */
export function list() {
  return Object.fromEntries(Object.entries(DEVICES).map(([type, { default: fallback, models }]) =>
    [type, { default: fallback, models: Object.fromEntries(Object.entries(models).map(([id, s]) => [id, `${s.width} x ${s.height}`])) }]));
}

/** One device with its size and emulation, in the shape `get_app_run_viewport` answers. */
export function resolve(type, model) {
  const entry = DEVICES[type];
  if (!entry) throw new Error(`no device type "${type}"; it is one of ${Object.keys(DEVICES).join(", ")}`);
  const variant = model ?? entry.default;
  const size = entry.models[variant];
  if (!size) throw new Error(`a ${type} has no model "${variant}"; its models are ${Object.keys(entry.models).join(", ")}`);
  return { runViewport: { ...size }, runDevice: { type, variant, ...EMULATION[type] } };
}

/**
 * The size and device a walk takes from a source. A device the tools answered (it carries a user
 * agent, or is a desktop with a size beside it) is taken whole, so a model newer than this table
 * still works. One with only a type and model is filled from the table, whose size wins over a size
 * given beside it, as `deliver_steps` makes the model's size win.
 */
export function readSource(source) {
  const device = source?.device ?? source?.runDevice ?? null;
  const given = source?.viewport ?? source?.runViewport ?? null;
  const size = isSize(given) ? { width: given.width, height: given.height } : null;
  if (!device) {
    if (!size) throw new Error("the source holds neither a device nor a size ({ width, height }); a platform run has neither and needs no device");
    return { viewport: size, device: null };
  }
  const answered = size && device.variant && (device.userAgent || device.type === "desktop");
  if (answered) {
    const emulation = device.userAgent ? { userAgent: device.userAgent, isMobile: Boolean(device.isMobile), hasTouch: Boolean(device.hasTouch) } : {};
    return { viewport: size, device: { type: device.type, variant: device.variant, ...emulation } };
  }
  const known = resolve(device.type, device.variant);
  return { viewport: known.runViewport, device: known.runDevice };
}

/** What playwright-cli reads at launch: the context every tab of that browser opens in. */
export function cliConfig(source) {
  const { viewport, device } = readSource(source);
  const contextOptions = { viewport };
  if (device?.userAgent) Object.assign(contextOptions, { userAgent: device.userAgent, isMobile: device.isMobile, hasTouch: device.hasTouch });
  return { browser: { contextOptions } };
}

/**
 * The function for one `browser_run_code_unsafe` call. The MCP browser is already running, so its
 * tab takes the device over the DevTools protocol, on one session kept on the page: a second session
 * would hold its own override and the two would fight. It reloads a loaded page, since the app picks
 * its layout once per load. Desktop clears what an earlier call set.
 */
export function mcpCode(source) {
  const { viewport, device } = readSource(source);
  const want = { viewport, userAgent: device?.userAgent ?? "", isMobile: Boolean(device?.isMobile), hasTouch: Boolean(device?.hasTouch) };
  const label = device ? `${device.type} ${device.variant} ${viewport.width} x ${viewport.height}` : `${viewport.width} x ${viewport.height}`;
  return `async (page) => {
  const d = ${JSON.stringify(want)};
  page.__uaDevice ??= await page.context().newCDPSession(page);
  const s = page.__uaDevice;
  await page.setViewportSize(d.viewport);
  await s.send('Emulation.setUserAgentOverride', { userAgent: d.userAgent });
  await s.send('Emulation.setTouchEmulationEnabled', { enabled: d.hasTouch, maxTouchPoints: d.hasTouch ? 5 : 1 });
  if (d.isMobile) await s.send('Emulation.setDeviceMetricsOverride', { ...d.viewport, deviceScaleFactor: 0, mobile: true });
  else await s.send('Emulation.clearDeviceMetricsOverride');
  if (page.url() !== 'about:blank') await page.reload();
  return ${JSON.stringify(`this tab runs as ${label}`)};
}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`could not read ${file}: ${error.message}`);
  }
}

function main(argv) {
  const [command, ...args] = argv;
  const usage = "usage: node device.mjs list | resolve <type> [model] | config <source.json> <out.json> | code <source.json>";
  if (command === "list" && args.length === 0) return `${JSON.stringify(list(), null, 2)}\n`;
  if (command === "resolve" && args.length >= 1 && args.length <= 2) return `${JSON.stringify(resolve(args[0], args[1]))}\n`;
  if (command === "config" && args.length === 2) {
    const config = cliConfig(readJson(args[0]));
    const out = path.resolve(args[1]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(config)}\n`);
    return `${JSON.stringify({ configFile: out, contextOptions: config.browser.contextOptions })}\n`;
  }
  if (command === "code" && args.length === 1) return `${mcpCode(readJson(args[0]))}\n`;
  throw new Error(usage);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}
