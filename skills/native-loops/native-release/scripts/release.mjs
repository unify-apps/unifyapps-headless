#!/usr/bin/env node
// Builds and releases a MOBILE app from chat: a test APK, an AAB, an iOS build, a release to Google
// Play or the App Store, or an over-the-air update. It sets what the chosen build still needs (app
// identity, store account, App Store app id, signing keys), starts the build on the release service
// and follows it to a link. Run by the main session from the solution folder.
//
//   status --app-id <id>
//       What the app has, the three extras, every build it can get with what each still needs, the
//       store accounts the tenant has, and recent builds. Writes nothing.
//   check-file --file <path>
//       What kind of key file this is (keystore, .p12, profile, .p8, Play key …). Never prints it.
//   signing-template --platform android|ios --work <dir>
//       Writes the empty signing passwords file the person fills in their own editor.
//   plan|apply --app-id <id> --goal apk|aab|ipa|store-android|store-ios|update-android|update-ios --work <dir>
//         [--app-name <n> --bundle-id <id>] [--signing generate|own|keep] [--keystore <f> | --certificate <f> --profile <f>]
//         [--store-account <id> | --store-key <file> [--issuer-id <id> --key-id <id>]] [--asc-app-id <digits>]
//         [--version x.y.z] [--name <label>] [--message <text>]
//       plan checks everything and lists each write; apply makes them in order, reads each back,
//       starts the build and writes <dir>/release-result.json.
//   watch --app-id <id> --build-id <id> [--limit-minutes 60]
//       Follows one build until it ends or the limit passes.
//   cancel|retry --app-id <id> --build-id <id>
//   download-keys --app-id <id> --platform android|ios --work <dir>
//       Saves the app's signing keys archive into <dir>; prints the path only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { refusalIssue, toolRefusal, withHost } from '../../../../scripts/lib/tool-host.mjs';
import { bundleIdIssues, issueSentence } from '../../native-push-notifications/scripts/lib/identity.mjs';
import { status as pushStatus } from '../../native-push-notifications/scripts/push-notifications.mjs';
import { GOALS, extrasState, goalKind, goalLabel, goalPlatform, goalNeeds, menu } from './lib/goals.mjs';
import { readSigningSecrets, sniffFile, writeSigningTemplate } from './lib/release-files.mjs';
import { bindAccount, checkStoreKey, createAccount, findAccounts, writeBuildInfo } from './lib/store-account.mjs';

const RESULT = 'release-result.json';
// Store accounts this work folder created, keyed by the key file's sha256, so a rerun after a stop
// binds the same account instead of adding a second one. Holds no part of the key.
const ACCOUNTS = 'store-accounts.json';
// The release service's own scheduler moves a build once a minute, so polling faster learns nothing.
const POLL_MS = 60_000;
// A store build runs 15 to 40 minutes; an hour covers a slow queue without leaving a watcher forever.
const WATCH_LIMIT_MINUTES = 60;
// One failed status read is a network blip, not a failed build; several in a row stop the watch.
const WATCH_READ_FAILURES = 3;
const FOLLOW = 'in the background; a build usually takes 15 to 30 minutes, up to 40';
// The release service accepts a signing file by its name's extension alone.
const SIGNING_EXTENSIONS = { keystore: ['.jks', '.keystore'], distributionCertificate: ['.p12'], provisioningProfile: ['.mobileprovision'] };
const SAY_PLATFORM = { android: 'Android', ios: 'iOS' };
const IDENTITY_CHANGE = 'Changing the app name or the bundle identifier in the app builder (Releases > Stores, App details) makes it a different app on the stores: it clears both stores\' accounts, the App Store app id, the signing keys and the Firebase files. Download the signing keys first (download-keys): an app already on Google Play cannot get updates without its upload keystore.';
// Up to three numbers of up to three digits each, as the builder's version field accepts.
const VERSION = /^\d{1,3}(\.\d{1,3}){0,2}$/u;
const VERSION_RULE = 'A version is up to three numbers of up to three digits each, such as 1.0.0 or 2.1.';

const MISSING_TOOLS = /Invalid enum value|unknown tool|no tool named|tool .*not found/iu;
const TOOLS_MISSING = "This tenant's UnifyApps cannot make this build from chat yet. Make it in the app builder: Releases > New release.";
const NOT_MOBILE = 'Builds and store releases are for mobile apps; this app is a web app.';
const STORE = { android: 'Google Play', ios: 'App Store Connect' };
const SIGNING_WORD = { android: 'Android', ios: 'iOS' };

