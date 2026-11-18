#!/usr/bin/env node
/**
 * The heal loop's persistent private folder: one saved sign-in per loop-owned test user,
 * kept between firings so a scheduled run can replay a case without a person typing a
 * password. Lives under <UA_HOME>/test-loop/<tenant>/<interfaceId>/ (folder 0700, file
 * 0600), never in the working folder and never in the per-run private folder, which a run
 * deletes at its end.
 *
 *   node loop-home.mjs home                                      prints {"folder"}
 *   node loop-home.mjs sign-in <tenant> <interfaceId> <userId>   prints {"userId","signInFile","exists"}
 *   node loop-home.mjs remove <tenant> <interfaceId>             deletes that app's folder
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = path.resolve(process.env.UA_HOME || path.join(os.homedir(), '.unifyapps-solutions'));

const SAFE = /^[A-Za-z0-9._-]+$/u;

function safeSegment(value, what) {
  const text = String(value ?? '');
  if (!SAFE.test(text)) throw new Error(`refused: ${what} "${text}" is not a plain name`);
  return text;
}

function ensureFolder(folder) {
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(folder).isSymbolicLink()) throw new Error(`refused: ${folder} is a link`);
  fs.chmodSync(folder, 0o700);
  return folder;
}

export function home(base = HOME) {
  ensureFolder(base);
  return { folder: ensureFolder(path.join(base, 'test-loop')) };
}

export function appFolder(tenant, interfaceId, base = HOME) {
  const root = home(base).folder;
  return ensureFolder(path.join(root, safeSegment(tenant, 'tenant'), safeSegment(interfaceId, 'interfaceId')));
}

/** True when the file holds a browser storage state with at least one cookie: an empty
 * placeholder, `{ }` or a half-written file is not a saved sign-in. */
function holdsSignIn(file) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(state?.cookies) && state.cookies.length > 0;
  } catch {
    return false;
  }
}

/** The saved sign-in of one loop-owned test user. The file is made empty at 0600 when missing,
 * before anything writes it, because a browser's `state-save` would create it readable by
 * others; `exists` is true only once it holds a real sign-in. */
export function signIn(tenant, interfaceId, userId, base = HOME) {
  const folder = appFolder(tenant, interfaceId, base);
  const file = path.join(folder, `sign-in-${safeSegment(userId, 'userId')}.json`);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(`refused: ${file} is a link`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}', { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return { userId: String(userId), signInFile: file, exists: holdsSignIn(file) };
}

export function remove(tenant, interfaceId, base = HOME) {
  const folder = path.join(home(base).folder, safeSegment(tenant, 'tenant'), safeSegment(interfaceId, 'interfaceId'));
  fs.rmSync(folder, { recursive: true, force: true });
  return { removed: folder };
}

const invokedDirectly = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const [command, tenant, interfaceId, userId] = process.argv.slice(2);
  try {
    let result;
    if (command === 'home') result = home();
    else if (command === 'sign-in') result = signIn(tenant, interfaceId, userId);
    else if (command === 'remove') result = remove(tenant, interfaceId);
    else throw new Error('usage: loop-home.mjs home | sign-in <tenant> <interfaceId> <userId> | remove <tenant> <interfaceId>');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
