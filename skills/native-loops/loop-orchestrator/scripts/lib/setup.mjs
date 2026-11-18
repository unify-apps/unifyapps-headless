// Install what doctor found missing. Without --yes it only lists each install with its
// consent line and exits 3 (the session asks the person, then runs setup --yes, or
// setup --yes --only <ids>). Steps only the person can do are listed, never run.
// On WEB (platform 'WEB') the one install is `browser`: Playwright's Chrome for Testing, through
// app-verify's `browser.mjs --install`; nothing of the simulator side is offered.
import { runInherit, which } from './exec.mjs';
import { runDoctor } from './doctor-checks.mjs';
import { invalidate } from './health.mjs';
import { EXIT, LoopsError, usage } from './output.mjs';
import { poolUp } from './pool.mjs';
import { previewInstall } from './preview.mjs';
import { readLoopsConfig, wantedRuntime } from './paths.mjs';
import { BROWSER_INSTALL } from './web-probes.mjs';

const sourceLabel = (source) => source?.app ?? source?.url ?? null;

/**
 * Pure: the actions for a doctor result. source: { app | url } for the Preview app;
 * count: the pool size (else the laptop's).
 */
export function planSetup(doctor, { config = {}, source = null, count = null, platform = 'MOBILE' } = {}) {
  if (platform === 'WEB') return planWebSetup(doctor);
  const tools = Object.fromEntries(doctor.rows.map((item) => [item.tool, item]));
  const actions = [];
  const manual = [];
  const broken = (tool) => tools[tool] && tools[tool].ok === false;
  if (broken('node')) manual.push({ id: 'node', step: tools.node.fixCommand, why: tools.node.detail });
  if (broken('xcode')) manual.push({ id: 'xcode', step: tools.xcode.fixCommand, why: tools.xcode.detail });
  if (broken('rosetta')) {
    actions.push({ id: 'rosetta', consent: "Install Rosetta (the Preview app's simulator build is x86_64)?", cmd: 'softwareupdate', args: ['--install-rosetta', '--agree-to-license'], kind: 'system' });
  }
  if (broken('ios-runtime') && tools['ios-runtime'].fixKind === 'long') {
    const version = wantedRuntime(config);
    actions.push({ id: 'ios-runtime', consent: `Download the iOS ${version} simulator runtime (about 8 GB, 10–30 minutes)?`, cmd: 'xcodebuild', args: ['-downloadPlatform', 'iOS', '-buildVersion', version], kind: 'long' });
  } else if (broken('ios-runtime')) {
    manual.push({ id: 'ios-runtime', step: tools['ios-runtime'].fixCommand, why: tools['ios-runtime'].detail });
  }
  if (tools.baguette && tools.baguette.present === false) {
    if (which('brew')) actions.push({ id: 'baguette', consent: 'Install baguette with Homebrew (headless simulator control and the farm view on :8421)?', cmd: 'brew', args: ['install', 'baguette'], kind: 'brew' });
    else manual.push({ id: 'baguette', step: 'install Homebrew (https://brew.sh), then: brew install baguette', why: tools.baguette.detail });
  } else if (broken('baguette')) {
    manual.push({ id: 'baguette', step: tools.baguette.fixCommand, why: tools.baguette.detail });
  }
  if (tools.argent && tools.argent.present === false) {
    actions.push({ id: 'argent', consent: 'Install argent globally with npm (it drives the simulators for the agents)?', cmd: 'npm', args: ['i', '-g', '@swmansion/argent@0.28.0'], kind: 'npm' });
  }
  if ((tools.argent && tools.argent.present === false) || (broken('argent') && tools.argent.fixCommand?.startsWith('claude mcp add'))) {
    actions.push({ id: 'argent-mcp', consent: "Register argent's MCP server for your user, so every session has the device tools?", cmd: 'claude', args: ['mcp', 'add', '--scope', 'user', 'argent', '--', 'argent', 'mcp'], kind: 'npm' });
  }
  const pool = tools['sim-pool'];
  const size = count ?? doctor.capacity?.pool ?? '?';
  // The loops cannot fetch the Preview app: the person gives its simulator build, or one is
  // already configured from an earlier install.
  const configured = config?.previewApp?.path || config?.previewApp?.url || null;
  const from = sourceLabel(source) ?? configured;
  const needApp = { id: 'preview', step: "get the UnifyApps Preview app's iOS simulator build, then run setup again with --app <its .app, or a .zip, .tar.gz or .tgz of it> or --url <an https URL to one>", why: 'the loops cannot download the Preview app themselves' };
  if (pool && pool.present === false) {
    if (from) actions.push({ id: 'pool', consent: `Create the simulator pool: ${size} iOS ${wantedRuntime(config)} simulators with the Preview app from ${from} (about 1.5 GB of disk each)?`, internal: 'pool-up', kind: 'loops' });
    else manual.push(needApp);
  } else if (source) {
    actions.push({ id: 'preview', consent: `Install the Preview app from ${from} on every pool simulator?`, internal: 'preview-install', kind: 'loops' });
  } else if (tools['preview-app'] && tools['preview-app'].present === false) {
    manual.push(needApp);
  }
  // A pool made before this laptop's size grew (slim simulators about doubled it) grows on a yes.
  const have = pool?.data?.devices ?? 0;
  if (pool?.present && Number.isInteger(size) && size > have) {
    actions.push({ id: 'pool-grow', consent: `Grow the simulator pool from ${have} to ${size} simulators (about 1.5 GB of disk each)?`, internal: 'pool-up', kind: 'loops' });
  }
  return { actions, manual };
}

