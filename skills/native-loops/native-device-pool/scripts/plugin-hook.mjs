#!/usr/bin/env node
// The simulator-pool hooks as the UnifyApps Headless plugin runs them. `hooks/hooks.json`
// starts this file for SessionStart, SessionEnd, Stop and PostToolUse on argent's
// MCP tools, and `scripts/tool-guard.mjs` calls `deviceHook` for PreToolUse
// (argent's MCP tools and Bash commands that name argent), so Bash pays no
// second process. Without a pool every path returns at once, imports nothing
// heavy and writes nothing. A hook never fails a session: errors are swallowed.
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loopsHome } from './lib/home.mjs';

const EVENTS = new Set(['session-start', 'session-end', 'stop', 'pre-tool', 'post-tool', 'pretool-bash']);

function hasPool(home) {
  return existsSync(path.join(home, 'pool.json'));
}

/** Runs one hook event on the parsed hook input; returns the hook's stdout text, or null. */
export async function deviceHook(event, input, { env = process.env } = {}) {
  try {
    if (!EVENTS.has(event) || !input) return null;
    if (event === 'pretool-bash' && !/argent/.test(String(input.tool_input?.command ?? ''))) return null;
    // A pool is only ever made by `device-pool pool init`, so the move from the old
    // home has already happened by then; never migrate from a hook.
    const home = loopsHome({ env, migrate: false });
    // No pool yet (the first setup, a person driving argent by hand): nothing to guard, so an
    // argent MCP call is approved outright rather than asked every time.
    if (!hasPool(home)) {
      const approve = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } });
      if (event === 'pre-tool') return approve;
      if (event === 'pretool-bash') return (await import('./lib/hooks.mjs')).argentOnly(input.tool_input?.command) ? approve : null;
      return null;
    }
    const { readConfig } = await import('./lib/state.mjs');
    const { handleHook } = await import('./lib/hooks.mjs');
    return (await handleHook(event, input, { home, config: readConfig(home) })) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const event = process.argv[2];
  if (!EVENTS.has(event)) return;
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  let input;
  try { input = JSON.parse(text); } catch { return; }
  const output = await deviceHook(event, input);
  if (output) process.stdout.write(`${output}\n`);
}

// Compare real paths: Node resolves the main module through symlinks, argv[1] does not.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) await main().catch(() => {});
