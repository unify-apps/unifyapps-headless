#!/usr/bin/env node
// PreToolUse hook. A UnifyApps Headless builder agent reads tenant content, so an
// instruction planted there could steer it. This limits each builder, even
// when permission prompts are off: Write/Edit stay inside the working folder
// (the hook's folder or the one this session opened UnifyApps Headless in) or the system
// temp folder, away from files that run code or steer Claude
// later, Bash is refused what BASH_RULES below lists, and Read and Grep are
// kept out of the private folders that hold a saved sign-in and the browser
// profiles signed in with it.
// Hooks in a plugin agent's frontmatter are ignored, so the check lives here.
// The main session and other agents pass through untouched, except for the one
// check every caller meets: a copy below the oldest supported version.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegistry } from './folder/session-registry.mjs';
import { DELETE_YES_DIR } from './folder/delete-yes.mjs';
import { UA_HOME } from './lib/session-paths.mjs';
import { checkoutContaining } from './folder/code-checkout.mjs';

// Files that run code or steer Claude in a later session. Blocked at any depth.
const PROTECTED = new Set([
  '.claude', '.git', '.mcp.json', '.envrc', '.vscode', 'CLAUDE.md', 'CLAUDE.local.md',
  // A builder plants code here today; a person runs it later with npm, git,
  // a shell, or an editor, outside anything this hook can see.
  'package.json', '.npmrc', '.yarnrc', '.yarnrc.yml', '.husky', '.github', '.gitlab-ci.yml',
  'node_modules', '.zshrc', '.zshenv', '.zprofile', '.bashrc', '.bash_profile', '.profile',
  '.ssh', '.idea',
]);
// macOS/Windows filesystems are case-insensitive, so a write to `.Claude` lands
// on the real `.claude`; compare lowercased so the check can't be cased around.
const PROTECTED_LOWER = new Set([...PROTECTED].map((name) => name.toLowerCase()));
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const WRITE_DENY = 'UnifyApps Headless builder agents may write only inside the working folder or the system temp folder, and never to .claude, .git, CLAUDE.md, package.json, shell startup files or other files that run code later.';

// The file may not exist yet, so resolve its nearest existing folder. That
// also resolves a symlink that points out of the working folder.
function realTarget(file) {
  let dir = file;
  const rest = [];
  while (!fs.existsSync(dir)) {
    const up = path.dirname(dir);
    if (up === dir) break;
    rest.unshift(path.basename(dir));
    dir = up;
  }
  return path.join(fs.realpathSync(dir), ...rest);
}

// Builders keep scratch files in the system temp folder, where Claude's own
// scratchpad lives, so it is a second place a builder may write.
const TEMP_ROOTS = [...new Set([os.tmpdir(), '/tmp'].filter((dir) => fs.existsSync(dir)).map((dir) => fs.realpathSync(dir)))];

// The folder this Claude session opened UnifyApps Headless in, from the session registry:
// the same lookup the CLI uses. The hook's cwd is only where the session is
// now, and it moves (into .sessions/<id>/drafts, or to another folder when the
// desktop app moves the session), while a builder's report file and argsFile
// stay in the workspace's .sessions/<id>/batches folder.
function sessionWorkspace(sessionId) {
  try {
    const folder = readRegistry().sessions[String(sessionId ?? '')]?.cwd;
    return typeof folder === 'string' && path.isAbsolute(folder) && fs.existsSync(folder) ? fs.realpathSync(folder) : null;
  } catch { return null; }
}

// A code app's own manifest inside a checkout UnifyApps Headless downloaded
// (folder/code-checkout.mjs) is the app's source: it is pushed to Code Builder's
// engine and built there in its jail, not left here for a person to run later. Only
// package.json, only there, and never under another protected name such as
// node_modules.
function appManifestInCheckout(root, target, parts) {
  const protectedParts = parts.filter((part) => PROTECTED_LOWER.has(part.toLowerCase()));
  return protectedParts.length === 1 && parts.at(-1).toLowerCase() === 'package.json'
    && checkoutContaining(root, target) !== null;
}

