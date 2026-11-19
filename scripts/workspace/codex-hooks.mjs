/**
 * The plugin's hooks as Codex holds them, in Codex's own `config.toml`.
 *
 * Codex runs hooks — `codex features list` reports `hooks` as stable — and sends
 * a hook the same payload fields, takes the same `hookSpecificOutput` answer and
 * refuses the same way by exiting 2 as Claude Code does. So `scripts/codex-hooks.mjs`
 * reuses the plugin's own hook code unchanged, and only the registration is
 * written here. Three things about it are Codex's own, each measured on
 * codex-cli 0.170.0 rather than assumed:
 *
 *   * A plugin cannot carry hooks (`plugin_hooks` is reported as removed), and
 *     neither `$CODEX_HOME/hooks/hooks.json` nor a project's
 *     `.codex/hooks/hooks.json` is read: a hook written to either file never
 *     ran, even with `--dangerously-bypass-hook-trust`, while Codex still
 *     printed a `hook: SessionStart Completed` trace with no handler behind it.
 *     The registration Codex does read is `[[hooks.<Event>]]` in its own
 *     `config.toml`, so that is where this writes — the same home the builders
 *     go to (`codex-agents.mjs`).
 *   * Codex names a tool to a hook the way Claude Code does: a session's own
 *     shell call arrives as `tool_name: "Bash"` with `tool_input.command` a
 *     string, and a file written through the shell arrives the same way. So the
 *     matchers name the Claude tools, with `apply_patch` added for the edits
 *     that arrive under Codex's own name. A matcher naming only Codex's internal
 *     tool names matched nothing, and the guard then ran on no call at all while
 *     looking installed.
 *   * `Notification` has no Codex counterpart. `PermissionRequest` is the event
 *     raised when the session waits on the person, so the notification hangs
 *     there instead.
 *
 * Codex asks the person once to trust a hook's command before it runs it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** How an entry in that config is recognised as ours, so a person's own hooks are left alone. */
const HOOK_ENTRY = path.join('scripts', 'codex-hooks.mjs');
/** Where this plugin's block starts and ends inside Codex's `config.toml`. */
const HOOKS_START = '# >>> UnifyApps Headless hooks. Written by the installer; edits are replaced. >>>';
const HOOKS_END = '# <<< UnifyApps Headless hooks <<<';
/** The tool names `hooks/hooks.json` matches on Claude Code, plus Codex's own `apply_patch`. */
const GUARDED = 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|Read|Grep|Glob|Skill|Task|Agent|apply_patch|mcp__plugin_ua_.*|mcp__argent__.*';

export const codexConfigFile = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');

/**
 * The events this plugin acts on, and what each is for.
 *
 * `UserPromptSubmit`, `PostCompact`, `Stop`, `SessionEnd` and `SubagentStart`
 * are left out: each would start a process on every turn or every session for
 * behaviour the plugin does not have on Codex.
 */
export function codexHooks(pluginRoot) {
  const command = `bash "${path.join(pluginRoot, 'scripts', 'run-node.sh')}" "${path.join(pluginRoot, HOOK_ENTRY)}"`;
  const entry = (timeout) => ({ hooks: [{ type: 'command', command, timeout }] });
  const matched = (matcher, timeout) => ({ matcher, ...entry(timeout) });
  return {
    // The builder jail: every call that writes a file, runs a command or reaches
    // a tenant server passes through it.
    PreToolUse: [matched(GUARDED, 10)],
    // Only a plugin CLI call changes the local cache, and `hooks.mjs` narrows it
    // again to a Bash call that names the CLI.
    PostToolUse: [matched('Bash|PowerShell|apply_patch', 10)],
    // The solution sync waits for the refresh, so it gets the room it has on
    // Claude Code.
    SessionStart: [entry(30)],
    PreCompact: [entry(10)],
    PermissionRequest: [entry(10)],
    // How a Codex session learns a builder finished. Claude Code sends an agent
    // notification instead; Codex has none.
    SubagentStop: [entry(10)],
  };
}

/**
 * Those hooks as the TOML Codex reads.
 *
 * Only an event, a matcher, a command and a timeout are written, so the quoting
 * stays limited to strings with no newline — the same limit the MCP pointer
 * files keep.
 */
export function codexHooksToml(pluginRoot) {
  const quote = (value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
  const blocks = [];
  for (const [event, groups] of Object.entries(codexHooks(pluginRoot))) {
    for (const group of groups) {
      let block = `[[hooks.${event}]]\n`;
      if (group.matcher) block += `matcher = ${quote(group.matcher)}\n`;
      for (const hook of group.hooks) {
        block += `[[hooks.${event}.hooks]]\ntype = ${quote(hook.type)}\ncommand = ${quote(hook.command)}\ntimeout = ${hook.timeout}\n`;
      }
      blocks.push(block);
    }
  }
  return `${HOOKS_START}\n${blocks.join('\n')}${HOOKS_END}\n`;
}

/**
 * A person's `config.toml` with this plugin's block put in, replaced, or taken
 * out, and every other byte of it left as it was.
 *
 * The block is found between its markers rather than by rewriting the file from
 * parsed TOML: that config holds the person's own model, approvals, servers and
 * comments, and a round trip through a parser would reformat all of it. A file
 * whose end marker is missing — hand-edited — keeps its text, and the block is
 * added again below it, so nothing of theirs is cut away on a guess.
 */
export function configWithHooks(text, block) {
  const current = String(text ?? '');
  const start = current.indexOf(HOOKS_START);
  const end = current.indexOf(HOOKS_END);
  const without = start >= 0 && end > start
    ? `${current.slice(0, start)}${current.slice(end + HOOKS_END.length).replace(/^\n/u, '')}`
    : current;
  const tidy = without.replace(/\n{3,}$/u, '\n\n');
  if (!block) return tidy;
  const separator = tidy === '' || tidy.endsWith('\n\n') ? '' : tidy.endsWith('\n') ? '\n' : '\n\n';
  return `${tidy}${separator}${block}`;
}

const readConfig = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

/** Writes this plugin's hooks into Codex's config, keeping everything else in it. */
export function writeCodexHooks(pluginRoot, file = codexConfigFile()) {
  write(file, configWithHooks(readConfig(file), codexHooksToml(pluginRoot)));
  return file;
}

/** Takes this plugin's hooks back out, leaving the rest of the config in place. */
export function removeCodexHooks(file = codexConfigFile()) {
  if (!fs.existsSync(file)) return;
  write(file, configWithHooks(readConfig(file), null));
}
