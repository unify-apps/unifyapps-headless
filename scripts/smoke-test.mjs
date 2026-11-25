#!/usr/bin/env node
// `npm test`. Checks the plugin loads and its entry points answer, without a
// tenant, a sign-in or a network call.
//
// Every check here catches a class of breakage that reading the code does not:
// a module that parses but imports something deleted, a hook that throws on an
// empty event, a CLI that cannot print its own help, a manifest the plugin
// loader will not accept.
//
//   node scripts/smoke-test.mjs
//
// Exits 0 when every check passed, 1 on the first failure class, 2 on usage.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (process.argv.length > 2) {
  process.stderr.write('Usage: node scripts/smoke-test.mjs\n');
  process.exit(2);
}

// No check here downloads release.json; the ones about updates name their own file.
process.env.UA_NO_UPDATE_CHECK ??= '1';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? `\n        ${detail}` : ''}\n`);
};

/** The files git tracks, or null outside a checkout. The suite ships with the
 * plugin, so it also runs from an installed copy, which has no git. */
function trackedFiles(...patterns) {
  try {
    return execFileSync('git', ['ls-files', ...patterns], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean);
  } catch { return null; }
}

/** Everything under the plugin, for when git cannot answer. */
function walk(dir, into = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(relative, into);
    else into.push(relative);
  }
  return into;
}

const allFiles = () => trackedFiles() ?? walk('.').map((file) => file.replace(/^\.\//u, ''));

/** Every .mjs and .js file, so a deleted import shows up as a parse or load
 * error. A loop's `workflows/` scripts are skipped: they are orchestration
 * scripts run by their host with a top-level `return`, which no module parser
 * accepts. */
function sourceFiles() {
  return allFiles().filter((file) => /\.(?:mjs|js)$/u.test(file)).filter((file) => !file.includes('/workflows/'));
}

// 1. Every source file parses. A syntax error here reaches users as a skill
// that silently does nothing.
let parsed = 0;
const unparsed = [];
for (const file of sourceFiles()) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (check.status === 0) parsed++;
  else unparsed.push(`${file}: ${(check.stderr || '').split('\n').find((line) => line.includes('Error')) ?? 'parse failed'}`);
}
record(`${parsed} source files parse`, unparsed.length === 0, unparsed.slice(0, 5).join('\n        '));

// 2. The hooks answer an empty event. They run on every session start and
// before every tool call, so a dead import stops the plugin outright; a parse
// check cannot see it, because an import only resolves when the file is loaded.
for (const script of ['hooks.mjs', 'tool-guard.mjs']) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { input: '{}', encoding: 'utf8', timeout: 30_000 });
  const failed = run.status !== 0 || /ERR_MODULE_NOT_FOUND|Cannot find module/u.test(run.stderr ?? '');
  record(`scripts/${script} runs`, !failed, (run.stderr ?? '').split('\n').slice(0, 3).join(' '));
}

// 3. The CLI prints its own help. This loads the command table and every
// module it names.
const help = spawnSync(process.execPath, [path.join(root, 'scripts', 'ua.mjs'), '--help'], { encoding: 'utf8', timeout: 30_000 });
record('scripts/ua.mjs --help answers', help.status === 0 && /solution/u.test(help.stdout ?? ''), (help.stderr ?? '').split('\n').slice(0, 3).join(' '));

// 4. The manifests are valid JSON and name what they must. `claude plugin
// validate` is the real check and runs in CI, where the CLI is installed; this
// keeps the suite useful on a machine without it.
for (const file of ['.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', '.mcp.json', 'hooks/hooks.json', 'package.json']) {
  let ok = false, detail = '';
  try { JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); ok = true; }
  catch (error) { detail = error.message; }
  record(`${file} is valid JSON`, ok, detail);
}

// 5. Every MCP server the manifest declares points at a file that exists, and
// every hook command names a script that exists. A renamed script otherwise
// fails only when a person first uses that server.
const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8'));
const missingTargets = [];
for (const [name, server] of Object.entries(mcp.mcpServers ?? {})) {
  const named = JSON.stringify(server.args ?? []);
  for (const match of named.matchAll(/scripts\/[\w./-]+?\.(?:mjs|sh)/gu)) {
    if (!fs.existsSync(path.join(root, match[0]))) missingTargets.push(`${name} -> ${match[0]}`);
  }
}
const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8'));
for (const [event, groups] of Object.entries(hooks.hooks ?? {})) {
  for (const group of groups) {
    for (const hook of group.hooks ?? []) {
      for (const match of String(hook.command ?? '').matchAll(/(?:scripts|skills)\/[\w./-]+?\.(?:mjs|sh)/gu)) {
        if (!fs.existsSync(path.join(root, match[0]))) missingTargets.push(`${event} -> ${match[0]}`);
      }
    }
  }
}
record('every declared MCP server and hook target exists', missingTargets.length === 0, missingTargets.join('\n        '));