// The design-capture agent of the UnifyApps Headless loops keeps its Figma captures in a shared
// cache under LOOPS_HOME, outside the working folder; only that one agent, and
// only that one folder, gets the extra root.
function agentWriteRoots(input) {
  if (String(input?.agent_type ?? '') !== 'ua:design-capture') return [];
  const loopsHome = path.resolve(process.env.LOOPS_HOME || path.join(UA_HOME, 'loops'));
  return [realTarget(path.join(loopsHome, 'figma-cache'))];
}

function writeDenyReason(input) {
  const cwd = input?.cwd, file = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || typeof file !== 'string' || !file) return WRITE_DENY;
  const target = realTarget(path.resolve(cwd, file));
  const workspace = sessionWorkspace(input.session_id);
  for (const root of [fs.realpathSync(cwd), ...(workspace ? [workspace] : []), ...TEMP_ROOTS, ...agentWriteRoots(input)]) {
    const relative = path.relative(root, target);
    if (!relative) return WRITE_DENY;
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
    const parts = relative.split(path.sep);
    if (!parts.some((part) => PROTECTED_LOWER.has(part.toLowerCase()))) return null;
    return appManifestInCheckout(root, target, parts) ? null : WRITE_DENY;
  }
  return WRITE_DENY;
}

// THE LINE FOR BUILDER BASH. Everything not listed here runs: reading,
// searching and writing files in the working folder or scratch folders, jq,
// python3, node, the plugin scripts, and network tools such as curl, which a
// builder uses to set up its own work. The original three rules were replayed
// against 218 Bash calls from real builder runs; together they refused 2, both
// an fde-agent listing the cookie folder to build its own tenant client outside
// MCP. The two private-folder sign-in rules were added without that replay.
// Add a rule here only after the same replay shows it stops no plugin work.
const SIGN_IN_DENY = 'UnifyApps Headless builder agents may not name a saved sign-in or a browser profile in a private browser folder; only the browser wrapper\'s state-load and state-save may name the test-user sign-in.';
const commandIs = (names) => new RegExp(`(^|[;&|(\`\\n]|\\$\\()\\s*(\\S*\\/)?(${names})(\\s|$)`, 'u');
const BASH_RULES = [
  [/(\.ssh\/|\.aws\/|\.gnupg|\.netrc|session\/cookies|security\s+(find-generic-password|find-internet-password|dump-keychain))/u, 'UnifyApps Headless builder agents may not touch sign-in secrets: SSH or cloud keys, the UnifyApps Headless cookie folder or the Keychain.'],
  [{ test: plantsCode }, WRITE_DENY],
  [{ test: namesTestSignIn }, SIGN_IN_DENY],
  [{ test: probesPrivateFolder }, SIGN_IN_DENY],
  // A job that outlives the run, or root.
  [commandIs('crontab|launchctl|sudo'), 'UnifyApps Headless builder agents may not schedule jobs or run as root.'],
  // The tenant tools are reached through the UnifyApps Headless bridge, which asks the
  // person before a delete. A script that sends to the tenant itself skips it.
  [/\b(?:tenant-fetch|tenant-mcp|solution-mcp|platform-call|ua-tenant|mcp-bridge|tool-calls)(?:\.mjs)?\b|\/llm-tools\/mcp\b/u, 'UnifyApps Headless builder agents reach the tenant only through their MCP tools, never by a script that sends to it.'],
];