function failure(code, message, extra = {}) { return Object.assign(new Error(message), { code, extra }); }

let redact = (text) => String(text).replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, '[REDACTED]');
export function useRedactor(fn) { redact = fn; }

const sleepFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const READ_AGAIN_MS = 5_000;
// The builder's App details dialog: the stores cap a name at 30 characters, and phones may cut a name
// longer than 12 under the icon (a warning, not a refusal).
const APP_NAME_MAX = 30;
const APP_NAME_SHOWN = 12;

function toolMessage(error) {
  const refusal = toolRefusal(error);
  const issues = refusal?.errorPayload?.issues ?? [];
  return issues.map((issue) => issue?.message).filter(Boolean).join(' ') || refusal?.errorPayload?.message || error.message;
}

async function readReadiness(tools, appId) {
  try {
    return await tools.app.call('app_release', { appId, action: 'readiness' });
  } catch (error) {
    if (/MOBILE/u.test(error.message)) throw failure('NOT_MOBILE', NOT_MOBILE);
    if (MISSING_TOOLS.test(error.message)) throw failure('TOOLS_MISSING', TOOLS_MISSING);
    throw error;
  }
}

function asResult(error) {
  const text = String(error?.message ?? '');
  // The person's yes counts only when the question quotes the gate's "summary (id)" word for word.
  const confirm = /CONFIRM_REQUIRED \((d_[0-9a-f]+)\): ([\s\S]*?)\. A delete cannot be undone/u.exec(text);
  if (confirm) {
    const [, confirmId, summary] = confirm;
    const question = `${summary} (${confirmId})`;
    const again = /did not count/u.test(text) ? 'A yes was seen, but the question did not quote this text exactly, so it did not count. ' : '';
    return { ok: false, code: 'CONFIRM_REQUIRED', confirmId, summary, question,
      message: `${again}Removing the auto-generated signing keys cannot be undone. Ask the person with AskUserQuestion, with "${question}" in the question text exactly as written, "Yes, go ahead" first and "No" second. On the yes, run apply again.` };
  }
  if (!error?.code) throw error;
  return { ok: false, code: error.code, message: redact(error.message), ...error.extra };
}

/** What the app has and what it can get. Answers a result; never throws for a refusal. */
export async function status({ tools, appId }) {
  try {
    const readiness = await readReadiness(tools, appId);
    // Push setup has tools of its own; a tenant without them still builds.
    const push = await pushStatus({ tools, appId }).catch(() => null);
    const pushKnown = Boolean(push && push.ok !== false && push.firebase);
    const splash = (await tools.app.call('get_app_settings', { appId, panel: 'splashScreen' }))?.panels?.splashScreen?.values ?? {};
    const brand = (await tools.app.call('get_app_settings', { appId, panel: 'brandAssets' }))?.panels?.brandAssets?.values ?? {};
    const accounts = {};
    for (const p of ['android', 'ios']) {
      const bound = readiness.platforms?.[p]?.storeAccount?.id;
      const found = await findAccounts(tools, p).catch(() => []);
      accounts[p] = found.map((account) => ({ ...account, bound: account.id === bound }));
    }
    const builds = (await tools.app.call('app_release', { appId, action: 'list', limit: 10 }))?.releases ?? [];
    const identity = readiness.identity ?? {};
    return {
      ok: true, appId,
      extras: { ...extrasState({ brandAssets: brand, splashScreen: splash, pushConfigured: pushKnown && push.firebase.configured }),
        ...(pushKnown ? {} : { pushNotifications: 'unknown' }) },
      identity: { appName: identity.appName ?? '', bundleIdentifier: identity.bundleIdentifier ?? '', issues: bundleIdIssues(identity.bundleIdentifier).map(issueSentence) },
      published: readiness.published, unpublishedChanges: readiness.unpublishedChanges,
      platforms: readiness.platforms, nextVersion: readiness.nextVersion, updateTargets: readiness.updateTargets,
      menu: menu(readiness), accounts, builds, firstBuild: builds.length === 0,
    };
  } catch (error) {
    return asResult(error);
  }
}

/**
 * What identity to write. `stored` is the app's build info record as saved (readiness reports a
 * default name made from the app's own name when none is saved, which is not a stored name).
 */
