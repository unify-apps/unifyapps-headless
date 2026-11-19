#!/usr/bin/env node
// Streamable HTTP tenant tools over stdio. Resolve tenant, base URL and cookie
// per request: the saved or default `https://<tenant>/llm-tools` base is trusted
// without a startup check, and the first real tool call proves it works.
// Calls pass through unchanged: the tenant tools compare the version a call
// names with the live item and refuse a stale write themselves, so the bridge
// keeps no versions of its own. Eight
// exceptions: a create gets the `UnifyApps Headless` tag (`withUaTag`), a deploy or
// publish gets the plan or chat task it ships at the end of its
// `deploymentNotes` (`withChangeTag`), a long input
// may come from a file (`ARGS_FILES`, `TEXT_FILES`:
// `apply_page_edits`, `update_app_settings`, `set_app_theme` and
// `set_theme_typography` take their arguments from a JSON `argsFile`, checked
// before anything is sent; `compile_and_save_workflow` its
// code from a .ts `codeFile`; `save_skill` its body and the agent writes their
// instructions from a .md file), `upload_public_file` may take its file from a
// local path (`filePath`), `open_workflow` may write the code it returns to a
// .ts `outFile` instead of answering it inline (`OUT_FILES`), the
// application-builder knowledge read comes back as one reply with its pages joined,
// and on application-builder a call that names its `agent` gets that builder's
// knowledge tokens added (see `keepTokens`), a key the API Platform answers
// once goes to a private file, never to the model (see `keepKeyOut`), and on
// code-builder a downloaded codebase is written to a local checkout, a push may
// send that checkout's own diff, and the files new dataSources answer (Storage
// bindings, an automation's binding) are written into it (`localPath`; see
// `folder/code-checkout.mjs`).
// A tool's refusal for the AGENT_LLM_TOOLS permission is answered as what it means
// (see `isPermissionRefusal`). Some calls are refused before they leave: a delete
// without the person's yes (`destructiveCall`), a page built by hand at a
// sign-in address such as /login (`handBuiltAuthPage`), and a call that changes
// an existing item without the version it read (`missingVersionProblem`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA_HOME, canonicalCwd, readRecords, readRegistry, readState, sessionForFolder, signInForFolder, tenantMcp, writeState } from './folder/local.mjs';
import { claudeProcessSession } from './folder/claude-process.mjs';
import { parsePlan } from './lib/formats.mjs';
import { approveFolder } from './lib/session-paths.mjs';
import { confirmRequiredText, isTenantOnlyRead, normalizeTenant, UaError, SOLUTION_TAG } from './lib/contracts.mjs';
import { handBuiltAuthPage } from './lib/auth-pages.mjs';
import { missingVersionProblem } from './lib/expected-version.mjs';
import { callKey, destructiveCall } from './lib/destructive.mjs';
import { afterRevert, afterSave, gateProblem, GATED_TOOLS } from './lib/changeset-yes.mjs';
import { validatedMcpBaseUrl } from './lib/mcp-url.mjs';
import { budgetNodes, joinKnowledgePages, parseKnowledgePage, stillToAsk } from './lib/knowledge-pages.mjs';
import { addTokens, isAgentName, replyTokens, withCollisionNote, withHave, withKnowledgeTokens, withRestartedNote, withSameCallAdvice } from './lib/knowledge-tokens.mjs';
import { lineOfPath, pageEditProblems, parseJsonText, pathText } from './lib/page-edits.mjs';
import { screenCodeSkillAnswer } from './lib/skill-scan.mjs';
import { readCookie } from './platform/auth.mjs';
import { tenantFetch } from './platform/tenant-fetch.mjs';
import { fetchUserContext, fetchUserIdentity, verifyCookie } from './platform/user-context.mjs';
import { addPendingDelete, failedYesFor, takeDeleteYes } from './folder/delete-yes.mjs';
import { linkEntityRefs, markCachedEntityDirty, markCachedInterfaceDirty, markCachedPageDirty } from './folder/entity-cache.mjs';
import { createdEntityRefs } from './lib/mcp-entity-changes.mjs';
import { agentContext } from './lib/agent-context.mjs';
import { checkForUpdate, updateNotice, updateRequiredMessage } from './lib/update-check.mjs';
import { writeCodexAgents } from './folder/codex-agents.mjs';
import {
  boundCallable, checkoutFolder, localPatch, markCommitted, provisionedBindings, pullBase, pullChanges, readCheckout, unpackCodebase,
  writeBindings, writeCallable,
} from './folder/code-checkout.mjs';

/** The plugin version that made the call. llm-tools governs a call that carries it
 * (the AGENT_LLM_TOOLS permission check, see `isPermissionRefusal`). */
function pluginVersion() {
  try { return String(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? ''); }
  catch { return ''; }
}

// A header value is ASCII and carries no separator: these come from our own
// files, but a header is the one place a stray newline would split a request.
const headerSafe = (value) => {
  const text = String(value ?? '').trim();
  return /^[\w.@:-]{1,200}$/u.test(text) ? text : '';
};

/** What a call carries beside the sign-in cookie, and nothing about the person
 * or the machine: the session and solution it belongs to, the plugin version
 * (which puts the call under llm-tools' permission check), and `x-ua-check-versions`,
 * which asks the tenant tools to compare the version a write names with the
 * stored one; without it they drop the version, so the platform's own agents,
 * which fill every optional input, keep working. */
export function clientHeaders({ sessionId, solutionId, version = pluginVersion() } = {}) {
  const headers = {
    'x-ua-session-id': headerSafe(sessionId),
    'x-ua-solution-id': headerSafe(solutionId),
    'x-ua-plugin-version': headerSafe(version),
    'x-ua-check-versions': 'true',
  };
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value));
}

// The tenant comes from a working folder, never from the Claude session alone:
// Claude Code keeps this process running across /clear and /resume with its first
// id. The calling session is the one the SessionStart hook recorded for this
// bridge's Claude Code process (`claude-process.mjs`), else that first id. The
// folder is the one the calling session opened UnifyApps Headless in (or signed in to a
// tenant in), and else the folder this process runs in: the two differ when
// UnifyApps Headless was opened after a `cd`, and then this folder holds no session at all,
// so every tool would go missing. Either way that folder names the call: a
// session row (`solution open`) gives the solution, and a sign-in entry
// (`solution storage-check`, right after the sign-in) gives the tenant, so the
// tools are listed while setup still runs. A folder that already holds a
// solution on that tenant names it on every call, sign-in or not; only a folder
// with none yet sends no solution id. The session id is the caller's whenever it
// is known, and the folder's newest session only when it is not.
export function bridgeContext(cwd = process.cwd(), claudeSessionId = process.env.CLAUDE_CODE_SESSION_ID, liveSessionId = claudeProcessSession()) {
  const { sessions, signIns = {}, tenantBindings = {} } = readRegistry();
  // The session calling now is the one the SessionStart hook last recorded for
  // the Claude Code process that started this bridge, else the one it started with.
  const caller = liveSessionId ?? claudeSessionId;
  const startingEntry = !caller ? null
    : Object.hasOwn(sessions, caller) ? sessions[caller]
      : Object.hasOwn(signIns, caller) ? signIns[caller] : null;
  // A folder holds one solution on one tenant, so a sign-in to that same tenant
  // (a cookie renewed mid-work, or another Claude session signing in here) never
  // hides it: every call from the folder names the solution. Only a newer sign-in
  // to another tenant means the folder is being switched, with no solution yet.
  const newestEntryInFolder = (folder) => {
    const session = sessionForFolder(folder), signIn = signInForFolder(folder);
    if (session && signIn && signIn.tenant !== session.tenant) return signIn.at.localeCompare(session.lastUsedAt) > 0 ? { signIn } : { session };
    return session ? { session } : signIn ? { signIn } : null;
  };
  const { signIn, session } = (startingEntry?.cwd ? newestEntryInFolder(startingEntry.cwd) : null) ?? newestEntryInFolder(cwd) ?? {};
  if (!signIn && !session) return tenantOnlyContext(tenantBindings, cwd, caller);
  if (signIn) {
    const { tenant } = signIn, sessionId = liveSessionId ?? signIn.sessionId;
    const identity = { sessionId, version: pluginVersion() };
    return { tenant, url: tenantMcp(tenant).url, cookie: readCookie(tenant), home: null, identity, client: clientHeaders(identity) };
  }
  // A known caller with its own row in the folder is named by that row, as the
  // CLI names it, never by whichever session in the folder was used last.
  const ownRow = liveSessionId && Object.hasOwn(sessions, liveSessionId) ? sessions[liveSessionId] : null;
  const row = ownRow?.cwd === session.cwd && ownRow.tenant === session.tenant ? ownRow : session;
  const { tenant, solutionId } = row;
  // A session that has only signed in here so far still names itself, beside the folder's solution.
  const onlySignedInHere = startingEntry && !Object.hasOwn(sessions, caller)
    && startingEntry.cwd === session.cwd && startingEntry.tenant === tenant;
  const sessionId = liveSessionId ?? (onlySignedInHere ? claudeSessionId : session.sessionId);
  const identity = { sessionId, solutionId, version: pluginVersion() };
  return { tenant, url: tenantMcp(tenant).url, cookie: readCookie(tenant), home: row.path, storage: row.storage ?? 'platform',
    identity, client: clientHeaders(identity) };
}

// A folder connected to a tenant with no solution open (`solution connect`): the
// folder the Claude session joined first, else this one. `tenantOnly` limits the
// bridge to TENANT_ONLY_READ_TOOLS, and `home` is null so no cache is marked.
function tenantOnlyContext(bindings, cwd, claudeSessionId) {
  const joined = claudeSessionId && Object.entries(bindings).find(([, binding]) => binding.sessions.includes(claudeSessionId));
  const folder = joined ? joined[0] : canonicalCwd(cwd);
  const binding = bindings[folder];
  if (!binding) return null;
  const sessionId = joined ? claudeSessionId : binding.ownerSession;
  const identity = { sessionId, version: pluginVersion() };
  return { tenant: binding.tenant, url: tenantMcp(binding.tenant).url, cookie: readCookie(binding.tenant), home: null, tenantOnly: true,
    identity, client: clientHeaders(identity) };
}

// A Claude host (the CLI, the desktop app, the SDK) names its session in
// CLAUDE_CODE_SESSION_ID; Codex names its thread in CODEX_THREAD_ID. A Claude
// session id alone can be inherited by a Codex child, so the explicit Claude
// markers decide first.
const CLAUDE_ENTRYPOINTS = new Set(['claude-desktop', 'claude-desktop-3p', 'cli', 'sdk-ts', 'sdk-py']);
function callerSessionId(env = process.env) {
  const claude = env.CLAUDECODE === '1' || CLAUDE_ENTRYPOINTS.has(env.CLAUDE_CODE_ENTRYPOINT);
  return !claude && String(env.CODEX_THREAD_ID ?? '').trim() ? env.CODEX_THREAD_ID : env.CLAUDE_CODE_SESSION_ID;
}

/** CLI context uses its exact session and folder, while the stdio bridge follows
 * the session the SessionStart hook recorded across /clear and /resume. Explicit IDs win. */
export function tenantToolContext({ host, sessionId = callerSessionId(), solutionId, cwd = process.cwd(), home } = {}) {
  const tenant = normalizeTenant(host), folder = canonicalCwd(home ?? cwd);
  const { sessions } = readRegistry();
  const entry = sessionId ? sessions[sessionId] : null;
  const own = entry?.tenant === tenant && entry.cwd === folder ? entry : null;
  // A session with no entry of its own here (signed in again before reopening, or
  // a new id after /clear) still names the folder's solution on this tenant.
  const folderSession = own ? null : sessionForFolder(folder);
  const matching = own ?? (folderSession?.tenant === tenant ? folderSession : null);
  const resolvedSolutionId = solutionId === undefined ? matching?.solutionId : solutionId;
  const identity = { sessionId, solutionId: resolvedSolutionId, version: pluginVersion() };
  return { tenant, url: tenantMcp(tenant).url, cookie: readCookie(tenant), home: null, identity, client: clientHeaders(identity) };
}

