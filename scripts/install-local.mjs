#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { copyDistribution } from './release/distribution.mjs';
import { pluginId } from './release/plugin-id.mjs';

// The operating system refused the file itself: wrong format for this machine
// (ENOEXEC), gone from PATH between the check and the call (ENOENT), or not
// executable (EACCES). None of these are about the arguments we passed.
const SPAWN_REFUSED = new Set(['ENOEXEC', 'ENOENT', 'EACCES']);

/** `--yes` for a `claude plugin install` that still takes it, and nothing for one that
 * does not. Claude Code dropped the flag — 2.1.220 exits `error: unknown option
 * '--yes'` while parsing, before installing anything, which left an update
 * failing with the plugin already uninstalled and no way back but a manual install.
 * Older builds wanted it to skip a confirmation, so neither spelling works on both.
 * The command is asked rather than tried and retried, because a retry would report
 * its own argument error in place of whatever really stopped the install. `uninstall`
 * still takes `-y, --yes` and is left alone. */
function skipsPrompts(run) {
  try { return run('plugin', 'install', '--help').includes('--yes') ? ['--yes'] : []; }
  catch { return []; }  // No help to read: the plain call is the one that works today.
}

export function installLocal({ source, uaHome, run }) {
  const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
  const own = pluginId(source);
  const installedSource = path.join(uaHome, 'plugin', version);
  if (fs.realpathSync(source) !== (fs.existsSync(installedSource) ? fs.realpathSync(installedSource) : installedSource)) {
    copyDistribution(source, installedSource);
  }

  const marketplaces = JSON.parse(run('plugin', 'marketplace', 'list', '--json'));
  const registered = marketplaces.find(m => m.name === own.marketplace);
  if (registered?.path !== installedSource) {
    if (registered) run('plugin', 'marketplace', 'remove', own.marketplace);
    run('plugin', 'marketplace', 'add', installedSource);
  }
  const userCopy = (id) => JSON.parse(run('plugin', 'list', '--json')).find(p => p.id === id && p.scope === 'user');
  // Claude's update command keeps the existing cache when the marketplace
  // publishes changed files under the same version. A local installer must be
  // safely rerunnable while a release is being prepared, so replace the plugin
  // registration and preserve its persistent data before installing the exact
  // distribution currently staged at installedSource.
  if (userCopy(own.id)) {
    run('plugin', 'uninstall', own.id, '--scope', 'user', '--keep-data', '--yes');
  }
  run('plugin', 'install', own.id, '--scope', 'user', ...skipsPrompts(run));
  let result = userCopy(own.id);
  if (result && !result.enabled) {
    run('plugin', 'enable', own.id, '--scope', 'user');
    result = userCopy(own.id);
  }
  if (!result?.enabled || result.version !== version) throw new Error(`Expected enabled ${own.id} ${version}; installation did not finish.`);
  return installedSource;
}

// Compare real paths: Node resolves symlinks in import.meta.url, while argv[1]
// keeps whatever the caller typed (macOS TMPDIR is /var/… → /private/var/…).
const entry = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (entry === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const home = os.homedir();
  const uaHome = path.resolve(process.env.UA_HOME || path.join(home, '.unifyapps-solutions'));
  try {
    const installed = installLocal({
      source: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      uaHome,
      run: (...args) => execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }),
    });
    console.log(`Plugin installed from ${installed}`);
  } catch (error) {
    // The operating system refused to execute `claude` at all, so no argument
    // we pass can help: the file on PATH is a launcher whose platform-native
    // binary was never downloaded (an npm install that skipped its postinstall).
    // Node reports ENOEXEC where bash quietly falls back to /bin/sh, so this is
    // the first place the broken copy becomes visible. Name the fix instead of
    // printing a spawnSync stack trace at someone installing a plugin.
    if (SPAWN_REFUSED.has(error?.code) && String(error?.syscall ?? '').startsWith('spawnSync claude')) {
      // The installer probes for `claude` first, but it can still be genuinely
      // absent here, and the two cases must not be described with each other's
      // words.
      console.error(`UnifyApps Headless could not run Claude Code (${error.code}).

${error.code === 'ENOENT'
  ? 'No `claude` was found on PATH.'
  : '`claude` is on PATH, but this machine cannot execute it. That usually means the\nClaude Code package was installed without its postinstall step, so the binary\nfor this platform was never downloaded.'}

Install or repair Claude Code, check that \`claude --version\` runs, then run setup again.`);
      process.exitCode = 1;
    } else if (error?.signal !== 'SIGKILL') {
      throw error;
    } else {
      console.error(`Claude Code couldn't finish setting up UnifyApps Headless.

Claude Code was unexpectedly stopped before setup completed. This can happen when Claude Desktop or another Claude Code session is open.

Please close Claude Desktop and any open Claude Code windows, then run the same installation command again. It's safe to retry.`);
      process.exitCode = 1;
    }
  }
}
