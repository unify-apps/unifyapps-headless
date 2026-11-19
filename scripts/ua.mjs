#!/usr/bin/env node
// Single entry point for UnifyApps Headless's solution lifecycle. Only this module prints.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UaError } from './lib/contracts.mjs';
import { withRetry } from './lib/retry.mjs';
import { serviceFor } from './platform/service.mjs';
import { homeForCwd, readState, readRegistry, canonicalCwd, executionActor, assertStarted, validatedSessionId, sessionForFolder } from './folder/local.mjs';
import { tenantBindingFor, tenantOnlyHome } from './folder/session-registry.mjs';
import { COMMANDS, FLAGS, BOOLEAN, helpFor } from './lib/usage.mjs';
import { installedCopy, RELOAD_STEP } from './release/installed-copy.mjs';

export { COMMANDS };

const setup = new Set(['state next', 'state resolve','solution resolve', 'solution handoff', 'solution handoff-claim', 'solution find', 'solution locate', 'solution storage-check', 'solution connect', 'solution open', 'solution create', 'workspace list']);
// What a folder connected to a tenant with no solution open may still run. The
// `task` area answers questions about the tenant, so it runs there too.
const tenantOnly = new Set(['solution mcp-setup', 'workspace list']);
const exitCodes = { USAGE: 2, FOLDER_SOLUTION_MISMATCH: 2, FOLDER_CONTENT_CONFLICT: 2, TENANT_BINDING_CONFLICT: 2, WORKSPACE_MISMATCH: 2, AUTH_EXPIRED: 3, PERMISSION_REQUIRED: 3, PLAN_INTERRUPTED: 5, PLATFORM_UNREACHABLE: 6, MCP_SETUP_FAILED: 6 };

/**
 * Claude Code keeps the plugin folder a session started with, while a copy
 * installed later (by another session, or an update) can serve the skills.
 * Then the skills ask for flags and lines this older CLI refuses. An installed
 * copy (one inside Claude Code's plugin cache) checks it is still the copy
 * Claude Code has installed, and answers both versions when it is not.
 * A copy run from anywhere else, such as a checkout, is not checked.
 */
