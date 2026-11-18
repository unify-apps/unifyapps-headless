#!/usr/bin/env node
// Installs UnifyApps Headless into the coding agents on this machine.
//
//   node scripts/install/index.mjs                  detect the agents, ask which ones, install
//   node scripts/install/index.mjs --agents a,b     install for these, no question (ids: claude, codex, opencode)
//   node scripts/install/index.mjs --agents all     every agent found
//   node scripts/install/index.mjs --yes            every agent found, no question
//   node scripts/install/index.mjs --list           say which agents are here and stop
//   node scripts/install/index.mjs --uninstall [--agents a,b]
//   node scripts/install/index.mjs --update          the agents the last install chose, no question
//
// One copy of the plugin is staged under UA_HOME/plugin/<version>; every
// agent is pointed at that copy. The install itself runs the staged copy's
// code, so the paths each agent is given are the staged ones, not those of the
// folder the installer was unpacked into, which may be deleted afterwards.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copyDistribution } from '../release/distribution.mjs';
import { UA_HOME } from '../lib/session-paths.mjs';
import { TARGETS } from './targets.mjs';

const SOURCE = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
/** Which agents the last install chose, so an update reaches the same ones. */
const AGENTS_FILE = path.join(UA_HOME, 'agents.json');

/** The recorded agents. An install from before this file existed knew only Claude Code. */
export function recordedAgents(file = AGENTS_FILE) {
  try {
    const agents = JSON.parse(fs.readFileSync(file, 'utf8')).agents;
    if (Array.isArray(agents)) return agents.filter((id) => typeof id === 'string');
  } catch { /* none recorded */ }
  return ['claude'];
}

function recordAgents(ids, version, file = AGENTS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ agents: [...new Set(ids)].sort(), version, at: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
}

function parseArgs(argv) {
  const options = { agents: null, yes: false, list: false, uninstall: false, update: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agents') options.agents = String(argv[++i] ?? '');
    else if (arg.startsWith('--agents=')) options.agents = arg.slice('--agents='.length);
    else if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--uninstall') options.uninstall = true;
    else if (arg === '--update') options.update = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}. Run with --help.`);
  }
  return options;
}

const USAGE = `Usage: install [--agents ${TARGETS.map((t) => t.id).join(',')}|all] [--yes] [--list] [--uninstall]`;

/** The terminal, even when the installer itself was piped in (curl … | bash). */
function openTerminal() {
  if (process.stdin.isTTY) return { input: process.stdin, output: process.stdout, close() {} };
  try {
    const input = fs.createReadStream('/dev/tty');
    const output = fs.createWriteStream('/dev/tty');
    return { input, output, close() { input.destroy(); output.end(); } };
  } catch { return null; }
}

function describe(found) {
  return found.map(({ target, state }, index) => `  ${index + 1}. ${target.label.padEnd(12)} ${state.found ? state.version : `(${state.note})`}`).join('\n');
}

/** Turns "1,3", "codex opencode", "all" or "" into targets. */
export function parseChoice(answer, rows, fallback) {
  const text = String(answer ?? '').trim().toLowerCase();
  if (!text) return fallback;
  if (text === 'all') return rows.filter((row) => row.state.found).map((row) => row.target);
  const picked = [];
  for (const part of text.split(/[\s,]+/u).filter(Boolean)) {
    const byNumber = /^\d+$/u.test(part) ? rows[Number(part) - 1] : null;
    const row = byNumber ?? rows.find((entry) => entry.target.id === part);
    if (!row) throw new Error(`"${part}" is not one of the listed agents.`);
    if (!row.state.found) throw new Error(`${row.target.label} is not installed on this machine.`);
    if (!picked.includes(row.target)) picked.push(row.target);
  }
  return picked;
}

async function choose(rows, options) {
  const found = rows.filter((row) => row.state.found).map((row) => row.target);
  // An update reinstalls into the agents chosen last time that are still here, with no question.
  if (options.update) return found.filter((target) => recordedAgents().includes(target.id));
  if (options.agents) return parseChoice(options.agents.replaceAll(',', ' '), rows, found);
  if (options.yes) return found;
  const terminal = openTerminal();
  if (!terminal) return found;
  const ask = readline.createInterface({ input: terminal.input, output: terminal.output });
  try {
    const fallback = found.length ? found.map((target) => target.label).join(', ') : 'none';
    for (;;) {
      const answer = await ask.question(`\nInstall UnifyApps Headless for which agents? Numbers or names, "all", or Enter for: ${fallback}\n> `);
      try { return parseChoice(answer, rows, found); } catch (error) { terminal.output.write(`${error.message}\n`); }
    }
  } finally { ask.close(); terminal.close(); }
}

/** The one copy every agent uses. A reinstall of the same version replaces it. */
function stage(version) {
  const staged = path.join(UA_HOME, 'plugin', version);
  const same = fs.existsSync(staged) && fs.realpathSync(staged) === fs.realpathSync(SOURCE);
  if (!same) {
    fs.rmSync(staged, { recursive: true, force: true });
    copyDistribution(SOURCE, staged);
  }
  return staged;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(USAGE); return 0; }
  const version = JSON.parse(fs.readFileSync(path.join(SOURCE, 'package.json'), 'utf8')).version;
  const rows = TARGETS.map((target) => ({ target, state: target.detect() }));
  console.log(`UnifyApps Headless ${version}\n\nCoding agents on this machine:\n${describe(rows)}`);
  if (options.list) return 0;

  const chosen = await choose(rows, options);
  if (!chosen.length) {
    console.error('\nNo agent chosen, so nothing was installed.');
    return 1;
  }

  if (options.uninstall) {
    const removed = [];
    for (const target of chosen) {
      try { await target.uninstall({ pluginRoot: SOURCE }); removed.push(target.id); console.log(`  Removed from ${target.label}.`); }
      catch (error) { console.error(`  ${target.label}: ${error.message}`); }
    }
    recordAgents(recordedAgents().filter((id) => !removed.includes(id)), version);
    return 0;
  }

  const pluginRoot = stage(version);
  const { TARGETS: STAGED } = await import(pathToFileURL(path.join(pluginRoot, 'scripts', 'install', 'targets.mjs')).href);
  console.log(`\nInstalled files: ${pluginRoot}`);
  let failed = 0;
  const done = [];
  for (const { id } of chosen) {
    const target = STAGED.find((entry) => entry.id === id);
    process.stdout.write(`  ${target.label}: installing… `);
    try {
      const result = await target.install({ pluginRoot, version });
      console.log('done');
      done.push({ target, result });
    } catch (error) {
      failed += 1;
      console.log('failed');
      console.error(`    ${error.message}`);
    }
  }
  if (done.length) {
    recordAgents([...recordedAgents(), ...done.map(({ target }) => target.id)], version);
    console.log('\nNext:');
    for (const { target, result } of done) {
      console.log(`  ${target.label}: ${result.start}`);
      for (const note of result.notes ?? []) console.log(`    Note: ${note}`);
    }
    console.log('\nIf an agent was already open, exit it first so it loads the plugin.');
  }
  return failed ? 1 : 0;
}

const entry = process.argv[1] && fs.existsSync(process.argv[1]) ? fs.realpathSync(process.argv[1]) : '';
if (entry === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}