// Claude Code closes a stdio MCP server whose reply line is over 16 MiB, and
// the builder then sees only 'Connection closed' (a 40 MB get_interface_version
// did this). So no line this process writes is longer than 15 MB, with room for
// the JSON-RPC wrapping. The tenant's answer itself may be up to 100 MB, since
// the CLI's own reads (a whole app from `get_app_entities`) run in-process and
// never reach Claude Code; past that it is not read. Either way the caller gets
// a named error instead of a dropped connection.
const MAX_REPLY_BYTES = 15 * 1024 * 1024;
const MAX_TENANT_REPLY_BYTES = 100 * 1024 * 1024;
const tooLarge = (msg, tenant, limit = '15 MB, more than Claude Code takes in one reply') => new UaError('REPLY_TOO_LARGE',
  `${msg?.method === 'tools/call' && msg.params?.name ? msg.params.name : 'The tenant'} answered more than ${limit}, so it was not passed on. `
  + 'Nothing changed on the tenant. Ask for less: fewer ids, one page, or a summary view.', { host: tenant });

// One call, one deadline. Every tenant tool answers well inside a minute except
// these. The app-testing submission: `deliver_steps` compiles the case and runs it
// in a live browser, and that green-gate run alone takes up to 300 seconds, so it
// gets 450. A test run: `trigger_workflow_run` waits up to 90 seconds for the run
// on the server, so it gets 150, which leaves
// room for the reply; cut at 60, a longer run lost its runId. A batch of test
// questions: `send_test_messages` asks up to 60, 4 at a time (15 rounds of up
// to 50 seconds each), then waits up to 2.5 minutes for the traces, so it gets
// 900. The three big page writes make one platform save after another, one per
// page, source or step: cut at 60, a 20-step `apply_page_edits` and 7 sources of
// `create_data_sources` were still writing and landed anyway, so they get 180.
// The two evaluation reads of one experiment run's scores walk the run 200 rows a page, up
// to 25 pages of up to 30 seconds each on the server, so they get 180 too.
// The CLI's app read: `get_app_entities` makes up to two platform reads of a
// whole app, each allowed 60 seconds, so it gets 150. The API Platform's
// `call_api` waits up to 120 seconds for the API's answer, and makes and removes a
// test caller around it, so it gets 180. A custom connector's list writes save,
// switch, import or delete up to 10 items one after another, each a few platform
// calls, and `test_connector_action` makes a test connection and then runs the
// request in the other app, so they get 180 too. The changeset send and export each
// make the platform pack the bundle inside the call, and a send then waits for the
// secret scan, so they get 180; the review asks the platform one dependency level
// at a time, up to 8, so it gets 120. The agent-builder `upload_file` sends up to
// 20 MB and the server allows its upload 120 seconds, so it gets 180. The knowledge
// tools that take a list make several platform calls per item, one item after
// another: `add_knowledge` (up to 20 sources) gets 180, and `update_knowledge`,
// `list_knowledge_apps` (each app's actions read one by one) and
// `delete_knowledge_sets` (each set's agents and sources read first) get 120.
// Claude Code's own per-call limit is about 28 hours, so this deadline is the
// one that counts. On code-builder a push and a publish each run the app's whole
// build on the engine (llm-tools allows 330 and 450 seconds for them), a codebase
// download zips a branch (120), creating an app seeds its scaffold and writes
// four platform records, and a dataSource create makes up to five records and
// waits out the page each hangs from: llm-tools allows each source 120, so a data
// sources call gets 130 for every source it asks for, and one minute more. A compare is one pull (120); a restore
// is a pull and then a push (120 + 330).
const CALL_TIMEOUT_MS = 60_000;
const TOOL_TIMEOUT_MS = { deliver_steps: 450_000, trigger_workflow_run: 150_000, send_test_messages: 900_000,
  apply_page_edits: 180_000, create_pages: 180_000, create_auth_pages: 180_000, create_data_sources: 180_000, upload_public_file: 180_000,
  experiment_scorecard: 180_000, get_run_results: 180_000, get_app_entities: 150_000, get_definitions: 150_000, call_api: 180_000,
  save_connector_action: 180_000, save_connector_trigger: 180_000, save_connector_authentication: 180_000,
  import_connector_actions: 180_000, set_connector_resource_enabled: 180_000, test_connector_action: 180_000,
  delete_connector_action: 180_000, delete_connector_trigger: 180_000, delete_connector_authentication: 180_000,
  send_changeset: 180_000, export_changeset: 180_000, review_changeset: 120_000,
  upload_file: 180_000, add_knowledge: 180_000, update_knowledge: 120_000, list_knowledge_apps: 120_000,
  delete_knowledge_sets: 120_000,
  push_code_patch: 360_000, publish_code_app: 480_000, get_branch_codebase: 150_000, create_code_app: 120_000,
  compare_code_versions: 150_000, restore_code_version: 480_000 };
// One engine call per source, each allowed 120 seconds by llm-tools.
const DATA_SOURCE_MS = 130_000;
export const callTimeoutMs = (msg) => {
  if (msg?.method !== 'tools/call') return CALL_TIMEOUT_MS;
  if (msg.params?.name === 'create_code_app_data_sources') {
    const sources = msg.params.arguments?.sources;
    return CALL_TIMEOUT_MS + DATA_SOURCE_MS * Math.max(1, Array.isArray(sources) ? sources.length : 1);
  }
  return TOOL_TIMEOUT_MS[msg.params?.name] || CALL_TIMEOUT_MS;
};

// The deadline only stops the wait here, never the tenant's save. So a call that
// ran out of time says a write may have landed, and to read before sending again.
function noAnswer(msg, deadline, tenant) {
  const seconds = Math.round(deadline / 1000);
  const tool = msg?.method === 'tools/call' ? msg.params?.name : null;
  return new UaError('PLATFORM_UNREACHABLE', tool
    ? `No answer from ${tool} within ${seconds} seconds. If it writes, the write may still have landed: read the item back before you send it again.`
    : `No answer from the tenant within ${seconds} seconds.`, { host: tenant, timeoutSeconds: seconds });
}

