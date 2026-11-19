// What the model in an agent other than Claude Code needs to know to follow
// skills written for Claude Code: the plugin's folder (the skills name it
// `${CLAUDE_PLUGIN_ROOT}`, which these agents' shells do not set) and what the
// Claude Code tool names in them mean here. Gemini CLI gets it from its
// SessionStart hook, Codex from the solution server's MCP instructions.
// No angle brackets: Gemini escapes them in hook context.

const BUILDERS = {
  gemini: (root) => `- The Agent or Task tool with a builder (subagent_type) means doing that builder's work yourself: read ${root}/agents/NAME.md and follow it. Gemini has no UnifyApps Headless builders.`,
  codex: (root) => `- The Agent or Task tool with a builder (subagent_type NAME) means spawning the Codex agent of that name with dashes as underscores (app-agent is app_agent). UnifyApps Headless writes them to ~/.codex/agents when it starts; a session that started before they existed does the work itself from ${root}/agents/NAME.md.`,
};

const COMMANDS = {
  gemini: (root) => `- A /ua:NAME command, the Skill tool, or a skill named ua:NAME means the UnifyApps Headless skill NAME. Read its SKILL.md in ${root}/skills or ${root}/loops (the command names the file) and follow it.`,
  codex: () => '- A /ua:NAME command, the Skill tool, or a skill named ua:NAME means the skill ua:NAME, which Codex lists as $ua:NAME.',
};

const TOOLS = {
  gemini: '- mcp__plugin_ua_SERVER__TOOL is the tool TOOL of the SERVER MCP server.',
  codex: '- mcp__plugin_ua_SERVER__TOOL is the tool mcp__SERVER__TOOL here.',
};

const NAMES = { gemini: 'Gemini CLI', codex: 'Codex' };

export function agentContext(agent, root, { notice = null } = {}) {
  return [
    `UnifyApps Headless is installed in this ${NAMES[agent]} from ${root}. Its skills were written for Claude Code. In this session:`,
    `- \${CLAUDE_PLUGIN_ROOT} and $CLAUDE_PLUGIN_ROOT in a skill mean ${root}. The shell does not set it: write that path in their place in every command you run.`,
    COMMANDS[agent](root),
    '- AskUserQuestion means asking the person in chat and waiting for their answer.',
    BUILDERS[agent](root),
    TOOLS[agent],
    `- A delete waits for the person: the tenant tool asks them through ${NAMES[agent]}, and a refusal says so.`,
    ...(notice ? [`- ${notice}`] : []),
  ].join('\n');
}