function checkIdentity(stored, given, { suggestedName }) {
  const write = {};
  for (const [field, flag] of [['appName', given.appName], ['bundleIdentifier', given.bundleId]]) {
    const current = String(stored?.[field] ?? '').trim();
    const wanted = String(flag ?? '').trim();
    if (current && wanted && current !== wanted) {
      throw failure('IDENTITY_CONFLICT', `This app's ${field === 'appName' ? 'name' : 'bundle identifier'} is already ${current}; use it. ${IDENTITY_CHANGE}`);
    }
    if (!current && wanted) write[field] = wanted;
  }
  if (!String(stored?.bundleIdentifier ?? '').trim() && !write.bundleIdentifier) {
    const missing = [...(String(stored?.appName ?? '').trim() || write.appName ? [] : ['appName']), 'bundleIdentifier'];
    throw failure('IDENTITY_MISSING', 'This build needs the app name and the bundle identifier (reverse-domain, at least three parts, such as com.yourcompany.appname). The bundle identifier is permanent once the app is in a store.', { missing, suggestedName });
  }
  // The builder's App details dialog: a store name is at most 30 characters.
  if (write.appName && write.appName.length > APP_NAME_MAX) throw failure('IDENTITY_INVALID', `App name can be up to ${APP_NAME_MAX} characters, the stores' limit; this one has ${write.appName.length}. Shorten it.`);
  const issues = bundleIdIssues(write.bundleIdentifier);
  if (issues.length) throw failure('IDENTITY_INVALID', `That bundle identifier will not work: ${issues.map(issueSentence).join(' ')}`);
  return write;
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function savedAccounts(workDir) {
  try { return JSON.parse(fs.readFileSync(path.join(workDir, ACCOUNTS), 'utf8')) ?? {}; } catch { return {}; }
}
function saveAccount(workDir, p, account) {
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, ACCOUNTS), `${JSON.stringify({ ...savedAccounts(workDir), [p]: account }, null, 1)}\n`);
}

const fileArg = (file) => ({ fileName: path.basename(file), contentBase64: fs.readFileSync(file).toString('base64') });

function ownSigning(p, answers, workDir) {
  const wrong = (file, wanted, reads) => failure('SIGNING_FILE_WRONG', `${path.basename(String(file))} is not ${wanted} (it reads as ${reads}).`);
  const secretsFile = path.join(workDir, `signing-${p}.json`);
  const secrets = readSigningSecrets(secretsFile, p);
  const named = (file, slot, wanted) => {
    if (!SIGNING_EXTENSIONS[slot].includes(path.extname(String(file)).toLowerCase())) {
      throw failure('SIGNING_FILE_WRONG', `${path.basename(String(file))} must be named with ${SIGNING_EXTENSIONS[slot].join(' or ')}: the release service takes ${wanted} by that ending only. Rename the file (the content stays the same) and give the new name.`);
    }
  };
  let files;
  if (p === 'android') {
    const kind = answers.keystore ? sniffFile(answers.keystore).kind : 'missing';
    if (kind !== 'jks' && kind !== 'pkcs12') throw wrong(answers.keystore ?? '--keystore', 'an Android keystore (.jks or .keystore)', kind);
    named(answers.keystore, 'keystore', 'a keystore');
    files = { keystore: answers.keystore };
  } else {
    const cert = answers.certificate ? sniffFile(answers.certificate).kind : 'missing';
    const profile = answers.profile ? sniffFile(answers.profile).kind : 'missing';
    if (cert !== 'pkcs12') throw wrong(answers.certificate ?? '--certificate', 'a distribution certificate (.p12)', cert);
    if (profile !== 'mobileprovision') throw wrong(answers.profile ?? '--profile', 'a provisioning profile (.mobileprovision)', profile);
    named(answers.certificate, 'distributionCertificate', 'a certificate');
    named(answers.profile, 'provisioningProfile', 'a profile');
    files = { distributionCertificate: answers.certificate, provisioningProfile: answers.profile };
  }
  if (secrets.missing) {
    throw failure('SIGNING_SECRETS_MISSING', secrets.invalid
      ? `The signing passwords file ${secretsFile} is missing or not valid JSON. Run signing-template, then ask the person to fill it in their own editor.`
      : `Ask the person to fill ${secrets.missing.join(', ')} in ${secretsFile}, in their own editor.`);
  }
  return { files, secrets };
}