async function responseText(response, msg, tenant) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > MAX_TENANT_REPLY_BYTES) {
      await response.body.cancel().catch(() => {});
      throw tooLarge(msg, tenant, '100 MB');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const PAGE_EDITS = 'apply_page_edits';
const SAVE_WORKFLOW = 'compile_and_save_workflow';
const OPEN_WORKFLOW = 'open_workflow';
const PUBLIC_UPLOAD = 'upload_public_file';
// The agent-builder upload takes the same bytes. Another server may name a tool
// `upload_file` too, so it is known by its route as well as its name.
const AGENT_BUILDER = '/mcp/agent-builder';
const AGENT_UPLOAD = 'upload_file';
const isFileUpload = (name, target) => name === PUBLIC_UPLOAD || (target === AGENT_BUILDER && name === AGENT_UPLOAD);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// The tenant's own ceiling for `upload_public_file`; a bigger file is refused here, before it is read.
const MAX_PUBLIC_FILE_BYTES = 20 * 1024 * 1024;
const WHERE_FILES_GO = 'Put it in the work folder your message names.';
const ARGS_FILE_HELP = 'Path to a .json file holding every argument of this call except host, interfaceId and agent: '
  + `{"pageId": "…", "steps": [ … ]}. ${WHERE_FILES_GO} `
  + 'Nothing is sent until the file passes a check: a JSON mistake or a bad step comes back with its line number, '
  + 'so the fix is one edit to that line. Use it for any call with more than a few steps or with a condition object.';
const SETTINGS_FILE_HELP = 'Path to a .json file holding every argument of this call except host: '
  + `{"appId": "…", "panel": "…", "values": { … }}. ${WHERE_FILES_GO} `
  + 'Use it for a long value, such as a custom code header: make the file with a script, so the text is never typed out.';
const THEME_FILE_HELP = 'Path to a .json file holding every argument of this call except host, such as the file '
  + `app-look-args.mjs theme writes. ${WHERE_FILES_GO} Use it so the colours and raw tokens are never typed out.`;
const CODE_FILE_HELP = 'Path to a .ts file holding the whole workflow code, sent as `code`. Use it instead of `code` for a long automation: '
  + `write the code open_workflow returned to the file, edit it there, and pass the path. ${WHERE_FILES_GO}`;
const textFileHelp = (key, what) => `Path to a .md file holding ${what}, sent as \`${key}\`. Use it instead of \`${key}\` for a long text: `
  + `write the text to the file, edit it there, and pass the path. ${WHERE_FILES_GO}`;
const OUT_FILE_HELP = 'Path to a .ts file to write the returned `code` to, instead of answering it inline. '
  + 'The reply then names the file in `codeFile` with its length. Edit the file there and pass the same path to '
  + `compile_and_save_workflow as \`codeFile\`. An existing file is overwritten. ${WHERE_FILES_GO}`;
const FILE_PATH_HELP = 'Path to the file to upload, sent as `contentBase64` with its own name as `fileName` unless you give one. '
  + 'It must be in the working folder or a temp folder: copy a file the person named from elsewhere into the working folder first. At most 20 MB.';
const INSTRUCTIONS_FILE = { key: 'instructions', input: 'instructionsFile', extension: '.md', help: textFileHelp('instructions', 'the whole instruction text') };

// The long inputs a tool takes inline, and the file the bridge reads in their
// place, so a long text is never retyped into one tool call. `argsFile` is a
// .json file with the call's arguments, checked before anything is sent; the
// others hold one text each.
const ARGS_FILES = {
  [PAGE_EDITS]: { onCall: ['host', 'interfaceId'], help: ARGS_FILE_HELP, check: true },
  update_app_settings: { onCall: ['host'], help: SETTINGS_FILE_HELP, check: false },
  set_app_theme: { onCall: ['host'], help: THEME_FILE_HELP, check: false },
  set_theme_typography: { onCall: ['host'], help: THEME_FILE_HELP, check: false },
};
const TEXT_FILES = {
  [SAVE_WORKFLOW]: { key: 'code', input: 'codeFile', extension: '.ts', help: CODE_FILE_HELP },
  save_skill: { key: 'body', input: 'bodyFile', extension: '.md', help: textFileHelp('body', 'the whole skill text') },
  create_agent: INSTRUCTIONS_FILE,
  update_agent: INSTRUCTIONS_FILE,
  save_task: INSTRUCTIONS_FILE,
};
// The long text a tool answers, and the file the bridge writes it to in its
// place, so a long automation reaches the disk without being retyped. The
// reply keeps everything else and names the file.
const OUT_FILES = {
  [OPEN_WORKFLOW]: { key: 'code', input: 'outFile', extension: '.ts', help: OUT_FILE_HELP },
};
const argsFileOf = (name) => (Object.hasOwn(ARGS_FILES, name ?? '') ? ARGS_FILES[name] : null);
const textFileOf = (name) => (Object.hasOwn(TEXT_FILES, name ?? '') ? TEXT_FILES[name] : null);
const outFileOf = (name) => (Object.hasOwn(OUT_FILES, name ?? '') ? OUT_FILES[name] : null);
const CODE_BUILDER = '/mcp/code-builder';
const CODEBASE = 'get_branch_codebase';
const PUSH = 'push_code_patch';
const DATA_SOURCES = 'create_code_app_data_sources';
// Code Builder's skills, read from the tenant's engine at run time
const SKILL_READS = new Set(['list_code_skills', 'read_code_skill']);
const LOCAL_PATH_HELP = 'The checkout get_branch_codebase wrote, relative to the working folder: `<appId>/<branch>`, '
  + 'for example `app-f4f71b82094d/main`. The bridge sends your whole change there — `git diff` against the commit you '
  + 'downloaded — as `patch`. Send it instead of `patch`.';
const DATA_SOURCES_PATH_HELP = 'The checkout get_branch_codebase wrote, relative to the working folder: `<appId>/<branch>`. '
  + 'The bridge writes the files the call answers into that checkout (Storage: `src/data/bindings.ts`; an automation: its '
  + 'binding in `src/data/callables.ts`), so your next push carries them, and answers without them. A source the copy '
  + 'already has is not sent: it answers `inCopy: true`.';
const RESOLVED_HELP = 'With localPath: the files the last pull listed under `unmarked` that you decided to leave exactly as the pull left '
  + 'them. A push is refused while such a file is untouched and not named here, so leaving one as it is has to be a decision.';

// Advertise the file input a tool takes, and let the file carry what the call would otherwise need.
function withFileInput(tool, target) {
  if (!tool?.inputSchema?.properties) return tool;
  const { inputSchema } = tool;
  if (isFileUpload(tool.name, target)) {
    return { ...tool, inputSchema: {
      ...inputSchema,
      properties: { ...inputSchema.properties, filePath: { type: 'string', description: FILE_PATH_HELP } },
      required: (inputSchema.required ?? []).filter((key) => key !== 'contentBase64' && key !== 'fileName'),
    } };
  }
  const outFile = outFileOf(tool.name);
  if (outFile) {
    return { ...tool, inputSchema: { ...inputSchema, properties: { ...inputSchema.properties, [outFile.input]: { type: 'string', description: outFile.help } } } };
  }
  if (tool.name === PUSH) {
    return { ...tool, inputSchema: {
      ...inputSchema,
      properties: { ...inputSchema.properties, localPath: { type: 'string', description: LOCAL_PATH_HELP },
        resolved: { type: 'array', items: { type: 'string' }, description: RESOLVED_HELP } },
      required: (inputSchema.required ?? []).filter((key) => key !== 'patch'),
    } };
  }
  if (tool.name === DATA_SOURCES) {
    return { ...tool, inputSchema: {
      ...inputSchema,
      properties: { ...inputSchema.properties, localPath: { type: 'string', description: DATA_SOURCES_PATH_HELP } },
    } };
  }
  const argsFile = argsFileOf(tool.name), textFile = textFileOf(tool.name);
  if (!argsFile && !textFile) return tool;
  const [input, help] = argsFile ? ['argsFile', argsFile.help] : [textFile.input, textFile.help];
  return { ...tool, inputSchema: {
    ...inputSchema,
    properties: { ...inputSchema.properties, [input]: { type: 'string', description: help } },
    required: (inputSchema.required ?? []).filter((key) => (argsFile ? argsFile.onCall.includes(key) : key !== textFile.key)),
  } };
}

// Where a file the model names may be: the working folder this bridge serves
// (it holds the work folder a builder's message names), the
// folder this process runs in, or a temp folder. Anything else is refused, so the
// bridge cannot be used to read files the model has no business opening.
const TEMP_FOLDERS = [os.tmpdir(), '/tmp'];

// The solution home registered for the CURRENT Claude session id, read fresh
// per call (the registry is already re-read per call elsewhere in this file,
// e.g. callContext() — never cached, since the session can move to a new
// folder mid-process in ways this process has no other way to learn of).
// `process.cwd()` is fixed at spawn time and cannot follow a move, and
// `ctx.home` is null on some branches (a sign-in or tenant-only session with
// no solution open yet); this closes that gap without widening the sandbox: a
// session's own `.sessions/<id>/work/` folder is strictly narrower than the OS
// temp dir TEMP_FOLDERS already allows.
function sessionHome(sessionId) {
  if (!sessionId) return null;
  try { return readRegistry().sessions[sessionId]?.path ?? null; } catch { return null; }
}

// The native realpath names a folder the way the disk does, so a path typed in
// another letter case (macOS folders ignore case) still matches its folder.
function locateFile(file, { input, folders }) {
  const resolved = path.resolve(String(file));
  let real;
  try { real = fs.realpathSync.native(resolved); } catch { return { problem: `${input} ${resolved} does not exist. Write the file first, then call again.` }; }
  const roots = [...new Set(folders.filter(Boolean).flatMap((dir) => { try { return [fs.realpathSync.native(dir)]; } catch { return []; } }))];
  if (!roots.some((root) => real.startsWith(root + path.sep))) {
    return { problem: `${input} must be inside ${roots.join(' or ')}, not ${real}. Write it to the work folder your message names, then call again.` };
  }
  if (!fs.statSync(real).isFile()) return { problem: `${input} ${real} is not a file.` };
  return { file: real, size: fs.statSync(real).size };
}

function readFileArgument(file, { input, extension, folders }) {
  const resolved = path.resolve(String(file));
  if (path.extname(resolved) !== extension) return { problem: `${input} must be a ${extension} file, not ${resolved}.` };
  const found = locateFile(file, { input, folders });
  if (found.problem) return found;
  if (found.size > MAX_FILE_BYTES) return { problem: `${input} ${found.file} is larger than 2 MB.${input === 'argsFile' ? ' Split the steps over two calls.' : ''}` };
  return { file: found.file, text: fs.readFileSync(found.file, 'utf8') };
}

// The file to upload from `filePath`, as the bytes the tool takes, or the reason nothing was sent.
// Same folders as every other file input: a public upload is the last place the bridge should
// read a file the person never named, so one from elsewhere is copied in first, on purpose.
function publicFileArguments({ filePath, ...inline }, folders, name = PUBLIC_UPLOAD) {
  if (filePath === undefined) return { args: inline };
  if (inline.contentBase64 !== undefined) return { problem: 'Nothing was sent: send `contentBase64` or `filePath`, not both.' };
  const found = locateFile(filePath, { input: 'filePath', folders });
  if (found.problem) return { problem: `Nothing was sent: ${found.problem}` };
  if (found.size === 0) return { problem: `Nothing was sent: ${found.file} is empty.` };
  if (found.size > MAX_PUBLIC_FILE_BYTES) return { problem: `Nothing was sent: ${found.file} is larger than 20 MB, the most ${name} takes.` };
  return { args: { fileName: path.basename(found.file), ...inline, contentBase64: fs.readFileSync(found.file).toString('base64') } };
}

// Where a reply's text may be written, checked before the call is sent: a file
// of the right kind, in a folder that already exists inside the allowed ones. An
// existing file is overwritten, but never through a link that leads elsewhere.
function outFileTarget(file, { input, extension, folders }) {
  const resolved = path.resolve(String(file));
  if (path.extname(resolved) !== extension) return { problem: `Nothing was sent: ${input} must be a ${extension} file, not ${resolved}.` };
  let folder;
  try { folder = fs.realpathSync.native(path.dirname(resolved)); } catch { return { problem: `Nothing was sent: the folder of ${input} ${resolved} does not exist. Make it first, then call again.` }; }
  const target = path.join(folder, path.basename(resolved));
  if (fs.existsSync(target)) {
    const found = locateFile(target, { input, folders });
    return found.problem ? { problem: `Nothing was sent: ${found.problem}` } : { file: found.file };
  }
  const roots = [...new Set(folders.filter(Boolean).flatMap((dir) => { try { return [fs.realpathSync.native(dir)]; } catch { return []; } }))];
  if (!roots.some((root) => target.startsWith(root + path.sep))) {
    return { problem: `Nothing was sent: ${input} must be inside ${roots.join(' or ')}, not ${target}. Name a file in the work folder your message names, then call again.` };
  }
  return { file: target };
}

// The reply with its text written to the file and named in its place. A reply
// that is a failure, or carries no such text (a workflow the DSL cannot express
// answers no code), is passed on unchanged and nothing is written.
function withOutFile(result, { key }, file) {
  const item = result?.content?.[0];
  if (!result || result.isError || result.content.length !== 1 || item?.type !== 'text') return result;
  let answer;
  try { answer = JSON.parse(item.text); } catch { return result; }
  if (typeof answer?.[key] !== 'string') return result;
  const { [key]: text, ...rest } = answer;
  fs.writeFileSync(file, text);
  const lines = text.split('\n').length;
  const named = { ...rest, codeFile: file, codeChars: text.length, codeLines: lines,
    written: `The ${key} (${text.length} characters, ${lines} lines) is in ${file}, exactly as the tenant returned it. Edit it there and save it with compile_and_save_workflow and this codeFile.` };
  return { ...result, content: [{ type: 'text', text: JSON.stringify(named, null, 2) }] };
}

// The text to send from a text file input, or the reason nothing was sent.
// A tool whose schema takes the text as a list of strings (`save_task`'s
// `instructions`) gets the file text as a one-entry list, else the tenant refuses it.
function textFileArguments(args, { key, input, extension }, schema, folders) {
  const { [input]: file, ...inline } = args;
  if (file === undefined) return { args: inline };
  if (inline[key] !== undefined) return { problem: `Nothing was sent: send \`${key}\` or \`${input}\`, not both.` };
  const read = readFileArgument(file, { input, extension, folders });
  if (read.problem) return { problem: `Nothing was sent: ${read.problem}` };
  if (!read.text.trim()) return { problem: `Nothing was sent: ${read.file} is empty.` };
  const wanted = schema?.properties?.[key]?.type === 'array';
  return { args: { ...inline, [key]: wanted ? [read.text] : read.text } };
}

// The arguments to send from an `argsFile`, checked as page edits when the tool
// takes steps, or the reason nothing was sent.
function argsFileArguments({ argsFile, ...inline }, { onCall, check }, schema, folders) {
  let fromFile = {}, text, wrapped = false, file = 'the call';
  if (argsFile !== undefined) {
    const read = readFileArgument(argsFile, { input: 'argsFile', extension: '.json', folders });
    if (read.problem) return read;
    ({ file, text } = read);
    const parsed = parseJsonText(text);
    if (parsed.problem) return { problem: `Nothing was sent: ${file} is not valid JSON.\n${parsed.problem}\nFix that line in the file, then call again with the same argsFile.` };
    wrapped = check && Array.isArray(parsed.value);
    fromFile = wrapped ? { steps: parsed.value } : parsed.value;
    if (fromFile === null || typeof fromFile !== 'object' || Array.isArray(fromFile)) {
      return { problem: `Nothing was sent: ${file} must hold an object such as ${check ? '{"pageId": "…", "steps": [ … ]}' : '{"appId": "…", …}'}.` };
    }
    const misplaced = Object.keys(fromFile).filter((key) => onCall.includes(key));
    if (misplaced.length) return { problem: `Nothing was sent: ${misplaced.join(' and ')} go on the call, not in ${file}.` };
    const both = Object.keys(fromFile).filter((key) => key in inline);
    if (both.length) return { problem: `Nothing was sent: ${both.join(', ')} is both on the call and in ${file}. Keep one.` };
  }
  const args = { ...fromFile, ...inline };
  const problems = check ? pageEditProblems(args, schema) : [];
  if (!problems.length) return { args };
  const lines = problems.map(({ path: at, message }) => {
    const line = text !== undefined && at[0] in fromFile ? lineOfPath(text, wrapped ? at.slice(1) : at) : undefined;
    return `- ${line ? `line ${line}, ` : ''}${pathText(at)}: ${message}`;
  });
  return { problem: `Nothing was sent: ${problems.length === 1 ? '1 problem' : `${problems.length} problems`} in ${file}.\n${lines.join('\n')}` };
}

// Every app, AI agent, automation, object and knowledge set made through UnifyApps Headless carries the
// `UnifyApps Headless` tag, as a solution does, kept beside any tags the call sends. Only a
// create gets it: an update would replace the tags the item already has.
const withTag = (tags) => (tags === undefined ? [SOLUTION_TAG]
  : Array.isArray(tags) && !tags.includes(SOLUTION_TAG) ? [...tags, SOLUTION_TAG] : tags);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export function withUaTag(name, args) {
  if (!isObject(args)) return args;
  if (name === 'create_app' || name === 'create_agent' || (name === SAVE_WORKFLOW && !args.workflowId)) {
    return { ...args, tags: withTag(args.tags) };
  }
  if (name === 'save_knowledge_sets' && Array.isArray(args.knowledgeSets)) {
    return { ...args, knowledgeSets: args.knowledgeSets.map((set) => (isObject(set) && !set.knowledgeSetId
      ? { ...set, tags: withTag(set.tags) } : set)) };
  }
  if (name === 'apply_object_batch' && Array.isArray(args.steps)) {
    return { ...args, steps: args.steps.map((step) => (step?.tool === 'create_object' && isObject(step.args)
      ? { ...step, args: { ...step.args, tags: withTag(step.args.tags) } } : step)) };
  }
  return args;
}

// A deploy or publish names the change it ships at the end of its
// `deploymentNotes`, so the deployment can be traced back: `[ua plan <id>]`
// when exactly one of this session's plans has a running deploy, publish or
// automation-shell task on the same automation or app, else `[ua task <id>]`
// for the session's current chat task, else nothing. Builders once typed the tag
// by hand and invented ones such as `[ua plan chat-task]`. Notes that already
// hold a tag are left alone, and a lookup that fails sends the notes unchanged.
// `HAS_TAG` also matches the former `[nebula …]` spelling, so a note tagged by
// an older copy is not tagged twice.
const NOTES_TOOLS = Object.freeze({ deploy_workflow: 'workflowId', publish_app: 'appId' });
const RELEASE_KINDS = new Set(['deploy', 'publish', 'automation-shell']);
const HAS_TAG = /\[(?:ua|nebula) (plan|task) /u;
export function changeTag(name, args, { state, plans = [], sessionId } = {}) {
  const idKey = NOTES_TOOLS[name];
  if (!idKey || !isObject(args)) return null;
  const id = args[idKey];
  const ours = new Set(Array.isArray(state?.planIds) ? state.planIds : []);
  const matched = !id ? [] : plans.filter((plan) => plan?.id
    && (ours.has(plan.id) || (sessionId && plan.meta?.runner?.claudeSessionId === sessionId))
    && (plan.tasks ?? []).some((task) => task?.status === 'running' && RELEASE_KINDS.has(task.kind) && task.entity?.id === id));
  if (matched.length === 1) return `[ua plan ${matched[0].id}]`;
  const taskId = state?.currentTask?.id;
  return typeof taskId === 'string' && taskId ? `[ua task ${taskId}]` : null;
}
// The plans cached in the solution folder, with their tasks. `changeTag` keeps
// only this session's: the ones it made or started (`planIds`) and the ones it
// runs now, since a resumed plan is not in `planIds`.
function cachedPlans(home) {
  return readRecords(home, 'plan').flatMap((record) => {
    try {
      const { meta, tasks } = parsePlan(record?.properties?.plan);
      return [{ id: record.id, meta, tasks }];
    } catch { return []; }
  });
}
export function withChangeTag(name, args, { home, sessionId } = {}) {
  if (!NOTES_TOOLS[name] || !isObject(args) || !home) return args;
  const notes = args.deploymentNotes;
  if (notes !== undefined && typeof notes !== 'string') return args;
  if (HAS_TAG.test(notes ?? '')) return args;
  let tag = null;
  try {
    const state = readState(home, sessionId);
    tag = changeTag(name, args, { state, plans: cachedPlans(home), sessionId });
  } catch { /* the call still goes out with its own notes */ }
  if (!tag) return args;
  return { ...args, deploymentNotes: notes?.trim() ? `${notes.trimEnd()} ${tag}` : tag };
}

// A key the API Platform answers once never reaches the model. The bridge writes
// it to `.sessions/<sessionId>/secrets/<profileId>.txt` (owner-only) and the reply
// names that file in `secretFile` instead. A model that saved the key itself typed
// it into a shell command, which a saved session then uploaded unmasked. A reply the
// bridge cannot write the file for goes on unchanged, so the key is never lost.
const API_GATEWAY = '/mcp/api-gateway';
const KEY_TOOLS = new Set(['save_access_profile', 'rotate_access_profile_key', 'create_oauth_token']);
export function keepKeyOut(replies, { home, sessionId } = {}, name, args = {}) {
  if (!home || !sessionId || !Array.isArray(replies)) return replies;
  return replies.map((reply) => {
    const [part, ...rest] = reply?.result?.content ?? [];
    if (reply?.result?.isError || part?.type !== 'text') return reply;
    let answer;
    try { answer = JSON.parse(part.text); } catch { return reply; }
    if (typeof answer?.secret !== 'string' || !answer.secret) return reply;
    const id = String(args.profileId ?? answer.profileId ?? answer.readBack?.profileId ?? 'key').replace(/[^A-Za-z0-9_-]/g, '_');
    const file = path.join(home, '.sessions', sessionId, 'secrets', `${id}${name === 'create_oauth_token' ? '-token' : ''}.txt`);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, `${answer.secret}\n`, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
    } catch { return reply; }
    const { secret, ...kept } = answer;
    return { ...reply, result: { ...reply.result, content: [{ ...part, text: JSON.stringify({ ...kept, secretFile: file }, null, 2) }, ...rest] } };
  });
}

// llm-tools refuses a call carrying `x-ua-plugin-version` when the signed-in
// person's role lacks the AGENT_LLM_TOOLS action the tool needs, with one fixed
// sentence (`PERMISSION_DENIED` below) in the error envelope of that tool's
// family: the bare text, `{ ok: false, error }` or `errors[].errorPayload.message`. A builder's two tries would send it again,
// and the CLI read it as an outage. A permission read that fails (a 5xx, its own
// timeout) gets the same sentence, and a dead cookie makes it fail: the production
// gate's verdict is kept for an hour, so such a cookie still reaches the tool. So
// the sign-in is checked first, and a dead one is AUTH_EXPIRED, as a 401 or 403 is;
// and since the bridge cannot tell a missing permission from a failed read, the
// line says both (`permissionRequiredText`).
const PERMISSION_DENIED = "You don't have permission to perform this action.";
const isDenied = (value) => typeof value === 'string' && value.trim() === PERMISSION_DENIED;
export function isPermissionRefusal(reply) {
  if (reply?.result?.isError !== true) return false;
  return (reply.result.content ?? []).some((item) => {
    if (typeof item?.text !== 'string' || !item.text.includes(PERMISSION_DENIED)) return false;
    if (isDenied(item.text)) return true;
    let answer;
    try { answer = JSON.parse(item.text); } catch { return false; }
    const errors = Array.isArray(answer?.errors) ? answer.errors : [];
    return [answer?.error, answer?.error?.message, answer?.message,
      ...errors.map((entry) => entry?.errorPayload?.message ?? entry?.message)].some(isDenied);
  });
}
// verifyCookie's answer as this path reads it: 401, or an answer that names no
// one, is a sign-in that ran out, and so is 403, as `readContext` and the
// bridge's own HTTP path read it (login keeps 403 indeterminate). Anything else
// it cannot read (a 5xx, a lost connection, another status) leaves it unchecked.
const signInState = (answer) => (answer?.state === 'invalid' || answer?.status === 403 ? 'expired'
  : answer?.state === 'valid' ? 'valid' : 'unchecked');
// A script that sends one call to 150 items, each refused, would make 150 sign-in
// reads; the verdict is kept 30 seconds (as long as llm-tools keeps a permission
// answer) per tenant and cookie, in memory only, so a new sign-in is checked at
// once, and refusals side by side share one read.
const SIGN_IN_VERDICT_MS = 30_000;
function signInVerdicts(verify) {
  const kept = new Map();
  return (ctx) => {
    const last = kept.get(ctx.tenant);
    if (last && last.cookie === ctx.cookie && Date.now() - last.at < SIGN_IN_VERDICT_MS) return last.verdict;
    const verdict = Promise.resolve().then(() => verify(ctx.tenant, ctx.cookie)).then(signInState, () => 'unchecked');
    kept.set(ctx.tenant, { at: Date.now(), cookie: ctx.cookie, verdict });
    return verdict;
  };
}
function featureFlagOffText({ host }) {
  return `The UnifyApps Headless MCP tools feature flag is turned off on ${host}. To enable it, go to Platform Settings → Feature Flags and turn it on.\n`
    + `Note: If the issue continues after enabling it, sign out of the current ${host} session and sign back in to start with a fresh cookie.`;
}
function permissionRequiredText({ host, tool, email, signIn }) {
  const who = email || 'the signed-in person';
  // This refusal reads the same whether the role truly lacks the permission
  // or the tenant just failed to read the role's permissions for a moment, and
  // nothing here tells the two apart. So the fix is named, but calling again
  // is never ruled out as the thing that clears it.
  return `${host} refused ${tool || 'the call'}: you don't have access to this tool. UnifyApps Headless's tool calls there need the AGENT_LLM_TOOLS permission on ${who}'s role `
    + '(VIEW to read, and CREATE, EDIT and DELETE to build, or ALL). '
    + 'UnifyApps Headless cannot tell from this refusal alone whether the role truly lacks it or the tenant just failed to read the role\'s permissions just then. '
    + 'If the role does not have it, a tenant admin must add it. '
    + `Either way, if ${who} already holds it, the call can be sent once more after a minute.`
    + (signIn === 'unchecked' ? ` UnifyApps Headless could not check the sign-in on ${host} just then either; if that call is refused too, check the sign-in with /ua:setup.` : '');
}
async function permissionError(ctx, tool, signInOf, everSucceeded) {
  const signIn = await signInOf(ctx);
  if (signIn === 'expired') return new UaError('AUTH_EXPIRED', { host: ctx.tenant });
  if (!everSucceeded) return new UaError('PERMISSION_REQUIRED', featureFlagOffText({ host: ctx.tenant }), { host: ctx.tenant, tool });
  const email = ctx.identity?.userEmail ?? (await fetchUserIdentity(ctx.tenant, { cookie: ctx.cookie }))?.email;
  const details = { host: ctx.tenant, tool, ...(email ? { email } : {}), ...(signIn === 'unchecked' ? { signIn } : {}) };
  return new UaError('PERMISSION_REQUIRED', permissionRequiredText(details), details);
}

const KNOWLEDGE = 'get_app_builder_knowledge';
const APP_BUILDER = '/mcp/application-builder';

// Every tenant write that changes an entity the cache may hold a copy of, and
// what it marks stale before the call leaves this process: the page it names,
// the object or automation it names, or the whole app when an app-level write
// names its pages in a shape the bridge does not parse. A dry run writes nothing
// and marks nothing. The first theme write points the app at a new theme of its
// own, so the theme writes mark the app too. The live-names check
// checks every name here against the tenant's live tool list.
const APP_WRITES = ['apply_interface_version_diff', 'apply_navigation_edits', 'apply_permission_edits', 'copy_entities',
  'create_auth_pages', 'create_data_sources', 'create_modules', 'create_pages', 'delete_data_sources', 'delete_pages', 'move_entities',
  'move_interface_to_package', 'prepare_data_source', 'publish_app', 'set_app_visibility', 'set_pages_visibility',
  'update_app_settings', 'update_data_sources', 'update_event_actions', 'update_page_contracts', 'update_page_paths', 'update_pages',
  'save_app_namespace', 'set_app_theme', 'set_theme_typography', 'set_theme_component_style', 'set_theme_custom_css',
  'set_navigation_style',
  // code-builder's writes to a code app's interface record and its dataSources, which the cache holds as its app
  'update_code_app_settings', 'create_code_app_data_sources'];
// Every agent-builder write that names the agent it changes in `agentId`.
// `create_agent` names none, because the agent does not exist yet and nothing is
// cached for it; `remove_task`, `save_skill` and `update_tools` name a task,
// skill or tool id instead, and those are separate entities the agent record
// does not carry, so a refresh of the agent would not change either way.
const AGENT_WRITES = ['add_app_action', 'add_knowledge', 'add_tools', 'attach_knowledge_sets', 'attach_skills',
  'deploy_agent', 'detach_knowledge_sets', 'detach_skills',
  'publish_agent', 'remove_deployment', 'remove_knowledge', 'remove_tools', 'save_task', 'set_guardrails', 'update_agent'];
export const CACHE_WRITES = Object.freeze({
  [PAGE_EDITS]: 'page',
  apply_object_batch: 'object', delete_object: 'object',
  compile_and_save_workflow: 'automation', deploy_workflow: 'automation',
  ...Object.fromEntries(AGENT_WRITES.map((name) => [name, 'ai-agent'])),
  ...Object.fromEntries(APP_WRITES.map((name) => [name, 'app'])),
});
// The cached copies one write invalidates: the kind and id each tool names.
// Pure, so nothing here can throw: a shape the tool does not expect simply
// yields no targets, and the tenant refuses the call with its own message,
// exactly as before the cache existed.
function cacheWriteTargets(name, rawArgs) {
  const kind = Object.hasOwn(CACHE_WRITES, name ?? '') ? CACHE_WRITES[name] : null;
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  if (!kind || args.dryRun === true) return [];
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const ids = kind === 'object' ? (name === 'delete_object' ? [args.objectId] : steps.map((step) => step?.args?.objectId))
    : kind === 'automation' ? [args.workflowId]
      : kind === 'ai-agent' ? [args.agentId]
        : kind === 'app' ? [args.interfaceId ?? args.appId] : [args.pageId];
  return ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => ({ kind, id, interfaceId: args.interfaceId }));
}
// Whether the call's own reply says the write actually went through: a
// matching reply with a result the tenant did not flag as an error. No
// reply at all (a thrown error, a lost response) or an error result both
// mean nothing is known to have changed on the tenant.
function wroteSomething(msg, replies) {
  const reply = Array.isArray(replies) ? replies.find((item) => item?.id === msg.id) : null;
  return Boolean(reply?.result) && !reply.result.isError;
}
// The platform entity type behind each cached kind that keeps its own snapshots.
const ENTITY_TYPE_OF = Object.freeze({ object: 'ENTITY_TYPE', automation: 'WORKFLOW_DEFINITION', 'ai-agent': 'ai_agent' });
function markCacheDirty(home, name, args) {
  if (!home) return;
  for (const { kind, id, interfaceId } of cacheWriteTargets(name, args)) {
    // A marker that cannot be written (an id the cache would never store, a
    // full disk) costs one live read later. It never blocks the platform write,
    // and it never stops the next marker.
    try {
      if (kind === 'page') markCachedPageDirty(home, interfaceId, id);
      else if (kind === 'app') markCachedInterfaceDirty(home, id);
      else markCachedEntityDirty(home, ENTITY_TYPE_OF[kind], id);
    } catch { /* see above */ }
  }
}
// Claude Code saves a tool reply over about 25,000 tokens to a file unless the
// tool raises its own limit; 500,000 characters is the most it accepts.
// The changeset tools send and export as the person. The first live run showed
// a prose-only gate holding two times out of three, so the yes is a recorded
// step: `ua.mjs changeset confirm` writes the person's answer on the
// session state, and a save, send or export with no matching record is refused
// here before anything leaves (`lib/changeset-yes.mjs`). A create's record
// moves from the name to the id the tenant answers; a revert drops the id's
// record, since the next content needs a new answer.
const CHANGESET = '/mcp/changeset';
const GATED = new Set(GATED_TOOLS);
// The states a recorded answer may sit on, as [sessionId, state] pairs: this
// bridge's own Claude session first, when it has a state in this folder, then
// the session `bridgeContext` named. They differ when a second UnifyApps Headless session
// in the same folder was used more recently: `changeset confirm` wrote the yes
// on the session that asked (its exact CLAUDE_CODE_SESSION_ID), and the gate
// read only the newer one. Either holds only what `changeset confirm` wrote.
function changesetStates(ctx) {
  if (!ctx?.home || !ctx.identity?.sessionId) return null;
  // `ctx.home` is this session's own solution home, built by `bridgeContext`
  // from the registry. The bridge only auto-approves its own `process.cwd()`,
  // which is the solution home in a desktop session but not under the test
  // harness, so approve this home before reading or writing its state, the
  // way `homeForCwd` does for the CLI.
  try {
    approveFolder(ctx.home);
    const named = [ctx.identity.sessionId, readState(ctx.home, ctx.identity.sessionId) ?? {}];
    const own = process.env.CLAUDE_CODE_SESSION_ID;
    if (!own || own === ctx.identity.sessionId) return [named];
    let ownState = null;
    try { ownState = readState(ctx.home, own); } catch { /* not a session of this folder */ }
    return ownState ? [[own, ownState], named] : [named];
  } catch { return null; }
}
function changesetGate(ctx, name, args) {
  if (!GATED.has(name ?? '')) return null;
  const states = changesetStates(ctx);
  if (states === null) return 'Nothing was sent: a changeset is saved, sent or exported only with the person\'s recorded answer, which needs an open UnifyApps Headless solution. Run /ua:setup, then ask the person and run `node scripts/ua.mjs changeset confirm`.';
  const problems = states.map(([, state]) => gateProblem(state, name, args ?? {}));
  return problems.includes(null) ? null : problems[0];
}
function rememberChangesetAnswer(ctx, msg, replies) {
  const name = msg.params?.name, args = msg.params?.arguments ?? {};
  if (name !== 'save_changeset' && name !== 'revert_changeset_to_draft') return;
  const reply = replies.find((item) => item?.id === msg.id);
  if (!reply?.result || reply.result.isError) return;
  const states = changesetStates(ctx);
  if (states === null) return;
  const text = (reply.result.content ?? []).find((item) => item?.type === 'text')?.text;
  // The record moves or goes on whichever session's state held it.
  for (const [sessionId, state] of states) {
    const patch = name === 'save_changeset' ? afterSave(state, args, text) : afterRevert(state, args.id);
    if (!patch) continue;
    try { writeState(ctx.home, patch, sessionId); } catch { /* the tenant already answered; the next call says what is missing */ }
  }
}

