// The disable list a simulator's launchd_sim reads when the simulator starts. It is a file on the
// Mac, outside the simulator's data folder, keyed by udid:
//   /private/var/tmp/com.apple.CoreSimulator.SimDevice.<udid>/disabled.plist
// a flat XML plist of <key>launchd label</key> followed by <true/> (disabled) or <false/> (enabled).
// launchd_sim rewrites it on every `launchctl enable` or `disable`, so it is written only while the
// simulator is shut down, and every entry already in it (the runtime writes some of its own) is kept.
// It survives shutdown, reboot and `simctl erase`; a clone or a new simulator starts without one.
// LOOPS_SIM_STORE_ROOT moves it; with LOOPS_FAKE_SIMCTL=1 it lives under LOOPS_HOME.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loopsHome } from './state.mjs';

const UDID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/iu;

export function storeRoot() {
  if (process.env.LOOPS_SIM_STORE_ROOT) return process.env.LOOPS_SIM_STORE_ROOT;
  if (process.env.LOOPS_FAKE_SIMCTL === '1') return path.join(loopsHome(), 'fake-sim-store');
  return '/private/var/tmp';
}

// The udid becomes part of a path, so only a real udid gets through.
export function storeFile(udid) {
  if (!UDID.test(String(udid))) throw new Error(`"${udid}" is not a simulator udid`);
  return path.join(storeRoot(), `com.apple.CoreSimulator.SimDevice.${udid}`, 'disabled.plist');
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (text) => text.replace(/&(amp|lt|gt|quot|apos);/gu, (_, name) => XML_ENTITIES[name]);
const escapeXml = (text) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

function storeText(file) {
  const bytes = fs.readFileSync(file);
  // launchd_sim writes XML; a binary plist is converted rather than misread.
  if (bytes.subarray(0, 8).toString('latin1') === 'bplist00') {
    return execFileSync('plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return bytes.toString('utf8');
}

/** Every entry in the store, label → true (disabled) or false (enabled). No store is an empty map. */
export function readStore(udid) {
  const file = storeFile(udid);
  let text;
  try {
    text = storeText(file);
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
  const entries = new Map();
  for (const match of text.matchAll(/<key>([^<]*)<\/key>\s*<(true|false)\s*\/>/gu)) entries.set(unescapeXml(match[1]), match[2] === 'true');
  return entries;
}

function encode(entries) {
  const lines = [...entries.keys()].sort().map((label) => `\t<key>${escapeXml(label)}</key>\n\t<${entries.get(label) ? 'true' : 'false'}/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${lines.join('\n')}
</dict>
</plist>
`;
}

/**
 * Sets each label in `changes` (label → true to disable, false to enable) and keeps every other
 * entry. Writes a temporary file and renames it, so launchd_sim never reads half a store. Returns
 * how many entries changed; nothing is written when none did.
 */
export function writeStore(udid, changes) {
  const entries = readStore(udid);
  let changed = 0;
  for (const [label, disabled] of Object.entries(changes)) {
    if (entries.get(label) === disabled) continue;
    entries.set(label, disabled);
    changed += 1;
  }
  if (!changed) return 0;
  const file = storeFile(udid);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, encode(entries), { mode: 0o644 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
  return changed;
}