/** The build name the builder's release drawers fill in. */
async function defaultName(tools, appId, kind, version) {
  if (kind === 'store') return `Store release ${version}`;
  if (kind === 'update') return `OTA update ${version}`;
  const earlier = (await tools.app.call('app_release', { appId, action: 'list', limit: 1 }).catch(() => null))?.releases ?? [];
  return earlier.length ? `Test build ${version}` : 'First build';
}

/** Plans (and with `apply`, makes) one build. Answers a result; never throws for a refusal. */
export async function release({ tools, appId, goal, workDir, apply = false, sleep = sleepFor, ...answers }) {
  try {
    return await releaseSteps({ tools, appId, goal, workDir, apply, answers, sleep });
  } catch (error) {
    return asResult(error);
  }
}

async function releaseSteps({ tools, appId, goal, workDir, apply, answers: a, sleep }) {
  if (!GOALS.includes(goal)) throw failure('GOAL_UNKNOWN', `--goal is one of ${GOALS.join(', ')}.`);
  const p = goalPlatform(goal);
  const kind = goalKind(goal);
  const r = await readReadiness(tools, appId);
  const st = r.platforms?.[p] ?? {};
  const steps = [];
  const notes = [];
  const actions = [];

  if (st.buildRunning) {
    throw failure('BUILD_RUNNING', `An ${SIGNING_WORD[p]} build (version ${st.buildRunning.appVersion}) is still running, and only one runs per platform at a time. Follow it with watch --build-id ${st.buildRunning.buildId}, or cancel it first.`,
      { buildId: st.buildRunning.buildId, appVersion: st.buildRunning.appVersion });
  }
  if (!r.published) throw failure('PUBLISH_NEEDED', 'This app has never been published, and a build carries the published version. Offer to publish it, then run this again.');
  const offerPublish = r.unpublishedChanges === true;
  if (offerPublish) notes.push('The app has changes that are not published yet. A build carries the published version, so offer to publish first.');

  // 1. Identity: every build needs the app name and bundle identifier, the test APK too.
  const stored = (await tools.app.call('get_app_build_info', { appId }))?.buildInfo ?? {};
  const identityWrite = checkIdentity(stored, a, { suggestedName: r.identity?.appName ?? '' });
  const appName = String(identityWrite.appName || r.identity?.appName || '').trim();
  if (identityWrite.appName && identityWrite.appName.length > APP_NAME_SHOWN) {
    notes.push(`The app name "${identityWrite.appName}" is over ${APP_NAME_SHOWN} characters, so a phone may cut it off under the icon. It is allowed; offer a shorter one.`);
  }
  if (Object.keys(identityWrite).length) {
    steps.push(`Save the app's identity: ${Object.entries(identityWrite).map(([k, v]) => `${k === 'appName' ? 'name' : 'bundle identifier'} ${v}`).join(', ')}.`);
  }

  // 2. Store account and App Store app id.
  const current = st.signing ?? 'none';
  const generating = goal !== 'apk' && current === 'none' && a.signing === 'generate';
  const needsAccount = kind !== 'file' || (p === 'ios' && generating);
  let account = null;
  if (a.storeAccount) {
    const found = (await findAccounts(tools, p)).find((row) => row.id === a.storeAccount);
    if (!found) throw failure('STORE_ACCOUNT_MISSING', `This tenant has no ${STORE[p]} account with id ${a.storeAccount}. Run status to list them.`);
    if (st.storeAccount?.id !== found.id) account = found;
  } else if (a.storeKey) {
    const sha = fs.existsSync(a.storeKey) ? sha256(a.storeKey) : '';
    const saved = savedAccounts(workDir)[p];
    if (sha && saved?.sha === sha && saved.id) {
      notes.push(`The ${STORE[p]} account "${saved.name}" was already added from this key file; it is used again.`);
      if (st.storeAccount?.id !== saved.id) account = { id: saved.id, name: saved.name };
    } else {
      // Checked now, so a wrong file stops the plan rather than apply after the identity is written.
      checkStoreKey(p, { file: a.storeKey, issuerId: a.issuerId, keyId: a.keyId });
      account = { create: true, name: `${appName || 'App'} ${STORE[p]}`, sha };
    }
  }
  const hasAccount = Boolean(st.storeAccount || account);
  if (kind !== 'file' && !hasAccount) {
    throw failure('STORE_ACCOUNT_MISSING', `A ${kind === 'update' ? 'store update' : 'store release'} needs a ${STORE[p]} account. Ask the person: use an existing account, or add a new one.`);
  }
  // How the build is signed is asked before the App Store app id, the order of the builder's setup.
  if (goal !== 'apk' && current === 'none' && !a.signing) {
    const ios = p === 'ios' && !hasAccount
      ? 'Auto-generating iOS keys needs an App Store Connect account first; ask: add one first (recommended), or upload the team\'s own certificate and profile.'
      : `Ask: auto-generate (recommended), or upload the team's own ${p === 'android' ? 'keystore' : 'certificate and profile'}.`;
    throw failure('SIGNING_CHOICE_MISSING', `This build needs ${SIGNING_WORD[p]} signing keys, the app's proof that each new version comes from the same publisher. ${ios}`);
  }
  if (needsAccount && !hasAccount) {
    throw failure('IOS_GENERATE_NEEDS_ACCOUNT', 'To auto-generate iOS signing keys, UnifyApps signs in to the Apple developer account through an App Store Connect account, and this app has none yet. Two ways forward: add an App Store Connect account first (existing or new), then auto-generate; or upload the team\'s own distribution certificate (.p12) and provisioning profile.');
  }
  let ascAppId;
  if (p === 'ios' && kind !== 'update' && !String(st.ascAppId ?? '').trim()) {
    if (!a.ascAppId || !/^\d+$/u.test(String(a.ascAppId))) {
      throw failure('ASC_APP_ID_MISSING', `${goal === 'ipa' ? 'An iOS build' : 'A release to the App Store'} needs the App Store app id, as the builder's Apple setup does before its signing keys: the Apple ID number (digits only) on the app's App Information page in App Store Connect. The app record must exist there first.`);
    }
    ascAppId = String(a.ascAppId);
  }
  if (account || ascAppId) {
    steps.push(account?.create ? `Add the ${STORE[p]} account "${account.name}" from the key file and use it for this app.`
      : account ? `Use the ${STORE[p]} account "${account.name}" for this app.` : '');
    if (ascAppId) steps.push(`Save the App Store app id ${ascAppId}.`);
    // One write carries the identity too: on an app with no record yet it creates it, and a second
    // write straight after can read the new record late.
    actions.push(async () => {
      let use = account ?? st.storeAccount;
      if (account?.create) {
        use = await createAccount(tools, p, { name: account.name, file: a.storeKey, issuerId: a.issuerId, keyId: a.keyId });
        saveAccount(workDir, p, { id: use.id, name: use.name ?? account.name, sha: account.sha });
      }
      await bindAccount(tools, appId, p, use ?? null, ascAppId, identityWrite);
    });
  } else if (Object.keys(identityWrite).length) {
    actions.push(() => writeBuildInfo(tools, appId, identityWrite));
  }
  if (goal === 'store-android' && st.hasStoreRelease !== true) {
    notes.push('Google Play takes a brand-new app\'s very first build only through Play Console. If this app has never had a build uploaded in Play Console, make an AAB first, download it, and upload it there once by hand to Internal testing; otherwise this release fails at the upload after the build. Ask whether that first upload is done.');
  }

  // 3. Signing keys.
  if (goal !== 'apk') {
    if (a.signing === 'generate') {
      if (current === 'none') {
        steps.push(`Auto-generate ${SIGNING_WORD[p]} signing keys.`);
        actions.push(() => tools.app.call('generate_app_signing_keys', { appId, platform: p }));
      } else notes.push(`This app already has ${SIGNING_WORD[p]} signing keys; they are kept.`);
    }
    if (a.signing === 'own') {
      const { files, secrets } = ownSigning(p, a, workDir);
      if (current === 'generated') {
        notes.push(`Before the auto-generated ${SIGNING_WORD[p]} signing keys are removed, offer download-keys so the team keeps a copy: once removed, they cannot be brought back.`);
        if (st.hasStoreRelease === true) {
          notes.push(`This app is already in ${p === 'android' ? 'Google Play' : 'the App Store'} under the auto-generated keys, and the store refuses an update signed with other keys. Upload your own only if they are the keys the store expects (on Google Play with Play App Signing, the upload key).`);
        }
        steps.push(`Remove the auto-generated ${SIGNING_WORD[p]} signing keys (asks the person for a yes first: it cannot be undone).`);
        actions.push(() => tools.app.call('remove_app_signing_keys', { appId, platform: p }));
      }
      steps.push(`Upload the team's own ${SIGNING_WORD[p]} signing keys.`);
      actions.push(() => tools.app.call('upload_app_signing_keys', { appId, platform: p,
        ...Object.fromEntries(Object.entries(files).map(([field, file]) => [field, fileArg(file)])), ...secrets }));
    }
  }

  // 4. Version, name, message.
  let version;
  if (kind === 'update') {
    const targets = r.updateTargets?.[p] ?? [];
    if (st.hasStoreRelease !== true || !targets.length) {
      throw failure('STORE_RELEASE_MISSING', `An over-the-air update goes to phones that already have a ${STORE[p]} version of the app, and this app has none yet. Make a store release first.`);
    }
    version = a.version ?? targets[0];
    if (!targets.includes(version)) throw failure('VERSION_INVALID', `An update goes to a version phones already run: ${targets.join(', ')}.`);
  } else {
    version = r.nextVersion || '1.0.0';
    if (a.version) {
      if (!VERSION.test(a.version)) throw failure('VERSION_INVALID', VERSION_RULE);
      // A version already built is refused at the start with the next free one, and moved there.
      version = a.version;
    }
  }
  if (kind === 'update' && !String(a.message ?? '').trim()) {
    throw failure('MESSAGE_MISSING', 'An over-the-air update needs a short message saying what it changes; it shows against the release it reaches.');
  }
  const name = String(a.name ?? '').trim() || await defaultName(tools, appId, kind, version);
  const body = kind === 'file'
    ? { action: 'start', kind, format: goal, appVersion: version, name }
    : { action: 'start', kind, platforms: [p], appVersion: version, name, ...(kind === 'update' ? { message: a.message } : {}) };
  steps.push(`Start the build: ${goalLabel(goal)}, version ${version}, named "${name}".`);

  const checklist = [
    { step: 'publish', done: Boolean(r.published) },
    { step: 'identity', done: !goalNeeds(r, goal).includes('identity') },
    ...(needsAccount ? [{ step: 'store account', done: Boolean(st.storeAccount) }] : []),
    ...(p === 'ios' && kind !== 'update' ? [{ step: 'App Store app id', done: Boolean(String(st.ascAppId ?? '').trim()) }] : []),
    ...(goal !== 'apk' ? [{ step: 'signing', done: current !== 'none' && a.signing !== 'own' }] : []),
    { step: 'version and name', done: false },
  ];
  const plan = { ok: true, applied: false, goal, platform: p, kind, version, name, steps: steps.filter(Boolean), checklist, notes, offerPublish };
  if (!apply) return plan;

  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      if (/CONFIRM_REQUIRED/u.test(error.message) || error.code) throw error;
      if (/signing_keys/u.test(error.message) || refusalIssue(error, 'platform')) {
        if (MISSING_TOOLS.test(error.message)) throw failure('TOOLS_MISSING', TOOLS_MISSING);
        throw failure('SIGNING_FAILED', `The signing keys were not set: ${toolMessage(error)}`);
      }
      throw error;
    }
  }
  if (actions.length) {
    // Each write answered; the build starts only when reading the app back shows they held. A record
    // created moments ago can read late, so a miss is read once more before it counts.
    const lostAfter = async () => {
      const after = await readReadiness(tools, appId);
      const now = after.platforms?.[p] ?? {};
      const lost = [];
      for (const [field, value] of Object.entries(identityWrite)) {
        if (String(after.identity?.[field] ?? '').trim() !== value) lost.push(field === 'appName' ? 'the app name' : 'the bundle identifier');
      }
      if (needsAccount && !now.storeAccount) lost.push(`the ${STORE[p]} account`);
      if (ascAppId && String(now.ascAppId ?? '').trim() !== ascAppId) lost.push('the App Store app id');
      if (goal !== 'apk' && (!now.signing || now.signing === 'none')) lost.push(`the ${SIGNING_WORD[p]} signing keys`);
      return lost;
    };
    let lost = await lostAfter();
    if (lost.length) { await sleep(READ_AGAIN_MS); lost = await lostAfter(); }
    if (lost.length) {
      throw failure('NOT_SAVED', `Each write was answered, but reading the app back shows ${lost.join(', ')} not saved, so the build was not started. Run apply again; if it happens again, set it in the app builder's Releases tab.`);
    }
  }
  let started;
  try {
    started = await tools.app.call('app_release', { appId, ...body });
  } catch (error) {
    const spent = /nextFreeVersion is (\d+\.\d+\.\d+)/u.exec(refusalIssue(error, 'appVersion')?.message ?? '');
    if (!spent) throw failure('BUILD_REFUSED', `The build did not start: ${toolMessage(error)}`);
    notes.push(`${body.appVersion} was already built for this app; this build uses ${spent[1]}.`);
    body.appVersion = spent[1];
    version = spent[1];
    started = await tools.app.call('app_release', { appId, ...body }).catch((again) => { throw failure('BUILD_REFUSED', `The build did not start: ${toolMessage(again)}`); });
  }
  const { buildIds, failures } = triggerOutcome(started);
  if (!buildIds.length) throw failure('BUILD_REFUSED', `The build did not start: ${failures.join('; ') || 'the service named no build'}`);
  notes.push(...failures);
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, RESULT), `${JSON.stringify({ goal, version, name, buildIds }, null, 1)}\n`);
  return { ...plan, applied: true, version, notes, buildIds,
    next: `Follow it: watch --app-id ${appId} --build-id ${buildIds[0]} (${FOLLOW}).` };
}