const RESULT_LIMIT = 500_000;
const MOST_JOINED_CHARS = RESULT_LIMIT - 20_000;
const MOST_PAGES = 20;
const MOST_PAGE_MS = 120_000;
// The tool's own `nodes.maxItems` until a tools/list says otherwise.
const MOST_NODES = 25;

const EVENT_ACTIONS = 'update_event_actions';
// The application-builder tools that read or need knowledge tokens.
const KEEPS_TOKENS = new Set([KNOWLEDGE, PAGE_EDITS, EVENT_ACTIONS]);
const AGENT_HELP = 'Your builder name from the first line of your message, or main. '
  + 'The bridge keeps the token of every sheet you read under this name and adds them to your writes. '
  + 'It is never sent to the tenant.';
const HAVE_HELP = 'Send [] on your first knowledge read, and again after your context was summarised: '
  + 'the bridge then forgets the sheets it kept under your agent name and starts your list from this read. '
  + 'Leave it out on every other read: the bridge sends the tokens of every sheet you read.';
const TOKENS_HELP = 'Leave this out. The bridge adds the token of every sheet you read under your agent name.';

// The tenant's own text tells a builder to send `have` or `knowledgeTokens`; the
// bridge fills them from the builder's list, so the schema says to leave them out.
function withAgent(tool, target) {
  if (target !== APP_BUILDER || !KEEPS_TOKENS.has(tool?.name) || !tool.inputSchema?.properties) return tool;
  const { inputSchema } = tool;
  const [key, help] = tool.name === KNOWLEDGE ? ['have', HAVE_HELP] : ['knowledgeTokens', TOKENS_HELP];
  const properties = { ...inputSchema.properties, agent: { type: 'string', description: AGENT_HELP } };
  if (properties[key]) properties[key] = { ...properties[key], description: help };
  return { ...tool, inputSchema: {
    ...inputSchema,
    properties,
    required: [...new Set([...(inputSchema.required ?? []).filter((name) => name !== key), 'agent'])],
  } };
}

