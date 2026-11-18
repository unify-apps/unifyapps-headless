#!/usr/bin/env node
// Sets up push notifications on a MOBILE app: its name and bundle identifier, its notification
// icon and colour, and Firebase (the service-account key, a Firebase connection, and the Android
// and iOS config files Firebase makes for the app). Run by the main session from the solution folder.
//
//   status --app-id <id>
//       Reads what the app already has and prints what is missing. Writes nothing.
//   check-service-file --file <path>
//       Says which Firebase file this is and what the setup can read from it. Never prints the key.
//   setup --app-id <id> --key-file <path> --project-number <digits> --work <dir>
//         --prompt-permission on|off [--app-name <name> --bundle-id <id>] [--icon <png>] [--colour <#RRGGBB>] [--apply]
//       Without --apply: checks everything it can before the tenant and lists each write.
//       With --apply: makes them in order, reads every one back, and writes <dir>/push-result.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { configFile, isAlreadyExists, lookupRequest, readLookup, readRunResponse, runRequest } from './lib/automation.mjs';
import { describeFirebaseFile, readFirebaseFile } from './lib/firebase-file.mjs';
import { bundleIdIssues, checkIcon, issueSentence, normaliseColour } from './lib/identity.mjs';
import { toolRefusal, withHost } from '../../../../scripts/lib/tool-host.mjs';

export { toolRefusal, withHost };

const RESULT = 'push-result.json';
// What this folder already sent for a key file, by the file's hash: the uploaded key's link and the
// connection made from it. A rerun with the same file reuses both instead of leaving copies behind.
// It holds no part of the key.
const STATE = 'firebase-state.json';
// The colour Android draws behind the notification icon when the app sets none.
export const DEFAULT_NOTIFICATION_COLOUR = '#383838';

function failure(code, message) { return Object.assign(new Error(message), { code }); }

// Every message that leaves this script passes through here: a platform error can echo the inputs
// it was sent, and one of them is the private key.
let redact = (text) => String(text).replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, '[REDACTED]')
  .replace(/MII[A-Za-z0-9+/=\\n]{40,}/gu, '[REDACTED]');
export function useRedactor(fn) { redact = fn; }

// The builder's "Prompt User for Push Notifications Permission" toggle, as the phone reads it:
// while it is off the app never asks for permission and never registers the device.
const PERMISSION_KEY = 'enabled';
const toggleSteps = (on) => `In the app builder: Settings > Advanced > Push Notifications, turn ${on ? 'on' : 'off'} "Prompt User for Push Notifications Permission".`;

const MISSING_TOOLS = /unknown tool|no tool named|tool .*not found|not a settings panel|unknown panel|no panel named/iu;

const NOT_MOBILE = 'Push notifications are for mobile apps; this app is a web app.';

function settingsReply(reply, panel) {
  const values = reply?.panels?.[panel]?.values ?? {};
  // These panels hold MOBILE-only keys. A web app's read is not refused: it skips every key, so
  // it answers nothing set and nothing unset, where a mobile app nobody configured lists them unset.
  if (!Object.keys(values).length && !(reply?.panels?.[panel]?.unset ?? []).length) throw failure('NOT_MOBILE', NOT_MOBILE);
  return { values, version: reply?.version };
}

async function readSettings(tools, appId, panel) {
  let reply;
  try {
    reply = await tools.app.call('get_app_settings', { appId, panel });
  } catch (error) {
    if (/MOBILE/u.test(error.message)) throw failure('NOT_MOBILE', NOT_MOBILE);
    if (MISSING_TOOLS.test(error.message)) throw failure('TOOLS_MISSING', "This tenant's UnifyApps cannot set up push notifications from chat yet. Set them up in the app builder: Settings > Advanced > Push Notifications.");
    throw error;
  }
  return settingsReply(reply, panel);
}