/** app_release start and retry answer { started: [{ buildId, … }], failed: [{ platform, error, buildId? }] }. */
function triggerOutcome(reply) {
  const buildIds = (reply?.started ?? []).map((row) => row?.buildId).filter(Boolean);
  const failures = (reply?.failed ?? []).map((row) => redact(`The ${SAY_PLATFORM[String(row.platform).toLowerCase()] ?? row.platform} build did not start: ${row.error}${row.buildId ? ` (build ${row.buildId})` : ''}.`));
  return { buildIds, failures };
}

function linksOf(row) {
  const links = { apk: row.apkUrl ?? row.artifactUrls?.apk, aab: row.artifactUrls?.aab, ipa: row.artifactUrls?.ipa, install: row.installUrl };
  return Object.fromEntries(Object.entries(links).filter(([, value]) => typeof value === 'string' && value));
}

/** Follows one build until it ends or `limitMinutes` passes. A failed status read is retried. */
export async function watch({ tools, appId, buildId, limitMinutes = WATCH_LIMIT_MINUTES, intervalMs = POLL_MS, sleep = sleepFor }) {
  const minutes = Number.isFinite(limitMinutes) && limitMinutes > 0 ? limitMinutes : WATCH_LIMIT_MINUTES;
  const maxWaits = intervalMs > 0 ? Math.floor((minutes * 60_000) / intervalMs) : minutes;
  let readFailures = 0;
  for (let waits = 0; ; waits += 1) {
    let row;
    try {
      row = await tools.app.call('app_release', { appId, action: 'status', buildId });
      readFailures = 0;
    } catch (error) {
      readFailures += 1;
      if (readFailures >= WATCH_READ_FAILURES) {
        return { ok: true, done: false, buildId, status: 'unknown', message: redact(`The build's status could not be read ${readFailures} times in a row (${toolMessage(error)}). The build itself is not affected. Run watch --build-id ${buildId} again, or check it in the app builder's Releases tab.`) };
      }
    }
    if (row?.done) {
      if (row.failed) return { ok: false, code: 'BUILD_FAILED', buildId, status: row.status, message: redact(row.error ?? `The build ended ${row.status}.`) };
      return { ok: true, done: true, buildId, status: row.status, appVersion: row.appVersion, links: linksOf(row) };
    }
    if (waits >= maxWaits) {
      return { ok: true, done: false, buildId, status: 'still running', message: `The build is still running after ${minutes} minutes. Run watch --build-id ${buildId} again to keep following it.` };
    }
    await sleep(intervalMs);
  }
}