/** The inputs the bridge adds to a tool's schema and takes off again before sending. */
export const bridgeInputs = (tool) => [...(argsFileOf(tool) ? ['argsFile'] : []), ...(textFileOf(tool) ? [textFileOf(tool).input] : []),
  ...(outFileOf(tool) ? [outFileOf(tool).input] : []),
  ...(tool === PUBLIC_UPLOAD || tool === AGENT_UPLOAD ? ['filePath'] : []),
  ...(tool === PUSH ? ['localPath', 'resolved'] : []), ...(tool === DATA_SOURCES ? ['localPath'] : []),
  ...(KEEPS_TOKENS.has(tool) ? ['agent'] : [])];

const refused = (id, text) => [{ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } }];

// The replies that are long by nature, so Claude Code shows them whole instead
// of saving them to a file: every knowledge sheet a page needs, and the code of
// a big automation (an 80 KB automation is about 80,000 characters).
const LONG_REPLIES = { [APP_BUILDER]: [KNOWLEDGE], '/mcp/automation-code': [OPEN_WORKFLOW] };
function withResultLimit(tool, target) {
  if (!LONG_REPLIES[target]?.includes(tool?.name)) return tool;
  return { ...tool, _meta: { ...tool._meta, 'anthropic/maxResultSizeChars': RESULT_LIMIT } };
}

const resultChars = (result) => result.content.reduce((sum, item) => sum + (item.text?.length ?? 0), 0);

// The tenant caps one knowledge reply and lists the sheets it left out in
// `omitted.budget`. Asking for them here saves the agent one call per page.
// Whatever is still queued when the reading stops goes back in `omitted.budget`.
// When to delete: the object server's copy of this tool takes a `budget` (a word
// ceiling) and sends a whole page's sheets in one call, but that copy is being
// deleted. Once the application-builder copy takes `budget`, pass a large one
// instead and delete this loop and lib/knowledge-pages.mjs.
async function readAllPages(msg, send, mostNodes) {
  const started = Date.now();
  const isAnswer = (reply) => reply?.id === msg.id && reply.result;
  const pageOf = (replies) => parseKnowledgePage(replies.find(isAnswer)?.result);
  const asked = msg.params.arguments?.nodes;
  const later = Array.isArray(asked) ? asked.slice(mostNodes).map((id) => ({ id })) : [];
  const ask = (nodes, have) => ({ ...msg, params: { ...msg.params, arguments: { ...msg.params.arguments, nodes, ...(have && { have }) } } });
  const replies = await send(later.length ? ask(asked.slice(0, mostNodes)) : msg);
  const pages = [pageOf(replies)];
  if (!pages[0]) return replies;
  const tokens = new Set(msg.params.arguments?.have ?? []);
  const grew = (page) => {
    const size = tokens.size;
    for (const token of page.header.tokens ?? []) tokens.add(token);
    return tokens.size > size;
  };
  // A page that brings no new sheet means the tenant is not moving, so stop.
  let growing = grew(pages[0]);
  let queue = stillToAsk([...later, ...budgetNodes(pages[0].header)], tokens);
  while (growing && queue.length && pages.length < MOST_PAGES && Date.now() - started <= MOST_PAGE_MS) {
    const nodes = queue.slice(0, mostNodes);
    const next = await send(ask(nodes.map((node) => node.id), [...tokens])).then(pageOf, () => null);
    if (!next || resultChars(joinKnowledgePages([...pages, next], queue)) > MOST_JOINED_CHARS) break;
    pages.push(next);
    growing = grew(next);
    queue = stillToAsk([...queue.slice(nodes.length), ...budgetNodes(next.header)], tokens);
  }
  if (pages.length === 1 && !later.length) return replies;
  const joined = joinKnowledgePages(pages, queue);
  return replies.map((reply) => (isAnswer(reply) ? { ...reply, result: joined } : reply));
}

// A skill read whose text scans as a planted instruction comes back without it
// (lib/skill-scan.mjs): the model never reads the flagged text.
function screenedSkillReply(msg, reply) {
  if (reply?.id !== msg.id || !reply.result) return reply;
  const body = toolJson(reply.result);
  if (!body?.ok) return reply;
  const screened = screenCodeSkillAnswer(body);
  return screened === body ? reply : { ...reply, result: toolText(JSON.stringify(screened)) };
}

// A tool's reply is its JSON in one text item; null when it is not.
function toolJson(result) {
  try { return JSON.parse(result?.content?.[0]?.text ?? ''); } catch { return null; }
}
const toolText = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });

// The checkout a push names: a folder get_branch_codebase made inside the working
// folder, compared by the disk's own path so a link cannot lead out of it.
function checkoutAt(home, localPath) {
  if (!home) return { problem: 'there is no working folder to find the checkout in.' };
  let folder, root;
  try {
    root = fs.realpathSync.native(home);
    folder = fs.realpathSync.native(path.resolve(home, String(localPath ?? '')));
  } catch {
    return { problem: `${localPath} does not exist. Download the branch with get_branch_codebase first.` };
  }
  if (!folder.startsWith(root + path.sep)) return { problem: `${localPath} is not inside the working folder ${root}.` };
  if (!readCheckout(folder)) return { problem: `${localPath} is not a checkout get_branch_codebase made. Pass the localPath it answered.` };
  return { folder };
}

