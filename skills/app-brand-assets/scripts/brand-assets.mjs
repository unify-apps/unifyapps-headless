#!/usr/bin/env node
// Makes a MOBILE app's icons and splash screen from one logo image, and puts them on the app.
//
//   inspect --logo <image> --out <dir> [--background <#RRGGBB|transparent>]
//       Reads the logo: its background, its inks, and its pieces grouped into marks and lines of
//       text, numbered. Writes <dir>/inspect.json and <dir>/inspect.png (the logo with each group
//       boxed and numbered) and prints the JSON.
//   make --recipe <recipe.json> --out <dir>
//       Builds every file from the groups the recipe picks (SKILL.md § The recipe): the iOS light,
//       dark and tinted icons, the Android adaptive foreground and themed icon, the notification
//       icon, and the light and dark splash images, plus <dir>/preview.png and <dir>/brand-assets.json.
//   upload --out <dir> --app-id <id> [--apply]
//       Without --apply: reads the app's Brand Assets and Splash Screen panels and says what would
//       change, writing nothing. With --apply: uploads each file as a public file, writes both
//       panels (a dry run first, then the write with the app's version), and reads them back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writePngFile } from '../../native-loops/native-visual-check/scripts/lib/png.mjs';
import { analyse, greyscale, inksOf, lift, maxRadius, readImage, recolour, silhouette } from './lib/artwork.mjs';
import { blank, circleMask, contrast, fill, fitInto, hexToRgb, masked, over, place, ring, rgbToHex, roundedSquareMask, strokeRect, text } from './lib/raster.mjs';
import { ANDROID_SAFE_RADIUS, ANDROID_VISIBLE_RADIUS, CANVAS, DEFAULT_COLOURS, FILES, FIT, SPLASH_IMAGE_WIDTH, SPLASH_VISIBLE_RADIUS, fitScale } from './lib/specs.mjs';
import { withHost } from '../../../scripts/lib/tool-host.mjs';

export { withHost };

const MANIFEST = 'brand-assets.json';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) throw new Error(`Unexpected argument ${rest[i]}.`);
    const key = rest[i].slice(2);
    if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) flags[key] = true;
    else { flags[key] = rest[i + 1]; i += 1; }
  }
  return { command, flags };
}

const GROUP_COLOURS = [[230, 25, 75], [60, 140, 60], [0, 110, 230], [240, 130, 20], [145, 30, 180], [0, 160, 160], [200, 0, 140], [120, 90, 0]];

export function inspect(logoFile, outDir, { background } = {}) {
  const image = readImage(logoFile);
  const analysis = analyse(image, { background: background && background !== 'transparent' ? hexToRgb(background) : background });
  const { bg, groups, palette } = analysis;
  const report = {
    logo: path.resolve(logoFile),
    size: [image.width, image.height],
    background: bg.kind === 'transparent' ? 'transparent' : bg.hex,
    readArea: [bg.area.x, bg.area.y, bg.area.w, bg.area.h],
    ...(analysis.droppedFrame ? { frameLeftOut: `${analysis.droppedFrame} pieces touching the edge of the area read (a frame or card corners) were left out` } : {}),
    inks: palette.map((ink) => ({ hex: ink.hex, share: +ink.share.toFixed(3) })),
    flat: palette.length <= 6 && palette.reduce((a, ink) => a + ink.share, 0) >= 0.9,
    groups: groups.map((g) => ({ id: g.id, box: g.box, inks: g.inks })),
  };
  fs.mkdirSync(outDir, { recursive: true });
  // The overlay: the logo, scaled to at most 1200 px wide, each group boxed and numbered.
  const scale = Math.min(1, 1200 / image.width);
  const shown = fill(fitInto(image, Math.round(image.width * scale), Math.round(image.height * scale)), [255, 255, 255]);
  for (const g of groups) {
    const colour = GROUP_COLOURS[(g.id - 1) % GROUP_COLOURS.length];
    const [x, y, w, h] = g.box.map((v) => Math.round(v * scale));
    strokeRect(shown, x - 3, y - 3, w + 6, h + 6, colour, 2);
    const label = blank(6 * 3 * String(g.id).length + 6, 27, [...colour, 255]);
    text(label, 3, 3, String(g.id), [255, 255, 255], 3);
    over(shown, label, Math.max(0, x - 3), Math.max(0, y - 30));
  }
  writePngFile(path.join(outDir, 'inspect.png'), shown);
  fs.writeFileSync(path.join(outDir, 'inspect.json'), `${JSON.stringify(report, null, 1)}\n`);
  return report;
}

