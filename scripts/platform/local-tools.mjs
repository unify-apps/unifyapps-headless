/**
 * Whether a local command-line tool this machine's own PATH can reach.
 * Local-only: no tenant, no network, no files written; the one file it looks
 * at is Bun's own install folder. This is the
 * counterpart in spirit to `checkTenantStorage` (storage-check.mjs), which
 * is tenant-record-existence only and knows nothing about tools on this
 * machine — the two are never the same check and must not be conflated.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function has(tool) {
  try { execFileSync('which', [tool], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

/**
 * Whether poppler's PDF tools are on PATH: `pdftoppm` (renders a page to an
 * image) and `pdftotext` (extracts the text). These are the exact names
 * Claude Code's own `Read` names in its error when a PDF is too long to read
 * directly, so setup can tell the person up front whether a long PDF
 * requirements file will actually be readable, rather than only discovering
 * it mid-task.
 */
export function pdfToolsPresence() {
  return { pdftoppm: has('pdftoppm'), pdftotext: has('pdftotext') };
}

/**
 * Whether Bun, which a code app's local build needs, is on this machine:
 * `onPath` when PATH reaches it, `path` for where it is (PATH first, then
 * Bun's own install folder `~/.bun/bin`, which a fresh install does not add
 * to PATH), and `present` when either holds. Detection only: UnifyApps Headless never
 * installs it.
 */
export function bunPresence(home = os.homedir()) {
  if (has('bun')) return { present: true, onPath: true, path: 'bun' };
  const own = path.join(home, '.bun', 'bin', 'bun');
  const there = fs.existsSync(own);
  return { present: there, onPath: false, path: there ? own : null };
}

/** True only when both poppler tools are present. */
export function hasPdfTools() {
  const presence = pdfToolsPresence();
  return presence.pdftoppm && presence.pdftotext;
}