// What get_branch_codebase answers once its archive is a folder on disk.
function checkoutNote(localPath, unpacked) {
  const lines = [];
  if (unpacked.conflicts.length) {
    lines.push(`These files changed on both sides and now carry conflict markers: ${unpacked.conflicts.join(', ')}. ` +
      'In each, the lines under `<<<<<<< Updated upstream` are what others committed, the lines under `||||||| Stash base` are the common ancestor, ' +
      'and the lines between `=======` and `>>>>>>> Stashed changes` are YOURS.');
  }
  for (const item of unpacked.unmarked ?? []) lines.push(`${item.path}: ${item.what}`);
  if (unpacked.unmarked?.length) {
    lines.push('A push is refused while one of these is exactly as the pull left it: change it, or name it in `resolved` when leaving it is your decision.');
  }
  if (unpacked.mergedBoth?.length) {
    lines.push(`Both sides changed ${unpacked.mergedBoth.join(', ')} and git merged them with no conflict: read them to check the result is what both changes meant.`);
  }
  if (lines.length) return `Pulled into ${localPath}, with your change replayed on the branch's newest commit. ${lines.join(' ')} Resolve every one, build locally, then push_code_patch with localPath.`;
  if (unpacked.pulled) return `Pulled into ${localPath}: it is now at the branch's newest commit, with your change replayed on top.`;
  if (unpacked.upToDate) return `${localPath} is already at the branch's newest commit, ${unpacked.head ?? 'its head'}: nothing new to pull, and your change is as you left it.`;
  return `Checked out in ${localPath}. Read, edit and build the app there. To commit: hold_code_branch; when the head it answers is not this checkout's, pull — get_branch_codebase naming the appId and the branch, which brings only what changed — then push_code_patch with localPath "${localPath}" and the holdId the hold answered.`;
}

const PLUGIN_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Under Codex and Antigravity, the solution server's instructions: where the
 * plugin is and what the Claude Code names in its skills mean there, since
 * neither sets a plugin-root variable in its shell. Both show a server's
 * instructions to the model. Under Codex it also writes the builders to
 * ~/.codex/agents, which a Codex plugin cannot carry. */
async function codexInstructions(server, updates) {
  const agent = process.env.UA_AGENT;
  if (!['codex', 'antigravity'].includes(agent) || server !== 'solution') return null;
  if (agent === 'codex') try { writeCodexAgents(PLUGIN_ROOT); } catch { /* the builders are a convenience; the skills still work */ }
  const notice = updateNotice(await updates().catch(() => null));
  return agentContext(agent, PLUGIN_ROOT, { notice });
}

