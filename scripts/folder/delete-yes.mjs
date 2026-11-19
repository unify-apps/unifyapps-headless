// The person's yes to one call that cannot be undone. The bridge writes a
// pending file when it refuses the call; only the AskUserQuestion hook moves
// it to approved, from the person's real answer; the bridge takes it once.
// The folder and every export carry a name no one's work would use, because
// the tool guard refuses any command that names them: an everyday name
// (`approvals`, `approve(`) refused an app's own Approvals page.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UA_HOME } from '../lib/session-paths.mjs';

export const DELETE_YES_DIR = path.join(UA_HOME, 'ua-delete-yes');
export const DELETE_YES_TTL_MS = 30 * 60 * 1000;
const PENDING = path.join(DELETE_YES_DIR, 'pending');
const APPROVED = path.join(DELETE_YES_DIR, 'approved');
const ID = /^d_[0-9a-f]{6}$/u;

function folder(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(DELETE_YES_DIR, 0o700);
  fs.chmodSync(dir, 0o700);
  return dir;
}
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const write = (file, value) => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
};
const squash = (text) => String(text ?? '').replace(/\s+/gu, ' ').trim().toLowerCase();
const showsSummary = (question, summary) => !!squash(summary) && squash(question).includes(squash(summary));
const remove = (file) => { try { fs.unlinkSync(file); } catch { /* already gone */ } };

function entries(dir, now = Date.now()) {
  const out = [];
  for (const name of fs.readdirSync(folder(dir))) {
    const file = path.join(dir, name);
    const value = name.endsWith('.json') ? read(file) : null;
    const at = Date.parse(value?.approvedAt ?? value?.createdAt ?? '');
    if (!value || !(now - at < DELETE_YES_TTL_MS)) { remove(file); continue; }
    out.push({ file, value });
  }
  return out;
}

/** The id the person answers; an open request for the same call keeps its id. */
export function addPendingDelete({ key, tool, summary }) {
  entries(APPROVED);
  const open = entries(PENDING).find(({ value }) => value.key === key);
  if (open) return open.value.id;
  const id = `d_${crypto.randomBytes(3).toString('hex')}`;
  write(path.join(PENDING, `${id}.json`), { id, key, tool, summary, createdAt: new Date().toISOString() });
  return id;
}

/**
 * Whether `id` is waiting for a yes and `question` shows its summary. Checks
 * only, so a question naming several ids can be checked whole before any of
 * them is approved.
 */
export function pendingSummaryShown(id, question) {
  if (!ID.test(String(id))) return false;
  const pending = entries(PENDING).find(({ value }) => value.id === id);
  return !!pending && showsSummary(question, pending.value.summary);
}

/**
 * The person's yes to the question that showed `id`. The question must also
 * show the call's summary, so a yes always answers what the call really does:
 * a question that hid it ("Tidy up? (d_…)") approves nothing.
 */
export function approveDelete(id, question) {
  if (!ID.test(String(id))) return false;
  const pending = entries(PENDING).find(({ value }) => value.id === id);
  if (!pending || !showsSummary(question, pending.value.summary)) return false;
  folder(APPROVED);
  write(path.join(APPROVED, `${id}.json`), { ...pending.value, approvedAt: new Date().toISOString() });
  remove(pending.file);
  return true;
}

export function dropDelete(id) {
  if (!ID.test(String(id))) return;
  remove(path.join(folder(PENDING), `${id}.json`));
  remove(path.join(folder(APPROVED), `${id}.json`));
}

/**
 * A "yes" that named this id but whose question did not quote the summary, so
 * `approveDelete` returned false: recorded on the still-pending entry, so the
 * same id's next refusal can say why an earlier yes did not count, instead of
 * discarding that fact silently. A no-op when the id has no pending entry
 * (already approved, already dropped, or never asked).
 */
export function recordFailedYes(id) {
  if (!ID.test(String(id))) return false;
  const pending = entries(PENDING).find(({ value }) => value.id === id);
  if (!pending) return false;
  write(path.join(PENDING, `${id}.json`), { ...pending.value, failedYesAt: new Date().toISOString() });
  return true;
}

/** Whether a yes that did not count is on record for this pending id, or null when there is none. */
export function failedYesFor(id) {
  if (!ID.test(String(id))) return null;
  return entries(PENDING).find(({ value }) => value.id === id)?.value?.failedYesAt ?? null;
}

/** True once per yes: the approval is used up by the call it allowed. */
export function takeDeleteYes(key) {
  entries(PENDING);
  const hit = entries(APPROVED).find(({ value }) => value.key === key);
  if (!hit) return false;
  remove(hit.file);
  return true;
}
