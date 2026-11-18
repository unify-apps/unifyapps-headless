#!/usr/bin/env node
// Gemini CLI's SessionStart hook for UnifyApps Headless. Gemini fills in
// `${extensionPath}` only in its own manifest and hooks, so the skills'
// `${CLAUDE_PLUGIN_ROOT}` stays unset in its shell. This tells the model the
// plugin's folder and what the Claude Code names in the skills mean here.
// Gemini escapes angle brackets in hook context, so the text has none.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

export const geminiSessionContext = (pluginRoot = root) => [
  `UnifyApps Headless is installed in this Gemini CLI from ${pluginRoot}. Its skills were written for Claude Code. In this session:`,
  `- \${CLAUDE_PLUGIN_ROOT} and $CLAUDE_PLUGIN_ROOT in a skill mean ${pluginRoot}. The shell does not set it: write that path in their place in every command you run.`,
  `- A /ua:NAME command, the Skill tool, or a skill named ua:NAME means the UnifyApps Headless skill NAME. Read its SKILL.md in ${pluginRoot}/skills or ${pluginRoot}/loops (the command names the file) and follow it.`,
  `- AskUserQuestion means asking the person in chat and waiting for their answer.`,
  `- The Agent or Task tool with a builder (subagent_type) means doing that builder's work yourself: read ${pluginRoot}/agents/NAME.md and follow it. Gemini has no UnifyApps Headless builders.`,
  `- mcp__plugin_ua_SERVER__TOOL is the tool TOOL of the SERVER MCP server.`,
  `- A delete waits for the person: the tenant tool asks them through Gemini, and a refusal says so.`,
].join('\n');

const entry = process.argv[1] && path.resolve(process.argv[1]);
if (entry === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: geminiSessionContext() } })}\n`);
}