export async function cancelBuild({ tools, appId, buildId }) {
  return { ok: true, ...(await tools.app.call('app_release', { appId, action: 'cancel', buildId })) };
}

export async function retryBuild({ tools, appId, buildId }) {
  try {
    const reply = await tools.app.call('app_release', { appId, action: 'retry', buildId });
    const { buildIds, failures } = triggerOutcome(reply);
    if (!buildIds.length) return { ok: false, code: 'BUILD_REFUSED', message: `The retry did not start: ${failures.join('; ') || 'the service named no build'}` };
    return { ok: true, retriedBuildId: buildId, buildIds, notes: failures,
      next: `Follow it: watch --app-id ${appId} --build-id ${buildIds[0]} (${FOLLOW}).` };
  } catch (error) {
    return { ok: false, code: 'BUILD_REFUSED', message: redact(`The retry did not start: ${toolMessage(error)}`) };
  }
}

/** Saves the signing keys archive into `workDir`; the result names the file, never its content. */
export async function downloadKeys({ tools, appId, platform, workDir }) {
  const reply = await tools.app.call('download_app_signing_keys', { appId, platform });
  if (!reply?.contentBase64) return { ok: false, code: 'KEYS_NOT_DOWNLOADED', message: 'The signing keys came back empty, so nothing was saved. Download them in the app builder: Releases > Stores, Signing keys > Download.' };
  fs.mkdirSync(workDir, { recursive: true });
  const file = path.join(workDir, path.basename(String(reply?.fileName ?? `${platform}-signing-keys.zip`)));
  const bytes = Buffer.from(String(reply?.contentBase64 ?? ''), 'base64');
  fs.writeFileSync(file, bytes);
  return { ok: true, path: file, sizeBytes: bytes.length,
    note: 'Keep this file and its passwords somewhere safe outside this folder: it is what proves a new version comes from this app\'s publisher.' };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) throw new Error(`Unexpected argument ${rest[i]}.`);
    const flag = rest[i].slice(2);
    if (rest[i + 1] === undefined || rest[i + 1].startsWith('--')) flags[flag] = true;
    else { flags[flag] = rest[i + 1]; i += 1; }
  }
  return { command, flags };
}