// Artwork placed at the centre of a canvas, scaled to fit a spec. Answers the canvas, the scale,
// and the farthest drawn pixel's distance from the canvas centre, measured on the result.
function centred(art, spec, size = CANVAS) {
  const scale = fitScale({ width: art.width, height: art.height, radius: maxRadius(art) }, spec);
  const image = place(art, { width: size, height: size, scale, left: (size - art.width * scale) / 2, top: (size - art.height * scale) / 2 });
  let radius = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (image.data[(y * size + x) * 4 + 3] < 26) continue;
    radius = Math.max(radius, Math.hypot(Math.max(Math.abs(x - size / 2), Math.abs(x + 1 - size / 2)), Math.max(Math.abs(y - size / 2), Math.abs(y + 1 - size / 2))));
  }
  return { image, scale, radius, drawn: [Math.round(art.width * scale), Math.round(art.height * scale)] };
}

function readRecipe(file) {
  const recipe = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of ['logo', 'icon', 'splash']) if (!recipe[key]) throw new Error(`The recipe needs "${key}".`);
  if (!Array.isArray(recipe.icon) || !Array.isArray(recipe.splash)) throw new Error('"icon" and "splash" are lists of parts: [{"group": 1}] or [{"box": [x, y, w, h], "dx": 0, "dy": 0}].');
  return { ...recipe, logo: path.resolve(path.dirname(file), recipe.logo) };
}

const rules = (list = []) => list.map((r) => ({ from: hexToRgb(r.from), to: hexToRgb(r.to) }));