export function createBridge(target, { context = bridgeContext, request = fetch, tempFolders = TEMP_FOLDERS, onListFailed = () => {}, elicit = null, verifySignIn = verifyCookie, identify = fetchUserContext, linkCreated = linkToSolution, updates = () => checkForUpdate() } = {}) {
  if (!/^\/mcp\/[a-z-]+$/.test(target ?? '')) throw new Error('Use a tenant MCP path such as /mcp/application-builder.');
  // The headers a call carries are always the ones `clientHeaders` makes from
  // the context's identity, never whatever else a context's `client` holds.
  const callContext = () => {
    const ctx = context();
    if (!ctx) return ctx;
    const client = ctx.client ?? {};
    return { ...ctx, client: clientHeaders({ sessionId: ctx.identity?.sessionId ?? client['x-ua-session-id'],
      solutionId: ctx.identity?.solutionId ?? client['x-ua-solution-id'],
      version: ctx.identity?.version ?? client['x-ua-plugin-version'] }) };
  };
  const server = target.slice('/mcp/'.length);
  // The sign-in check behind a permission refusal, kept per tenant (`signInVerdicts`).
  const signInOf = signInVerdicts(verifySignIn);
  // The live input schemas, so the step count, the verb list and how many ids one
  // knowledge read takes stay the server's own.
  const schemas = new Map();
  // The last tool list the tenant gave this process. Claude Code fixes a
  // subagent's tools when it starts it, so a list that fails once (a short 5xx
  // on the environment check, a sign-in that ran out) would leave every builder
  // started after it with no tools at all. A later list that fails answers with
  // this one instead; each tool call still passes the sign-in and production
  // checks on its own.
  let lastTools = null;
  // The first permission refusal from a tenant this process has not yet heard
  // a successful tool call from is read as the tenant's own `enable_nebula_tools`
  // flag being off, since that gate denies every tool the same way. A refusal
  // that comes after another tool already got through this tenant is read as
  // the signed-in person's role lacking that one tool's AGENT_LLM_TOOLS action,
  // since the flag would have denied the earlier call too. This is a guess, not
  // a fact the tenant states: a session whose very first call happens to be one
  // the role lacks would read the same as a flag that is off.
  const succeededTenants = new Set();
  const listed = (replies) => replies.map((reply) => {
    const tools = reply?.result?.tools;
    if (!Array.isArray(tools)) return reply;
    for (const tool of tools) if (tool?.inputSchema) schemas.set(tool.name, tool.inputSchema);
    const shaped = tools.map((tool) => withAgent(withResultLimit(withFileInput(tool, target), target), target));
    if (shaped.length) lastTools = shaped;
    return { ...reply, result: { ...reply.result, tools: shaped } };
  });
  // Each builder's token list, by agent name, in memory only. This process lives
  // as long as the Claude session, and so does a builder's context: a builder
  // spawned again in a new session no longer holds the sheets' text, so it must
  // start with an empty list. One list per builder keeps the tenant's check
  // strict for each of them. A name alone cannot tell a new builder from an old
  // one (a failed SendMessage starts a new Agent() under the same name, and so
  // does a plan resumed after /clear), so `have: []` on a read means "I hold no
  // sheet": the list starts again from what that read hands over. A process
  // that starts again mid-session (a plugin update) has no list for a builder
  // that still holds the sheets' text, so a refused write of a builder with no
  // list says so and tells it to read again with `have: []`.
  const lists = new Map();
  const keepTokens = async (msg, call, refuse = (text) => refused(msg.id, text)) => {
    const { agent, ...args } = msg.params.arguments;
    if (!isAgentName(agent)) return refuse(`Nothing was sent: \`agent\` must be your builder name from the first line of your message, such as 10fcf2-app-agent-3, or main, in a-z, 0-9 and - only. It was ${JSON.stringify(agent)}.`);
    const isRead = msg.params.name === KNOWLEDGE;
    const startsAgain = isRead && Array.isArray(args.have) && !args.have.length;
    const hadList = lists.has(agent);
    const list = lists.get(agent) ?? {};
    // have: [] means "I hold nothing" and starts the list over -- the
    // documented restart contract a builder relies on after its context is
    // summarised. But when this exact agent name already held a non-empty
    // list, the read that just wiped it may instead be a second builder
    // dispatched under the same literal name, discarding sheets the first
    // one still holds. The wipe still happens (a stale sheet must never
    // pass the knowledge gate); this only names the possible collision so
    // it is never silently invisible.
    const collision = startsAgain && hadList && Object.keys(list).length > 0;
    const sent = isRead ? withHave(args, list) : withKnowledgeTokens(args, list);
    const advised = (result) => {
      const same = withSameCallAdvice(result);
      const noted = hadList ? same : withRestartedNote(same, agent);
      return collision ? withCollisionNote(noted, agent) : noted;
    };
    const replies = (await call({ ...msg, params: { ...msg.params, arguments: sent } }))
      .map((reply) => (reply?.id === msg.id && reply.result
        ? { ...reply, result: !isRead ? advised(reply.result) : collision ? withCollisionNote(reply.result, agent) : reply.result }
        : reply));
    // Read the list again: another call of the same builder may have changed it meanwhile.
    const handed = replies.filter((reply) => reply?.id === msg.id).flatMap((reply) => replyTokens(reply.result));
    // A write that is handed nothing starts no list, so the next refusal still says the bridge holds none.
    if (isRead || handed.length || lists.has(agent)) lists.set(agent, addTokens(startsAgain ? {} : (lists.get(agent) ?? {}), handed));
    return replies;
  };
  const send = async (ctx, msg) => {
    // The bridge has no fake tenant of its own: `UA_FAKE=1` only ever fools
    // `fetchUserContext`, below. Refuse the one call that would actually
    // reach a real tenant while that switch is set and nothing has replaced
    // `fetch` with something that cannot leave this process.
    if (request === fetch && process.env.UA_FAKE === '1') {
      throw new UaError('PLATFORM_UNREACHABLE', 'The tenant bridge refuses to send a real request while UA_FAKE=1 is set: it has no fake tenant to answer, so this would send real traffic past a faked identity read.', { host: ctx.tenant });
    }
    const url = validatedMcpBaseUrl(ctx.url, ctx.tenant);
    const deadline = callTimeoutMs(msg);
    const body = JSON.stringify(msg);
    // The page-speed tooling patches the `const response = await tenantFetch(…`
    // line below by its exact text, so it stays one line, written once.
    const answer = async () => {
      const response = await tenantFetch(ctx.tenant, target, {
        method: 'POST', signal: AbortSignal.timeout(deadline),
        headers: {
          'content-type': 'application/json', accept: 'application/json, text/event-stream',
          origin: new URL(url).origin,
          ...ctx.client,
        },
        body,
      }, { base: url, cookie: ctx.cookie, fetchImpl: request });
      if (response.status === 401 || response.status === 403) throw new UaError('AUTH_EXPIRED', { host: ctx.tenant });
      if (response.status === 202 || response.status === 204) return { response, text: null };
      if (!response.ok) throw new UaError('PLATFORM_UNREACHABLE', `Tenant MCP returned HTTP ${response.status}.`, { host: ctx.tenant, status: response.status });
      return { response, text: await responseText(response, msg, ctx.tenant) };
    };
    let response, text;
    try { ({ response, text } = await answer()); }
    catch (error) {
      throw error?.name === 'TimeoutError' ? noAnswer(msg, deadline, ctx.tenant) : error;
    }
    if (text === null) return [];
    if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const replies = [];
      for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (data) { try { replies.push(JSON.parse(data)); } catch { /* heartbeat */ } }
      }
      return msg.method === 'tools/list' ? listed(replies) : replies;
    }
    const reply = JSON.parse(text);
    const replies = Array.isArray(reply) ? reply : [reply];
    return msg.method === 'tools/list' ? listed(replies) : replies;
  };
  // get_branch_codebase: the archive becomes a checkout in the working folder, and
  // the model gets the folder back instead of megabytes of base64. A call naming the
  // branch of a checkout is a pull: it asks only for what changed since the commit
  // the checkout is exactly (`since`), and that one patch is applied to the copy. A
  // copy that cannot take it is not touched, and the whole branch is downloaded.
  const codebaseCall = async (ctx, msg) => {
    const args = msg.params?.arguments ?? {};
    let since = null;
    if (args.since === undefined && typeof args.branch === 'string' && ctx.home) {
      const located = checkoutFolder(ctx.home, args.appId, args.branch);
      if (!located.problem) since = pullBase(located.folder);
    }
    const asked = since ? { ...msg, params: { ...msg.params, arguments: { ...args, since } } } : msg;
    const replies = await send(ctx, asked);
    const answers = [];
    for (const reply of replies) answers.push(await codebaseReply(ctx, msg, reply));
    return answers;
  };
  const codebaseReply = async (ctx, msg, reply, { retried = false } = {}) => {
    if (reply?.id !== msg.id || !reply.result) return reply;
    const body = toolJson(reply.result);
    if (!body?.ok) return reply;
    let unpacked;
    let shown = body;
    let extra = {};
    if (body.changes?.encoding === 'patch' && typeof body.changes.patch === 'string' && !retried) {
      try {
        unpacked = pullChanges(ctx.home, { appId: body.appId, branch: body.branch, since: body.since, head: body.head, patch: body.changes.patch });
      } catch (error) {
        return { ...reply, result: toolText(`The pull was answered but not applied: ${error.message}`, true) };
      }
      if (unpacked.problem) {
        const { since: _since, ...plain } = msg.params?.arguments ?? {};
        const again = (await send(ctx, { ...msg, params: { ...msg.params, arguments: plain } })).find((r) => r?.id === msg.id);
        if (!again) return reply;
        return codebaseReply(ctx, msg, again, { retried: true });
      }
      const { changes, ...rest } = body;
      shown = rest;
      extra = { changedFiles: changes.files ?? [] };
    } else {
      if (typeof body.code?.archive !== 'string') return reply;
      try {
        unpacked = unpackCodebase(ctx.home, { appId: body.appId, branch: body.branch, head: body.head, archive: body.code.archive });
      } catch (error) {
        unpacked = { problem: error.message };
      }
      if (unpacked.problem) return { ...reply, result: toolText(`The codebase was downloaded but not written: ${unpacked.problem}`, true) };
      const { code: _archive, ...rest } = body;
      shown = rest;
      if (retried) extra = { pullFallback: body.pullFallback ?? 'not_applied' };
    }
    const localPath = path.relative(ctx.home, unpacked.folder);
    return { ...reply, result: toolText(JSON.stringify({
      ...shown, ...extra, localPath, files: unpacked.files, pulled: unpacked.pulled,
      ...(unpacked.pulled ? { previousHead: unpacked.previousHead } : {}),
      conflicts: unpacked.conflicts,
      // `state` is the bridge's own bookkeeping; the agent gets what, and theirs
      unmarked: (unpacked.unmarked ?? []).map(({ state: _state, ...item }) => item),
      mergedBoth: unpacked.mergedBoth ?? [], note: checkoutNote(localPath, unpacked),
    })) };
  };
  // push_code_patch with `localPath`: the patch is the checkout's whole change, and a
  // commit moves the checkout's base to exactly what was committed.
  const pushFromCheckout = async (ctx, msg) => {
    const { localPath, resolved, ...args } = msg.params.arguments;
    if (args.patch !== undefined) return refused(msg.id, 'Nothing was sent: send `patch` or `localPath`, not both.');
    const located = checkoutAt(ctx.home, localPath);
    if (located.problem) return refused(msg.id, `Nothing was sent: ${located.problem}`);
    // The checkout says which app and branch its change belongs to; a push names them
    // only to be checked, so a change never lands on another app or branch.
    const checkout = readCheckout(located.folder) ?? {};
    if (args.appId !== checkout.appId) return refused(msg.id, `Nothing was sent: ${localPath} is a checkout of ${checkout.appId}, not ${args.appId}.`);
    if (args.branch !== undefined && args.branch !== checkout.branch) {
      return refused(msg.id, `Nothing was sent: ${localPath} is a checkout of the branch ${checkout.branch}, not ${args.branch}.`);
    }
    args.branch = checkout.branch;
    let local;
    try {
      local = localPatch(located.folder, { resolved: Array.isArray(resolved) ? resolved.map(String) : [] });
    } catch (error) {
      return refused(msg.id, `Nothing was sent: ${error.message}`);
    }
    if (local.problem) return refused(msg.id, `Nothing was sent: ${local.problem}`);
    if (!local.paths.length) {
      // Not an error: a push sent again after it committed lands here, and must not be retried.
      return [{ jsonrpc: '2.0', id: msg.id, result: toolText(JSON.stringify({
        ok: true, sent: false, head: checkout.head ?? null,
        note: `Nothing to send: ${localPath} has no change against ${checkout.head ?? 'its commit'}, the commit it was downloaded at or last pushed as. ` +
          'A change you pushed before is committed: get_code_app answers it as head.sha.',
      })) }];
    }
    // `base` is the commit the copy is at: the engine lands the patch only while that
    // is the branch's head, and answers `behind` — pull first — once it is not
    const replies = await send(ctx, { ...msg, params: { ...msg.params, arguments: { ...args, patch: local.patch, base: checkout.head ?? undefined } } });
    const body = toolJson(replies.find((reply) => reply?.id === msg.id)?.result);
    if (body?.committed === true && typeof body.commit === 'string') {
      // a failure here only costs the next pull a replay of what is already there
      try { markCommitted(located.folder, local.tree, body.commit, { parent: body.parent ?? null }); } catch { /* see above */ }
    }
    return replies;
  };
  // create_code_app_data_sources with `localPath`: the files it answers are written
  // into that checkout, never retyped by the model, and pushed with the change. A
  // source the copy already has is not sent, since asking again would only leave
  // orphans on the tenant: Storage bindings that name a FETCH id, or an automation's
  // block in callables.ts.
  const dataSourcesIntoCheckout = async (ctx, msg) => {
    const { localPath, ...args } = msg.params.arguments;
    const located = checkoutAt(ctx.home, localPath);
    if (located.problem) return refused(msg.id, `Nothing was created: ${located.problem}`);
    const checkout = readCheckout(located.folder) ?? {};
    if (args.appId !== checkout.appId) return refused(msg.id, `Nothing was created: ${localPath} is a checkout of ${checkout.appId}, not ${args.appId}.`);
    if (args.branch !== undefined && args.branch !== checkout.branch) {
      return refused(msg.id, `Nothing was created: ${localPath} is a checkout of the branch ${checkout.branch}, not ${args.branch}.`);
    }
    args.branch = checkout.branch;
    const asked = Array.isArray(args.sources) ? args.sources : [];
    const inCopy = asked.map((source) => {
      if (source?.kind === 'storage') {
        const file = provisionedBindings(located.folder);
        return file ? { kind: 'storage', ok: true, inCopy: true, path: file } : null;
      }
      if (source?.kind === 'automation' && typeof source.automationId === 'string') {
        const file = boundCallable(located.folder, source.automationId);
        return file ? { kind: 'automation', ok: true, inCopy: true, automationId: source.automationId, path: file } : null;
      }
      return null;
    });
    const toSend = asked.filter((_, index) => !inCopy[index]);
    const merge = (answered) => {
      let next = 0;
      return inCopy.map((held) => held ?? answered[next++]).filter(Boolean);
    };
    if (asked.length && !toSend.length) {
      return [{ jsonrpc: '2.0', id: msg.id, result: toolText(JSON.stringify({
        ok: true, appId: args.appId, branch: checkout.branch, localPath, sources: merge([]),
        note: `Nothing to create: ${localPath} already has every source asked for. Use them.`,
      })) }];
    }
    const replies = await send(ctx, { ...msg, params: { ...msg.params, arguments: { ...args, sources: toSend } } });
    return replies.map((reply) => {
      if (reply?.id !== msg.id || !reply.result) return reply;
      const body = toolJson(reply.result);
      if (!body || !Array.isArray(body.sources)) return reply;
      const problems = [];
      const written = body.sources.map((source) => {
        if (!source?.ok) return source;
        let wrote;
        try {
          wrote = source.kind === 'storage' && typeof source.content === 'string'
            ? writeBindings(located.folder, source.path, source.content)
            : source.kind === 'automation' && typeof source.block === 'string'
              ? writeCallable(located.folder, source.path, { automationId: source.automationId, block: source.block, content: source.content })
              : { problem: 'the answer carried no file' };
        } catch (error) {
          wrote = { problem: error.message };
        }
        if (wrote.problem) {
          // the dataSource exists: hand its file back rather than lose its ids
          problems.push(`${source.kind}${source.automationId ? ` ${source.automationId}` : ''}: ${wrote.problem}`);
          return { ...source, writeError: `Not written into ${localPath}: ${wrote.problem} Write it to \`${source.path}\` there exactly as it is.` };
        }
        const { content: _content, block: _block, ...rest } = source;
        return { ...rest, wrote: source.path };
      });
      const { hint: _hint, ...rest } = body;
      return { ...reply, result: toolText(JSON.stringify({
        ...rest, localPath, sources: merge(written),
        ...(body.ok ? { note: `Wrote the files into ${localPath}. Storage: add each object the app reads to ENTITY in bindings.ts and read it with useData(…, 'storage', { object: ENTITY.<name> }). An automation: import its exportName from callables.ts and call it from a wrapper in src/data/, sending context and storedInputs whole and replacing parameters with real values for the fields in overridable. Push the files with your change.` } : {}),
      }), !body.ok || problems.length > 0) };
    });
  };
  // The tenant a call goes to, once it passed the checks every call passes, or
  // null when no UnifyApps Headless session serves this folder.
  const readyContext = async (msg, ctx) => {
    if (!ctx) return null;
    // Checked before the production read, so a refused call sends nothing at all.
    if (ctx.tenantOnly && msg.method !== 'tools/list') {
      const name = msg.method === 'tools/call' ? msg.params?.name : null;
      if (!isTenantOnlyRead(server, name)) {
        throw new UaError('NO_SOLUTION', `${name ?? msg.method} was not sent: no solution is open in this folder, so only read tools reach ${ctx.tenant}. Open or create a solution first.`, { tenant: ctx.tenant, tool: name });
      }
    }
    if (!ctx.url) throw new Error(`Run /ua:setup to configure tenant tools for ${ctx.tenant}.`);
    const requested = msg.params?.arguments?.host;
    if (requested && normalizeTenant(requested) !== ctx.tenant) throw new UaError('TENANT_MISMATCH', { urlHost: normalizeTenant(requested), tenant: ctx.tenant });
    if (!ctx.cookie) throw new UaError('AUTH_EXPIRED', { host: ctx.tenant });
    // Who is signed in, read once per bridge process before the arguments are
    // even read. The production refusal this used to also decide now runs
    // server-side (the tenant's `enable_nebula_tools` flag gates llm-tools).
    // Kept on the context only, for naming the person in a permission refusal.
    const authenticated = await identify(ctx.tenant, { cookie: ctx.cookie });
    return authenticated?.email ? { ...ctx, identity: { ...ctx.identity, userEmail: authenticated.email } } : ctx;
  };
  // A tool list that fails answers with the last good one. With none yet, the
  // caller hears about it, so it can ask Claude Code to list again later.
  const listTools = async (msg) => {
    let readsOnly = false;
    try { readsOnly = context()?.tenantOnly === true; } catch { /* readyContext below reports it */ }
    const allowed = (tools) => (readsOnly ? tools.filter((tool) => isTenantOnlyRead(server, tool?.name)) : tools);
    const answer = (tools) => [{ jsonrpc: '2.0', id: msg.id, result: { tools: allowed(tools) } }];
    let replies;
    try {
      const ctx = await readyContext(msg, callContext());
      if (!ctx) return answer(lastTools ?? []);
      replies = await send(ctx, msg);
    } catch (error) {
      if (lastTools) return answer(lastTools);
      onListFailed(error);
      throw error;
    }
    if (replies.some((reply) => reply?.id === msg.id && reply.result?.tools?.length)) {
      return replies.map((reply) => (Array.isArray(reply?.result?.tools) ? { ...reply, result: { ...reply.result, tools: allowed(reply.result.tools) } } : reply));
    }
    if (lastTools) return answer(lastTools);
    onListFailed(new Error('The tenant listed no tools.'));
    return replies;
  };
  const forward = async function forward(msg) {
    if (msg.method === 'initialize') {
      const instructions = await codexInstructions(server, updates);
      return [{ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: msg.params?.protocolVersion ?? '2025-03-26',
        capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'ua-tenant-bridge', version: '3.0.0' },
        ...(instructions ? { instructions } : {}),
      } }];
    }
    if (msg.method === 'ping') return [{ jsonrpc: '2.0', id: msg.id, result: {} }];
    if (msg.id === undefined) return [];
    if (msg.method === 'tools/list') return listTools(msg);
    const isTool = msg.method === 'tools/call';
    // A copy below the published minimum sends nothing (update-check.mjs).
    if (isTool) {
      const update = await updates().catch(() => null);
      if (update?.state === 'required') return refused(msg.id, updateRequiredMessage(update));
    }
    let ctx, replies, refusal, mayInvalidateCache = false;
    const refuse = (text) => (replies = refused(msg.id, text));
    try {
      ctx = callContext();
      ctx = await readyContext(msg, ctx);
      if (!ctx) throw new UaError('NOT_STARTED');
      const name = isTool ? msg.params?.name : null;
      if (argsFileOf(name) || textFileOf(name) || isFileUpload(name, target)) {
        const folders = [ctx.home, sessionHome(process.env.CLAUDE_CODE_SESSION_ID), process.cwd(), ...tempFolders].filter(Boolean);
        const args = msg.params.arguments ?? {};
        const checked = argsFileOf(name) ? argsFileArguments(args, argsFileOf(name), schemas.get(name), folders)
          : textFileOf(name) ? textFileArguments(args, textFileOf(name), schemas.get(name), folders)
            : publicFileArguments(args, folders, name);
        if (checked.problem) return refuse(checked.problem);
        msg = { ...msg, params: { ...msg.params, arguments: checked.args } };
      }
      // open_workflow can write its code to a .ts file the builder names, so a long
      // automation is never retyped from the reply; the file is checked before
      // anything is sent, and the tenant never sees `outFile`.
      let outFile = null;
      if (outFileOf(name) && msg.params.arguments?.[outFileOf(name).input] !== undefined) {
        const { [outFileOf(name).input]: file, ...args } = msg.params.arguments;
        const checkedFile = outFileTarget(file, { ...outFileOf(name), folders: [ctx.home, sessionHome(process.env.CLAUDE_CODE_SESSION_ID), process.cwd(), ...tempFolders].filter(Boolean) });
        if (checkedFile.problem) return refuse(checkedFile.problem);
        outFile = checkedFile.file;
        msg = { ...msg, params: { ...msg.params, arguments: args } };
      }
      // A call that changes an existing item must name the version it read, so
      // the tool can refuse it when someone else saved in between. Refused here,
      // it is sent nowhere and marks no cache. It runs before the delete gate,
      // so a person's yes is never spent on a call this check would refuse.
      if (isTool) {
        const problem = missingVersionProblem(name, msg.params?.arguments, schemas.get(name));
        if (problem) return refuse(problem);
      }
      // Only the person's own yes lets a call that deletes something through,
      // and only once. It can arrive two ways, and a call with neither is sent
      // nowhere and marks no cache.
      //
      // The recorded yes comes first: in Claude Code the AskUserQuestion hook
      // writes it, and that is the answer the person already gave. Only when
      // there is none does the bridge ask over the connection itself, which is
      // how an agent with no AskUserQuestion tool can still be asked. A client
      // that cannot be asked, or that fails to answer, falls through to the
      // refusal below, so the gate never opens by default.
      const destructive = name ? destructiveCall(name, msg.params?.arguments) : null;
      if (destructive) {
        const key = callKey(name, msg.params?.arguments, ctx.tenant);
        if (!takeDeleteYes(key)) {
          const answer = elicit ? await elicit({ tool: name, summary: destructive.summary }) : 'unavailable';
          if (answer === 'decline') return refuse(`CONFIRM_DECLINED: ${destructive.summary}. The person answered no, so nothing was deleted. Do not ask again unless they bring it up.`);
          if (answer !== 'accept') {
            const pendingId = addPendingDelete({ key, tool: name, summary: destructive.summary });
            return refuse(confirmRequiredText(pendingId, destructive.summary, { failedYes: Boolean(failedYesFor(pendingId)) }));
          }
        }
      }
      // A page built by hand at /login (or another sign-in address) is never the
      // app's sign-in page; only a copy of the platform's template is. Refused
      // here, it is sent nowhere and marks no cache.
      if (isTool && target === APP_BUILDER) {
        const problem = handBuiltAuthPage(name, msg.params?.arguments);
        if (problem) return refuse(problem);
      }
      if (isTool && target === CHANGESET) {
        const problem = changesetGate(ctx, name, msg.params?.arguments);
        if (problem) return refuse(problem);
      }
      if (isTool) msg = { ...msg, params: { ...msg.params, arguments: withChangeTag(name, withUaTag(name, msg.params?.arguments), { home: ctx.home, sessionId: ctx.identity?.sessionId }) } };
      // Marked dirty in the `finally` below, once the reply says the write
      // actually went through: a save the tenant refused wrote nothing, and
      // marking the cache stale for it only makes a later read refuse to
      // answer for no reason.
      if (isTool) mayInvalidateCache = true;
      const callTenant = (message) => (target === APP_BUILDER && message.method === 'tools/call' && message.params?.name === KNOWLEDGE
        ? readAllPages(message, (next) => send(ctx, next), schemas.get(KNOWLEDGE)?.properties?.nodes?.maxItems ?? MOST_NODES)
        : send(ctx, message));
      const call = () => (target === CODE_BUILDER && name === CODEBASE ? codebaseCall(ctx, msg)
        : target === CODE_BUILDER && name === PUSH && msg.params.arguments?.localPath !== undefined ? pushFromCheckout(ctx, msg)
        : target === CODE_BUILDER && name === DATA_SOURCES && msg.params.arguments?.localPath !== undefined ? dataSourcesIntoCheckout(ctx, msg)
          : target === APP_BUILDER && isTool && KEEPS_TOKENS.has(msg.params?.name) && msg.params.arguments?.agent !== undefined
            ? keepTokens(msg, callTenant, refuse) : callTenant(msg));
      replies = await call();
      if (target === CODE_BUILDER && SKILL_READS.has(msg.params?.name)) replies = replies.map((reply) => screenedSkillReply(msg, reply));
      if (target === API_GATEWAY && KEY_TOOLS.has(msg.params?.name)) {
        replies = keepKeyOut(replies, { home: ctx.home, sessionId: ctx.identity?.sessionId }, msg.params.name, msg.params.arguments);
      }
      if (outFile) {
        replies = replies.map((reply) => (reply?.id === msg.id && reply.result ? { ...reply, result: withOutFile(reply.result, outFileOf(name), outFile) } : reply));
      }
      if (isTool && target === CHANGESET) rememberChangesetAnswer(ctx, msg, replies);
      if (isTool) replies = await withCreatedLinks(ctx, target, msg, replies, linkCreated);
      if (!isTool || !isPermissionRefusal(replies.find((reply) => reply?.id === msg.id))) {
        if (isTool) succeededTenants.add(ctx.tenant);
        return replies;
      }
      refusal = await permissionError(ctx, msg.params?.name, signInOf, succeededTenants.has(ctx.tenant));
    } finally {
      if (mayInvalidateCache && wroteSomething(msg, replies)) markCacheDirty(ctx.home, msg.params?.name, msg.params?.arguments);
    }
    throw refusal;
  };
  return forward;
}
// Every app, code app, object, automation, AI agent and connection a call
// creates is linked to the folder's solution, one `solution_linked_assets` row
// each, the moment the tenant answers. A link never waits for a builder's
// report, so an entity made in a session that ended early still shows in the
// solution. A link that fails never fails the call: the reply says so instead.
async function linkToSolution(ctx, refs) {
  const { serviceFor } = await import('./platform/service.mjs');
  // The bridge approves only its own folder; a solution opened after a `cd` is
  // another one, and the rows are mirrored into it (see `changesetStates`).
  approveFolder(ctx.home);
  const solutionId = ctx.identity.solutionId;
  const service = serviceFor(ctx.tenant, { storage: ctx.storage, home: ctx.home, sessionId: ctx.identity.sessionId, solutionId });
  return linkEntityRefs({ home: ctx.home, service, state: { solutionId } }, refs);
}
const READ_KINDS = new Set(['object', 'automation', 'app', 'ai-agent']);
async function withCreatedLinks(ctx, target, msg, replies, link) {
  if (!ctx?.home || !ctx.identity?.solutionId || ctx.tenantOnly) return replies;
  const refs = createdEntityRefs({ server: target, tool: msg.params?.name, args: msg.params?.arguments, replies, requestId: msg.id });
  if (!refs.length) return replies;
  try {
    await link(ctx, refs);
    return replies;
  } catch (error) {
    const readable = refs.filter((ref) => READ_KINDS.has(ref.kind));
    const note = `UnifyApps Headless could not link ${refs.map((ref) => `${ref.kind} ${ref.id}`).join(', ')} to this solution: ${String(error?.message ?? error).replace(/\.$/u, '')}.`
      + (readable.length ? ` Link ${readable.length > 1 ? 'them' : 'it'} with ${readable.map((ref) => `\`entity read ${ref.kind} ${ref.id} --source build\``).join(', ')}.` : '');
    return replies.map((reply) => (reply?.id === msg.id && reply.result
      ? { ...reply, result: { ...reply.result, content: [...(Array.isArray(reply.result.content) ? reply.result.content : []), { type: 'text', text: note }] } }
      : reply));
  }
}

// After a tool list fails with no earlier list to fall back on, Claude Code is
// asked to list again: first after 15 seconds, then twice as long each time, up
// to every 5 minutes, until a list comes back. Without this, one failed list at
// the wrong moment left the server with no tools until Claude Code restarted.
const RELIST_FIRST_MS = 15_000;
const RELIST_MOST_MS = 300_000;
/** How long a confirm question waits for the person. Long enough to read it
 * and decide, short enough that a client which answers nothing does not hold
 * the tool call open: after this the caller is told to ask with its own tool. */
const ELICIT_TIMEOUT_MS = 300_000;

// The last guard before Claude Code: a reply line it would drop the
// connection for becomes an error for that one call.
export function replyLine(request, reply) {
  const line = JSON.stringify(reply);
  if (Buffer.byteLength(line) <= MAX_REPLY_BYTES || reply?.id === undefined) return line;
  return JSON.stringify({ jsonrpc: '2.0', id: reply.id, error: { code: -32000, message: tooLarge(request).message } });
}

export function main(target = process.argv[2]) {
  const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const writeReply = (request, reply) => process.stdout.write(replyLine(request, reply) + '\n');
  const listChanged = () => write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  let relistTimer, relistWait = RELIST_FIRST_MS;
  const listAgainLater = () => {
    if (relistTimer) return;
    relistTimer = setTimeout(() => { relistTimer = undefined; listChanged(); }, relistWait);
    relistTimer.unref();
    relistWait = Math.min(relistWait * 2, RELIST_MOST_MS);
  };
  // Asking the person over the connection, for a client that declared it can be
  // asked. The bridge is a proxy, so this is the one message it originates: a
  // request of its own with its own id, answered on the same stdin every other
  // message arrives on. The reply is matched by id in `handle` and never
  // forwarded to the tenant.
  //
  // Only a plain yes counts. Anything else — a no, a cancel, a client that
  // declared the capability and then failed, a reply that never came — leaves
  // the gate shut, and the caller is told how to ask with its own tool instead.
  const pendingElicits = new Map();
  let canElicit = false, elicitSeq = 0;
  const elicit = async ({ tool, summary }) => {
    if (!canElicit) return 'unavailable';
    const id = `ua-confirm-${++elicitSeq}`;
    const answer = new Promise((resolve) => {
      const timer = setTimeout(() => { pendingElicits.delete(id); resolve('timeout'); }, ELICIT_TIMEOUT_MS);
      timer.unref();
      pendingElicits.set(id, (value) => { clearTimeout(timer); pendingElicits.delete(id); resolve(value); });
    });
    write({ jsonrpc: '2.0', id, method: 'elicitation/create', params: {
      message: `${summary}. This cannot be undone. Delete it?`,
      // No fields: the answer is the accept or decline itself, which every
      // client renders without having to draw a form.
      requestedSchema: { type: 'object', properties: {}, required: [] },
    } });
    return answer;
  };
  const forward = createBridge(target, { onListFailed: listAgainLater, elicit });
  // Solution selection unblocks discovery without restarting the bridge or
  // pinning it to the tenant present at launch.
  fs.mkdirSync(UA_HOME, { recursive: true, mode: 0o700 });
  fs.chmodSync(UA_HOME, 0o700);
  let initialized = false, timer;
  const watcher = fs.watch(UA_HOME, (_, filename) => {
    const file = String(filename);
    if (!initialized || file !== 'sessions.json') return;
    clearTimeout(timer);
    timer = setTimeout(listChanged, 50);
  });
  let buffer = '', inFlight = 0, closed = false, ending = false;
  const settle = () => {
    if (!closed || inFlight !== 0 || ending) return;
    ending = true;
    clearTimeout(timer); clearTimeout(relistTimer); watcher.close();
    process.stdout.end();
  };
  const handle = (line) => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    // The answer to a question this bridge asked. It is this process's own
    // reply, not a call to pass on, so it resolves the waiting gate and stops.
    if (msg.method === undefined && msg.id !== undefined && pendingElicits.has(msg.id)) {
      const settle = pendingElicits.get(msg.id);
      const action = String(msg.result?.action ?? '');
      settle(msg.error ? 'failed' : action === 'accept' ? 'accept' : action === 'decline' ? 'decline' : 'cancel');
      return;
    }
    if (msg.method === 'initialize') {
      initialized = true;
      canElicit = Boolean(msg.params?.capabilities?.elicitation);
    }
    inFlight++;
    forward(msg).then(replies => {
      if (msg.method === 'tools/list' && replies.some(reply => reply?.result?.tools?.length)) relistWait = RELIST_FIRST_MS;
      replies.forEach(reply => writeReply(msg, reply));
    }).catch(error => {
      if (msg.id !== undefined) write({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: error.message } });
    }).finally(() => { inFlight--; settle(); });
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1); if (line) handle(line); }
  });
  process.stdin.on('end', () => { if (buffer.trim()) handle(buffer.trim()); closed = true; settle(); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
