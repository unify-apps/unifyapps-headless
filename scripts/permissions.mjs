#!/usr/bin/env node
// Writes, or checks, the permission rules UnifyApps Headless needs under Claude Code's auto
// mode in the person's own Claude settings (`~/.claude/settings.json`, or
// `$CLAUDE_CONFIG_DIR/settings.json`). The rules match every UnifyApps Headless version, so
// one run lasts across updates. `setup.sh` runs `apply` at install.
//
//   node scripts/permissions.mjs [apply]        add the missing rules, keep a backup
//   node scripts/permissions.mjs check [--json] say which rules are missing; writes nothing
//
// `apply` refuses to run inside a Claude Code session: auto mode refuses a
// session that edits its own permissions, and a setting the agent could write
// for itself would be no setting. The person runs it in their own terminal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASK_RULES, allowRules, mergeRules, missingRules } from './lib/permission-rules.mjs';
import { pluginId } from './release/plugin-id.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function claudeConfigDir(env = process.env) {
  return path.resolve(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
}

/** `install-local.mjs`'s own install tree, `<UA_HOME>/plugin`: a local install (no
 * Claude Code marketplace cache involved) keeps every version straight under there. */
function localInstallTree(env = process.env) {
  return path.join(path.resolve(env.UA_HOME || path.join(os.homedir(), '.unifyapps-solutions')), 'plugin');
}

/** The folder that holds every installed version of the copy actually running —
 * Claude Code's own plugin cache, or, when this copy was put there by
 * `install-local.mjs` instead, that installer's own tree. Rules built from the wrong
 * one never match what Bash actually runs, so `check` would answer `ok` for a tree
 * nothing is installed in while the real one stays unmatched. */
export function versionsDir(configDir, { pluginRoot = root, env = process.env } = {}) {
  const local = localInstallTree(env);
  if (pluginRoot === local || pluginRoot.startsWith(`${local}${path.sep}`)) return local;
  const { marketplace, plugin } = pluginId(root);
  return path.join(configDir, 'plugins', 'cache', marketplace, plugin);
}

/** The one command the person runs in their own terminal. */
export function fixCommand(pluginRoot = root) {
  return `bash "${path.join(pluginRoot, 'scripts', 'run-node.sh')}" "${path.join(pluginRoot, 'scripts', 'permissions.mjs')}"`;
}

function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* named below */ }
  throw new Error(`${file} is not a JSON object, so UnifyApps Headless left it untouched. Fix it, then run this again.`);
}

function stamp(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function apply({ env = process.env } = {}) {
  const configDir = claudeConfigDir(env);
  const file = path.join(configDir, 'settings.json');
  const before = readSettings(file);
  const { settings, added } = mergeRules(before, { allow: allowRules(versionsDir(configDir)), ask: [...ASK_RULES] });
  if (!added.allow.length && !added.ask.length) return { file, added, backup: null };
  let backup = null;
  if (fs.existsSync(file)) {
    backup = `${file}.bak-${stamp()}`;
    fs.copyFileSync(file, backup);
  }
  fs.mkdirSync(configDir, { recursive: true });
  const temp = `${file}.ua-${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`);
  fs.renameSync(temp, file);
  return { file, added, backup };
}

export function check({ env = process.env } = {}) {
  const configDir = claudeConfigDir(env);
  const file = path.join(configDir, 'settings.json');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const missing = missingRules(readSettings(file), { versionsDir: versionsDir(configDir), version });
  return { ok: missing.allow.length === 0 && missing.ask.length === 0, settingsFile: file, missing, command: fixCommand() };
}

const entry = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (entry === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [command = 'apply', ...rest] = process.argv.slice(2);
  const json = rest.includes('--json');
  try {
    if (command === 'check') {
      const result = check();
      if (json) console.log(JSON.stringify(result));
      else if (result.ok) console.log(`Auto-mode permission rules: OK (${result.settingsFile})`);
      else console.log(`Auto-mode permission rules: ${result.missing.allow.length + result.missing.ask.length} missing in ${result.settingsFile}.\nRun this in your own terminal, once:\n\n  ${result.command}`);
    } else if (command === 'apply') {
      if (process.env.CLAUDECODE) {
        console.error(`UnifyApps Headless does not change Claude's permissions from inside a Claude session. Run this in your own terminal:\n\n  ${fixCommand()}`);
        process.exitCode = 2;
      } else {
        const { file, added, backup } = apply();
        if (!added.allow.length && !added.ask.length) console.log(`Auto-mode permission rules already in ${file}.`);
        else console.log(`Auto-mode permission rules: allow +${added.allow.length}, ask +${added.ask.length} in ${file}${backup ? ` (backup: ${backup})` : ''}. They match every UnifyApps Headless version.`);
      }
    } else {
      console.error('Usage: node scripts/permissions.mjs [apply | check [--json]]');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
