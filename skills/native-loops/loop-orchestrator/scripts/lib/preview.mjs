// The UnifyApps Preview app for the pool: a simulator build the person gives, as a local .app or
// archive, or as a URL. Then installed on every pool simulator (device-pool pool install, which runs
// `xcrun simctl install` and records the build in pool.json).
//
// --platform android takes a local .apk or an https .apk and installs it on one emulator or phone
// with adb: there is no Android pool. An emulator with Google Play can run the store build instead.
import fs from 'node:fs';
import path from 'node:path';
import { blockError, devicePool } from './blocks.mjs';
import { runInherit } from './exec.mjs';
import { invalidate } from './health.mjs';
import { failed, missing, usage } from './output.mjs';
import { readPool } from './probes.mjs';

const ARCHIVE = /\.(zip|tar\.gz|tgz)$/iu;
const APK = /\.apk$/iu;

/** What to say when no build was named: the loops cannot fetch the Preview app on their own. */
export const NO_SOURCE = 'preview install needs the UnifyApps Preview app: pass --app <its simulator .app, or a .zip, .tar.gz or .tgz of one> or --url <an https URL to such an archive>.';
const NO_SOURCE_ANDROID = 'preview install --platform android needs the UnifyApps Preview app: pass --app <file.apk> or --url <an https .apk>, or install it from Google Play on an emulator that has Play.';

/** Pure: which source, from the flags. Throws a usage error on a bad combination. */
export function parsePreviewArgs(values) {
  const platform = values.platform ?? 'ios';
  if (!['ios', 'android'].includes(platform)) throw usage('--platform must be ios or android');
  if (platform === 'android') return parseAndroidArgs(values);
  if (values.device !== undefined) throw usage('--device is for --platform android; iOS installs on every pool simulator');
  const given = ['app', 'url'].filter((key) => values[key] !== undefined);
  if (given.length > 1) throw usage('preview install takes one source: --app or --url, not both');
  if (!given.length) throw usage(NO_SOURCE);
  const common = { platform: 'ios', print: Boolean(values.print), skipInstall: Boolean(values['skip-install']) };
  const key = given[0];
  const value = String(values[key] ?? '').trim();
  if (!value) throw usage(`--${key} needs a value`);
  if (key === 'url') {
    if (!/^https?:\/\/\S+$/iu.test(value)) throw usage('--url must be an http(s) URL to a .zip, .tar.gz or .tgz of the .app');
    return { source: 'url', value, ...common };
  }
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) throw usage(`--app ${resolved} does not exist`);
  const isApp = resolved.endsWith('.app') && fs.statSync(resolved).isDirectory();
  if (!isApp && !ARCHIVE.test(resolved)) throw usage('--app takes a .app folder or a .zip, .tar.gz or .tgz of one');
  return { source: 'app', value: resolved, ...common };
}

function parseAndroidArgs(values) {
  const given = ['app', 'url'].filter((key) => values[key] !== undefined);
  if (given.length > 1) throw usage('preview install takes one source: --app or --url, not both');
  const skipInstall = Boolean(values['skip-install']);
  const print = Boolean(values.print);
  const device = values.device === undefined ? null : String(values.device).trim();
  if (!device && !skipInstall && !print) throw usage('--platform android needs --device <adb serial> (adb devices lists them), or --skip-install');
  const common = { platform: 'android', device, print, skipInstall };
  if (!given.length) throw usage(NO_SOURCE_ANDROID);
  const key = given[0];
  const value = String(values[key] ?? '').trim();
  if (key === 'url') {
    if (!/^https?:\/\/\S+\.apk(\?\S*)?$/iu.test(value)) throw usage('--url must be an http(s) URL to an .apk');
    return { source: 'url', value, ...common };
  }
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) throw usage(`--app ${resolved} does not exist`);
  if (!APK.test(resolved)) throw usage('--platform android --app takes an .apk file');
  return { source: 'app', value: resolved, ...common };
}

/** Pure: the steps that bring a local or downloaded .apk to disk, and its adb install. */
export function androidPlan(parsed, { home }) {
  const steps = [];
  let appPath = parsed.value;
  if (parsed.source === 'url') {
    const dir = path.join(home, 'apps', 'downloads');
    appPath = path.join(dir, 'preview-app.apk');
    steps.push({ id: 'download', title: 'Download the .apk', cwd: home, env: {}, cmd: 'curl', args: ['-fL', '--create-dirs', '-o', appPath, parsed.value] });
  }
  const install = parsed.skipInstall ? null : {
    title: `Install on ${parsed.device ?? '<device>'} with adb`, cmd: 'adb', args: ['-s', parsed.device ?? '<device>', 'install', '-r', appPath],
  };
  return { source: parsed.source, platform: 'android', steps, appPath, install };
}

