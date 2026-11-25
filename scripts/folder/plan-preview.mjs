// Writes the plan preview into this session's drafts and opens it in the
// default browser. The page itself is built by lib/plan-preview.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { UaError } from '../lib/contracts.mjs';
import { atomicFile, readJsonFile } from '../lib/session-paths.mjs';
import { sessionHome } from './local.mjs';
import { WIRING_FILE } from './folder-layout.mjs';

export const PREVIEW_NAME = /^preview-[0-9a-f]{16}\.html$/u;

export const draftsFolder = (home, sessionId) => path.join(sessionHome(home, sessionId), 'drafts');

export const previewPath = (home, sessionId, hash) => path.join(draftsFolder(home, sessionId), `preview-${hash}.html`);

export function writePreview(home, sessionId, hash, html) {
  const file = previewPath(home, sessionId, hash);
  if (!PREVIEW_NAME.test(path.basename(file))) throw new UaError('USAGE', 'A preview hash is 16 lowercase hex characters.');
  atomicFile(file, html);
  return file;
}

/** `.nebula/wiring.json` as the last render wrote it, or null. */
export function readWiringFile(home) {
  try { return readJsonFile(path.join(home, WIRING_FILE), null); } catch { return null; }
}

/**
 * Opens only a preview page in this session's drafts, by its real path, with no
 * shell: the path is the one argument `open` gets, so no name in it can run as a
 * command. Off macOS, and under the fake platform, nothing opens and the caller
 * prints the path instead.
 */
export function openPreview(file, { drafts: folder, platform = process.platform, launch = spawn } = {}) {
  if (!PREVIEW_NAME.test(path.basename(file))) throw new UaError('USAGE', 'Only a preview-<hash>.html page in this session\'s drafts is opened.');
  let real, drafts;
  try {
    real = fs.realpathSync(file);
    drafts = fs.realpathSync(folder);
  } catch { throw new UaError('USAGE', 'The preview page is not in this session\'s drafts.'); }
  if (path.dirname(real) !== drafts || !PREVIEW_NAME.test(path.basename(real))) {
    throw new UaError('USAGE', 'Only a preview-<hash>.html page in this session\'s drafts is opened.');
  }
  if (platform !== 'darwin' || process.env.UA_FAKE === '1') return false;
  try {
    const child = launch('open', [real], { detached: true, stdio: 'ignore' });
    child.on?.('error', () => {});
    child.unref?.();
    return true;
  } catch { return false; }
}
