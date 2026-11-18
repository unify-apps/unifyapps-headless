// A code app's branch, checked out in the working folder at <appId>/<branch>, so
// Claude reads, edits and builds the app with its own tools and the bridge sends
// what changed to Code Builder's engine as one patch.
//
// The folder is a git repository of its own with no remote. It never reaches Code
// Builder's repository: git here only keeps one record and writes diffs.
//
// HEAD is the engine's COMMITTED source as last known: the download (the engine
// serves a branch's commit, never its uncommitted files), moved forward to exactly
// what a push committed. Claude's whole change is the diff against it, and every push
// sends that whole change — the engine puts back whatever an earlier push saved
// before applying the next, so nothing here tracks what was sent.
//
// A pull replays Claude's change on top of the new commit. It is only what changed
// since the checkout's commit — one patch, applied to the copy as it was downloaded or
// pushed (`pullChanges`) — or, when the copy is not exactly that commit, the whole
// download again (`unpackCodebase`). Lines someone else changed too become conflict
// markers in the copy, for Claude to resolve before it pushes. The replay is a
// `git stash pop`, so in each conflict the side labelled `Updated upstream` is what
// others committed and the side labelled `Stashed changes` is Claude's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateArchiveEntries } from '../lib/archive-entries.mjs';

// Inside the checkout's own .git, so it is never part of a diff, and it is how the
// bridge and the tool guard tell a checkout from any other folder.
export const CHECKOUT_MARKER = 'nebula-code.json';
// What a local install and build leave behind, never part of a patch. The engine keeps
// the app's .gitignore to itself, so the download carries none; this is the local
// equivalent, kept in .git/info/exclude where no patch can reach it.
const LOCAL_ONLY = ['node_modules', '.bun-cache/', 'dist/', '.tscache/', '*.tsbuildinfo', '.preview-build/',
  '.deploy/', '.vite/', '*.log', '.env.local', '.env.*.local', '.DS_Store'];
// Where git puts a file it could not replay because a folder now stands in its place.
const STRAY = /~(?:Stashed changes|Updated upstream)$/u;
// How much of the other side's change an unmarked file carries in the pull's answer.
const THEIRS_LIMIT = 6000;
const STASH_NOTE = 'UnifyApps Headless: local changes, replayed on a pull';

// Inline on every call, never a config write: no identity of the person's, no hooks,
// no signing, no line-ending rewrites, the a/ and b/ prefixes the engine reads, and
// conflicts that show all three sides.
const GIT_CONFIG = ['-c', 'user.name=UnifyApps Headless', '-c', 'user.email=headless@localhost', '-c', 'commit.gpgsign=false',
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.autocrlf=false', '-c', 'diff.noprefix=false',
  '-c', 'diff.mnemonicPrefix=false', '-c', 'init.defaultBranch=engine', '-c', 'merge.conflictStyle=zdiff3'];
const MAX_OUTPUT = 64 * 1024 * 1024;

function git(folder, args, env = undefined) {
  const result = spawnSync('git', [...GIT_CONFIG, ...args], { cwd: folder, encoding: 'utf8', maxBuffer: MAX_OUTPUT, ...(env ? { env } : {}) });
  if (result.error) throw result.error;
  return result;
}