// Finds a shell write whose target is a protected name: the word after `>`,
// `>>` or `tee`, or the last word of a cp, mv, ln, install or `sed -i` step.
function plantsCode(command) {
  for (const step of command.split(/[;&|\n]+/u)) {
    const targets = [...step.matchAll(/>>?\s*(\S+)/gu)].map((m) => m[1]);
    const words = step.trim().split(/\s+/u);
    if (/^(\S*\/)?(tee|cp|mv|ln|install)$/u.test(words[0]) || (words[0] === 'sed' && words.some((w) => w.startsWith('-i')))) targets.push(words.at(-1));
    const hit = (target) => target.replace(/["']/gu, '').split('/').some((part) => PROTECTED_LOWER.has(part.toLowerCase()));
    if (targets.some(hit)) return true;
  }
  return false;
}

// Two private 0700 folders in the system temp folder hold a live session: a
// test-author run's saved test-user sign-in and its helpers' browser profiles
// (`ua-test-author-<id>`), and the browser profile a builder's `open-page`
// signs in as the person (`ua-proof-browser-<key>`).
// This is a text match: it stops the plain ways to reach them, not a
// determined shell. The real protection is the private folder.
const PRIVATE_FOLDER = /(?:ua|nebula)-(?:test-author|proof-browser)-/u;
// The browser wrapper, and the discover loop's walk script, which runs several
// wrapper commands in one call and takes the same folder argument first.
const WRAPPER_TAILS = ['skills/app-verify/scripts/browser.mjs', 'loops/app-test-discover-loop/scripts/walk.mjs'];
const WRAPPER_TAIL = WRAPPER_TAILS[0];
const OWN_WRAPPER = path.resolve(import.meta.dirname, '..', WRAPPER_TAIL);
const WRAPPERS = new Set();
for (const tail of WRAPPER_TAILS) {
  const own = path.resolve(import.meta.dirname, '..', tail);
  for (const name of [`\${CLAUDE_PLUGIN_ROOT}/${tail}`, `$CLAUDE_PLUGIN_ROOT/${tail}`, own]) WRAPPERS.add(name);
  if (fs.existsSync(own)) WRAPPERS.add(fs.realpathSync(own));
  // The hook runs with the plugin root Claude Code gave it, which may be the
  // symlink the skills name rather than the folder Node resolved.
  if (process.env.CLAUDE_PLUGIN_ROOT) WRAPPERS.add(path.join(process.env.CLAUDE_PLUGIN_ROOT, tail));
}
// A folder or file argument: bare, "double" or 'single' quoted, with no
// expansion or glob character, so it names exactly the path it shows.
const ARG = String.raw`(?:[^\s"'$\x60*?\[\]{}]+|"[^"$\x60*?\[\]{}]*"|'[^'$\x60*?\[\]{}]*')`;
const WRAPPER_CALL = new RegExp(String.raw`^\s*(?:\w+=\S*\s+)*(?:node|/\S*/node)\s+("[^"]*"|'[^']*'|\S+)\s+(${ARG})(\s+.*)?$`, 'su');
const SIGN_IN_TAIL = new RegExp(String.raw`^\s+state-(?:load|save)\s+(${ARG})(?:\s+\d?>(?:&\d|\s*/dev/null))*\s*$`, 'u');
// One saved sign-in per test user, `sign-in-<user id>.json` (private-folder.mjs, signInName).
const SIGN_IN_NAME = /sign-in(?:-[\w-]+)?\.json/u;
const SIGN_IN_FILE = /(?:^|\/)sign-in-[\w-]+\.json$/u;
const unquote = (word) => word.replace(/^(["'])(.*)\1$/su, '$2');

// The `&` in `2>&1`, `>&2` or `&>` is a redirection, not a separator.
const steps = (command) => command.split(/&&|\|\||[;|\n]|(?<![<>])&(?!>)/u);

// Returns what follows the wrapper path when the step runs this plugin's
// browser wrapper, else null. Any other browser.mjs is not the wrapper.
function wrapperArgs(step) {
  const match = WRAPPER_CALL.exec(step);
  return match && isOwnWrapper(unquote(match[1])) ? { wrapper: match[1], rest: match[3] ?? '' } : null;
}

// Claude Code reaches the plugin through a symlinked folder: skills and
// `$CLAUDE_PLUGIN_ROOT` name the link, while Node resolves this file's own
// path to the real folder. A path that resolves to the wrapper is the wrapper;
// a copy of it elsewhere is not, since its imports would load other files.
function isOwnWrapper(file) {
  if (WRAPPERS.has(file)) return true;
  try {
    return path.isAbsolute(file) && WRAPPERS.has(fs.realpathSync(file));
  } catch {
    return false;
  }
}

function namesTestSignIn(command) {
  return steps(command).some((step) => {
    if (!SIGN_IN_NAME.test(step)) return false;
    const tail = SIGN_IN_TAIL.exec(wrapperArgs(step)?.rest ?? '');
    return !(tail && SIGN_IN_FILE.test(unquote(tail[1])));
  });
}

// Removes quoted text so the checks below see only what the shell expands.
function unquoted(step, keepDouble) {
  let out = '', quote = null;
  for (const ch of step) {
    if (quote) { if (ch === quote) quote = null; else if (keepDouble && quote === '"') out += ch; }
    else if (ch === '"' || ch === '\'') quote = ch;
    else out += ch;
  }
  return out;
}

// A glob or an expansion can spell the sign-in or a profile without naming it.
// A wrapper call's folder argument is literal (WRAPPER_CALL takes no other), and
// what follows it is the browser's work: an eval function held in a shell
// variable, a URL with a query, a find text. Those may carry `$`, `*` or `?`;
// they are a probe only when they reach into the private folder again. The
// code-app frame helper was refused for `JS='() => …'; node walk.mjs "<its
// folder>" eval "$JS"`, and left the header on four routes unread.
const PROFILE_IN_PRIVATE = /(?:ua|nebula)-(?:test-author|proof-browser)-[^\s"']*\/profile(\/|\b)/u;
const expands = (text) => /[*?]/u.test(unquoted(text, false)) || /\$\(|\$\{|\x60|\$[A-Za-z]/u.test(unquoted(text, true));
function probesPrivateFolder(command) {
  return steps(command).some((step) => {
    if (!PRIVATE_FOLDER.test(step)) return false;
    const wrapper = wrapperArgs(step);
    if (!wrapper) return PROFILE_IN_PRIVATE.test(step) || expands(step);
    const rest = wrapper.rest;
    if (!PRIVATE_FOLDER.test(rest)) return false;
    return PROFILE_IN_PRIVATE.test(rest) || expands(rest);
  });
}

const READ_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const PROFILE_PATH = /(?:ua|nebula)-(?:test-author|proof-browser)-[^/]*\/(?:.*\/)?profile(\/|$)/u;

// Glob only lists names, so it passes. Grep returns contents, so it may not
// search the private folder at all.
function readDenyReason(input) {
  const args = input?.tool_input ?? {};
  if (input.tool_name === 'Read') {
    const file = String(args.file_path ?? '');
    return SIGN_IN_NAME.test(file) || PROFILE_PATH.test(file) ? SIGN_IN_DENY : null;
  }
  if (input.tool_name === 'Grep') return [args.path, args.glob, args.pattern].some((value) => PRIVATE_FOLDER.test(String(value ?? ''))) ? SIGN_IN_DENY : null;
  return null;
}

// One folder holds a yes: the person's yes to a call that cannot be undone, in
// DELETE_YES_DIR, written only by the AskUserQuestion hook. It writes from its
// own process, so no tool call, the main session's included, has a reason to
// name it. This is a text match, like the rest of this guard: it stops the plain
// ways (a path, a `cd` into the folder, importing the code that writes them),
// not a determined shell that builds the name from pieces. So it matches only
// names no one's work would use. The folder was once `approvals`, and every
// command about an app's own Approvals page was refused (8 times in one build
// on 2026-10-09), because the plugin itself is installed in the same home.
const APPROVALS_DENY = 'Only the person\'s answer to the confirm question can approve a call that cannot be undone. Ask them with AskUserQuestion.';
const GATE_TEXT = [
  /ua-delete-yes/iu,
  /\bdelete-yes\.mjs\b/iu,
  /\b(?:addPendingDelete|approveDelete|dropDelete|takeDeleteYes|saveBrowserCheck)\b/u,
];
// The words that matched, so a refusal says what to take out instead of leaving
// a builder to guess which part of a long command or file tripped it.
const gateMatch = (text) => (text.includes(DELETE_YES_DIR) ? DELETE_YES_DIR : GATE_TEXT.map((rule) => rule.exec(text)?.[0]).find(Boolean) ?? null);
const gateDeny = (where, match) => `${APPROVALS_DENY} Refused because ${where} names "${match}".`;
function insideGateFiles(target) {
  let root = DELETE_YES_DIR;
  try { target = realTarget(target); root = realTarget(root); } catch { /* compare as given */ }
  const relative = path.relative(root, target);
  return !relative || !(relative.startsWith('..') || path.isAbsolute(relative));
}
// What a file tool would write: Write's content, Edit's new text, each of
// MultiEdit's edits.
const writtenText = (args) => [args.content, args.new_string, args.new_source, ...(Array.isArray(args.edits) ? args.edits.map((edit) => edit?.new_string) : [])]
  .filter((text) => typeof text === 'string').join('\n');
export function approvalsDenyReason(input) {
  const args = input?.tool_input ?? {};
  if (FILE_TOOLS.has(input?.tool_name)) {
    const file = args.file_path ?? args.notebook_path;
    if (typeof file !== 'string' || !file) return null;
    const cwd = typeof input.cwd === 'string' && path.isAbsolute(input.cwd) ? input.cwd : '/';
    if (insideGateFiles(path.resolve(cwd, file))) return `${APPROVALS_DENY} Refused because ${file} is the delete-yes folder.`;
    // A builder never writes code that names these files, so a script it
    // writes now to run later is refused too. The main session edits this
    // repository's own code, so the content check is a builder rule.
    const match = String(input?.agent_type ?? '').startsWith('ua:') ? gateMatch(writtenText(args)) : null;
    return match ? gateDeny('the text written', match) : null;
  }
  if (input?.tool_name !== 'Bash') return null;
  const match = gateMatch(String(args.command ?? ''));
  return match ? gateDeny('the command', match) : null;
}

/** Returns a deny reason for a builder's tool call, or null to let it through. */
export function denyReason(input) {
  const approvals = approvalsDenyReason(input);
  if (approvals) return approvals;
  const agent = String(input?.agent_type ?? '');
  if (!agent.startsWith('ua:')) return null;
  if (FILE_TOOLS.has(input?.tool_name)) return writeDenyReason(input);
  if (READ_TOOLS.has(input?.tool_name)) return readDenyReason(input);
  if (input?.tool_name !== 'Bash') return null;
  const command = String(input?.tool_input?.command ?? '');
  return BASH_RULES.find(([rule]) => rule.test(command))?.[1] ?? null;
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  let input = null, reason;
  try {
    input = JSON.parse(text);
    reason = denyReason(input);
  } catch {
    // Fail closed for a builder, open for everyone else: a broken guard must
    // never let a builder through, and must never block the person's own work.
    reason = /"agent_type"\s*:\s*"ua:/u.test(text) ? WRITE_DENY : null;
  }
  if (reason) { fs.writeSync(1, JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })); return; }
  // The loops' device pool guards its reserved simulators: argent's MCP
  // tools, and Bash commands that name argent. Nothing to load otherwise.
  const tool = String(input?.tool_name ?? '');
  if (tool.startsWith('mcp__argent__') || (tool === 'Bash' && /argent/u.test(String(input?.tool_input?.command ?? '')))) {
    try {
      const { deviceHook } = await import(new URL('../skills/native-loops/native-device-pool/scripts/plugin-hook.mjs', import.meta.url).href);
      const output = await deviceHook(tool === 'Bash' ? 'pretool-bash' : 'pre-tool', input);
      if (output) fs.writeSync(1, output);
    } catch { /* the pool guard is advice for the pool; it never blocks a session by failing */ }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