// 6. Every skill folder the plugin manifest lists has a readable SKILL.md with
// the two fields the Agent Skills format requires, and a name that matches its
// folder. A skill short of either is skipped silently at load time.
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
const badSkills = [];
let skillCount = 0;
for (const folder of manifest.skills ?? []) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) { badSkills.push(`${folder}: folder in plugin.json does not exist`); continue; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    skillCount++;
    const front = /^---\n([\s\S]*?)\n---/u.exec(fs.readFileSync(skillFile, 'utf8'));
    if (!front) { badSkills.push(`${entry.name}: no frontmatter`); continue; }
    const name = /^name:\s*(.+)$/mu.exec(front[1])?.[1]?.trim();
    if (!name) badSkills.push(`${entry.name}: no name`);
    else if (name !== entry.name) badSkills.push(`${entry.name}: name is "${name}"`);
    const description = /^description:\s*(.+)$/mu.exec(front[1])?.[1]?.trim();
    if (!description) badSkills.push(`${entry.name}: no description`);
    // A plain YAML scalar ends at a colon followed by a space, so an unquoted
    // description holding one is not valid YAML. Claude Code reads it anyway;
    // Copilot CLI drops the whole skill, and the model never learns it exists.
    else if (!/^["']/u.test(description) && description.includes(': ')) badSkills.push(`${entry.name}: the description holds ": " and is not quoted`);
  }
}
record(`${skillCount} skills have a valid SKILL.md`, badSkills.length === 0, badSkills.slice(0, 8).join('\n        '));

// 7. Nothing left behind by the internal build. These names belong to code that
// is not part of this plugin, so a reference to one is a stale instruction an
// agent would try to follow.
const forbidden = ['mcp-telemetry', 'client-metadata', 'x-ua-device-serial-number', 'x-ua-ai-client-email', 'UA_TELEMETRY'];
const stale = [];
for (const file of allFiles()) {
  // This check's own list names the removed code on purpose.
  if (file === 'scripts/smoke-test.mjs') continue;
  let text;
  try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
  for (const word of forbidden) if (text.includes(word)) stale.push(`${file}: ${word}`);
}
record('no references to removed internal code', stale.length === 0, stale.slice(0, 10).join('\n        '));

// 8. The delete gate opens for one answer and no other. A call that cannot be
// undone is refused unless the person said yes, so each way of not saying yes
// is checked by name: a client that cannot be asked, one that says no, one that
// cancels, one that breaks, and one that never answers.
try {
  const { createBridge } = await import(new URL('./mcp-bridge.mjs', import.meta.url));
  const context = () => ({ tenant: 'example.uat.unifyapps.com', url: 'https://example.uat.unifyapps.com/llm-tools/mcp',
    cookie: 'smoke-test', home: '/tmp/nowhere', tenantOnly: false, client: {}, identity: { version: '0.0.0' } });
  const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_object', arguments: { objectId: 'e_throwaway' } } };
  const outcomeWith = async (answer) => {
    const bridge = createBridge('/mcp/object', {
      context,
      // The gate refuses before anything is sent, so reaching this is the failure.
      request: async () => { throw new Error('SENT TO THE TENANT'); },
      elicit: answer === null ? null : async () => answer,
      // Every outward call is stubbed, so this reaches the gate and nothing
      // else. `identify` is the sign-in read the bridge makes before it looks
      // at the arguments; left real it would try the network and throw first,
      // and the gate below would never be reached at all.
      identify: async () => ({ email: 'smoke@example.invalid', id: 0, name: 'smoke' }),
      verifySignIn: async () => ({ ok: true }),
    });
    try { return JSON.stringify(await bridge(call)); } catch (error) { return `THREW: ${error.message}`; }
  };
  // A refusal is the gate's own answer and nothing else. An error — the bridge
  // failing for an unrelated reason — is not a refusal: counting it as one once
  // let this whole check pass while the gate was never reached.
  const refused = (text) => !text.startsWith('THREW:') && (text.includes('CONFIRM_REQUIRED') || text.includes('CONFIRM_DECLINED'));
  const wrong = [];
  for (const answer of [null, 'decline', 'cancel', 'failed', 'timeout']) {
    const text = await outcomeWith(answer);
    if (!refused(text)) wrong.push(`${answer ?? 'cannot be asked'}: expected a refusal, got ${text.slice(0, 120)}`);
  }
  // A yes must let the call through to the tenant, which the stub above marks
  // by throwing. Anything else means the gate stayed shut on an approved call.
  const accepted = await outcomeWith('accept');
  if (!accepted.includes('SENT TO THE TENANT')) wrong.push(`accept: a yes did not open the gate, got ${accepted.slice(0, 120)}`);
  record('a delete waits for the person, and only a yes lets it through', wrong.length === 0, wrong.join('\n        '));
} catch (error) {
  record('a delete waits for the person, and only a yes lets it through', false, error.message);
}

// 8b. A tool call sends the tenant the call and nothing about the person or the
// machine, and nothing else at all. Every request the process makes is caught:
// the bridge's own `request` and the global fetch a side channel would use. The
// context carries a serial and an AI-client email, in its identity and in its
// headers, the way an older session's state or a hand-built context could, so a
// bridge that still forwarded either would fail here.
{
  const name = 'a tool call carries no device or AI-account header and sends no telemetry';
  const sent = [];
  const realFetch = globalThis.fetch;
  const answer = (url, init = {}) => {
    sent.push({ url: String(url), headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), String(value)])) });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: '{"ok":true}' }] } }),
      { headers: { 'content-type': 'application/json' } });
  };
  globalThis.fetch = async (url, init) => answer(url, init);
  try {
    const { createBridge } = await import(new URL('./mcp-bridge.mjs', import.meta.url));
    const bridge = createBridge('/mcp/object', {
      context: () => ({ tenant: 'example.uat.unifyapps.com', url: 'https://example.uat.unifyapps.com/llm-tools',
        cookie: 'smoke-test', home: null, tenantOnly: false,
        identity: { version: '0.0.0', sessionId: 'smoke-session', deviceSerialNumber: 'SMOKESERIAL1', claudeCodeEmail: 'ai@example.invalid' },
        client: { 'x-ua-device-serial-number': 'SMOKESERIAL1', 'x-ua-ai-client-email': 'ai@example.invalid' } }),
      request: async (url, init) => answer(url, init),
      identify: async () => ({ email: 'smoke@example.invalid', id: 0, name: 'smoke' }),
      verifySignIn: async () => ({ ok: true }),
    });
    const replies = await bridge({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_objects', arguments: {} } });
    // A side channel may send after the answer; give it a moment to show itself.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const problems = [];
    if (replies?.[0]?.result?.content?.[0]?.text !== '{"ok":true}') problems.push(`the call was not answered: ${JSON.stringify(replies).slice(0, 120)}`);
    if (!sent.some((request) => request.url.includes('/llm-tools/mcp/object'))) problems.push('the call never reached the tenant');
    for (const request of sent) {
      const url = new URL(request.url);
      if (url.pathname !== '/llm-tools/mcp/object') problems.push(`a request went to ${url.pathname}`);
      for (const header of ['x-ua-device-serial-number', 'x-ua-ai-client-email', 'x-ua-user-email', 'x-ua-record-usage']) {
        if (header in request.headers) problems.push(`${url.pathname} carried ${header}`);
      }
      const all = JSON.stringify(request.headers);
      if (all.includes('SMOKESERIAL1') || all.includes('ai@example.invalid') || all.includes('smoke@example.invalid')) problems.push(`${url.pathname} carried an identity value`);
    }
    if (sent.some((request) => request.url.includes('/api/workflow/trigger'))) problems.push('a request went to /api/workflow/trigger');
    record(name, problems.length === 0, problems.join('\n        '));
  } catch (error) {
    record(name, false, error.message);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 9. Every builder is written out for the other agents, and each one keeps its
// name, its description and the rule that holds it to its own tools. A builder
// that lost any of those would still load and would then work outside its job.
try {
  const targets = await import(new URL('./folder/agent-targets.mjs', import.meta.url));
  const dir = path.join(root, 'agents');
  const problems = [];
  let count = 0;
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
    const agent = targets.parseAgent(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!agent) { problems.push(`${file}: no frontmatter this can read`); continue; }
    count++;
    const wantsServers = agent.tools.some((tool) => tool.startsWith('mcp__plugin_ua_'));
    for (const [label, text] of [['codex', targets.codexAgent(agent)], ['opencode', targets.opencodeAgent(agent)], ['copilot', targets.copilotAgent(agent)]]) {
      if (!text.includes(agent.description.slice(0, 40))) problems.push(`${agent.name} (${label}): lost its description`);
      if (!text.includes(agent.body.slice(0, 60))) problems.push(`${agent.name} (${label}): lost its instructions`);
      // A builder given tenant servers must carry the rule naming them; one
      // given none has nothing to be held to.
      if (wantsServers && !text.includes('and no other')) problems.push(`${agent.name} (${label}): no tool rule`);
      // Only the rule's own sentence, because a repeat in it means a server
      // was listed twice; the same words in prose are just prose.
      const rule = /Your job needs the (.+?) MCP server/u.exec(text)?.[1] ?? '';
      const named = rule.split(/,| and /u).map((part) => part.trim()).filter(Boolean);
      if (named.length !== new Set(named).size) problems.push(`${agent.name} (${label}): a server is named twice`);
    }
  }
  record(`${count} builders are written out for Codex, OpenCode and Copilot`, problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('builders are written out for Codex, OpenCode and Copilot', false, error.message);
}

// 10. The OpenCode plugin gives OpenCode what Claude Code reads from the
// manifests: every tenant server, every builder, every skill folder, a
// /ua:<name> command per typed skill, and the plugin root in every shell. The
// person's own config wins on a name both define. OpenCode 1 runs the package
// entry's `server` and takes the hooks it returns.
const opencodeEntry = pathToFileURL(path.join(root, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).main)).href;
const opencodeServers = Object.keys(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers).filter((name) => name !== 'playwright');
const opencodeBuilders = fs.readdirSync(path.join(root, 'agents')).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3));
/** OpenCode's wildcard match: `*` stands for any run of characters. */
const wildcardMatch = (pattern, value) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')}$`, 'u').test(value);
try {
  const plugin = (await import(opencodeEntry)).default;
  const problems = [];
  // OpenCode 2 refuses a module whose default export has no id and setup;
  // OpenCode 1 takes a default export with server().
  if (typeof plugin?.id !== 'string' || !plugin.id) problems.push('the package entry\'s default export has no id');
  if (typeof plugin?.setup !== 'function') problems.push('the package entry\'s default export has no setup for OpenCode 2');
  if (typeof plugin?.server !== 'function') problems.push('the package entry\'s default export has no server for OpenCode 1');
  const exported = Object.keys(await import(opencodeEntry));
  if (exported.join() !== 'default') problems.push(`the package entry exports ${exported.join(', ')}, not the default alone`);
  const hooks = await plugin.server({ directory: root });
  const config = { mcp: { object: { type: 'local', command: ['mine'] } }, permission: { '*': 'allow', 'solution_*': 'ask' } };
  await hooks.config(config);
  for (const name of opencodeServers) if (!config.mcp[name]) problems.push(`server ${name} missing`);
  if (config.mcp.object.command[0] !== 'mine') problems.push('the person\'s own server was replaced');
  for (const [name, server] of Object.entries(config.mcp)) {
    if (name !== 'object' && !server.command.slice(1).every((part) => part.startsWith('/mcp/') || fs.existsSync(part))) problems.push(`server ${name} names a file that does not exist`);
  }
  for (const name of opencodeBuilders) if (config.agent?.[name]?.mode !== 'subagent') problems.push(`builder ${name} missing`);
  if (!config.command?.['ua:setup']?.template?.includes('`setup` skill')) problems.push('no /ua:setup command');
  if (config.command?.['ua:loop-orchestrator']) problems.push('a skill marked user-invocable: false became a command');
  if (Object.values(config.command ?? {}).some((command) => /^["']/u.test(command.description))) problems.push('a command description keeps its YAML quotes');
  if (!config.skills?.paths?.length || !config.skills.paths.every((dir) => fs.existsSync(dir))) problems.push('skill folders missing');
  // OpenCode applies the last rule whose key matches, the agent's after the config's.
  const allowed = (agent, tool) => {
    const rules = [...Object.entries(config.permission), ...Object.entries(config.agent?.[agent]?.permission ?? {})];
    return rules.findLast(([key]) => wildcardMatch(key, tool))?.[1];
  };
  for (const [agent, tool, want] of [
    [null, 'object_get_objects', 'deny'], [null, 'application-builder_get_page', 'deny'], [null, 'solution_get_solution', 'ask'],
    ['app-agent', 'application-builder_get_page', 'allow'], ['app-agent', 'object_get_objects', 'allow'], ['app-agent', 'api-gateway_get_api', 'deny'],
    ['fde-agent', 'application-builder_get_user_details', 'allow'], ['fde-agent', 'application-builder_get_page', 'deny'],
  ]) if (allowed(agent, tool) !== want) problems.push(`${agent ?? 'the main session'} gets ${allowed(agent, tool)} for ${tool}, not ${want}`);
  const env = { env: {} };
  await hooks['shell.env']({ cwd: root }, env);
  if (env.env.CLAUDE_PLUGIN_ROOT !== root) problems.push('CLAUDE_PLUGIN_ROOT is not set in the shell');
  const system = { system: [] };
  await hooks['experimental.chat.system.transform']({}, system);
  if (!system.system.join('\n').includes('`task` tool')) problems.push('OpenCode 1 is not told the Claude tool names');
  record('the OpenCode plugin registers the servers, builders, skills and /ua: commands, and limits each server to its builders', problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('the OpenCode plugin registers the servers, builders, skills and /ua: commands, and limits each server to its builders', false, error.message);
}

/**
 * A stand-in for the context OpenCode 2 hands a plugin's setup, shaped as
 * `@opencode/plugin` 2.3 declares it: transform editors over state that starts
 * as OpenCode's own (a built-in `build` agent, the person's own `object`
 * server), hooks kept by domain and name, and the session calls a command
 * makes. `ctx.agent.get` answers from the edited agents, as OpenCode's does.
 */
function fakeOpencode2(directory) {
  const newAgent = (id) => ({ id, name: id, mode: 'primary', hidden: false, request: {}, permissions: [{ action: '*', resource: '*', effect: 'allow' }] });
  const state = {
    mcp: new Map([['object', { type: 'local', command: ['mine'] }]]),
    agents: new Map([['build', newAgent('build')]]),
    skills: new Map(), commands: new Map(), hooks: new Map(), prompts: [],
  };
  const hook = (domain) => async (name, callback) => { state.hooks.set(`${domain}:${name}`, callback); return { dispose: async () => {} }; };
  const transform = (editor) => async (callback) => { callback(editor); return { dispose: async () => {} }; };
  const ctx = {
    location: { directory },
    options: {},
    mcp: { transform: transform({
      list: () => [...state.mcp], get: (name) => state.mcp.get(name), set: (name, config) => state.mcp.set(name, config),
      update: (name, fn) => fn(state.mcp.get(name)), remove: (name) => state.mcp.delete(name),
    }) },
    agent: {
      transform: transform({
        list: () => [...state.agents.values()], get: (id) => state.agents.get(id), default: () => {}, remove: (id) => state.agents.delete(id),
        update: (id, fn) => {
          if (!state.agents.has(id)) state.agents.set(id, newAgent(id));
          fn(state.agents.get(id));
        },
      }),
      get: async ({ agentID }) => ({ data: state.agents.get(agentID) }),
    },
    skill: { transform: transform({
      list: () => [...state.skills.values()], get: (id) => state.skills.get(id), add: (skill) => state.skills.set(skill.id, skill),
      update: () => {}, remove: (id) => state.skills.delete(id),
    }) },
    command: { transform: transform({ add: (definition) => state.commands.set(definition.name, definition) }) },
    session: { hook: hook('session'), prompt: async (input) => { state.prompts.push(input); } },
    permission: { hook: hook('permission') },
    shell: { hook: hook('shell') },
    tool: { hook: hook('tool') },
  };
  /** What OpenCode 2 decides for an agent's call: its last matching rule, then
   * the evaluate hooks, which run only when no rule denies. */
  const decide = async (agent, action) => {
    const rule = state.agents.get(agent)?.permissions.findLast((item) => wildcardMatch(item.action, action));
    if (rule?.effect === 'deny') return 'deny';
    const event = { sessionID: 's', agent, action, resources: ['*'], effect: rule?.effect ?? 'ask' };
    await state.hooks.get('permission:evaluate')?.(event);
    return event.effect;
  };
  return { ctx, state, decide };
}

// 10b. On OpenCode 2 the package entry's setup gives OpenCode the same: every
// server (the person's own kept), every builder held to its own servers, every
// skill, the /ua: commands, the plugin root in every shell and the Claude tool
// names. A builder's servers stay out of the main session even when the
// person's own rules allow everything, and a rule naming a server is kept.
try {
  const plugin = (await import(opencodeEntry)).default;
  const { ctx, state, decide } = fakeOpencode2(root);
  await plugin.setup(ctx);
  const problems = [];
  for (const name of opencodeServers) if (!state.mcp.get(name)) problems.push(`server ${name} missing`);
  if (state.mcp.get('object').command[0] !== 'mine') problems.push('the person\'s own server was replaced');
  for (const name of opencodeBuilders) {
    const agent = state.agents.get(name);
    if (agent?.mode !== 'subagent' || !agent.system || !agent.description) problems.push(`builder ${name} missing or without its prompt`);
  }
  const skillFiles = ['skills', 'loops'].flatMap((dir) => fs.readdirSync(path.join(root, dir), { recursive: true })).filter((file) => path.basename(String(file)) === 'SKILL.md').length;
  if (state.skills.size !== skillFiles) problems.push(`${skillFiles} SKILL.md files but ${state.skills.size} skills added`);
  if (!state.skills.get('setup')?.content) problems.push('the setup skill has no content');
  for (const skill of state.skills.values()) if (!fs.existsSync(skill.path) || /^["']/u.test(skill.description ?? '')) problems.push(`skill ${skill.id} has no SKILL.md at ${skill.path}, or a quoted description`);
  if (!state.commands.has('ua:setup')) problems.push('no /ua:setup command');
  if (state.commands.has('ua:loop-orchestrator')) problems.push('a skill marked user-invocable: false became a command');
  await state.commands.get('ua:setup')?.execute({ sessionID: 's1', prompt: { text: 'switch solution' }, delivery: 'steer' });
  const sent = state.prompts[0];
  if (sent?.sessionID !== 's1' || sent.delivery !== 'steer' || !sent.text.includes('`setup` skill') || !sent.text.endsWith('switch solution')) problems.push(`/ua:setup sent ${JSON.stringify(sent)}`);
  for (const [agent, tool, want] of [
    ['build', 'object_get_objects', 'deny'], ['build', 'application-builder_get_page', 'deny'], ['build', 'solution_get_solution', 'allow'],
    ['app-agent', 'application-builder_get_page', 'allow'], ['app-agent', 'object_get_objects', 'allow'], ['app-agent', 'api-gateway_get_api', 'deny'],
    ['fde-agent', 'application-builder_get_user_details', 'allow'], ['fde-agent', 'application-builder_get_page', 'deny'],
  ]) {
    const got = await decide(agent, tool);
    if (got !== want) problems.push(`${agent} gets ${got} for ${tool}, not ${want}`);
  }
  // OpenCode 2 applies the person's own rules after a plugin's: a catch-all
  // does not hand the main session a builder's tools; naming a server does.
  state.agents.get('build').permissions.push({ action: '*', resource: '*', effect: 'allow' });
  if (await decide('build', 'object_get_objects') !== 'deny') problems.push('the person\'s catch-all "*" hands the main session a builder\'s tools');
  state.agents.get('build').permissions.push({ action: 'evaluation_*', resource: '*', effect: 'allow' });
  if (await decide('build', 'evaluation_get_metrics') !== 'allow') problems.push('the person\'s own rule for a server is overridden');
  const shell = { command: 'true', cwd: root, timeout: 0, shell: 'bash', env: {} };
  await state.hooks.get('shell:create.before')?.(shell);
  if (shell.env.CLAUDE_PLUGIN_ROOT !== root) problems.push('CLAUDE_PLUGIN_ROOT is not set in the shell');
  const context = { sessionID: 's1', agent: 'build', system: [], messages: [], tools: {} };
  await state.hooks.get('session:context')?.(context);
  if (!context.system.some((part) => part.type === 'text' && part.text.includes('`subagent` tool'))) problems.push('OpenCode 2 is not told the Claude tool names');
  record('on OpenCode 2 the plugin adds the servers, builders, skills and /ua: commands, and limits each server to its builders', problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('on OpenCode 2 the plugin adds the servers, builders, skills and /ua: commands, and limits each server to its builders', false, error.message);
}

// 11. In OpenCode, a "Yes" to the `question` tool approves a refused delete the
// way an AskUserQuestion answer does in Claude Code, and a "No" does not, on
// OpenCode 1's hook and on OpenCode 2's (its question tool's real result shape:
// the answers in `output` and `metadata`, the same as text in `content`). Run
// in a child with its own UA_HOME, so no real pending delete is touched.
{
  const home = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'ua-smoke-'));
  const child = `
    const yes = await import(${JSON.stringify(new URL('./folder/delete-yes.mjs', import.meta.url).href)});
    const plugin = (await import(${JSON.stringify(opencodeEntry)})).default;
    const v1 = await plugin.server({ directory: process.cwd() });
    let v2 = null;
    const on = async () => ({ dispose: async () => {} });
    await plugin.setup({
      location: { directory: process.cwd() },
      mcp: { transform: on }, agent: { transform: on }, skill: { transform: on }, command: { transform: on },
      permission: { hook: on }, shell: { hook: on }, session: { hook: on },
      tool: { hook: async (name, callback) => { if (name === 'execute.after') v2 = callback; return { dispose: async () => {} }; } },
    });
    const ask = (key) => {
      const summary = 'Delete the object Throwaway (' + key + ')';
      const id = yes.addPendingDelete({ key, tool: 'delete_object', summary });
      return summary + '? (' + id + ')';
    };
    const said = (question, choice) => 'User has answered your questions: "' + question + '"="' + choice + '". You can now continue with the user\\'s answers in mind.';
    const answerV1 = async (key, choice) => {
      const question = ask(key);
      await v1['tool.execute.after']({ tool: 'question', sessionID: 's', callID: 'c', args: { questions: [{ question, header: 'Delete', options: [] }] } },
        { title: '', output: said(question, choice), metadata: { answers: [[choice]] } });
      return yes.takeDeleteYes(key);
    };
    const answerV2 = async (key, choice, result) => {
      const question = ask(key);
      await v2({ tool: 'question', sessionID: 's', agent: 'build', messageID: 'm', id: 'c', status: 'completed',
        input: { questions: [{ question, header: 'Delete', options: [] }] }, result: result(question) });
      return yes.takeDeleteYes(key);
    };
    const full = (choice) => (question) => ({ output: { answers: [[choice]] }, content: [{ type: 'text', text: said(question, choice) }], metadata: { answers: [[choice]] } });
    const textOnly = (choice) => (question) => ({ content: said(question, choice) });
    process.stdout.write(JSON.stringify({
      yes: await answerV1('k-yes', 'Yes'), no: await answerV1('k-no', 'No'),
      yes2: await answerV2('k2-yes', 'Yes', full('Yes')), no2: await answerV2('k2-no', 'No', full('No')),
      yes2text: await answerV2('k2-text', 'Yes', textOnly('Yes')),
    }));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], { cwd: root, encoding: 'utf8', env: { ...process.env, UA_HOME: home }, timeout: 60_000 });
  let outcome = null;
  try { outcome = JSON.parse(result.stdout); } catch { /* reported below */ }
  fs.rmSync(home, { recursive: true, force: true });
  record('in OpenCode 1 and 2 a Yes to the question approves a refused delete, and a No does not',
    outcome?.yes === true && outcome?.no === false && outcome?.yes2 === true && outcome?.no2 === false && outcome?.yes2text === true,
    outcome ? JSON.stringify(outcome) : (result.stderr ?? '').split('\n').slice(0, 3).join(' '));
}

// 12. The installer: every target has the shape the registry promises, choices
// parse, a missing agent cannot be chosen, and Codex gets a manifest whose
// servers exist and whose skills are the resolved copy.
try {
  const { TARGETS } = await import(new URL('./install/targets.mjs', import.meta.url));
  const { parseChoice } = await import(new URL('./install/index.mjs', import.meta.url));
  const { codexManifest, codexManifestIsCurrent } = await import(new URL('./release/codex-manifest.mjs', import.meta.url));
  const problems = [];
  for (const target of TARGETS) {
    for (const key of ['id', 'label']) if (typeof target[key] !== 'string') problems.push(`${target.id ?? '?'}: no ${key}`);
    for (const key of ['detect', 'install', 'uninstall']) if (typeof target[key] !== 'function') problems.push(`${target.id}: no ${key}()`);
  }
  const rows = TARGETS.map((target, index) => ({ target, state: { found: index !== 1 } }));
  if (parseChoice('1 3', rows, []).map((target) => target.id).join() !== `${TARGETS[0].id},${TARGETS[2].id}`) problems.push('"1 3" did not pick the first and third agents');
  if (parseChoice('', rows, ['fallback'])[0] !== 'fallback') problems.push('an empty answer did not take the default');
  let refused = false;
  try { parseChoice(TARGETS[1].id, rows, []); } catch { refused = true; }
  if (!refused) problems.push('an agent that is not installed could be chosen');
  if (parseChoice('all', rows, []).some((target) => target === TARGETS[1])) problems.push('"all" chose an agent that is not installed');
  if (TARGETS.some((target) => 'installAgent' in target)) problems.push('the installer can install an agent; it must only add the plugin');
  if (!codexManifestIsCurrent(root)) problems.push('.codex-plugin/plugin.json is out of date: run node scripts/release/codex-manifest.mjs');
  const manifest = codexManifest(root);
  const claudeSkills = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).skills;
  if (JSON.stringify(manifest.skills) !== JSON.stringify(claudeSkills)) problems.push('the Codex manifest does not serve the same skill folders as the Claude one');
  for (const [name, server] of Object.entries(manifest.mcpServers ?? {})) {
    const files = [...server.args[1].matchAll(/"\$r\/([^"]+)"/gu)].map((match) => match[1]);
    if (!files.length || !files.every((file) => fs.existsSync(path.join(root, file)))) problems.push(`Codex server ${name} names a file that does not exist`);
  }
  record(`the installer knows ${TARGETS.map((target) => target.label).join(', ')}`, problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('the installer knows its agents', false, error.message);
}

// Gemini CLI installs the repository as it is in git, so its manifest and
// commands are committed and must match what the generator writes. Gemini reads
// the same hooks/hooks.json as Claude Code but fills in only ${extensionPath}:
// each Claude hook on an event Gemini also has exits when the plugin root is
// unset, and the Gemini session note exits when it is set.
try {
  const { geminiDrift, geminiManifest } = await import(new URL('./install/gemini.mjs', import.meta.url));
  const problems = geminiDrift().map((file) => `${file} is out of date: run node scripts/install/gemini.mjs`);
  const servers = Object.keys(JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers).filter((name) => name !== 'playwright');
  for (const name of servers) if (!geminiManifest().mcpServers[name]) problems.push(`Gemini has no ${name} server`);
  if (!fs.readFileSync(path.join(root, 'commands', 'ua', 'setup.toml'), 'utf8').includes('skills/setup/SKILL.md')) problems.push('/ua:setup does not name the setup skill');
  const hooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8')).hooks;
  for (const event of ['SessionStart', 'SessionEnd', 'Notification', 'BeforeTool', 'AfterTool', 'BeforeAgent', 'AfterAgent', 'PreCompress', 'BeforeModel', 'AfterModel', 'BeforeToolSelection']) {
    for (const { command } of (hooks[event] ?? []).flatMap((group) => group.hooks)) {
      const gemini = command.includes('${extensionPath}');
      if (gemini ? !command.startsWith('[ -z "${CLAUDE_PLUGIN_ROOT}" ] || exit 0;') : !command.startsWith('[ -n "${CLAUDE_PLUGIN_ROOT}" ] || exit 0;')) problems.push(`${event} hook runs in the wrong agent: ${command.slice(0, 80)}`);
    }
  }
  const note = spawnSync(process.execPath, [path.join(root, 'scripts', 'gemini-session.mjs')], { encoding: 'utf8' });
  const context = JSON.parse(note.stdout || '{}').hookSpecificOutput?.additionalContext ?? '';
  if (!context.includes(root) || /[<>]/u.test(context)) problems.push('the Gemini session note does not name the plugin folder, or has angle brackets Gemini would escape');
  record('Gemini CLI gets the servers, /ua: commands and a session note, and runs no Claude hook', problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('Gemini CLI gets the servers, /ua: commands and a session note, and runs no Claude hook', false, error.message);
}

// Signing out with nothing saved is not an error and calls no tenant, so it
// runs here with a home of its own.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-logout-'));
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'login.mjs'), 'smoke.invalid', '--logout', '--quiet'], { encoding: 'utf8', env: { ...process.env, UA_HOME: home } });
  let answer = {};
  try { answer = JSON.parse(run.stdout); } catch { /* checked below */ }
  fs.rmSync(home, { recursive: true, force: true });
  record('login.mjs --logout with nothing saved is a no-op', run.status === 0 && answer.loggedOut === true && answer.had === false, run.stderr || run.stdout);
}

// Releases: every manifest carries one version, and the catalogue names this
// folder or the tag of that version, never another.
try {
  const { readVersions, catalogueSource } = await import(new URL('./release/versions.mjs', import.meta.url));
  const versions = readVersions(root);
  const distinct = [...new Set(Object.values(versions))];
  const source = catalogueSource(root);
  const problems = [];
  const { antigravityDrift } = await import(new URL('./release/antigravity-manifest.mjs', import.meta.url));
  for (const file of antigravityDrift(root)) problems.push(`${file} is out of date: run node scripts/release/antigravity-manifest.mjs`);
  if (Object.keys(versions).length < 6) problems.push(`only ${Object.keys(versions).join(', ')} carry a version`);
  const { copilotDrift } = await import(new URL('./release/copilot-manifest.mjs', import.meta.url));
  for (const file of copilotDrift(root)) problems.push(`${file} is out of date: run node scripts/release/copilot-manifest.mjs`);
  if (distinct.length !== 1) problems.push(`the manifests disagree: ${JSON.stringify(versions)}`);
  if (source !== './' && !(source?.source === 'url' && source.ref === `v${distinct[0]}`)) problems.push(`the catalogue names ${JSON.stringify(source)}, not this folder or v${distinct[0]}`);
  record(`every manifest says ${distinct.join(' / ')} and the catalogue agrees`, problems.length === 0, problems.join('\n        '));
} catch (error) {
  record('every manifest carries one version', false, error.message);
}

// Updates: below the published minimum, a tool call is refused before it is
// sent and says how to update; at or above it, the call goes on as before.
// Under Codex the solution server, and only it, tells the model where the
// plugin is. Each runs in a child with a home of its own.
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-update-'));
  const child = `
    import fs from 'node:fs';
    const { createBridge } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts', 'mcp-bridge.mjs')).href)});
    const write = (min) => fs.writeFileSync(process.env.UA_RELEASE_URL, JSON.stringify({ version: '999.0.0', minRequiredVersion: min, message: 'Smoke.' }));
    const call = async (min) => {
      write(min); fs.rmSync(process.env.UA_HOME + '/update-check.json', { force: true });
      const bridge = createBridge('/mcp/object', { context: () => null });
      const [reply] = await bridge({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_objects', arguments: {} } }).catch((error) => [{ error: error.message }]);
      return JSON.stringify(reply);
    };
    const init = async (target) => (await createBridge(target, { context: () => null, updates: async () => ({ state: 'current' }) })({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }))[0].result.instructions ?? null;
    process.env.UA_AGENT = 'codex';
    console.log(JSON.stringify({ blocked: await call('999.0.0'), allowed: await call('0.0.0'), solution: await init('/mcp/solution'), object: await init('/mcp/object'),
      agents: fs.readdirSync(process.env.CODEX_HOME + '/agents').filter((file) => file.startsWith('ua-')).length }));`;
  const env = { ...process.env, UA_HOME: home, CODEX_HOME: path.join(home, 'codex'), UA_RELEASE_URL: path.join(home, 'release.json') };
  delete env.UA_NO_UPDATE_CHECK;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', child], { cwd: root, encoding: 'utf8', env, timeout: 60_000 });
  let out = {};
  try { out = JSON.parse(run.stdout.trim().split('\n').pop()); } catch { /* reported below */ }
  fs.rmSync(home, { recursive: true, force: true });
  const problems = [];
  if (!String(out.blocked).includes('UPDATE_REQUIRED') || !String(out.blocked).includes('Update with')) problems.push(`below the minimum: ${out.blocked}`);
  if (String(out.allowed).includes('UPDATE_REQUIRED')) problems.push(`at the minimum: ${out.allowed}`);
  if (!String(out.solution).includes(root)) problems.push('the Codex solution server does not name the plugin folder');
  if (out.object !== null) problems.push('a Codex server other than solution sends instructions');
  if (!(out.agents > 0)) problems.push('no builder was written to ~/.codex/agents');
  record('an out-of-date copy refuses tool calls; Codex learns the plugin folder', run.status === 0 && problems.length === 0, problems.join('\n        ') || run.stderr.slice(0, 400));
}

// Codex runs the same hook code through its own registration. A Codex payload is
// replayed end to end: a builder's patch onto a protected file is refused, a
// builder's Bash into a sign-in folder is refused, the person's own identical
// calls are not, and every answer keeps only what Codex accepts for that event.
// Keyed on real Codex spellings (`apply_patch`, `shell`, `ua_fde_agent`),
// because the guard matching nothing is how it would silently stop jailing.
try {
  const { claudeEvents, canonicalAgent, codexOutput, patchTargets } = await import(new URL('./codex/host-events.mjs', import.meta.url));
  const { codexHooks, codexHooksToml, configWithHooks, writeCodexHooks } = await import(new URL('./folder/codex-hooks.mjs', import.meta.url));
  const { handle } = await import(new URL('./codex-hooks.mjs', import.meta.url));
  const problems = [];

  if (canonicalAgent('ua_fde_agent') !== 'ua:fde-agent') problems.push('a Codex builder name does not reach the guard');
  if (canonicalAgent('ua:fde-agent') !== 'ua:fde-agent') problems.push('a Claude builder name was rewritten');
  // A bare name belongs to any agent a person may have installed, so it must
  // not be read as one of ours.
  if (canonicalAgent('') !== '' || canonicalAgent('general-purpose') !== 'general-purpose') problems.push('a name that is not a builder was taken for one');

  const patch = '*** Begin Patch\n*** Add File: CLAUDE.md\n+planted\n*** Update File: notes.md\n+fine\n*** End Patch\n';
  const targets = patchTargets(patch).map((target) => target.file).join();
  if (targets !== 'CLAUDE.md,notes.md') problems.push(`a patch's files were read as ${targets}`);
  const mapped = claudeEvents({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { input: patch }, agent_type: 'ua_fde_agent', cwd: root, session_id: 'smoke' });
  if (mapped.length !== 2 || mapped.some((event) => event.tool_name !== 'Write')) problems.push('a patch did not become one write per file');
  const shell = claudeEvents({ hook_event_name: 'PreToolUse', tool_name: 'shell', tool_input: { command: ['bash', '-lc', 'cat ~/.ssh/id_rsa'] }, agent_type: 'ua_fde_agent', cwd: root, session_id: 'smoke' });
  if (shell[0]?.tool_name !== 'Bash' || !shell[0]?.tool_input?.command.includes('.ssh')) problems.push('a Codex shell call did not become a Bash call');

  const asBuilder = (tool, args) => ({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: args, agent_type: 'ua_fde_agent', cwd: root, session_id: 'smoke', tool_use_id: 'call_1', model: 'gpt', permission_mode: 'default', transcript_path: null, turn_id: 't1' });
  const refusals = [
    ['a patch that plants a file that runs later', asBuilder('apply_patch', { input: patch })],
    ['a shell call that reads a saved sign-in', asBuilder('shell', { command: ['bash', '-lc', 'cat ~/.ssh/id_rsa'] })],
    ['a shell call that names the delete gate', asBuilder('shell', { command: 'node ua-delete-yes/x.mjs' })],
  ];
  for (const [what, event] of refusals) {
    const answer = await handle(event);
    if (answer?.hookSpecificOutput?.permissionDecision !== 'deny' || !answer.hookSpecificOutput.permissionDecisionReason) problems.push(`${what} was not refused on Codex`);
  }
  // The same calls from the person, who is not a builder, are theirs to make.
  const mine = await handle({ ...asBuilder('shell', { command: ['bash', '-lc', 'cat ~/.ssh/id_rsa'] }), agent_type: undefined });
  if (mine) problems.push('the person\'s own call was refused on Codex');
  const fine = await handle(asBuilder('apply_patch', { input: '*** Begin Patch\n*** Update File: notes.md\n+fine\n*** End Patch\n' }));
  if (fine) problems.push('a builder\'s ordinary patch was refused on Codex');

  // Codex drops a whole answer holding something the event does not allow, so an
  // approval or a suppressed output must never travel with a refusal.
  if (codexOutput('PreToolUse', { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' }, suppressOutput: true })) problems.push('a PreToolUse answer kept an approval Codex rejects');
  if (codexOutput('PreCompact', { hookSpecificOutput: { hookEventName: 'PreCompact', additionalContext: 'x' } })) problems.push('a PreCompact answer kept context Codex rejects');
  if (codexOutput('SessionStart', { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'x' } })?.hookSpecificOutput?.additionalContext !== 'x') problems.push('a SessionStart answer lost its context');

  // The guard must match the tool names Codex actually sends, which are the
  // Claude ones: measured on codex-cli 0.170.0, a shell call arrives as `Bash`.
  const registered = codexHooks(root);
  for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart', 'PreCompact', 'PermissionRequest', 'SubagentStop']) {
    if (!registered[event]) problems.push(`Codex is not given the ${event} hook`);
  }
  for (const tool of ['Bash', 'apply_patch', 'mcp__plugin_ua_object']) {
    if (!new RegExp(`^(?:${registered.PreToolUse[0].matcher})$`, 'u').test(tool)) problems.push(`the Codex guard does not match ${tool}`);
  }
  for (const groups of Object.values(registered)) {
    for (const hook of groups.flatMap((group) => group.hooks)) {
      for (const match of String(hook.command).matchAll(/\/[\w./-]+?\.(?:mjs|sh)/gu)) {
        if (!fs.existsSync(match[0])) problems.push(`a Codex hook names ${match[0]}, which does not exist`);
      }
    }
  }

  // The block written into the person's own config.toml, and everything else in
  // that file left theirs, through an install, a reinstall and an uninstall.
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-codex-home-'));
  try {
    const file = path.join(codexHome, 'config.toml');
    const theirs = 'model = "gpt-5.5"\n\n[mcp_servers.theirs]\ncommand = "echo"\n';
    fs.writeFileSync(file, theirs);
    writeCodexHooks(root, file);
    writeCodexHooks(root, file);
    const written = fs.readFileSync(file, 'utf8');
    if (!written.startsWith(theirs)) problems.push('installing the Codex hooks changed the person\'s own config');
    if ((written.match(/\[\[hooks\.PreToolUse\]\]/gu) ?? []).length !== 1) problems.push('a second install stacked another copy of the Codex hooks');
    if ((written.match(/codex-hooks\.mjs/gu) ?? []).length !== 6) problems.push('the Codex config does not hold one command per event');
    const removed = configWithHooks(written, null);
    if (removed.includes('hooks.PreToolUse') || removed.includes('codex-hooks.mjs')) problems.push('uninstalling left the Codex hooks behind');
    if (removed.trim() !== theirs.trim()) problems.push('uninstalling did not leave the config as the person had it');
    if (!codexHooksToml(root).includes('[[hooks.SubagentStop]]')) problems.push('the Codex config block has no SubagentStop hook');
  } finally {
    fs.rmSync(codexHome, { recursive: true, force: true });
  }

  record('Codex runs the guard, the session sync and the builder-finished signal through its own registration', problems.length === 0, problems.slice(0, 8).join('\n        '));
} catch (error) {
  record('Codex runs the guard, the session sync and the builder-finished signal through its own registration', false, error.message);
}

// One folder works in one tenant workspace. Three things decide that, and each
// is checked here: what a create carries so the new item lands in the folder's
// workspace, which write or link is refused because the item it names lives in
// another workspace, and the repair that puts back a workspace a tenant route
// dropped (a write with no `x-ua-project-id` header moves the item to Global,
// and a header of `0` matches nothing — both measured on a tenant).
{
  const name = 'a solution works in one workspace: creates carry it, outside writes and links are refused';
  const problems = [];
  const same = (actual, expected, what) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) problems.push(`${what}: got ${JSON.stringify(actual)}`);
  };
  try {
    const contracts = await import(new URL('./lib/contracts.mjs', import.meta.url));
    const gate = await import(new URL('./lib/workspace-gate.mjs', import.meta.url));
    const links = await import(new URL('./lib/entity-links.mjs', import.meta.url));
    const workspaces = await import(new URL('./platform/workspaces.mjs', import.meta.url));
    const { createService } = await import(new URL('./platform/service.mjs', import.meta.url));
    const host = 'example.uat.unifyapps.com';

    // The header: a workspace sends its id, Global sends nothing. Never "0".
    same(contracts.workspaceHeaderValue('194'), '194', 'a workspace id is sent as text');
    same(contracts.workspaceHeaderValue(0), undefined, 'a workspace of 0 is sent as nothing');
    same(contracts.workspaceHeaderValue('abc'), undefined, 'a workspace that is not a number is sent as nothing');
    same(contracts.workspaceHeaders('194'), { [contracts.WORKSPACE_HEADER]: '194' }, 'the header a workspace carries');
    same(contracts.workspaceHeaders(contracts.GLOBAL_WORKSPACE_ID), {}, 'Global carries no header');

    // A create takes the folder's workspace, under the argument its own tool takes.
    same(gate.withWorkspace('create_app', { name: 'Orders' }, '194'), { name: 'Orders', projectId: 194 }, 'create_app takes the workspace');
    same(gate.withWorkspace('apply_object_batch', { steps: [] }, '194'), { steps: [], project: '194' }, 'the object batch takes the workspace as text');
    same(gate.withWorkspace('save_knowledge_sets', { knowledgeSets: [{ name: 'Docs' }, { knowledgeSetId: 'k1', name: 'Old' }] }, '194'),
      { knowledgeSets: [{ name: 'Docs', projectId: '194' }, { knowledgeSetId: 'k1', name: 'Old' }] }, 'only a new knowledge set takes the workspace');
    // Deliberately left out: the tool refuses a workspace on a variable that
    // exists, and one save carries new and existing variables together.
    same(gate.withWorkspace('save_env_variables', { variables: [{ name: 'KEY' }] }, '194'), { variables: [{ name: 'KEY' }] }, 'env variables are left alone');
    same(gate.withWorkspace('create_app', { name: 'Orders', projectId: 7 }, '194'), { name: 'Orders', projectId: 7 }, 'a workspace the caller named is kept');
    same(gate.withWorkspace('create_app', { name: 'Orders' }, '0'), { name: 'Orders' }, 'Global adds nothing');
    same(gate.withWorkspace('create_agent', { name: 'Helper' }, '194'), { name: 'Helper' }, 'a tool with no workspace argument is untouched');

    // A write names the item whose workspace decides it, and where to read it.
    same(gate.writeTarget('apply_page_edits', { interfaceId: 'app-1', edits: [] }),
      { kind: 'app', id: 'app-1', path: '/api/entity/e_interface/app-1' }, 'a page edit names its app');
    same(gate.writeTarget('deploy_workflow', { workflowId: 'wf1' }),
      { kind: 'automation', id: 'wf1', path: '/api/workflow-definition/wf1' }, 'a deploy names its automation');
    same(gate.writeTarget('create_app', { name: 'Orders' }), null, 'a create names no existing item');
    same(gate.writeTarget('apply_page_edits', {}), null, 'a write with no id names nothing');
    same(gate.workspaceReadPath('ai-agent', 'a1'), null, 'no read answers an AI agent\'s workspace yet');
    if (!gate.UNCHECKED_KINDS.includes('ai agent')) problems.push('the ungated kinds no longer name the AI agent');
    // An object batch is checked for every object it edits, never only the first.
    same(gate.writeTargets('apply_object_batch', { steps: [
      { tool: 'create_object', args: { name: 'New' } },
      { tool: 'apply_object_edits', args: { objectId: 'obj_a' } },
      { tool: 'update_object_settings', args: { objectId: 'obj_b' } },
      { tool: 'apply_object_edits', args: { objectId: 'obj_a' } },
    ] }).map((target) => target.id), ['obj_a', 'obj_b'], 'every object a batch edits is checked');

    // The rule itself, from both sides.
    for (const [solution, item, expected] of [['194', '194', true], ['194', '199', false], ['194', '0', false], ['194', undefined, false],
      [null, undefined, true], [null, '199', true], ['0', '199', true]]) {
      if (gate.workspaceAllows(solution, item) !== expected) problems.push(`a solution in ${solution} on an item in ${item} should be ${expected}`);
    }

    // A create that cannot name a workspace is refused up front.
    for (const tool of ['create_agent', 'create_context_graph', 'create_test_suite']) {
      if (!gate.landsOutsideWorkspace(tool)) problems.push(`${tool} should be refused in a workspace solution`);
    }
    for (const tool of ['create_app', 'create_pages', 'save_api']) {
      if (gate.landsOutsideWorkspace(tool)) problems.push(`${tool} places its item, so it must not be refused`);
    }
    // A read must never be gated as a write: it would refuse looking at another
    // workspace, which is always allowed.
    const reads = new Set(Object.values(contracts.TENANT_ONLY_READ_TOOLS).flatMap((set) => [...set]));
    const gated = [...Object.keys(gate.WORKSPACE_CREATE_ARGS), ...Object.keys(gate.WORKSPACE_CREATE_ITEMS),
      ...Object.keys(gate.WORKSPACE_WRITE_TARGETS), ...gate.WORKSPACE_UNPLACEABLE_CREATES];
    for (const tool of gated) {
      if (reads.has(tool)) problems.push(`${tool} is a read, so the workspace gate must not name it`);
      if (!/^[a-z][a-z0-9_]*$/u.test(tool)) problems.push(`${tool} is not a tool name`);
    }

    // The refusal names the item, both workspaces and the one way out.
    const refusal = contracts.errorMessage('WORKSPACE_MISMATCH', { asset: 'The app `app-1`', assetWorkspace: 'Delivery', solutionWorkspace: 'Global' });
    for (const word of ['app-1', 'Delivery', 'Global', 'Open a solution in Delivery']) {
      if (!refusal.includes(word)) problems.push(`the refusal does not name ${word}`);
    }

    // A link opens in the solution's workspace; Global keeps `/p/0`.
    same(links.entityUrl(host, { kind: 'app', id: 'app-1' }, { workspaceId: '194' }), `https://${host}/p/194/interfaces/app-1/builder`, 'a link carries the workspace');
    same(links.entityUrl(host, { kind: 'app', id: 'app-1' }), `https://${host}/p/0/interfaces/app-1/builder`, 'a link with no workspace is Global');
    same(links.previewUrl(host, { kind: 'app', id: 'app-1' }, { workspaceId: '194' }), `https://${host}/p/194/interfaces/app-1/preview`, 'a preview carries the workspace');
    same(links.entityUrl(host, { kind: 'changeset', id: 'c1' }, { workspaceId: '194' }), `https://${host}/settings/change-sets/outbound/c1/details`, 'the changeset screens sit outside every workspace');

    // A solution with no workspace reads as Global, not as unknown.
    same(workspaces.workspaceOf({}), { id: '0', name: 'Global', global: true }, 'no workspace reads as Global');
    same(workspaces.workspaceOf({ workspaceId: '194', workspaceName: 'Delivery' }), { id: '194', name: 'Delivery', global: false }, 'a workspace reads by name');
    same(workspaces.workspaceOf({ workspaceId: '194' }), { id: '194', name: 'Workspace 194', global: false }, 'a workspace with no name reads by id');

    // The repair: `save_solution_record` sends no workspace header, so the write
    // lands and the record falls out of its workspace. The service reads the
    // answer back and puts it right through the entity API, which does send it.
    const record = { id: 'e_1', entityType: 'e_solution', version: 1, properties: { name: 'Portal', memory: '' }, projectId: 194 };
    const calls = [];
    const api = async (pathname, body, method, options = {}) => {
      calls.push({ pathname, workspaceId: options.workspaceId });
      if (pathname === '/api/entity/update') { record.version += 1; record.projectId = Number(options.workspaceId ?? 0) || undefined; }
      return { status: 200, body: { ...record } };
    };
    const callTool = async ({ name: tool }) => {
      if (tool !== 'save_solution_record') throw new Error(`unexpected tool ${tool}`);
      record.projectId = undefined;
      record.version += 1;
      return { record: { ...record } };
    };
    const saved = await createService({ host, api, callTool, workspaceId: '194' }).update(record, { memory: 'a line' });
    if (String(saved.projectId) !== '194') problems.push(`the solution did not go back to its workspace: ${JSON.stringify(saved.projectId)}`);
    if (!calls.some((call) => call.pathname === '/api/entity/update' && call.workspaceId === '194')) {
      problems.push('the repair did not write through the entity API with the workspace header');
    }

    // A link to an entity in another workspace is refused; one this folder may
    // change, one no read can place, and a folder in no workspace all pass.
    const reads2 = [];
    const workspaceOfPath = { '/api/entity/e_interface/app-elsewhere': 199, '/api/entity-type?entityType=obj_here': 194 };
    const fakeFetch = async (tenant, pathname) => {
      reads2.push(pathname);
      const projectId = workspaceOfPath[pathname];
      return { ok: true, status: 200, json: async () => (projectId ? { projectId } : {}) };
    };
    const { assertLinkable } = await import(new URL('./folder/entity-cache.mjs', import.meta.url));
    workspaces.__setTenantFetchForTest(fakeFetch);
    try {
      const here = { state: { tenant: host, workspaceId: '194', workspaceName: 'Delivery' } };
      await assertLinkable(here, [{ kind: 'object', id: 'obj_here' }]);
      await assertLinkable(here, [{ kind: 'ai-agent', id: 'agent-1' }]);
      await assertLinkable({ state: { tenant: host } }, [{ kind: 'app', id: 'app-elsewhere' }]);
      let refused = null;
      try { await assertLinkable(here, [{ kind: 'app', id: 'app-elsewhere' }]); }
      catch (error) { refused = error; }
      if (refused?.code !== 'WORKSPACE_MISMATCH') problems.push(`a link into another workspace was not refused: ${refused?.code ?? 'it passed'}`);
      else if (!refused.message.includes('app-elsewhere')) problems.push('the link refusal does not name the app');
    } finally { workspaces.__setTenantFetchForTest(null); }
    // No kind outside apps, objects and automations is read at all.
    if (reads2.some((pathname) => pathname.includes('agent-1'))) problems.push('an AI agent was read for a workspace it cannot answer');
  } catch (error) {
    problems.push(`${error.message}`);
  }
  record(name, problems.length === 0, problems.slice(0, 12).join('\n        '));
}

// `workspace list` runs before any solution exists, which is when setup asks it.
{
  const name = 'workspace list runs before a solution exists, and workspace show names the folder\'s workspace';
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-workspace-'));
  const env = { ...process.env, UA_HOME: home, UA_FAKE: '1', CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000001' };
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'scripts/ua.mjs'), ...args, '--json'],
    { cwd: home, encoding: 'utf8', env, timeout: 60_000 });
  const problems = [];
  const listed = run(['workspace', 'list']);
  // With no tenant to work from it asks for one, which is proof it passed the
  // session gates that answer NOT_STARTED for a command needing a solution.
  if (!/Name the tenant with --tenant/u.test(`${listed.stdout}${listed.stderr}`)) {
    problems.push(`workspace list did not reach the command: ${(listed.stdout || listed.stderr || '').slice(0, 200)}`);
  }
  // `workspace show` reads the open solution, so with none it is turned away by
  // the session gate itself, the way every other solution command is.
  const shown = run(['workspace', 'show']);
  if (!/NOT_STARTED|NO_SOLUTION/u.test(`${shown.stdout}${shown.stderr}`)) {
    problems.push(`workspace show with no solution: ${(shown.stdout || shown.stderr || '').slice(0, 200)}`);
  }
  fs.rmSync(home, { recursive: true, force: true });
  record(name, problems.length === 0, problems.join('\n        '));
}

// The launcher runs `node "$@"`, so its allow rule must name a plugin script,
// and `apply` must take out the broad rule older releases wrote. Which commands
// Claude Code lets these rules through was checked with `claude -p`
// (lib/permission-rules.mjs); this keeps the rules themselves from drifting.
{
  const name = 'the run-node.sh allow rule names a plugin script, and apply retires the broad one';
  const problems = [];
  try {
    const rules = await import(pathToFileURL(path.join(root, 'scripts/lib/permission-rules.mjs')).href);
    const dir = '/c/plugins/cache/unifyapps-headless/ua';
    const launcher = rules.allowRules(dir).filter((rule) => rule.includes('run-node.sh'));
    if (!launcher.length) problems.push('no run-node.sh rule');
    for (const rule of launcher) if (!rule.includes(`${dir}/*.mjs`)) problems.push(`accepts any arguments: ${rule}`);
    const broad = [`Bash(bash "${dir}/*/scripts/run-node.sh" *)`, `Bash(bash ${dir}/0.0.9/scripts/run-node.sh:*)`];
    const mine = 'Bash(git status *)';
    const before = { permissions: { allow: [mine, ...broad] } };
    if (rules.missingRules(before, { versionsDir: dir, version: '0.0.9' }).retired.length !== 2) problems.push('check does not flag the broad rules');
    const { settings, removed } = rules.mergeRules(before, { allow: rules.allowRules(dir), ask: [], retire: rules.retiredRules(before, dir) });
    if (removed.length !== 2 || settings.permissions.allow.some((rule) => broad.includes(rule))) problems.push('apply left a broad rule in');
    if (settings.permissions.allow[0] !== mine) problems.push('apply moved or removed the person\'s own rule');
    const after = rules.missingRules(settings, { versionsDir: dir, version: '0.0.9' });
    if (after.allow.length || after.retired.length) problems.push(`not clean after apply: ${JSON.stringify(after)}`);
  } catch (error) { problems.push(error.message); }
  record(name, problems.length === 0, problems.join('\n        '));
}

// A builder's Read and Grep stay out of the person's saved sign-in, whatever
// path spells it. Run in its own process: the guard reads UA_HOME on load.
{
  const name = 'a builder cannot read or search the saved sign-in';
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ua-guard-'));
  const work = path.join(home, 'work');
  for (const dir of ['session/cookies', 'session/chrome-profile', 'loops', 'work']) fs.mkdirSync(path.join(home, dir), { recursive: true });
  fs.symlinkSync(path.join(home, 'session/cookies'), path.join(work, 'link'));
  const cases = [
    [true, 'Read', { file_path: path.join(home, 'session/cookies/t.example.com') }],
    [true, 'Read', { file_path: path.join(home, 'session/chrome-profile/Default/Cookies') }],
    [true, 'Read', { file_path: path.join(work, 'link/t.example.com') }],
    [true, 'Read', { file_path: '../session/cookies/t.example.com' }],
    [true, 'Read', { file_path: path.join(os.homedir(), '.ssh/id_ed25519') }],
    [true, 'Grep', { pattern: '_at', path: home }],
    [true, 'Grep', { pattern: '_at', path: path.join(work, 'link') }],
    [false, 'Read', { file_path: path.join(work, 'notes.md') }],
    [false, 'Read', { file_path: path.join(home, 'loops/run.json') }],
    [false, 'Grep', { pattern: 'cookies', path: work }],
  ];
  const script = `const { denyReason } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'scripts/tool-guard.mjs')).href)});
    const cases = ${JSON.stringify(cases)};
    const wrong = cases.filter(([deny, tool, input]) => Boolean(denyReason({ agent_type: 'ua:fde-agent', tool_name: tool, cwd: ${JSON.stringify(work)}, tool_input: input })) !== deny);
    if (denyReason({ tool_name: 'Read', cwd: ${JSON.stringify(work)}, tool_input: cases[0][2] })) wrong.push('the main session was refused');
    console.log(JSON.stringify(wrong));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env, UA_HOME: home }, timeout: 30_000 });
  let wrong;
  try { wrong = JSON.parse(run.stdout); } catch { wrong = [run.stderr.split('\n').slice(0, 3).join(' ')]; }
  fs.rmSync(home, { recursive: true, force: true });
  record(name, wrong.length === 0, wrong.map((item) => JSON.stringify(item)).join('\n        '));
}

const failed = results.filter((result) => !result.ok);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exit(failed.length ? 1 : 0);
