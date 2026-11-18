#!/usr/bin/env node
/**
 * Writes the arguments that store an app look, from the plan's App look line.
 *
 *   node app-look-args.mjs theme --look-file <look.txt> --app-id <id>
 *        [--app-file <saved app entity .json>] --out-dir <folder>
 *   node app-look-args.mjs header --look-file <look.txt> --app-id <id>
 *        [--app-file <saved app entity .json>] --out <args.json>
 *
 * `theme` is for a tenant whose application-builder lists `set_app_theme`: the
 * look becomes the app's own theme (`themeArgs`). It writes `theme-args.json`
 * and `typography-args.json`, and `header-args.json` only when the saved app
 * header still holds a look block, to take that block out. It prints the calls
 * in order and what to check when reading the theme back. Running it twice
 * writes the same files.
 *
 * `header` is for a tenant without the theme tools, or an app whose theme
 * write is refused: the look goes in the app header block (`lookBlock`).
 *
 * `--look-file` names a file holding the plan's `app look · <app>:` line, as
 * the message's `App look:` gives it. The builder writes the file with its
 * Write tool, so the line never passes through a shell, where a code span or
 * `$(…)` in it would run. The script refuses the line for anything `plan
 * propose` and `spec draft` refuse it for, in their words. `header` also takes
 * `--seeds <seeds.json>`, the 17 values as a file: the 13 colours named in
 * SEEDS, then radius, font-text, font-display and font-url. A seeds file may
 * leave out the three radius sizes, the text sizes, the two weights and the
 * two gaps; every radius step then takes `radius`.
 *
 * Every file holds the call's arguments except `host`, which the bridge wants
 * on the call itself: send each as `{host, argsFile: <file>}`. A header file
 * keeps whatever else the app header and footer hold, and replaces or takes
 * out only the look block (between LOOK_START and LOOK_END).
 *
 * The header block has two parts:
 * - the seeds, as `--ds-*` variables on `:root`, plus the line's sizes,
 *   weights, gaps and three shadows for custom CSS;
 * - a fixed mapping from those seeds onto the platform theme's own variables
 *   (`--palette-brand-*`, `--palette-gray-*`, `--bg-*`, `--border-*`,
 *   `--fontFamily-*`, `--palette-alpha-brand-*`, `--radius-*` and the
 *   button, input, checkbox, tooltip and chart radius). Every block reads its
 *   colours, fonts and corners from those, so blocks nobody styled follow the
 *   look too. The colours and fonts were checked on a test tenant on 2026-10-04,
 *   in the builder and the preview, for the light scheme.
 *
 * It refuses a palette whose text would be hard to read, and prints every
 * contrast number it checked, so no number in a report is a guess.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkSeeds, lookBlock, themeArgs, withLook, withoutLook } from '../../../scripts/lib/app-look.mjs';
import { lookLineProblem, readLookLines } from '../../../scripts/lib/page-jobs.mjs';

// The colour code lives in the plugin's shared library, which `plan propose` and
// `spec draft` use to check the same line before any page is built.
export { LOOK_END, LOOK_START, SEEDS, checkSeeds, contrast, lookBlock, readLookLine, withLook } from '../../../scripts/lib/app-look.mjs';

const USAGE = [
  'node app-look-args.mjs theme --look-file <file holding the App look line> --app-id <id> [--app-file <saved app .json>] --out-dir <folder>',
  'node app-look-args.mjs header --look-file <file holding the App look line> (or --seeds <seeds.json>) --app-id <id> [--app-file <saved app .json>] --out <args.json>',
];

function readJson(file, what) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${what} ${file} is not readable JSON: ${error.message}`); }
}

function parse(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i]?.startsWith('--')) throw new Error(`Unexpected argument ${rest[i]}`);
    flags[rest[i].slice(2)] = rest[i + 1];
  }
  return { command, flags };
}

// The one App look line in a file, read, or an error that says why there is none.
function lookFromFile(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { throw new Error(`Look file ${file} is not readable: ${error.message}`); }
  // The message gives the line with no list dash; the spec writes it with one.
  const listed = text.split(/\r?\n/u).map((line) => (/^\s*[-*]\s/u.test(line) ? line : `- ${line}`)).join('\n');
  const looks = [...readLookLines(listed).values()];
  if (looks.length !== 1) {
    throw new Error(`Look file ${file} holds ${looks.length ? `${looks.length} app look lines` : 'no "app look · <app>:" line'}: write the one line your message gives as App look, as it is.`);
  }
  const [look] = looks;
  if (look.none) throw new Error(`This App look line says none (${look.none}), so there is nothing to store.`);
  const problem = lookLineProblem(look);
  if (problem) throw new Error(`Refused, nothing written: ${problem}`);
  return look;
}

// The app's stored custom code, from the saved app file, or nothing.
function storedCode(file) {
  if (!file) return {};
  const app = readJson(file, 'App file');
  return (app.properties ?? app.entity?.properties ?? app.body?.properties ?? {}).customCode ?? {};
}

// Prints every contrast number; false, with the problems said, when the palette is refused.
function readable(seeds) {
  const { problems, numbers } = checkSeeds(seeds);
  for (const n of numbers) console.log(`contrast ${n.fg} on ${n.bg}: ${n.ratio}:1 (needs ${n.min}:1)`);
  if (!problems.length) return true;
  console.error(`Refused, nothing written:\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
  return false;
}

function writeThemeFiles(flags) {
  const look = lookFromFile(flags['look-file']);
  if (!readable(look.seeds)) return;
  const { theme, typography } = themeArgs(look, flags['app-id']);
  const dir = path.resolve(flags['out-dir']);
  const fileOf = (name) => path.join(dir, name);
  const write = (name, args) => fs.writeFileSync(fileOf(name), JSON.stringify(args, null, 2));
  fs.mkdirSync(dir, { recursive: true });
  write('theme-args.json', theme);
  write('typography-args.json', typography);
  const { small, medium, large } = look.design.radius;
  const tokens = Object.entries(theme.cssVars);
  const pins = tokens.filter(([name]) => !name.startsWith('--ds-'));
  console.log(`Wrote ${fileOf('theme-args.json')}: ${theme.colorScheme} · radius ${theme.radius} (look ${small}/${medium}/${large}px) · `
    + `${Object.keys(theme.colors).length} colours · ${pins.length} role colours and ${tokens.length - pins.length} --ds-* names as raw tokens`);
  console.log(`Wrote ${fileOf('typography-args.json')}: ${typography.textFont} · base ${typography.baseFontSizePx}px`);

  const stored = storedCode(flags['app-file']);
  const header = withoutLook(stored.header);
  const calls = [`set_app_theme {host, argsFile: "${fileOf('theme-args.json')}"}`, `set_theme_typography {host, argsFile: "${fileOf('typography-args.json')}"}`];
  if (header === null) {
    // A file left by an earlier run would put back a header that may have changed since.
    fs.rmSync(fileOf('header-args.json'), { force: true });
    console.log(flags['app-file'] ? 'No header-args.json: the app header holds no look block.' : 'No header-args.json: no --app-file was given, so no old look block was looked for.');
  } else {
    write('header-args.json', { appId: flags['app-id'], panel: 'customCode', values: { header, footer: stored.footer ?? '' } });
    console.log(`Wrote ${fileOf('header-args.json')}: takes out the old look block (header ${stored.header.length} → ${header.length} chars, footer kept)`);
    calls.push(`update_app_settings {host, argsFile: "${fileOf('header-args.json')}"}`);
  }
  console.log(`Send, in this order:\n${calls.map((call) => `  ${call}`).join('\n')}`);
  const fontToken = `var(--font-${typography.textFont.toLowerCase().replace(/\s+/gu, '-')})`;
  console.log(`Read back get_app_theme {host, appId: "${theme.appId}", includeCssVars: true} and check:`);
  console.log(`  ownedByApp true · defaultScheme ${theme.colorScheme} · radius ${theme.radius} · typography.textFont ${fontToken} · typography.baseFontSizePx ${typography.baseFontSizePx}`);
  console.log(`  colors: ${Object.entries(theme.colors).map(([key, value]) => `${key} ${value}`).join(' · ')}`);
  console.log(`  effectiveCssVars: ${pins.map(([name, value]) => `${name} ${value}`).join(' · ')}`);
  console.log(`  and each of the ${tokens.length - pins.length} --ds-* names in theme-args.json, with the same value.`);
  if (header !== null) console.log(`  The update_app_settings reply: properties.customCode.header holds no "<!-- UnifyApps Headless app look -->".`);
}

function writeHeaderFile(flags) {
  const seeds = flags['look-file'] ? lookFromFile(flags['look-file']).seeds : readJson(flags.seeds, 'Seeds file');
  if (!readable(seeds)) return;
  const stored = storedCode(flags['app-file']);
  const header = withLook(stored.header, lookBlock(seeds));
  // The app's save writes both sides, so the footer goes back as it was.
  const args = { appId: flags['app-id'], panel: 'customCode', values: { header, footer: stored.footer ?? '' } };
  fs.writeFileSync(flags.out, JSON.stringify(args, null, 2));
  console.log(`Wrote ${flags.out}: header ${header.length} chars (look block ${lookBlock(seeds).length}), footer ${args.values.footer.length} chars.`);
  console.log(`Send it with update_app_settings {host, argsFile: "${flags.out}"}.`);
}

function main() {
  const { command, flags } = parse(process.argv.slice(2));
  if (command === 'theme' && flags['look-file'] && flags['app-id'] && flags['out-dir']) return writeThemeFiles(flags);
  if (command === 'header' && (flags.seeds || flags['look-file']) && flags['app-id'] && flags.out) return writeHeaderFile(flags);
  throw new Error(`Usage:\n  ${USAGE.join('\n  ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