const USAGE = 'Use: status --app-id <id> | check-file --file <path> | signing-template --platform android|ios --work <dir> | plan|apply --app-id <id> --goal <goal> --work <dir> [...] | watch|cancel|retry --app-id <id> --build-id <id> | download-keys --app-id <id> --platform android|ios --work <dir>';

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  const need = (flag) => { if (!flags[flag] || flags[flag] === true) throw new Error(`--${flag} is required.`); return flags[flag]; };
  const opt = (flag) => (typeof flags[flag] === 'string' ? flags[flag] : undefined);
  const file = (flag) => (opt(flag) ? path.resolve(opt(flag)) : undefined);
  if (command === 'check-file') return { ok: true, ...sniffFile(path.resolve(need('file'))) };
  if (command === 'signing-template') return { ok: true, path: writeSigningTemplate(path.resolve(need('work')), need('platform')) };
  if (!['status', 'plan', 'apply', 'watch', 'cancel', 'retry', 'download-keys'].includes(command)) throw new Error(USAGE);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const load = (name) => import(pathToFileURL(path.resolve(here, '../../../../scripts', name)).href);
  const [{ openTools }, { redactSecrets }, { bridgeContext }] = await Promise.all([load('tool-calls.mjs'), load('lib/redact-secrets.mjs'), load('mcp-bridge.mjs')]);
  useRedactor((text) => redactSecrets(String(text)));
  const tenant = bridgeContext(process.cwd(), process.env.CLAUDE_CODE_SESSION_ID)?.tenant;
  if (!tenant) throw new Error('This folder is not signed in to a tenant. Run /ua:setup first.');
  // The app-builder tools take the tenant as `host`; the bridge checks it but never adds it.
  const app = withHost(openTools('application-builder'), tenant);
  const connection = openTools('connection');
  const tools = { app, connection };
  const appId = need('app-id');
  try {
    if (command === 'status') return await status({ tools, appId });
    if (command === 'watch') return await watch({ tools, appId, buildId: need('build-id'), limitMinutes: Number(opt('limit-minutes') ?? WATCH_LIMIT_MINUTES) });
    if (command === 'cancel') return await cancelBuild({ tools, appId, buildId: need('build-id') });
    if (command === 'retry') return await retryBuild({ tools, appId, buildId: need('build-id') });
    if (command === 'download-keys') return await downloadKeys({ tools, appId, platform: need('platform'), workDir: path.resolve(need('work')) });
    return await release({ tools, appId, goal: need('goal'), workDir: path.resolve(need('work')), apply: command === 'apply',
      appName: opt('app-name'), bundleId: opt('bundle-id'), signing: opt('signing'),
      keystore: file('keystore'), certificate: file('certificate'), profile: file('profile'),
      storeAccount: opt('store-account'), storeKey: file('store-key'), issuerId: opt('issuer-id'), keyId: opt('key-id'),
      ascAppId: opt('asc-app-id'), version: opt('version'), name: opt('name'), message: opt('message') });
  } finally {
    await app.close();
    await connection.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => {
    // Through the redactor too: nothing here should carry a secret, and this is the last gate.
    process.stdout.write(`${redact(JSON.stringify(result, null, 1))}\n`);
    if (result && result.ok === false) process.exitCode = 1;
  }, (error) => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
