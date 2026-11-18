#!/usr/bin/env node
// Calls UnifyApps Headless's tenant tools from a script, for the same change on many items.
// Each call goes through the same bridge as Claude's MCP tools
// (scripts/mcp-bridge.mjs, in this process): the same tenant and sign-in
// checks, the delete gate and the UnifyApps Headless tag. Nothing here
// sends to the tenant any other way.
//
// In a script:
//   import { openTools, forEachItem } from '<this file>';
//   const tools = openTools('automation-code');
//   const found = await tools.call('search_workflows', { nameContains: 'Orders', limit: 100 });
//   const results = await forEachItem(found.workflows, async (w) => { ... tools.call(...) ... });
//   await tools.close();
//
// From a shell, one call:
//   node tool-calls.mjs <server> <tool> <args-json | @file>
// or many calls in one process, 4 at a time, from a JSON list of { tool, args }:
//   node tool-calls.mjs <server> --batch <calls.json>
// which prints one JSON line per call, in the list's order:
//   { "index": 0, "tool": "...", "ok": true, "value": ... } or { ..., "ok": false, "error": "..." }
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bridgeContext, createBridge } from './mcp-bridge.mjs';

export const SERVERS = Object.freeze(['application-builder', 'object', 'automation-code', 'agent-builder',
  'evaluation', 'connection', 'solution', 'app-testing', 'api-gateway', 'connectors-sdk']);
// 4 calls at a time: about 4x faster than one by one, and gentle on the tenant.
export const AT_ONCE = 4;

export function openTools(server, { cwd = process.cwd(), sessionId = process.env.CLAUDE_CODE_SESSION_ID, bridge } = {}) {
  if (!SERVERS.includes(server)) throw new Error(`Unknown tool server "${server}". Use one of: ${SERVERS.join(', ')}.`);
  // A CLI caller names its own session, so no hook-recorded session replaces it.
  const forward = bridge ?? createBridge(`/mcp/${server}`, { context: () => bridgeContext(cwd, sessionId, null) });
  let nextId = 1;
  // Answers the tool's reply, parsed when it is JSON; a refused or failed call throws with the tool's own words.
  const call = async (name, args = {}) => {
    const id = nextId++;
    const replies = await forward({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    const reply = replies.find((item) => item?.id === id);
    if (!reply) throw new Error(`${name} gave no answer.`);
    if (reply.error) throw new Error(`${name}: ${reply.error.message}`);
    const text = (reply.result?.content ?? []).map((item) => item?.text ?? '').join('');
    if (reply.result?.isError) throw new Error(`${name}: ${text}`);
    try { return JSON.parse(text); } catch { return text; }
  };
  // Nothing to release. Kept so every caller's `finally { await tools.close(); }` still works.
  const close = async () => {};
  return { call, close };
}

// Runs fn on every item, AT_ONCE at a time. One failed item never stops the
// others: each result is { item, ok: true, value } or { item, ok: false, error }.
export async function forEachItem(items, fn, { atOnce = AT_ONCE } = {}) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { item: items[index], ok: true, value: await fn(items[index], index) }; }
      catch (error) { results[index] = { item: items[index], ok: false, error: error.message }; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(atOnce, items.length)) }, worker));
  return results;
}

function readJson(raw, what) {
  try { return JSON.parse(raw); } catch (error) { throw new Error(`${what} not valid JSON: ${error.message}`); }
}

// Runs a list of { tool, args } on one server, AT_ONCE at a time, through one bridge.
export async function runBatch(tools, calls, { atOnce = AT_ONCE } = {}) {
  if (!Array.isArray(calls)) throw new Error('The batch file must hold a JSON list of { "tool": "...", "args": { ... } }.');
  calls.forEach((entry, index) => {
    if (typeof entry?.tool !== 'string' || !entry.tool) throw new Error(`Call ${index} in the batch file has no "tool" name.`);
  });
  const results = await forEachItem(calls, (entry) => tools.call(entry.tool, entry.args ?? {}), { atOnce });
  return results.map((result, index) => ({ index, tool: calls[index].tool,
    ...(result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error }) }));
}

async function main([server, name, argsText]) {
  if (!server || !name) throw new Error('Usage: node tool-calls.mjs <server> <tool> [<args-json> | @<file>]\n       node tool-calls.mjs <server> --batch <calls.json>');
  if (name === '--batch') {
    if (!argsText) throw new Error('Usage: node tool-calls.mjs <server> --batch <calls.json>');
    const calls = readJson(fs.readFileSync(argsText, 'utf8'), 'The batch file is');
    const tools = openTools(server);
    try {
      const results = await runBatch(tools, calls);
      for (const result of results) console.log(JSON.stringify(result));
      if (results.some((result) => !result.ok)) process.exitCode = 1;
    } finally { await tools.close(); }
    return;
  }
  const raw = argsText?.startsWith('@') ? fs.readFileSync(argsText.slice(1), 'utf8') : argsText ?? '{}';
  const args = readJson(raw, 'The arguments are');
  const tools = openTools(server);
  try {
    const answer = await tools.call(name, args);
    console.log(typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2));
  } finally { await tools.close(); }
}

if (import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1] ?? '')).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