function installedCopyMismatch() {
  const copy = installedCopy(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (!copy.inCache || !copy.installed || copy.isInstalled) return null;
  let running;
  try { running = JSON.parse(fs.readFileSync(path.join(copy.self, 'package.json'), 'utf8')).version; }
  catch { return null; }
  return { running, installed: String(copy.installed.version ?? path.basename(copy.installed.installPath)) };
}

// Commands that change nothing on the tenant or in the records. An old copy may
// still answer them; every other command waits for the restart.
const readOnlyKeys = new Set(['state resolve', 'solution resolve', 'solution find', 'solution locate', 'solution context',
  'task get', 'spec check', 'spec render', 'spec get', 'spec list', 'entity context', 'entity list', 'plan get', 'plan list',
  'memory get', 'feature list', 'feature get', 'feature match', 'prd list', 'prd get', 'prd history', 'prd diff', 'prd check', 'prd classify', 'prd verify']);
const readOnly = (area, key) => area === 'cache' || area === 'impact' || readOnlyKeys.has(key);

export function parseArguments(argv) {
  const args = [], flags = {};
  let positional = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') { positional = true; continue; }
    // No command here defines a short flag, so a single dash is always a
    // typo for a long one (-tenant for --tenant), never a flag of its own.
    // Swallowing it as a positional made it, say, cache grep's search
    // pattern with no error. A token that really starts with a dash (an
    // unusual regex) still gets through after `--` marks positionals.
    if (!positional && token.length > 1 && token[0] === '-' && token[1] !== '-') {
      throw new UaError('USAGE', `Unknown flag ${token}. Flags start with --; put -- before it to pass it as a value instead.`);
    }
    if (positional || !token.startsWith('--')) { args.push(token); continue; }
    const equal = token.indexOf('=');
    const key = token.slice(2, equal < 0 ? undefined : equal);
    if (Object.hasOwn(flags, key)) throw new UaError('USAGE', `Flag --${key} was supplied more than once.`);
    if (BOOLEAN.has(key)) {
      if (equal >= 0) throw new UaError('USAGE', `Flag --${key} takes no value.`);
      flags[key] = true;
    } else {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++i];
      if (value === undefined || value.startsWith('--')) throw new UaError('USAGE', `Flag --${key} needs a value.`);
      flags[key] = value;
    }
  }
  return { args, flags };
}
export async function execute(argv, { cwd = process.cwd() } = {}) {
  const { args, flags } = parseArguments(argv);
  const [area, command, ...positionals] = args;
  // --help is answered before anything else, so it works without a session, a
  // solution or the platform, and so a wrong flag can be diagnosed with it.
  if (flags.help || !area) return helpFor(area, command);
  if (!COMMANDS[area]?.includes(command)) throw new UaError('USAGE', 'Use `ua <state|solution|task|spec|fast|entity|cache|impact|plan|memory|feature|prd|session|changeset|skill|workspace> <command>`. Run `ua --help` for the list.');
  const key = `${area} ${command}`;
  for (const flag of Object.keys(flags)) if (!['json', 'session'].includes(flag) && !FLAGS[key].includes(flag)) throw new UaError('USAGE', `Unknown flag --${flag} for ${key}. Run UnifyApps Headless ${key} --help.`);
  // An installed update says restart before anything else, because the restart
  // is what loads the newer copy.
  if (key !== 'spec check' && !readOnly(area, key)) {
    const mismatch = installedCopyMismatch();
    if (mismatch) {
      throw new UaError('RESTART_NEEDED', `This Claude session still runs UnifyApps Headless ${mismatch.running}, but UnifyApps Headless ${mismatch.installed} is installed. ${RELOAD_STEP}`, mismatch);
    }
  }
  // These only read a Markdown file: without this the session check below would refuse them with NOT_STARTED.
  if (key === 'spec check' || key === 'spec render' || key === 'prd check') {
    const handler = await import(`./cmd/${area}.mjs`);
    return handler.run(command, positionals, flags, { cwd });
  }
  const suppliedSession = flags.session ?? process.env.CLAUDE_CODE_SESSION_ID;
  let sessionId = null;
  if (suppliedSession) {
    try { sessionId = validatedSessionId(suppliedSession); }
    catch { throw new UaError('USAGE', 'Use a valid Claude session ID.'); }
  }
  if (!sessionId && ['solution open', 'solution create', 'solution connect'].includes(key)) {
    throw new UaError('USAGE', 'A Claude session ID is required. Start UnifyApps Headless from Claude or supply --session <id>.');
  }
  const registered = sessionId ? readRegistry().sessions[sessionId] : null;
  // Setup runs where it is typed. Only the main session runs it, so setup in
  // another folder means the Claude session itself moved there, and
  // `solution open` / `create` bind it to that folder.
  let redirect = null;
  if (registered && registered.cwd !== canonicalCwd(cwd) && !setup.has(key)) {
    const typedCwd = canonicalCwd(cwd);
    // The typed folder may itself already hold a DIFFERENT solution (its own
    // newest session there). Silently answering for the session's registered
    // folder instead would then answer for the wrong solution with nothing
    // saying so: refuse by name, naming both folders and both solutions,
    // rather than guessing which one was meant.
    const typedFolder = sessionForFolder(typedCwd);
    if (typedFolder?.solutionId && (typedFolder.tenant !== registered.tenant || typedFolder.solutionId !== registered.solutionId)) {
      throw new UaError('USAGE', `This Claude session is bound to ${registered.solutionName ?? registered.solutionId} on ${registered.tenant} (${registered.cwd}), ` +
        `but ${typedCwd} holds a different solution, ${typedFolder.solutionName ?? typedFolder.solutionId} on ${typedFolder.tenant}. ` +
        `Run solution open --session ${sessionId} in ${typedCwd} to work on that folder's solution instead.`);
    }
    // Every other command runs in the session's own workspace, wherever it was
    // typed: a builder that works from /tmp or its scratchpad still reads the
    // cache it was told to. A file it names is still read from where it typed it.
    const typedIn = path.resolve(cwd);
    for (const flag of Object.keys(flags)) {
      if ((flag === 'file' || flag.endsWith('-file')) && typeof flags[flag] === 'string') flags[flag] = path.resolve(typedIn, flags[flag]);
    }
    redirect = { from: typedCwd, to: registered.cwd };
    cwd = registered.cwd;
  }
  const binding = sessionId ? homeForCwd(cwd, sessionId) : null;
  let state = null;
  if (binding) {
    try { state = readState(binding.home, sessionId); }
    catch (error) { if (!setup.has(key)) throw error; }
  }
  if (!setup.has(key) && !sessionId) {
    // A terminal of the person's own has no Claude session id. Say that, not
    // "run /ua:setup", and name the id to pass; never guess it.
    const newest = sessionForFolder(cwd);
    throw new UaError('NOT_STARTED', 'This terminal has no Claude session id, so UnifyApps Headless cannot tell which session to use. Add --session <id>.'
      + (newest ? ` The newest UnifyApps Headless session in this folder is ${newest.sessionId}.` : ''), newest ? { sessionId: newest.sessionId } : {});
  }
  // A folder connected to a tenant with no solution open answers questions, and
  // nothing else: every other command needs a solution, so it is refused here.
  const tenantBinding = !state && !setup.has(key) ? tenantBindingFor(cwd) : null;
  if (tenantBinding && !tenantOnly.has(key) && area !== 'task') throw new UaError('NO_SOLUTION', { tenant: tenantBinding.tenant });
  if (!setup.has(key) && !state && !tenantBinding) {
    // Claude Code can give one conversation a new session id (a resume, a
    // compaction), and the state stays under the id that opened the solution.
    // Name that session, as the terminal case above does; never adopt it,
    // since another live conversation may own it.
    const newest = sessionForFolder(cwd);
    if (newest?.solutionId && newest.sessionId !== sessionId) {
      throw new UaError('NOT_STARTED', `This Claude session (${sessionId}) has not opened a solution in this folder. `
        + `The newest UnifyApps Headless session here is ${newest.sessionId}: if this conversation opened it, add --session ${newest.sessionId}; otherwise run /ua:setup.`,
      { sessionId: newest.sessionId });
    }
    throw new UaError('NOT_STARTED');
  }
  if (state) {
    try {
      assertStarted(binding.home, sessionId);
      if (state.tenant !== binding.tenant || state.solutionId !== binding.solutionId || state.key !== binding.key) throw new UaError('NOT_STARTED');
    } catch (error) {
      if (!setup.has(key)) throw error;
      state = null;
    }
  }
  // A tenant-only session has no solution home; its task state lives under the bound folder.
  const taskHome = tenantBinding && area === 'task' ? tenantOnlyHome(cwd, sessionId)?.home : undefined;
  const ctx = { cwd, sessionId, home: binding?.home ?? taskHome, key: binding?.key,
    state: state ?? (taskHome ? readState(taskHome, sessionId) : null), tenantBinding,
    actor: executionActor(),
    service: state ? serviceFor(state.tenant, { retry: withRetry, beforeWrite: () => assertStarted(binding.home, sessionId),
      storage: state.storage ?? 'platform', home: binding.home, sessionId, solutionId: state.solutionId,
      // So a record write through the tenant's own tool, which sends no workspace
      // header, cannot leave the solution outside its workspace.
      workspaceId: state.workspaceId }) : null };
  const handler = await import(`./cmd/${area}.mjs`);
  let result, failure;
  try { result = await handler.run(command, positionals, flags, ctx); }
  catch (error) { failure = error; }
  if (failure) throw failure;
  // A redirect that lands silently can never again look like a correct
  // answer for the folder actually typed: every answer it produced names
  // which folder it really used.
  if (redirect && result && typeof result === 'object') {
    return { ...result, data: { ...(result.data ?? {}), workingFolder: redirect.to, redirectedFrom: redirect.from } };
  }
  return result;
}
export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  let result;
  try { result = await execute(argv); }
  catch (error) {
    const code = error.code ?? 'ERROR';
    const message = error instanceof SyntaxError ? 'A JSON input file is invalid.' : error.message || 'The command failed.';
    result = { data: { error: { code, message, ...(error.details ?? {}) } }, message, exitCode: exitCodes[code] ?? 1 };
  }
  const line = String(result.message ?? 'Done.').replace(/\s+/g, ' ').trim();
  // A write to a pipe is not done when it returns on macOS: past 64 KB the rest
  // waits for the reader. Claude Code's Bash tool, like `2>&1`, reads stdout and
  // stderr from one pipe, so a status line written at once lands inside the
  // JSON. It goes only after stdout has taken the whole JSON.
  if (json) {
    await new Promise((resolve) => process.stdout.write(JSON.stringify(result.data ?? {}) + '\n', resolve));
    process.stderr.write(line + '\n');
  }
  else process.stdout.write((result.text ?? line) + '\n');
  process.exitCode = result.exitCode ?? 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