/** What the app already has. */
export async function status({ tools, appId }) {
  const brand = await readSettings(tools, appId, 'brandAssets');
  const push = await readSettings(tools, appId, 'pushNotifications');
  let build;
  try { build = await tools.app.call('get_app_build_info', { appId }); } catch (error) {
    if (MISSING_TOOLS.test(error.message)) throw failure('TOOLS_MISSING', "This tenant's UnifyApps cannot set up push notifications from chat yet. Set them up in the app builder: Settings > Advanced > Push Notifications.");
    throw error;
  }
  const info = build?.buildInfo ?? {};
  const firebase = info.firebase ?? {};
  const identity = { appName: info.appName ?? '', bundleIdentifier: info.bundleIdentifier ?? '', issues: bundleIdIssues(info.bundleIdentifier) };
  const notification = { icon: brand.values.notificationIcon ?? '', colour: brand.values.notificationColor ?? '' };
  const missing = [
    ...(identity.appName ? [] : ['appName']), ...(identity.bundleIdentifier ? [] : ['bundleIdentifier']),
    ...(notification.icon ? [] : ['notificationIcon']), ...(notification.colour ? [] : ['notificationColor']),
  ];
  return {
    appId, identity, notification, missing, buildInfo: info,
    firebase: {
      // Set up means both generated files are stored, as the app builder decides it.
      configured: Boolean(firebase.google_services?.url && firebase.google_service_Info?.url),
      connectionId: firebase.connectionId ?? '',
      projectNumber: push.values.projectNumber ?? '',
      firebaseProjectId: push.values.firebaseProjectId ?? '',
      serviceFile: push.values.firebaseServiceFile ?? '',
      // Off until someone turns it on, as the app builder reads it; never written reads as `unset`.
      promptPermission: push.values[PERMISSION_KEY] === true,
    },
  };
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`); }

/** Checks everything that needs no tenant. Answers the inputs to use, or a refusal. */
function checkInputs({ keyFile, projectNumber, icon, colour }) {
  const key = readFirebaseFile(keyFile);
  if (key.kind !== 'service-account') return { refused: { code: 'KEY_FILE_WRONG', message: `${path.basename(keyFile)} is ${describeFirebaseFile(key).is}`, file: describeFirebaseFile(key) } };
  const number = String(projectNumber ?? '').trim();
  if (!/^\d+$/u.test(number)) {
    return { refused: { code: 'PROJECT_NUMBER_INVALID', message: `The project number is digits only, such as 55628048280 (Firebase: Project settings > General > Project number). ${number ? `"${number}" looks like the Project ID, a different value.` : ''}`.trim() } };
  }
  let iconCheck = null;
  if (icon) {
    iconCheck = checkIcon(icon);
    if (!iconCheck.ok) return { refused: { code: 'ICON_INVALID', message: iconCheck.message } };
  }
  let colourCheck = null;
  if (colour) {
    try { colourCheck = normaliseColour(colour); } catch (error) { return { refused: { code: 'COLOUR_INVALID', message: error.message } }; }
  }
  return { key, number, iconCheck, colourCheck };
}

/** The identity to build with, or why setup cannot go on. */
function settleIdentity(current, { appName, bundleId }) {
  const stored = current.identity;
  for (const [label, have, given] of [['app name', stored.appName, appName], ['bundle identifier', stored.bundleIdentifier, bundleId]]) {
    if (have && given && have !== given.trim()) {
      return { refused: { code: 'IDENTITY_CONFLICT', message: `The app already has the ${label} "${have}". It is changed only in the app builder's Releases tab, because a change resets the app's store setup.` } };
    }
  }
  const name = stored.appName || appName?.trim() || '';
  const id = stored.bundleIdentifier || bundleId?.trim() || '';
  if (!name || !id) return { refused: { code: 'IDENTITY_MISSING', message: `The app has no ${[!name && 'app name', !id && 'bundle identifier'].filter(Boolean).join(' and ')} yet. Ask the person for it.`, missing: [!name && 'appName', !id && 'bundleIdentifier'].filter(Boolean) } };
  const issues = bundleIdIssues(id);
  if (issues.length) {
    const where = stored.bundleIdentifier ? ' Fix it in the app builder\'s Releases tab, then run this again.' : '';
    return { refused: { code: 'IDENTITY_INVALID', message: `The bundle identifier "${id}" cannot be used. ${issues.map(issueSentence).join(' ')}${where}`, issues } };
  }
  const write = { ...(stored.appName ? {} : { appName: name }), ...(stored.bundleIdentifier ? {} : { bundleIdentifier: id }) };
  return { name, id, write };
}

async function writePanel(tools, appId, panel, values) {
  await tools.app.call('update_app_settings', { appId, panel, values, dryRun: true });
  // Someone else saved the app between our read and our write: read again and write once more.
  for (let attempt = 1; ; attempt += 1) {
    const { version } = await readSettings(tools, appId, panel);
    try {
      return await tools.app.call('update_app_settings', { appId, panel, values, ...(version !== undefined ? { expectedVersion: version } : {}) });
    } catch (error) {
      if (attempt >= 2 || toolRefusal(error)?.errorCode !== 'VERSION_CHANGED') throw error;
    }
  }
}

/** True only when this tenant's pushNotifications panel has no permission-prompt field yet. */
function panelLacksPermissionKey(error) {
  const refusal = toolRefusal(error);
  return refusal?.errorCode === 'APP_REFUSED' && (refusal.errorPayload?.issues ?? [])
    .some((issue) => issue?.path === `pushNotifications.${PERMISSION_KEY}` && String(issue.message).startsWith('is not a field'));
}

async function findAutomation(rest) {
  const { status: code, text } = await rest.call('POST', '/api/lookup', lookupRequest());
  if (code < 200 || code >= 300) throw failure('AUTOMATION_MISSING', `The Firebase setup automation could not be looked up (HTTP ${code}).`);
  let json; try { json = JSON.parse(text); } catch { json = null; }
  const id = readLookup(json);
  if (!id) throw failure('AUTOMATION_MISSING', "This tenant has no Firebase setup automation, so the config files cannot be made here. Ask your UnifyApps admin to install it, or set push notifications up on a tenant that has it.");
  return id;
}

async function runAutomation(rest, request) {
  const { status: code, text } = await rest.call('POST', '/api/workflow/execute/node?name=Firebase_App_Setup', request);
  if (code >= 200 && code < 300) {
    let json; try { json = JSON.parse(text); } catch { json = null; }
    try { return { files: readRunResponse(json) }; } catch (error) { return { text, error }; }
  }
  return { text, error: failure('AUTOMATION_FAILED', `HTTP ${code}`) };
}

/** The whole setup. Answers a result object; never throws for a refusal or a failed step. */
export async function setup({ tools, rest, appId, workDir, keyFile, projectNumber, appName, bundleId, icon, colour, promptPermission, apply = false }) {
  const inputs = checkInputs({ keyFile, projectNumber, icon, colour });
  if (inputs.refused) return { ok: false, ...inputs.refused };
  if (typeof promptPermission !== 'boolean') {
    return { ok: false, code: 'PROMPT_PERMISSION_MISSING', message: 'Ask the person whether the app should ask its users for notification permission (on), or stay silent with no notifications at all (off).' };
  }
  const { key, number, iconCheck, colourCheck } = inputs;
  const notes = [...(iconCheck?.warnings ?? []), ...(colourCheck?.note ? [colourCheck.note] : [])];
  try {
    const current = await status({ tools, appId });
    const identity = settleIdentity(current, { appName, bundleId });
    if (identity.refused) return { ok: false, ...identity.refused };
    if (!current.notification.icon && !icon) {
      return { ok: false, code: 'ICON_MISSING', message: 'The app has no notification icon yet. Ask the person for a PNG: a white shape on a transparent background, 96 x 96 px.' };
    }
    const colourToWrite = colourCheck?.colour ?? (current.notification.colour ? null : DEFAULT_NOTIFICATION_COLOUR);
    if (!colourCheck && colourToWrite) notes.push(`No notification colour was given, so ${DEFAULT_NOTIFICATION_COLOUR}, a mid-grey that shows on light and dark trays, is used.`);

    const stateFile = path.join(workDir, STATE);
    const hash = sha256(keyFile);
    const saved = readJson(stateFile);
    const reuse = saved.serviceFileSha256 === hash ? saved : {};
    const createApps = !current.firebase.configured;
    const plan = [
      ...(Object.keys(identity.write).length ? [`build info: set ${Object.keys(identity.write).join(' and ')}`] : []),
      ...(icon ? [`upload the notification icon ${path.basename(icon)} (public, like every app icon)`] : []),
      ...(icon || colourToWrite ? [`brandAssets: set ${[icon && 'notificationIcon', colourToWrite && `notificationColor ${colourToWrite}`].filter(Boolean).join(' and ')}`] : []),
      reuse.serviceFileUrl ? 'reuse the service-account key uploaded before' : `upload the service-account key for Firebase project ${key.projectId}, readable by this app only`,
      reuse.connectionId ? `reuse the Firebase connection ${reuse.connectionId}` : `create a Firebase connection named "${identity.name}"`,
      `run the Firebase setup for ${identity.id} in project number ${number}${createApps ? ', registering the Android and iOS apps' : ', fetching the existing apps\' files'}`,
      'build info: store the connection and the two config files',
      'pushNotifications: set projectNumber, firebaseProjectId and firebaseServiceFile',
      ...(current.firebase.promptPermission === promptPermission ? [] : [`pushNotifications: turn "Prompt User for Push Notifications Permission" ${promptPermission ? 'on' : 'off'}`]),
    ];
    if (!apply) return { ok: true, applied: false, firebaseProjectId: key.projectId, plan, notes };

    // Found first: a tenant without it gets nothing written and no connection left behind.
    const automationId = await findAutomation(rest);
    if (Object.keys(identity.write).length) await tools.app.call('update_app_build_info', { appId, values: identity.write });

    const brandValues = {};
    if (icon) {
      const reply = await tools.app.call('upload_public_file', { filePath: icon, fileName: `${appId}-notification-icon.png`, mimeType: 'image/png' });
      const url = reply?.file?.url;
      if (typeof url !== 'string' || !url.startsWith('https://')) throw failure('UPLOAD_FAILED', 'The notification icon uploaded with no https link.');
      brandValues.notificationIcon = url;
    }
    if (colourToWrite) brandValues.notificationColor = colourToWrite;
    if (Object.keys(brandValues).length) await writePanel(tools, appId, 'brandAssets', brandValues);

    let serviceFileUrl = reuse.serviceFileUrl;
    if (!serviceFileUrl) {
      const fileName = /^[\w.-]+\.json$/u.test(path.basename(keyFile)) ? path.basename(keyFile) : 'firebase-service-account.json';
      const reply = await tools.app.call('upload_firebase_service_account', { appId, fileName, contentBase64: fs.readFileSync(keyFile).toString('base64') });
      serviceFileUrl = reply?.file?.url;
      if (typeof serviceFileUrl !== 'string' || !serviceFileUrl) throw failure('UPLOAD_FAILED', 'The service-account key uploaded with no link.');
      writeJson(stateFile, { serviceFileSha256: hash, serviceFileUrl, firebaseProjectId: key.projectId });
    }
    let connectionId = reuse.connectionId;
    if (!connectionId) {
      const reply = await tools.connection.call('create_connection', {
        appName: 'firebase',
        connectionDetails: { name: identity.name, authType: 'JWT', project: key.projectId,
          serviceAccountEmail: key.clientEmail, client_email: key.clientEmail, private_key: key.privateKey },
      });
      connectionId = reply?.id ?? reply?.connection?.id ?? reply?.connectionId;
      if (typeof connectionId !== 'string' || !connectionId) throw failure('CONNECTION_FAILED', 'The Firebase connection was not created.');
      writeJson(stateFile, { serviceFileSha256: hash, serviceFileUrl, firebaseProjectId: key.projectId, connectionId });
    }

    const request = (apps) => runRequest({ automationId, connectionId, bundleId: identity.id, applicationName: identity.name, projectNumber: number, createApps: apps });
    let run = await runAutomation(rest, request(createApps));
    if (run.error && createApps && isAlreadyExists(run.text)) run = await runAutomation(rest, request(false));
    if (run.error) {
      throw failure('AUTOMATION_FAILED', `The Firebase setup did not finish: ${String(run.text ?? run.error.message).slice(0, 600)}. Check that the project number belongs to the same Firebase project as the key, and that the key's service account is a Firebase Admin.`);
    }
    const { androidConfigLocation, iosConfigLocation } = run.files;

    await tools.app.call('update_app_build_info', { appId, values: { firebase: {
      connectionId, google_services: configFile(androidConfigLocation), google_service_Info: configFile(iosConfigLocation) } } });
    const pushValues = { projectNumber: number, firebaseProjectId: key.projectId, firebaseServiceFile: serviceFileUrl };
    await writePanel(tools, appId, 'pushNotifications', pushValues);
    // Last, so a phone is never told to register before Firebase is set up for it.
    let permissionSet = current.firebase.promptPermission === promptPermission;
    if (!permissionSet) {
      try { await writePanel(tools, appId, 'pushNotifications', { [PERMISSION_KEY]: promptPermission }); permissionSet = true; } catch (error) {
        // A tenant whose panel has no permission prompt yet: the rest is set up, and the person flips one switch.
        if (!panelLacksPermissionKey(error)) {
          throw failure('PROMPT_PERMISSION_FAILED', `Everything else is set up, but the permission prompt was not: ${error.message}`);
        }
        notes.push(`This tenant cannot set the permission prompt from chat yet. ${toggleSteps(promptPermission)}`);
      }
    }

    const after = await status({ tools, appId });
    const stored = after.buildInfo;
    const mismatched = [
      ...Object.entries(identity.write).filter(([k, v]) => stored[k] !== v).map(([k]) => `buildInfo.${k}`),
      ...(stored.firebase?.connectionId === connectionId ? [] : ['buildInfo.firebase.connectionId']),
      ...(stored.firebase?.google_services?.url === androidConfigLocation ? [] : ['buildInfo.firebase.google_services']),
      ...(stored.firebase?.google_service_Info?.url === iosConfigLocation ? [] : ['buildInfo.firebase.google_service_Info']),
      ...(brandValues.notificationIcon && after.notification.icon !== brandValues.notificationIcon ? ['brandAssets.notificationIcon'] : []),
      ...(brandValues.notificationColor && after.notification.colour !== brandValues.notificationColor ? ['brandAssets.notificationColor'] : []),
      ...(after.firebase.projectNumber === number ? [] : ['pushNotifications.projectNumber']),
      ...(after.firebase.firebaseProjectId === key.projectId ? [] : ['pushNotifications.firebaseProjectId']),
      ...(after.firebase.serviceFile === serviceFileUrl ? [] : ['pushNotifications.firebaseServiceFile']),
      ...(permissionSet && after.firebase.promptPermission !== promptPermission ? [`pushNotifications.${PERMISSION_KEY}`] : []),
    ];
    const result = {
      ok: mismatched.length === 0, applied: true, appId, appName: identity.name, bundleIdentifier: identity.id,
      firebaseProjectId: key.projectId, projectNumber: number, connectionId,
      files: { android: androidConfigLocation, ios: iosConfigLocation },
      promptPermission: permissionSet ? (promptPermission ? 'on' : 'off') : `not set: ${toggleSteps(promptPermission)}`,
      readBack: mismatched.length ? { mismatched } : 'every key matches', notes,
    };
    writeJson(path.join(workDir, RESULT), result);
    return result;
  } catch (error) {
    const result = { ok: false, applied: apply, code: error.code ?? 'FAILED', message: redact(error.message) };
    if (apply) writeJson(path.join(workDir, RESULT), result);
    return result;
  }
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