export function make(recipeFile, outDir) {
  const recipe = readRecipe(recipeFile);
  const colours = { ...DEFAULT_COLOURS, ...(recipe.colours ?? {}) };
  for (const [key, value] of Object.entries(colours)) colours[key] = rgbToHex(hexToRgb(value));
  const notificationColor = recipe.notificationColor ? rgbToHex(hexToRgb(recipe.notificationColor)) : null;
  const background = recipe.background && recipe.background !== 'transparent' ? hexToRgb(recipe.background) : recipe.background;
  const analysis = analyse(readImage(recipe.logo), { background });
  const icon = lift(analysis, recipe.icon);
  const splash = lift(analysis, recipe.splash);
  const iconDark = recolour(icon, rules(recipe.dark));
  const splashDark = recolour(splash, rules(recipe.dark));
  const tinted = greyscale(recolour(iconDark, rules(recipe.tinted)));
  const notification = recipe.notification === false ? null
    : silhouette(icon, [255, 255, 255], (recipe.notification?.knockout ?? []).map(hexToRgb));

  const out = {};
  const ios = centred(icon, FIT.ios);
  out['icons/ios-light.png'] = { ...ios, image: fill(ios.image, hexToRgb(colours.iosBackground)), background: colours.iosBackground, art: icon };
  const iosDark = centred(iconDark, FIT.ios);
  // Transparent: iOS puts its own dark backdrop behind the dark icon, so inks are checked on black.
  out['icons/ios-dark.png'] = { ...iosDark, background: '#000000', art: iconDark };
  // Transparent greyscale: iOS keeps the lightness and applies the person's tint.
  out['icons/ios-tinted.png'] = { ...centred(tinted, FIT.ios), background: '#000000', art: tinted };
  out['icons/android-foreground.png'] = { ...centred(icon, FIT.android), background: colours.androidBackground, art: icon };
  out['icons/android-monochrome.png'] = { ...centred(silhouette(icon, [0, 0, 0]), FIT.android), background: null };
  if (notification) out['icons/notification-icon.png'] = { ...centred(notification, FIT.notification, FIT.notification.canvas), background: null };
  out['splash/splash-light.png'] = { ...centred(splash, FIT.splash), background: colours.splashBackground, art: splash };
  out['splash/splash-dark.png'] = { ...centred(splashDark, FIT.splash), background: colours.splashDarkBackground, art: splashDark };

  const warnings = [];
  const iconAspect = Math.max(icon.width, icon.height) / Math.min(icon.width, icon.height);
  if (iconAspect > 2) warnings.push(`The icon artwork is ${iconAspect.toFixed(1)} times wider than tall, so it is small and hard to read on a home screen. Use the symbol alone, or a monogram.`);
  if (ios.scale > 6) throw new Error(`The icon artwork is only ${Math.max(icon.width, icon.height)} px across; the iOS icon needs it at ${FIT.ios.box} px. Ask for a larger logo, at least ${Math.ceil(FIT.ios.box / 2)} px across the icon part.`);
  if (ios.scale > 2.5) warnings.push(`The icon artwork is ${Math.max(icon.width, icon.height)} px across and is drawn ${ios.scale.toFixed(1)} times larger on iOS. Its edges are rebuilt, but fine detail can look soft: a logo at least ${Math.ceil(FIT.ios.box / 2)} px across the icon part is safer.`);
  if (!(analysis.palette.length <= 6 && analysis.palette.reduce((a, ink) => a + ink.share, 0) >= 0.9)) {
    warnings.push('The logo is not flat colour (a gradient, shading or a photo), so the themed, tinted and notification icons, which are one colour, may lose detail. Check them in the preview.');
  }
  for (const [file, entry] of Object.entries(out)) {
    if (!entry.background || !entry.art) continue;
    const bg = hexToRgb(entry.background);
    const weak = inksOf(entry.art).filter((ink) => ink.share >= 0.1 && contrast(hexToRgb(ink.hex), bg) < 1.5);
    if (weak.length) warnings.push(`${file}: ${weak.map((ink) => ink.hex).join(', ')} barely shows on ${entry.background}. Recolour that ink for this background, or pick another background.`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const spec of FILES) {
    const entry = out[spec.file];
    if (!entry) continue;
    writePngFile(path.join(outDir, spec.file), entry.image, { alpha: !spec.opaque });
    files.push({ file: spec.file, panel: spec.panel, key: spec.key, size: [entry.image.width, entry.image.height],
      alpha: !spec.opaque, drawn: entry.drawn, farthestPixel: +entry.radius.toFixed(1) });
  }
  const values = {
    brandAssets: { androidBackgroundColor: colours.androidBackground, ...(notificationColor ? { notificationColor } : {}) },
    splashScreen: { backgroundColor: colours.splashBackground, darkBackgroundColor: colours.splashDarkBackground, imageWidth: SPLASH_IMAGE_WIDTH },
  };
  const limits = {
    'icons/android-foreground.png': ANDROID_SAFE_RADIUS, 'icons/android-monochrome.png': ANDROID_SAFE_RADIUS,
    'splash/splash-light.png': SPLASH_VISIBLE_RADIUS, 'splash/splash-dark.png': SPLASH_VISIBLE_RADIUS,
  };
  for (const entry of files) {
    if (limits[entry.file] && entry.farthestPixel > limits[entry.file]) warnings.push(`${entry.file}: drawn ${entry.farthestPixel} px from the centre, past the ${limits[entry.file].toFixed(1)} px the platform keeps.`);
  }
  writePngFile(path.join(outDir, 'preview.png'), previewSheet(out, colours));
  const manifest = { recipe: path.resolve(recipeFile), logo: recipe.logo, files, values, warnings };
  fs.writeFileSync(path.join(outDir, MANIFEST), `${JSON.stringify(manifest, null, 1)}\n`);
  return manifest;
}

// One sheet the person approves from: each file under the mask the phone puts on it.
function previewSheet(out, colours) {
  const T = 300; const PAD = 24; const LABEL = 30; const COLS = 4;
  const tiles = [];
  const shrink = (image) => fitInto(image, T, T);
  // The dark and tinted icons are transparent; the phone draws them on its own dark backdrop.
  const ios = (file, panel, backdrop) => {
    const image = backdrop ? fill(out[file].image, backdrop) : out[file].image;
    tiles.push({ label: file.split('/')[1].replace('.png', ''), panel, image: masked(shrink(image), roundedSquareMask(T, T * 0.2237)) });
  };
  ios('icons/ios-light.png', [233, 233, 238]);
  ios('icons/ios-dark.png', [28, 28, 30], [10, 10, 12]);
  ios('icons/ios-tinted.png', [28, 28, 30], [10, 10, 12]);
  const fg = over(blank(CANVAS, CANVAS, [...hexToRgb(colours.androidBackground), 255]), out['icons/android-foreground.png'].image);
  const visible = Math.round(ANDROID_VISIBLE_RADIUS * 2);
  const cut = place(fg, { width: visible, height: visible, scale: 1, left: -(CANVAS - visible) / 2, top: -(CANVAS - visible) / 2, sharpen: false });
  tiles.push({ label: 'android masked', panel: [60, 64, 67], image: masked(fitInto(cut, T, T), circleMask(T, T, T / 2, T / 2, T / 2)) });
  const guides = shrink(fg);
  ring(guides, T / 2, T / 2, ANDROID_SAFE_RADIUS * T / CANVAS, [0, 150, 255]);
  ring(guides, T / 2, T / 2, ANDROID_VISIBLE_RADIUS * T / CANVAS, [255, 120, 0]);
  tiles.push({ label: 'android safe zone', panel: [240, 240, 240], image: guides });
  const mono = out['icons/android-monochrome.png'].image;
  const themed = over(blank(CANVAS, CANVAS, [200, 235, 225, 255]), silhouette(mono, [30, 70, 60]));
  const themedCut = place(themed, { width: visible, height: visible, scale: 1, left: -(CANVAS - visible) / 2, top: -(CANVAS - visible) / 2, sharpen: false });
  tiles.push({ label: 'android themed', panel: [25, 40, 35], image: masked(fitInto(themedCut, T, T), circleMask(T, T, T / 2, T / 2, T / 2)) });
  if (out['icons/notification-icon.png']) {
    const note = out['icons/notification-icon.png'].image;
    const big = place(note, { width: T, height: T, scale: T / note.width, left: 0, top: 0, sharpen: false });
    tiles.push({ label: 'notification', panel: [32, 33, 36], image: fill(big, [32, 33, 36]) });
  }
  for (const [file, key] of [['splash/splash-light.png', 'splashBackground'], ['splash/splash-dark.png', 'splashDarkBackground']]) {
    const bg = hexToRgb(colours[key]);
    const sheet = shrink(fill(out[file].image, bg));
    ring(sheet, T / 2, T / 2, SPLASH_VISIBLE_RADIUS * T / CANVAS, [0, 150, 255]);
    tiles.push({ label: file.split('/')[1].replace('.png', ''), panel: bg, image: sheet });
    // The splash at its real size on a 412 dp wide phone: imageWidth 288 dp.
    const phoneW = Math.round(T * 412 / 915); const phone = blank(phoneW, T, [...bg, 255]);
    const logo = Math.round(phoneW * SPLASH_IMAGE_WIDTH / 412);
    over(phone, fitInto(out[file].image, logo, logo), Math.round((phoneW - logo) / 2), Math.round((T - logo) / 2));
    const framed = blank(T, T, [200, 200, 205, 255]); over(framed, phone, Math.round((T - phoneW) / 2), 0);
    tiles.push({ label: `${file.includes('dark') ? 'dark' : 'light'} on phone`, panel: [200, 200, 205], image: framed });
  }
  const rows = Math.ceil(tiles.length / COLS);
  const sheet = blank(COLS * (T + 2 * PAD), rows * (T + 2 * PAD + LABEL), [248, 248, 250, 255]);
  tiles.forEach((tile, index) => {
    const x = (index % COLS) * (T + 2 * PAD); const y = Math.floor(index / COLS) * (T + 2 * PAD + LABEL);
    over(sheet, blank(T + 2 * PAD - 12, T + 2 * PAD - 12, [...tile.panel, 255]), x + 6, y + 6);
    over(sheet, tile.image, x + PAD, y + PAD);
    text(sheet, x + 8, y + T + 2 * PAD + 6, tile.label, [40, 40, 40], 2);
  });
  return sheet;
}

const NOT_A_PANEL = /not a settings panel|unknown panel|no panel named/i;

/** Read both panels; answers their current values and the app record's version, or why it cannot. */
async function readPanels(tools, appId) {
  const panels = {};
  let version;
  for (const panel of ['brandAssets', 'splashScreen']) {
    let reply;
    try { reply = await tools.call('get_app_settings', { appId, panel }); } catch (error) {
      if (NOT_A_PANEL.test(error.message)) {
        return { missing: `This tenant's UnifyApps does not offer the ${panel} settings yet, so nothing can be written. The files are ready to add by hand in the builder (Settings > Brand Assets and Splash Screen).` };
      }
      throw error;
    }
    panels[panel] = reply?.panels?.[panel] ?? {};
    version = reply?.version;
  }
  return { panels, version };
}

export async function upload({ tools, outDir, appId, apply = false, namePrefix = 'app' }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, MANIFEST), 'utf8'));
  const before = await readPanels(tools, appId);
  if (before.missing) return { ok: false, code: 'PANELS_MISSING', message: before.missing };
  const plan = {
    upload: manifest.files.map((f) => f.file),
    write: {
      brandAssets: [...manifest.files.filter((f) => f.panel === 'brandAssets').map((f) => f.key), ...Object.keys(manifest.values.brandAssets)],
      splashScreen: [...manifest.files.filter((f) => f.panel === 'splashScreen').map((f) => f.key), ...Object.keys(manifest.values.splashScreen)],
    },
    current: { brandAssets: before.panels.brandAssets.values ?? {}, splashScreen: before.panels.splashScreen.values ?? {} },
  };
  if (!apply) return { ok: true, applied: false, plan };

  // Every file first: when one fails, nothing is written to the app.
  const links = {};
  for (const entry of manifest.files) {
    const reply = await tools.call('upload_public_file', {
      filePath: path.resolve(outDir, entry.file),
      fileName: `${namePrefix}-${path.basename(entry.file)}`,
      mimeType: 'image/png',
    });
    const url = reply?.file?.url;
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      return { ok: false, code: 'UPLOAD_FAILED', message: `${entry.file} uploaded with no https link; nothing was written to the app.`, uploaded: links };
    }
    links[entry.file] = url;
  }
  const values = { brandAssets: { ...manifest.values.brandAssets }, splashScreen: { ...manifest.values.splashScreen } };
  for (const entry of manifest.files) values[entry.panel][entry.key] = links[entry.file];

  const written = {};
  const warnings = [];
  for (const panel of ['brandAssets', 'splashScreen']) {
    const dry = await tools.call('update_app_settings', { appId, panel, values: values[panel], dryRun: true });
    warnings.push(...(dry?.warnings ?? []));
    const { version } = await tools.call('get_app_settings', { appId, panel });
    const reply = await tools.call('update_app_settings', { appId, panel, values: values[panel], ...(version !== undefined ? { expectedVersion: version } : {}) });
    warnings.push(...(reply?.warnings ?? []));
    written[panel] = reply?.stored ?? {};
  }
  const after = await readPanels(tools, appId);
  const mismatched = [];
  for (const panel of ['brandAssets', 'splashScreen']) {
    const stored = after.panels?.[panel]?.values ?? {};
    for (const [key, value] of Object.entries(values[panel])) if (stored[key] !== value) mismatched.push(`${panel}.${key}`);
  }
  const result = { ok: mismatched.length === 0, applied: true, links, values, readBack: mismatched.length ? { mismatched } : 'every key matches', warnings: [...new Set(warnings)] };
  fs.writeFileSync(path.join(outDir, 'upload-result.json'), `${JSON.stringify(result, null, 1)}\n`);
  return result;
}

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  const need = (key) => { if (!flags[key] || flags[key] === true) throw new Error(`--${key} is required.`); return flags[key]; };
  if (command === 'inspect') return inspect(need('logo'), need('out'), { background: flags.background });
  if (command === 'make') return make(need('recipe'), need('out'));
  if (command === 'upload') {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const load = (file) => import(pathToFileURL(path.resolve(here, '../../../scripts', file)).href);
    const [{ openTools }, { bridgeContext }] = await Promise.all([load('tool-calls.mjs'), load('mcp-bridge.mjs')]);
    const tenant = bridgeContext(process.cwd(), process.env.CLAUDE_CODE_SESSION_ID)?.tenant;
    if (!tenant) throw new Error('This folder is not signed in to a tenant. Run /ua:setup first.');
    // The app-builder tools take the tenant as `host`; the bridge checks it but never adds it.
    const tools = withHost(openTools('application-builder'), tenant);
    try {
      return await upload({ tools, outDir: need('out'), appId: need('app-id'), apply: Boolean(flags.apply), namePrefix: flags['name-prefix'] ?? 'app' });
    } finally { await tools.close(); }
  }
  throw new Error('Use: inspect --logo <image> --out <dir> | make --recipe <recipe.json> --out <dir> | upload --out <dir> --app-id <id> [--apply]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
    if (result && result.ok === false) process.exitCode = 1;
  }, (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
