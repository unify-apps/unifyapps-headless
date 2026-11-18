// Store accounts: the tenant connections that let UnifyApps upload to Google Play (`google_play`) and
// App Store Connect (`apple_app_store`), and the binding of one to an app's build info, which is what
// the release service reads. `tools` is `{app, connection}`, each with `call(name, args)`; the app
// tools already carry `host`.

import fs from 'node:fs';
import { toolRefusal } from '../../../../../scripts/lib/tool-host.mjs';
import { sniffFile } from './release-files.mjs';

export const STORE_APP = Object.freeze({ android: 'google_play', ios: 'apple_app_store' });

const failure = (code, message) => Object.assign(new Error(message), { code });
const READ_AGAIN = () => new Promise((resolve) => { setTimeout(resolve, 5_000); });

function rowsOf(reply) {
  if (Array.isArray(reply)) return reply;
  return reply?.objects ?? reply?.connections ?? reply?.items ?? [];
}

/** The tenant's accounts for that store: `[{id, name, status}]`, status in lower case. */
export async function findAccounts(tools, platform) {
  const reply = await tools.connection.call('list_connections', { appNames: [STORE_APP[platform]] });
  return rowsOf(reply)
    .filter((row) => typeof row?.id === 'string')
    .map((row) => ({ id: row.id, name: String(row.name ?? row.id), status: String(row.status ?? 'unknown').toLowerCase() }));
}

/** Checks the key file and ids before anything is written; throws STORE_KEY_WRONG. Never prints the key. */
export function checkStoreKey(platform, { file, issuerId, keyId }) {
  connectionDetails(platform, { name: '', file, issuerId, keyId });
}

function connectionDetails(platform, { name, file, issuerId, keyId }) {
  const { kind } = sniffFile(file);
  if (platform === 'android') {
    if (kind !== 'play-service-account') {
      throw failure('STORE_KEY_WRONG', `That file is not a Google Play service-account key (it reads as ${kind}). It is the JSON key of the service account given release access in Play Console.`);
    }
    const key = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { name, serviceAccountEmail: key.client_email, privateKey: key.private_key };
  }
  if (kind !== 'p8') {
    throw failure('STORE_KEY_WRONG', `That file is not an App Store Connect API key (it reads as ${kind}). It is the AuthKey_<Key ID>.p8 file downloaded once from Users and Access > Integrations.`);
  }
  const missing = [...(String(issuerId ?? '').trim() ? [] : ['Issuer ID']), ...(String(keyId ?? '').trim() ? [] : ['Key ID'])];
  if (missing.length) throw failure('STORE_KEY_WRONG', `An App Store Connect key also needs its ${missing.join(' and ')}, shown beside the key in Users and Access > Integrations.`);
  return { name, issuerId: issuerId.trim(), keyId: keyId.trim(), privateKey: fs.readFileSync(file, 'utf8') };
}

/** Creates the store account from the person's key file. Answers `{id, name}`. */
export async function createAccount(tools, platform, { name, file, issuerId, keyId }) {
  const details = connectionDetails(platform, { name, file, issuerId, keyId });
  const store = platform === 'android' ? 'Google Play' : 'App Store Connect';
  let reply;
  try {
    reply = await tools.connection.call('create_connection', { appName: STORE_APP[platform], connectionDetails: details });
  } catch (error) {
    const refusal = toolRefusal(error);
    const said = refusal?.errorPayload?.message ?? error.message;
    throw failure('CONNECTION_FAILED', `${store} refused the account: ${String(said).replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/gu, '[key]')}`);
  }
  const id = reply?.id ?? reply?.connection?.id ?? reply?.connectionId;
  if (typeof id !== 'string' || !id) throw failure('CONNECTION_FAILED', `The ${store} account was not created.`);
  return { id, name };
}

function bindingValues(platform, account, ascAppId) {
  if (platform === 'android') return { android: { playStoreConnectionId: account.id, playStoreConnectionName: account.name } };
  return { ios: { ...(account ? { appStoreConnectionId: account.id, appStoreConnectionName: account.name } : {}),
    ...(ascAppId ? { ascAppId: String(ascAppId) } : {}) } };
}

/**
 * Writes `values` into the app's build info: a dry run, a write pinned to the version just read, one
 * retry when someone else saved in between (the signing service writes this record too).
 */
export async function writeBuildInfo(tools, appId, values) {
  await tools.app.call('update_app_build_info', { appId, values, dryRun: true });
  for (let attempt = 1; ; attempt += 1) {
    const { version } = await tools.app.call('get_app_build_info', { appId });
    try {
      return await tools.app.call('update_app_build_info', { appId, values, ...(version !== undefined ? { expectedVersion: version } : {}) });
    } catch (error) {
      if (attempt >= 2 || toolRefusal(error)?.errorCode !== 'VERSION_CHANGED') throw error;
    }
  }
}

/**
 * Binds the account (and, on iOS, the App Store app id; `account` is null to save only the id) to the
 * app's build info, with any `alsoWrite`
 * values in the same write, then reads it back. Answers the stored binding fields.
 */
export async function bindAccount(tools, appId, platform, account, ascAppId, alsoWrite = {}, wait = READ_AGAIN) {
  const values = bindingValues(platform, account, ascAppId);
  await writeBuildInfo(tools, appId, { ...alsoWrite, ...values });
  const wrote = values[platform];
  const mismatchedNow = async () => {
    const stored = (await tools.app.call('get_app_build_info', { appId }))?.buildInfo?.[platform] ?? {};
    return { stored, mismatched: Object.keys(wrote).filter((key) => stored[key] !== wrote[key]) };
  };
  let { stored, mismatched } = await mismatchedNow();
  // A record created by this very write can read late; read once more before calling it lost.
  if (mismatched.length) { await wait(); ({ stored, mismatched } = await mismatchedNow()); }
  if (mismatched.length) throw failure('BIND_FAILED', `The store account was written but reads back different: ${mismatched.join(', ')}.`);
  return Object.fromEntries(Object.keys(wrote).map((key) => [key, stored[key]]));
}