// The automation run waits for Firebase to register two apps and write two files; the builder's
// own call waits as long. 3 minutes is well past a slow run and short of a stuck one.
const RUN_TIMEOUT_MS = 180_000;

async function main(argv) {
  const { command, flags } = parseArgs(argv);
  const need = (flag) => { if (!flags[flag] || flags[flag] === true) throw new Error(`--${flag} is required.`); return flags[flag]; };
  if (command === 'check-service-file') return describeFirebaseFile(readFirebaseFile(need('file')));
  if (command !== 'status' && command !== 'setup') {
    throw new Error('Use: status --app-id <id> | check-service-file --file <path> | setup --app-id <id> --key-file <path> --project-number <digits> --work <dir> --prompt-permission on|off [--app-name <name> --bundle-id <id>] [--icon <png>] [--colour <#RRGGBB>] [--apply]');
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const scripts = path.resolve(here, '../../../../scripts');
  const load = (file) => import(pathToFileURL(path.join(scripts, file)).href);
  const [{ openTools }, { redactSecrets }, { bridgeContext }] = await Promise.all([load('tool-calls.mjs'), load('lib/redact-secrets.mjs'), load('mcp-bridge.mjs')]);
  useRedactor((text) => redactSecrets(String(text)));
  const tenant = bridgeContext(process.cwd(), process.env.CLAUDE_CODE_SESSION_ID)?.tenant;
  if (!tenant) throw new Error('This folder is not signed in to a tenant. Run /ua:setup first.');
  // The app-builder tools take the tenant as `host`; the bridge checks it but never adds it.
  const app = withHost(openTools('application-builder'), tenant);
  const connection = command === 'setup' ? openTools('connection') : null;
  try {
    // The folder the person saves the logo and key into, so the chat can name it by full path.
    if (command === 'status') return { ...(await status({ tools: { app }, appId: need('app-id') })), solutionFolder: process.cwd() };
    let rest = null;
    if (flags.apply) {
      const { platformCall } = await load('platform-call.mjs');
      // These two calls go to the tenant directly, as the app builder makes them: no tool runs a
      // platform automation with a connection.
      rest = { call: (method, pathname, body) => platformCall(tenant, method, pathname, {
        body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, timeoutMs: RUN_TIMEOUT_MS }) };
    }
    return await setup({ tools: { app, connection }, rest, appId: need('app-id'), workDir: path.resolve(need('work')),
      keyFile: path.resolve(need('key-file')), projectNumber: need('project-number'),
      appName: flags['app-name'] === true ? undefined : flags['app-name'], bundleId: flags['bundle-id'] === true ? undefined : flags['bundle-id'],
      icon: typeof flags.icon === 'string' ? path.resolve(flags.icon) : undefined,
      colour: typeof flags.colour === 'string' ? flags.colour : undefined,
      promptPermission: { on: true, off: false }[flags['prompt-permission']], apply: Boolean(flags.apply) });
  } finally {
    await app.close();
    await connection?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
    if (result && result.ok === false) process.exitCode = 1;
  }, (error) => { process.stderr.write(`${redact(error.message)}\n`); process.exitCode = 1; });
}
