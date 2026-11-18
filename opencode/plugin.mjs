// UnifyApps Headless for OpenCode. `setup.sh --opencode` writes a one-line
// loader into OpenCode's plugins folder that re-exports this module.
//
// Claude Code reads the plugin from its manifests and runs its hooks; OpenCode
// does neither, so this module does the same work through OpenCode's own hooks:
//
//   config                 the tenant MCP servers, the builder agents, the skill
//                          folders, a `/ua:<skill>` command per typed skill, and
//                          which agents may use which servers' tools
//   shell.env              CLAUDE_PLUGIN_ROOT, which every skill's commands name
//   tool.execute.after     the person's answer to a `question` goes to the same
//                          hook Claude Code's AskUserQuestion answer goes to, so
//                          a delete the bridge refused can be approved
//   chat.system.transform  the Claude tool names the skills use, in OpenCode's terms
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opencodeRegistration } from '../scripts/workspace/agent-targets.mjs';

const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const TOOL_NAMES = [
  'UnifyApps Headless skills were written for Claude Code. In this session:',
  '- AskUserQuestion means the `question` tool. When a tool refuses a delete with a confirm id such as (d_1a2b3c), ask with `question`, copy the question text the refusal gives word for word, and offer "Yes" and "No".',
  '- The Agent or Task tool, and `subagent_type`, mean the `task` tool with the builder agent of that name.',
  '- The Skill tool means the `skill` tool. A skill named `ua:<name>` is the skill `<name>`.',
  '- `mcp__plugin_ua_<server>__<tool>` is the tool `<server>_<tool>`.',
  '- The tenant tools a builder owns are given only to that builder. When a skill says to call one in the main session, brief the builder that owns it with the `task` tool instead.',
  '- ${CLAUDE_PLUGIN_ROOT} is set in every bash command; leave it as it is.',
].join('\n');

/** The person's answers as Claude Code's AskUserQuestion reports them:
 * { "<question text>": "<answer>" }. OpenCode's question tool returns one list
 * of chosen labels per question, in `metadata.answers`, and the same in its
 * text output, which is read when the metadata is missing. */
export function questionAnswers(args, output) {
  const questions = (args?.questions ?? []).map((item) => String(item?.question ?? ''));
  let answers = Array.isArray(output?.metadata?.answers) ? output.metadata.answers : null;
  if (!answers) {
    const pairs = new Map([...String(output?.output ?? '').matchAll(/"((?:[^"\\]|\\.)*)"="([^"]*)"/gu)].map((match) => [match[1], match[2]]));
    answers = questions.map((question) => (pairs.has(question) ? [pairs.get(question)] : []));
  }
  const result = {};
  questions.forEach((question, index) => {
    const chosen = answers[index];
    if (question && chosen?.length) result[question] = (Array.isArray(chosen) ? chosen : [chosen]).join(', ');
  });
  return Object.keys(result).length ? result : null;
}

function runClaudeHook(event) {
  spawnSync('bash', [path.join(PLUGIN_ROOT, 'scripts/run-node.sh'), path.join(PLUGIN_ROOT, 'scripts/hooks.mjs')], {
    input: JSON.stringify(event), stdio: ['pipe', 'ignore', 'ignore'], timeout: 10_000,
  });
}

export const UnifyAppsHeadless = async ({ directory } = {}) => {
  const registration = opencodeRegistration();
  return {
    // The person's own config wins over ours on every name both define.
    config: async (config) => {
      config.mcp = { ...registration.mcp, ...config.mcp };
      config.agent = { ...registration.agent, ...config.agent };
      config.command = { ...registration.command, ...config.command };
      // OpenCode applies the last rule that matches, so ours go after the person's
      // own, a catch-all "*" among them, and a key they set themselves stays theirs.
      const own = typeof config.permission === 'string' ? { '*': config.permission } : { ...config.permission };
      for (const [key, action] of Object.entries(registration.permission)) if (!(key in own)) own[key] = action;
      config.permission = own;
      const paths = config.skills?.paths ?? [];
      config.skills = { ...config.skills, paths: [...new Set([...paths, ...registration.skillPaths])] };
    },
    'shell.env': async (_input, output) => {
      output.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT;
    },
    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'question') return;
      const answers = questionAnswers(input.args, output);
      if (!answers) return;
      // A missed answer only means the bridge asks again, so a failure here is not raised.
      try {
        runClaudeHook({
          hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', session_id: input.sessionID,
          cwd: directory ?? process.cwd(), tool_response: { answers },
        });
      } catch { /* asked again on the next refusal */ }
    },
    'experimental.chat.system.transform': async (_input, output) => {
      output.system.push(TOOL_NAMES);
    },
  };
};
