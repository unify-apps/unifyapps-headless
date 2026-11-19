#!/usr/bin/env node
// Gemini CLI's SessionStart hook for UnifyApps Headless. Gemini fills in
// `${extensionPath}` only in its own manifest and hooks, so the skills'
// `${CLAUDE_PLUGIN_ROOT}` stays unset in its shell. This tells the model the
// plugin's folder, what the Claude Code names in the skills mean here, and
// whether an update is available or required.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentContext } from './lib/agent-context.mjs';
import { checkForUpdate, updateNotice } from './lib/update-check.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const geminiSessionContext = (pluginRoot = root, notice = null) => agentContext('gemini', pluginRoot, { notice });

const entry = process.argv[1] && path.resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) {
  const notice = updateNotice(await checkForUpdate({ agent: 'gemini' }).catch(() => null));
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: geminiSessionContext(root, notice) } })}\n`);
}
