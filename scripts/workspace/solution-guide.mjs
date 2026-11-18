/**
 * Writes the guide a solution folder's agent reads, between its markers only.
 *
 * The guide goes in `AGENTS.md`, which Claude Code, Codex, OpenCode and GitHub
 * Copilot all read, so one file serves every one of them.
 *
 * Claude Code reads `AGENTS.md` only when the folder has no `CLAUDE.md`. A
 * folder that already has one — the person's own notes, or a guide from an
 * earlier version — would otherwise never see the guide at all, so that case
 * gets a single line importing `AGENTS.md` instead of a second copy of it.
 * There is one guide either way.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFolderMap } from './folder-guide.mjs';
import { assertHome, atomicFile } from '../lib/session-paths.mjs';

const GUIDE_FILE = new URL('../../skills/setup/references/solution-guide.md', import.meta.url);
/** The file every supported agent reads. */
export const GUIDE_NAME = 'AGENTS.md';
export const GUIDE_END = '<!-- nebula:end -->';
/** What a folder's existing CLAUDE.md gets, so Claude Code loads the one guide. */
export const GUIDE_IMPORT = `@${GUIDE_NAME}`;
// CLAUDE_PLUGIN_ROOT is not set in a folder guide or in Bash, so the guide names the CLI by its
// absolute path. Every render rewrites the block, so a plugin update moves the path with it.
export const UA_CLI = fileURLToPath(new URL('../ua.mjs', import.meta.url));
export const UA_TOOL_CALLS = fileURLToPath(new URL('../tool-calls.mjs', import.meta.url));
export const UA_SKILLS = fileURLToPath(new URL('../../skills', import.meta.url));
const START_PATTERN_ALL = /<!-- nebula:start[^>]*-->/gu;
const END_PATTERN_ALL = /<!-- nebula:end -->/gu;

export function pluginVersion() {
  try { return String(JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? ''); }
  catch { return ''; }
}

export function guideBlock({ pluginVersion: version = pluginVersion() } = {}) {
  const text = fs.readFileSync(GUIDE_FILE, 'utf8').replace('{{FOLDER_MAP}}', renderFolderMap()).replaceAll('{{UA_CLI}}', UA_CLI)
    .replaceAll('{{UA_SKILLS}}', UA_SKILLS).replaceAll('{{UA_TOOL_CALLS}}', UA_TOOL_CALLS).trimEnd();
  return `<!-- nebula:start v${version} -->\n${text}\n${GUIDE_END}`;
}

/**
 * The file's next contents with `block` between the markers, or null when the
 * markers are in a state where replacing would cut the person's own text.
 * Everything outside the markers is theirs and is kept.
 */
function withBlock(current, block) {
  if (current === null || !current.trim()) return `${block}\n`;
  const starts = [...current.matchAll(START_PATTERN_ALL)];
  const ends = [...current.matchAll(END_PATTERN_ALL)];
  if (!starts.length && !ends.length) return `${current.replace(/\s*$/u, '')}\n\n${block}\n`;
  // Exactly one start followed by one end. Anything else would make a replace
  // cut the person's own text.
  const [start] = starts, [end] = ends;
  if (starts.length !== 1 || ends.length !== 1 || end.index < start.index) return null;
  return current.slice(0, start.index) + block + current.slice(end.index + GUIDE_END.length);
}

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

/** Returns true when a file was written. */
export function writeSolutionGuide(workspaceDir, { pluginVersion: version = pluginVersion() } = {}) {
  const home = assertHome(workspaceDir);
  const guideFile = path.join(home, GUIDE_NAME);
  const current = read(guideFile);
  const next = withBlock(current, guideBlock({ pluginVersion: version }));
  if (next === null) {
    process.stderr.write(`UnifyApps Headless did not update ${guideFile}: its nebula:start and nebula:end markers are missing, repeated or out of order.\n`);
    return false;
  }
  let wrote = false;
  if (next !== current) { atomicFile(guideFile, next); wrote = true; }

  // Claude Code falls back to AGENTS.md only when no CLAUDE.md exists, so a
  // folder that has one is pointed at the guide rather than given a copy.
  const claudeFile = path.join(home, 'CLAUDE.md');
  const claude = read(claudeFile);
  if (claude !== null && claude.trim() && !claude.includes(GUIDE_IMPORT)) {
    const pointer = withBlock(claude, `<!-- nebula:start v${version} -->\n${GUIDE_IMPORT}\n${GUIDE_END}`);
    if (pointer === null) {
      process.stderr.write(`UnifyApps Headless did not update ${claudeFile}: its nebula:start and nebula:end markers are missing, repeated or out of order. Claude Code will not read ${GUIDE_NAME} while a CLAUDE.md is present, so add the line ${GUIDE_IMPORT} to it by hand.\n`);
      return wrote;
    }
    if (pointer !== claude) { atomicFile(claudeFile, pointer); wrote = true; }
  }
  return wrote;
}