/** Pure: the WEB actions for a WEB doctor result. */
export function planWebSetup(doctor) {
  const tools = Object.fromEntries(doctor.rows.map((item) => [item.tool, item]));
  const actions = [];
  const manual = [];
  const broken = (tool) => tools[tool] && tools[tool].ok === false;
  if (broken('node')) manual.push({ id: 'node', step: tools.node.fixCommand, why: tools.node.detail });
  if (broken('npx')) manual.push({ id: 'npx', step: tools.npx.fixCommand, why: tools.npx.detail });
  if (broken('browser')) {
    actions.push({ id: 'browser', consent: "Install Playwright's Chrome for Testing for UnifyApps Headless's browsers (about 100 MB, once per machine; never your own Chrome)?", cmd: BROWSER_INSTALL.cmd, args: BROWSER_INSTALL.args, kind: 'npm' });
  }
  return { actions, manual };
}

export function renderSetupPlan(plan, { ran = [] } = {}) {
  const lines = [];
  if (!plan.actions.length && !plan.manual.length) return 'Loops setup: nothing to install.';
  if (plan.actions.length) {
    lines.push('Loops setup would run, each only with your yes:');
    for (const action of plan.actions) lines.push(`- [${action.id}] ${action.consent}${action.cmd ? `\n    ${[action.cmd, ...action.args].join(' ')}` : ''}`);
  }
  if (plan.manual.length) {
    lines.push('', 'Only you can do these:');
    for (const item of plan.manual) lines.push(`- [${item.id}] ${item.step}`);
  }
  if (ran.length) lines.push('', ...ran.map((item) => `${item.ok ? '✓' : '✗'} ${item.id}${item.message ? `: ${item.message}` : ''}`));
  return lines.join('\n');
}

export async function runSetup({ home, yes = false, only = null, session, cwd, source = null, count = null, platform = 'MOBILE' }) {
  if (platform === 'WEB' && source) throw usage('--app and --url name a Preview app, which only a MOBILE app uses; a WEB app needs none');
  const config = readLoopsConfig(home);
  const doctor = await runDoctor({ home, cwd, platform });
  const plan = planSetup(doctor, { config, source, count, platform });
  const platformField = platform === 'WEB' ? { platform } : {};
  if (only?.length) {
    const unknown = only.filter((id) => !plan.actions.some((action) => action.id === id));
    if (unknown.length) throw usage(`--only names no pending install: ${unknown.join(', ')} (pending: ${plan.actions.map((action) => action.id).join(', ') || 'none'})`);
    plan.actions = plan.actions.filter((action) => only.includes(action.id));
  }
  if (!yes) {
    const data = { ...plan, ...platformField, ran: [], needsConsent: plan.actions.length > 0, capacity: doctor.capacity };
    if (plan.actions.length) throw new LoopsError(renderSetupPlan(plan), { exit: EXIT.CONSENT, code: 'CONSENT_REQUIRED', data });
    return { data, text: renderSetupPlan(plan) };
  }
  const ran = [];
  const sourceValues = source?.app ? { app: source.app } : source?.url ? { url: source.url } : {};
  for (const action of plan.actions) {
    process.stderr.write(`→ ${action.id}: ${action.consent.replace(/\?$/u, '')}\n`);
    try {
      if (action.internal === 'pool-up') poolUp({ home, session, count, previewApp: source?.app ?? source?.url ?? undefined });
      else if (action.internal === 'preview-install') await previewInstall(sourceValues, { home, session });
      else {
        const result = runInherit(action.cmd, action.args);
        if (result.status !== 0) throw new Error(`${action.cmd} exited ${result.status}${result.missing ? ' (not installed)' : ''}`);
      }
      ran.push({ id: action.id, ok: true });
    } catch (error) {
      ran.push({ id: action.id, ok: false, message: error.message });
      // A pool cannot be made without the runtime; stop at the first failure.
      break;
    }
  }
  invalidate(home, 'all', platform);
  const after = await runDoctor({ home, cwd, platform });
  const data = { ...plan, ...platformField, ran, ok: ran.every((item) => item.ok), doctor: { ok: after.ok, line: after.line, requiredMissing: after.requiredMissing } };
  const text = `${renderSetupPlan({ actions: [], manual: plan.manual }, { ran })}\n${after.line}`.trim();
  if (!data.ok) throw new LoopsError(text, { exit: EXIT.FAIL, code: 'SETUP_FAILED', data });
  return { data, text };
}
