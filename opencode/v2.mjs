// UnifyApps Headless for OpenCode 2: the same work `plugin.mjs` does on
// OpenCode 1, through OpenCode 2's plugin API (`@opencode/plugin`). OpenCode 2
// has no config hook; a plugin edits each part of OpenCode on its own:
//
//   mcp.transform            the tenant MCP servers
//   agent.transform          the builder agents, and which agents may use
//                            which servers' tools
//   skill.transform          every skill
//   command.transform        a `/ua:<skill>` command per typed skill
//   permission "evaluate"    holds builder-owned servers to their builders
//                            where an agent's own rules would let them through
//   shell "create.before"    CLAUDE_PLUGIN_ROOT, which every skill's commands name
//   tool "execute.after"     the person's answer to a `question` goes to the same
//                            hook Claude Code's AskUserQuestion answer goes to, so
//                            a delete the bridge refused can be approved
//   session "context"        the Claude tool names the skills use, in OpenCode's terms
//
// OpenCode 2 runs a plugin's transforms after its built-in agents and the
// person's own MCP servers are in place, and before the person's own agents,
// commands, skills and permission rules are applied over them. So the person's
// own entries win on every name both define: a server they named is left
// alone here, and the rest of their config lands on top of what this adds.
import { opencodeRegistration } from '../scripts/workspace/agent-targets.mjs';
import { PLUGIN_ROOT, questionAnswers, runClaudeHook, toolNames } from './plugin.mjs';
import { checkForUpdate, updateNotice } from '../scripts/lib/update-check.mjs';

const TOOL_NAMES = toolNames({ subagent: 'subagent', shell: 'shell', codeMode: true });

/** OpenCode's wildcard: `*` stands for any run of characters. */
const wildcard = (pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')}$`, 'u');

/** The text of a tool result's content, which is a string or a list of parts. */
const contentText = (content) => (typeof content === 'string'
  ? content
  : (Array.isArray(content) ? content : []).filter((part) => part?.type === 'text').map((part) => part.text).join('\n'));

/** The command text for a `/ua:<skill>` command: OpenCode 1's template with
 * `$ARGUMENTS` replaced by what the person typed after the command. */
const commandText = (template, input) => template.replaceAll('$ARGUMENTS', input ?? '').trim();

export async function setup(ctx) {
  const registration = opencodeRegistration();
  const builders = new Map(Object.entries(registration.agent));
  // Each builder-owned server, denied to every agent but its builders, as in
  // OpenCode 1. A denied tool is left out of the agent's tool list and its Code
  // Mode catalog altogether, which keeps the main session's prompt small.
  const denied = Object.entries(registration.permission).map(([action, effect]) => ({ action, resource: '*', effect }));
  const owned = denied.map((rule) => wildcard(rule.action));
  const grants = new Map([...builders].map(([id, entry]) => [id, Object.keys(entry.permission).map(wildcard)]));

  await ctx.mcp.transform((editor) => {
    for (const [name, server] of Object.entries(registration.mcp)) if (!editor.get(name)) editor.set(name, server);
  });

  await ctx.agent.transform((editor) => {
    for (const agent of editor.list()) if (!builders.has(agent.id)) agent.permissions.push(...denied);
    for (const [id, entry] of builders) {
      if (editor.get(id)) continue;
      editor.update(id, (agent) => {
        agent.name = id;
        agent.description = entry.description;
        agent.mode = entry.mode;
        agent.system = entry.prompt;
        agent.permissions.push(...denied, ...Object.entries(entry.permission).map(([action, effect]) => ({ action, resource: '*', effect })));
      });
    }
  });

  await ctx.skill.transform((editor) => {
    for (const skill of registration.skills) if (!editor.get(skill.id)) editor.add(skill);
  });

  await ctx.command.transform((editor) => {
    for (const [name, command] of Object.entries(registration.command)) {
      editor.add({
        name,
        description: command.description,
        execute: async ({ sessionID, prompt, delivery }) => {
          await ctx.session.prompt({ ...prompt, sessionID, text: commandText(command.template, prompt?.text), delivery });
        },
      });
    }
  });

  // An agent that was not there when the deny rules went in, or whose later
  // rules (the person's catch-all `*` among them) allow everything, still may
  // not call a builder's tools. A rule naming the server or tool itself is the
  // person's own choice and is kept.
  await ctx.permission.hook('evaluate', async (event) => {
    if (event.effect === 'deny' || !owned.some((pattern) => pattern.test(event.action))) return;
    if (event.agent && grants.get(event.agent)?.some((pattern) => pattern.test(event.action))) return;
    if (event.agent && await namedByAgent(ctx, event.agent, event.action)) return;
    event.effect = 'deny';
    event.message = `${event.action} belongs to a UnifyApps Headless builder. Brief the builder that owns it with the subagent tool.`;
  });

  await ctx.shell.hook('create.before', (event) => {
    event.env.CLAUDE_PLUGIN_ROOT = PLUGIN_ROOT;
  });

  await ctx.tool.hook('execute.after', (event) => {
    if (event.tool !== 'question' || event.status !== 'completed') return;
    const listed = event.result?.metadata?.answers ?? event.result?.output?.answers;
    const answers = questionAnswers(event.input, { metadata: { answers: listed }, output: contentText(event.result?.content) });
    if (!answers) return;
    // A missed answer only means the bridge asks again, so a failure here is not raised.
    try {
      runClaudeHook({
        hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', session_id: event.sessionID,
        cwd: ctx.location?.directory ?? process.cwd(), tool_response: { answers },
      });
    } catch { /* asked again on the next refusal */ }
  });

  // Asked once, without holding up the start; the first turns after it lands carry it.
  let notice = null;
  checkForUpdate({ agent: 'opencode' }).then((result) => { notice = updateNotice(result); }, () => {});
  await ctx.session.hook('context', (event) => {
    event.system.push({ type: 'text', text: notice ? `${TOOL_NAMES}\n${notice}` : TOOL_NAMES });
  });
}

/** Whether the agent's own last rule for this action names it, rather than
 * matching it through a catch-all `*`. */
async function namedByAgent(ctx, agentID, action) {
  try {
    const { data } = await ctx.agent.get({ agentID });
    const rule = (data?.permissions ?? []).findLast((item) => wildcard(item.action).test(action));
    return Boolean(rule && rule.action !== '*' && rule.effect !== 'deny');
  } catch {
    return false;
  }
}