const quote = (value) => (/^[\w@%+=:,./-]+$/u.test(value) ? value : `'${value.replace(/'/gu, `'\\''`)}'`);

export function shellLine(step) {
  const env = Object.entries(step.env ?? {}).map(([key, value]) => `${key}=${quote(value)}`).join(' ');
  return `cd ${quote(step.cwd)} && ${env ? `${env} ` : ''}${[step.cmd, ...step.args].map(quote).join(' ')}`;
}

/** The whole plan for the parsed flags: { source, steps[], appPath, install }. */
export function previewPlan(parsed, { home }) {
  if (parsed.platform === 'android') return androidPlan(parsed, { home });
  const plan = { steps: [], appPath: parsed.value };
  const install = parsed.skipInstall ? null : { title: 'Install on every pool simulator', args: ['pool', 'install', '--all', '--preview-app', plan.appPath] };
  return { source: parsed.source, ...plan, install };
}

export function renderPlan(plan) {
  const lines = [`Preview app from ${plan.source}:`];
  plan.steps.forEach((step, index) => lines.push(`${index + 1}. ${step.title}`, `   ${shellLine(step)}`));
  lines.push(`→ ${plan.appPath}`);
  if (plan.install) lines.push(`${plan.steps.length + 1}. ${plan.install.title}`, `   ${plan.install.cmd ?? 'device-pool'} ${plan.install.args.map(quote).join(' ')}`);
  return lines.join('\n');
}

export async function previewInstall(values, { home, session }) {
  const parsed = parsePreviewArgs(values);
  const plan = previewPlan(parsed, { home });
  if (parsed.print) return { data: { ...plan, commands: plan.steps.map(shellLine) }, text: renderPlan(plan) };
  if (parsed.platform === 'android') return runAndroid(plan);
  if (plan.install && !readPool(home)?.devices?.length) {
    throw missing(`there is no pool to install on: run pool up --preview-app ${plan.appPath} (it creates the simulators and installs the app)`);
  }
  const total = plan.steps.length + (plan.install ? 1 : 0);
  runSteps(plan, total);
  if (!plan.install) return { data: { ...plan, installed: false }, text: `${plan.appPath} (not installed: --skip-install).` };
  process.stderr.write(`[${total}/${total}] ${plan.install.title}\n`);
  return installOnPool(plan, { home, session, parsed });
}

/** device-pool records the source in config.previewApp, so later pool up / pool add install the same build. */
function installOnPool(plan, { home, session, parsed }) {
  const installed = devicePool(plan.install.args, { home, session, showProgress: true });
  invalidate(home, ['preview', 'pool']);
  if (installed.status !== 0) throw failed(`install failed: ${blockError(installed)}`, installed.json ?? undefined);
  const app = installed.json?.app;
  const from = `from ${parsed.source}`;
  return {
    data: { ...plan, installed: true, result: installed.json },
    text: `Preview app ${app?.bundleId ?? ''} ${app?.version ?? ''} installed on ${installed.json?.installed?.length ?? 'every'} pool simulators (${from}).`.replace(/\s+/gu, ' '),
  };
}

function runSteps(plan, total) {
  plan.steps.forEach((step, index) => {
    process.stderr.write(`[${index + 1}/${total}] ${step.title}\n  ${shellLine(step)}\n`);
    // A missing cwd makes spawn fail with ENOENT, which reads as "the command is not installed".
    fs.mkdirSync(step.cwd, { recursive: true });
    const result = runInherit(step.cmd, step.args, { cwd: step.cwd, env: { ...process.env, ...step.env } });
    if (result.status !== 0) {
      throw failed(`step "${step.id}" failed (exit ${result.status})${result.missing ? `: ${step.cmd} is not installed` : ''}; fix it and run preview install again`, { step: step.id, command: shellLine(step) });
    }
  });
}

function runAndroid(plan) {
  const total = plan.steps.length + (plan.install ? 1 : 0);
  runSteps(plan, total);
  if (!plan.install) return { data: { ...plan, installed: false }, text: `Downloaded ${plan.appPath} (not installed: --skip-install).` };
  process.stderr.write(`[${total}/${total}] ${plan.install.title}\n`);
  const serial = plan.install.args[1];
  const result = runInherit(plan.install.cmd, plan.install.args, { env: process.env });
  if (result.status !== 0) throw failed(`adb install failed (exit ${result.status})${result.missing ? ': adb is not installed' : ''}`, { command: ['adb', ...plan.install.args].map(quote).join(' ') });
  return { data: { ...plan, installed: true }, text: `${path.basename(plan.appPath)} installed on ${serial} (from ${plan.source}).` };
}
