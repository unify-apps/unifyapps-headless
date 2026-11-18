#!/usr/bin/env node
/**
 * Makes and removes the private folder that holds a test run's secrets: one saved
 * sign-in per test user and every helper's browser profile.
 *
 *   node private-folder.mjs prepare <sessionId>           prints {"folder"} as JSON
 *   node private-folder.mjs sign-in <sessionId> <userId>  prints {"userId", "signInFile"} as JSON
 *   node private-folder.mjs remove <sessionId>
 *
 * The folder lives in the system temp folder, not the working folder, so a synced or
 * shared working folder never carries the test user's session. `prepare` first deletes
 * this user's folders untouched for 12 hours, so a run that never reached its
 * clean-up does not leave a live session behind for long.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PREFIX = "ua-test-author-";
export const STALE_MS = 12 * 60 * 60 * 1000;

const SAFE_ID = /^[\w-]+$/u;

export function folderFor(sessionId, tmp = os.tmpdir()) {
  if (!SAFE_ID.test(String(sessionId ?? ""))) throw new Error("a session id of letters, digits, _ or - is required");
  return path.join(tmp, `${PREFIX}${sessionId}`);
}

// The tool guard recognises this name, so a helper can pass the file only to the browser
// wrapper's state-load and state-save. Keep the two in step.
export function signInName(userId) {
  if (!SAFE_ID.test(String(userId ?? ""))) throw new Error("a user id of letters, digits, _ or - is required");
  return `sign-in-${userId}.json`;
}

// Windows has no process.getuid and reports uid 0 for every file, so owner checks only run where uids exist.
const ownedByMe = (stat) => typeof process.getuid !== "function" || stat.uid === process.getuid();

// Only folders this user owns: on a shared /tmp another user's folder is not ours to delete.
// One folder that cannot be deleted must not block the run, so failures are collected, not thrown.
export function removeStale(tmp = os.tmpdir(), now = Date.now()) {
  const removed = [];
  const notRemoved = [];
  for (const name of fs.readdirSync(tmp)) {
    if (!name.startsWith(PREFIX)) continue;
    const full = path.join(tmp, name);
    try {
      const stat = fs.lstatSync(full);
      if (!stat.isDirectory() || !ownedByMe(stat) || now - stat.mtimeMs < STALE_MS) continue;
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(full);
    } catch (error) {
      // Another session may delete the same folder between readdir and lstat.
      if (error.code !== "ENOENT") notRemoved.push({ folder: full, error: error.message });
    }
  }
  return { removed, notRemoved };
}

// A folder planted under our name by someone else, or a link, would expose the sign-in.
function assertOwnFolder(folder) {
  const stat = fs.lstatSync(folder);
  if (!stat.isDirectory() || !ownedByMe(stat)) throw new Error(`refused: ${folder} is not a folder of this user`);
}

export function prepare(sessionId, tmp = os.tmpdir()) {
  const folder = folderFor(sessionId, tmp);
  const { notRemoved } = removeStale(tmp);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  assertOwnFolder(folder);
  fs.chmodSync(folder, 0o700);
  return notRemoved.length ? { folder, staleNotRemoved: notRemoved } : { folder };
}

/** Makes one test user's empty sign-in file in the prepared folder, and returns its path. */
export function signIn(sessionId, userId, tmp = os.tmpdir()) {
  const folder = folderFor(sessionId, tmp);
  const name = signInName(userId);
  if (!fs.existsSync(folder)) throw new Error(`refused: ${folder} does not exist; run prepare first`);
  assertOwnFolder(folder);
  const signInFile = path.join(folder, name);
  // Created empty at 0600 first: Playwright saves storage state with fs.writeFile, which keeps
  // an existing file's mode. A write to a temp file then rename would not.
  fs.closeSync(fs.openSync(signInFile, "a", 0o600));
  fs.chmodSync(signInFile, 0o600);
  return { userId: String(userId), signInFile };
}

export function remove(sessionId, tmp = os.tmpdir()) {
  fs.rmSync(folderFor(sessionId, tmp), { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, sessionId, userId] = process.argv.slice(2);
  try {
    if (command === "prepare") process.stdout.write(`${JSON.stringify(prepare(sessionId))}\n`);
    else if (command === "sign-in") process.stdout.write(`${JSON.stringify(signIn(sessionId, userId))}\n`);
    else if (command === "remove") remove(sessionId);
    else throw new Error("usage: private-folder.mjs prepare|remove <sessionId> | sign-in <sessionId> <userId>");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
}