function gitOk(folder, args, what, env = undefined) {
  const result = git(folder, args, env);
  if (result.status !== 0) throw new Error(`git could not ${what} in ${folder}: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

const APP_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/u;

/**
 * Where a branch of an app is checked out: `<home>/<appId>/<branch>`, a branch named
 * with `/` becoming nested folders. `{ folder }`, or `{ problem }` for a name that
 * could leave the working folder or that git would not allow.
 */
export function checkoutFolder(home, appId, branch) {
  if (!APP_ID.test(String(appId ?? ''))) return { problem: `${JSON.stringify(appId)} is not an app id.` };
  const segments = String(branch ?? '').split('/');
  if (!segments.every((part) => SEGMENT.test(part) && !part.endsWith('.lock') && !part.includes('..'))) {
    return { problem: `${JSON.stringify(branch)} is not a branch name a checkout can be made for.` };
  }
  return { folder: path.join(home, appId, ...segments) };
}

/** The checkout's record, or null when `folder` is not a checkout UnifyApps Headless made. */
export function readCheckout(folder) {
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, '.git', CHECKOUT_MARKER), 'utf8'));
  } catch {
    return null;
  }
}

/** The checkout `file` sits in, looking up from it but no higher than `home`; null when none. */
export function checkoutContaining(home, file) {
  const root = path.resolve(home);
  for (let dir = path.dirname(path.resolve(file)); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
    if (readCheckout(dir)) return dir;
  }
  return null;
}

function writeRecord(folder, record) {
  fs.writeFileSync(path.join(folder, '.git', CHECKOUT_MARKER), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

const listed = (text) => text.split('\0').filter(Boolean);

/** Paths whose content in the copy differs from the engine's committed source. */
export function unsentChanges(folder) {
  gitOk(folder, ['add', '-A'], 'collect the changes');
  return gitOk(folder, ['diff', '--cached', '--name-only', '-z', '--no-renames', 'HEAD'], 'list the changes')
    .split('\0').filter(Boolean);
}

// Every file of the zip, checked before any is written: no path that leaves the
// folder, and no link or special file once unpacked.
function unpackZip(zip, into, run) {
  const listed = run('unzip', ['-Z1', zip], { encoding: 'utf8' });
  if (listed.error || listed.status !== 0) throw new Error(`the codebase could not be read: ${(listed.error?.message ?? listed.stderr ?? '').trim()}`);
  validateArchiveEntries(listed.stdout.split('\n').map((line) => line.trim()).filter(Boolean), 'The codebase');
  const unpacked = run('unzip', ['-q', zip, '-d', into], { encoding: 'utf8' });
  if (unpacked.error || unpacked.status !== 0) throw new Error(`the codebase could not be unpacked: ${(unpacked.error?.message ?? unpacked.stderr ?? '').trim()}`);
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir)) {
      const file = path.join(dir, entry);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory())) throw new Error(`the codebase holds a link or special file: ${path.relative(into, file)}`);
      if (stat.isDirectory()) visit(file);
    }
  };
  visit(into);
}

// Make the copy's tracked files the download's: a file the download no longer has is
// removed, every file it has is written. Ignored files — node_modules, a local build —
// stay where they are, so a pull does not cost a reinstall.
function replaceFiles(folder, from, tracked) {
  const incoming = new Set();
  const visit = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(dir, entry.name), relPath);
      else incoming.add(relPath);
    }
  };
  visit(from, '');
  for (const rel of tracked) {
    if (!incoming.has(rel)) fs.rmSync(path.join(folder, rel), { force: true });
  }
  for (const rel of incoming) {
    const target = path.join(folder, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(path.join(from, rel), target);
  }
}

/**
 * Unpack a branch's codebase — the zip `get_branch_codebase` answers with, base64 —
 * into its checkout. A new checkout starts from it. An existing one is pulled: the
 * download becomes its new base and Claude's changes are replayed on top, any
 * conflict left in the files. A folder UnifyApps Headless did not make is never written to.
 *
 * Returns `{ folder, files, head, pulled, upToDate, previousHead, conflicts, unmarked,
 * mergedBoth }` or `{ problem }`. `pulled` is true only when the download moved the
 * checkout to another commit; downloading the commit it is already at is `upToDate`.
 */
export function unpackCodebase(home, { appId, branch, head, archive }, { run = spawnSync } = {}) {
  const located = checkoutFolder(home, appId, branch);
  if (located.problem) return located;
  const { folder } = located;
  const shown = path.relative(home, folder);
  const existing = fs.existsSync(folder) ? readCheckout(folder) : null;
  if (!existing && fs.existsSync(folder) && fs.readdirSync(folder).length) {
    return { problem: `${shown} already holds files UnifyApps Headless did not download. Move them away, then download again.` };
  }
  // A second pull would stash the markers as Claude's change and lose the list.
  const open = existing ? unresolved(folder, existing) : [];
  if (open.length) {
    return { problem: `${open.join(', ')} in ${shown} still carry what the last pull could not merge. Resolve them first, then download again. Nothing was changed.` };
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-codebase-'));
  let aside = { localChanges: [], stashed: false };
  try {
    const zip = path.join(scratch, 'codebase.zip');
    fs.writeFileSync(zip, Buffer.from(String(archive ?? ''), 'base64'));
    const unpacked = path.join(scratch, 'files');
    fs.mkdirSync(unpacked);
    try {
      unpackZip(zip, unpacked, run);
    } catch (error) {
      return { problem: `${error.message}. Nothing in ${shown} was changed.` };
    }
    fs.mkdirSync(folder, { recursive: true });
    if (!existing) {
      gitOk(folder, ['init', '-q'], 'start the checkout');
      fs.mkdirSync(path.join(folder, '.git', 'info'), { recursive: true });
      fs.writeFileSync(path.join(folder, '.git', 'info', 'exclude'), `${LOCAL_ONLY.join('\n')}\n`);
    } else {
      aside = setAside(folder);
    }
    const tracked = existing
      ? gitOk(folder, ['ls-files', '-z'], 'list the files').split('\0').filter(Boolean)
      : [];
    replaceFiles(folder, unpacked, tracked);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return settle(folder, existing, { appId, branch, head }, aside, { downloadedAt: new Date().toISOString() });
}

// Claude's whole change since the copy's commit, set aside so the engine's newer
// source can be written into a copy that is exactly that commit.
function setAside(folder) {
  gitOk(folder, ['add', '-A'], 'collect the changes');
  const localChanges = listed(gitOk(folder, ['diff', '--cached', '--name-only', '-z', '--no-renames', 'HEAD'], 'list the changes'));
  if (!localChanges.length) return { localChanges, stashed: false };
  gitOk(folder, ['stash', 'push', '-q', '--include-untracked', '-m', STASH_NOTE], 'set the local changes aside');
  return { localChanges, stashed: true };
}

// The end of a download over a checkout and of a pull alike: what was written is
// recorded as the engine's `head`, Claude's change is replayed on top, and the answer
// says what the replay left.
function settle(folder, existing, { appId, branch, head }, { localChanges, stashed }, stamp) {
  gitOk(folder, ['add', '-A'], 'record the download');
  gitOk(folder, ['commit', '-q', '--allow-empty', '-m', `engine ${head ?? 'head unknown'}`], 'record the download');
  let replay = { conflicts: [], unmarked: [], mergedBoth: [] };
  if (stashed) {
    const theirs = listed(gitOk(folder, ['diff', '--name-only', '-z', '--no-renames', 'HEAD~1', 'HEAD'], 'list what others changed'));
    const popped = git(folder, ['stash', 'pop', '-q']);
    replay = replayed(folder, localChanges, theirs);
    if (popped.status !== 0 && !replay.conflicts.length && !replay.unmarked.length) {
      throw new Error(`git could not replay the local changes in ${folder}; they are kept in its stash: ${(popped.stderr || popped.stdout).trim()}`);
    }
  }
  writeRecord(folder, {
    appId, branch, head: head ?? null, previousHead: existing?.head ?? null, ...replay, ...stamp,
  });
  return answered(folder, existing, head, replay);
}

function answered(folder, existing, head, replay) {
  // the branch's committed files, not the index: a replayed deletion stays in the index
  const files = listed(gitOk(folder, ['ls-tree', '-r', '--name-only', '-z', 'HEAD'], 'count the files')).length;
  const moved = Boolean(existing) && (existing.head ?? null) !== (head ?? null);
  return { folder, files, head: head ?? null, pulled: moved, upToDate: Boolean(existing) && !moved,
    previousHead: existing?.head ?? null, ...replay };
}

/**
 * The commit a pull of this checkout can start from: the engine commit its base is
 * exactly, or null when a pull has to download the whole branch — no record, or a
 * push that landed on a head someone else had moved, so the base holds the copy but
 * not their files.
 */
export function pullBase(folder) {
  const record = readCheckout(folder);
  return record?.head && record.exact !== false ? record.head : null;
}

/**
 * Pull without downloading: apply `patch` — what changed on the branch from `since`
 * to `head`, as get_branch_codebase answers it with `since` — to the copy as it was
 * downloaded or pushed, record that as the engine's `head`, and replay Claude's
 * change on top, with the same conflicts a download over the checkout would leave.
 * Same answer as `unpackCodebase`, or `{ problem }` with nothing changed: the
 * checkout is not exactly `since`, the last pull's conflicts are still open, or the
 * patch does not fit — download the branch instead.
 */
export function pullChanges(home, { appId, branch, since, head, patch }) {
  const located = checkoutFolder(home, appId, branch);
  if (located.problem) return located;
  const { folder } = located;
  const shown = path.relative(home, folder);
  const existing = fs.existsSync(folder) ? readCheckout(folder) : null;
  if (!existing || !since || pullBase(folder) !== since) {
    return { problem: `${shown} is not exactly the commit ${since ?? '(none named)'}, so the pull cannot be applied to it. Nothing was changed.` };
  }
  const open = unresolved(folder, existing);
  if (open.length) {
    return { problem: `${open.join(', ')} in ${shown} still carry what the last pull could not merge. Resolve them first, then pull again. Nothing was changed.` };
  }
  if ((head ?? null) === existing.head) return answered(folder, existing, head, { conflicts: [], unmarked: [], mergedBoth: [] });
  const text = String(patch ?? '');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-pull-'));
  try {
    const file = path.join(scratch, 'pull.patch');
    fs.writeFileSync(file, text);
    if (text.trim()) {
      // checked against the copy's commit in an index of its own, before anything is set aside
      const env = { ...process.env, GIT_INDEX_FILE: path.join(scratch, 'index') };
      gitOk(folder, ['read-tree', 'HEAD'], 'read the commit', env);
      const fits = git(folder, ['apply', '--cached', '--check', '--whitespace=nowarn', file], env);
      if (fits.status !== 0) {
        return { problem: `the pull does not fit ${shown}'s commit (${(fits.stderr || fits.stdout).trim()}). Nothing was changed.` };
      }
    }
    const aside = setAside(folder);
    if (text.trim()) gitOk(folder, ['apply', '--index', '--whitespace=nowarn', file], 'apply the pull');
    return settle(folder, existing, { appId, branch, head }, aside, {
      downloadedAt: existing.downloadedAt ?? null, pulledAt: new Date().toISOString(),
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// The state a file is in, to tell later whether anyone touched it: its bytes' hash,
// or "absent".
function stateOf(folder, rel) {
  try {
    return createHash('sha256').update(fs.readFileSync(path.join(folder, rel))).digest('hex');
  } catch {
    return 'absent';
  }
}

// What the other side's commits did to one file, as a diff — the one thing an agent
// that may not run git cannot otherwise see. Cut to THEIRS_LIMIT, saying so.
function theirChange(folder, rel) {
  const result = git(folder, ['diff', '--no-renames', 'HEAD~1', 'HEAD', '--', rel]);
  const text = result.status === 0 ? result.stdout : '';
  if (!text.trim()) return '';
  return text.length > THEIRS_LIMIT
    ? `${text.slice(0, THEIRS_LIMIT)}\n[cut at ${THEIRS_LIMIT} of ${text.length} characters]`
    : text;
}

// What a replay left to Claude. `conflicts`: files carrying markers, whose side
// labelled `Updated upstream` is what others committed and whose side labelled
// `Stashed changes` is Claude's. `unmarked`: conflicts git leaves no marker for, each
// with what is now in the folder, the other side's change to it (`theirs`), and its
// state as the pull left it, so a push can tell whether anyone decided. `mergedBoth`:
// files both sides changed that git merged on its own — right as often as not, but
// nobody has looked at them.
function replayed(folder, mine, theirs) {
  const stages = new Map();
  for (const entry of listed(gitOk(folder, ['ls-files', '-u', '-z'], 'list the conflicts'))) {
    const [meta, rel] = entry.split('\t');
    if (!stages.has(rel)) stages.set(rel, new Set());
    stages.get(rel).add(meta.split(' ')[2]);
  }
  const conflicts = [];
  const unmarked = [];
  const stray = (rel) => ({ path: rel, what: `git could not put this file back where it was, because a folder or file of the other side now stands there. Move what you need from it into place, then delete ${rel}.` });
  for (const [rel, held] of stages) {
    if (STRAY.test(rel)) unmarked.push(stray(rel));
    else if (!held.has('3')) unmarked.push({ path: rel, what: 'You deleted it and someone else changed it, so it is back with their change, shown in `theirs`. Decide: keep the file with their change, or delete it again once whatever their change needs is carried somewhere it lives on — if you moved its content, into that new place.' });
    else if (!held.has('2')) unmarked.push({ path: rel, what: 'Someone else deleted it, as `theirs` shows, and you changed it, so your version is in the folder. Decide: delete it too if their deletion stands, or keep it if your change still needs it.' });
    else if (stillMarked(folder, [rel]).length) conflicts.push(rel);
    else unmarked.push({ path: rel, what: 'Both sides changed it and git could not merge it, so the folder holds the other side\'s version. Make your change on it again.' });
  }
  for (const rel of listed(gitOk(folder, ['ls-files', '-o', '--exclude-standard', '-z'], 'list new files'))) {
    if (STRAY.test(rel) && !stages.has(rel)) unmarked.push(stray(rel));
  }
  for (const item of unmarked) {
    const original = item.path.replace(STRAY, '');
    item.theirs = theirChange(folder, original);
    item.state = stateOf(folder, item.path);
  }
  const settled = new Set([...conflicts, ...unmarked.map((item) => item.path)]);
  const mergedBoth = mine.filter((rel) => theirs.includes(rel) && !settled.has(rel));
  return { conflicts, unmarked, mergedBoth };
}

// What a pull left in the folder that must not be pushed: a file still carrying
// markers, a file git set aside under a `~Stashed changes` name, and — for a push —
// an unmarked conflict still exactly as the pull left it, unless the push names it in
// `resolved`: leaving it as it is may be the decision, but it has to be one.
function unresolved(folder, record, { resolved = null } = {}) {
  const strays = (record.unmarked ?? []).map((item) => item.path).filter((rel) => STRAY.test(rel) && fs.existsSync(path.join(folder, rel)));
  const undecided = resolved === null ? [] : (record.unmarked ?? [])
    .filter((item) => !STRAY.test(item.path) && item.state && stateOf(folder, item.path) === item.state && !resolved.includes(item.path))
    .map((item) => item.path);
  return [...stillMarked(folder, record.conflicts ?? []), ...strays, ...undecided];
}

function stillMarked(folder, paths) {
  return paths.filter((rel) => {
    try {
      const text = fs.readFileSync(path.join(folder, rel), 'utf8');
      return text.includes('<<<<<<<') || text.includes('>>>>>>>');
    } catch {
      return false;
    }
  });
}

/**
 * Claude's whole change — the copy against the engine's committed source — as the
 * unified diff the engine's push takes: a/ and b/ prefixes, /dev/null for a new or
 * deleted file, binary files whole. `{ patch, paths, tree }` — `tree` is what was
 * diffed, for `markCommitted` — or `{ problem }` while a pull's conflict markers are
 * still in a file.
 */
export function localPatch(folder, { resolved = [] } = {}) {
  const record = readCheckout(folder) ?? {};
  const open = unresolved(folder, record, { resolved });
  if (open.length) {
    return { problem: `These files still carry what the last pull could not merge, or are exactly as the pull left them with nobody deciding: ${open.join(', ')}. `
      + 'Resolve each — the pull answer shows the other side\'s change for an unmarked file — build, then push. When leaving an unmarked file as it is IS your decision, name it in `resolved`.' };
  }
  const paths = unsentChanges(folder);
  const tree = gitOk(folder, ['write-tree'], 'record the copy').trim();
  if (!paths.length) return { patch: '', paths, tree };
  const patch = gitOk(folder, ['diff', '--cached', '--binary', '--full-index', '--no-renames', 'HEAD'], 'write the patch');
  return { patch, paths, tree };
}

/**
 * Record that the engine committed the copy as it was diffed (`tree` from localPatch)
 * as `commit`: that is now the committed source the next change is made against.
 * Edits made while the push was building stay in the copy as the next change.
 *
 * The copy is exactly `commit` only when the push landed on the copy's own commit
 * (`parent`, the push's answer). Landed on a head someone else had moved, `commit`
 * also holds their files, which the copy does not: it is recorded as not exact, and
 * the next pull downloads the whole branch rather than patching a copy that is not
 * the commit the patch starts from.
 */
export function markCommitted(folder, tree, commit, { parent = null } = {}) {
  const base = gitOk(folder, ['rev-parse', 'HEAD'], 'read the base').trim();
  const recorded = gitOk(folder, ['commit-tree', tree, '-p', base, '-m', `engine ${commit}`], 'record the commit').trim();
  gitOk(folder, ['update-ref', 'HEAD', recorded], 'record the commit');
  const record = readCheckout(folder) ?? {};
  const exact = Boolean(parent) && pullBase(folder) === parent;
  writeRecord(folder, { ...record, head: commit, exact, conflicts: [], unmarked: [], mergedBoth: [], committedAt: new Date().toISOString() });
}

// Where a code app keeps its storage bindings, under the tree root or under its app
// folder, and FETCH's id in them: the engine's own test for "provisioned"
// (agent-platform storage_datasources.storage_bindings_provisioned).
const BINDINGS_FILES = ['app/src/data/bindings.ts', 'src/data/bindings.ts'];
const FETCH_ID = /export\s+const\s+FETCH\s*=\s*\{[^{}]*?\bid\s*:\s*['"]([^'"]*)['"]/u;

/** The bindings file in the copy that already names a FETCH dataSource, or null. */
export function provisionedBindings(folder) {
  for (const file of BINDINGS_FILES) {
    let text;
    try { text = fs.readFileSync(path.join(folder, file), 'utf8'); } catch { continue; }
    if (FETCH_ID.exec(text)?.[1]) return file;
  }
  return null;
}

/**
 * Write the bindings file provisioning answered into the copy, at the tree-relative
 * `file` it named, so the next push carries it like any other change. `{ problem }`
 * for a path that is not a bindings file of this copy.
 */
export function writeBindings(folder, file, content) {
  if (!BINDINGS_FILES.includes(String(file))) return { problem: `${JSON.stringify(file)} is not where a code app keeps its bindings.` };
  const target = path.join(folder, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return { file };
}

// Where a code app keeps the bindings of the automations it calls, under the tree root
// or under its app folder: one block per automation between `>>> callable <id>`
// markers (agent-platform callable_bindings.py writes the same file).
const CALLABLES_FILES = ['app/src/data/callables.ts', 'src/data/callables.ts'];
const callableMarkers = (automationId) => [`// >>> callable ${automationId}`, `// <<< callable ${automationId}`];
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The callables file in the copy that already binds this automation, or null. */
export function boundCallable(folder, automationId) {
  const [open] = callableMarkers(automationId);
  for (const file of CALLABLES_FILES) {
    let text;
    try { text = fs.readFileSync(path.join(folder, file), 'utf8'); } catch { continue; }
    if (text.includes(open)) return file;
  }
  return null;
}

/**
 * Put the binding the engine answered into the copy's callables file at the
 * tree-relative `file`, so the next push carries it like any other change. A copy
 * with no such file takes `content`, the branch's committed file with the binding
 * added; one that has the file, perhaps with bindings not pushed yet, keeps them and
 * gets `block` in place of this automation's old block. `{ problem }` for a path that
 * is not a callables file of this copy.
 */
export function writeCallable(folder, file, { automationId, block, content }) {
  if (!CALLABLES_FILES.includes(String(file))) return { problem: `${JSON.stringify(file)} is not where a code app keeps its callables.` };
  const target = path.join(folder, file);
  let source = null;
  try { source = fs.readFileSync(target, 'utf8'); } catch { /* none yet */ }
  let next = content;
  if (source !== null) {
    const [open, close] = callableMarkers(automationId);
    const kept = source.replace(new RegExp(`\\n*${escapeRegExp(open)}[\\s\\S]*?${escapeRegExp(close)}\\n?`, 'u'), '\n');
    next = `${kept.replace(/\n+$/u, '')}\n\n${block}`;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, next);
  return { file };
}
