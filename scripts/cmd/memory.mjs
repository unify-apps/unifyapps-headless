import fs from 'node:fs';
import { UaError } from '../lib/contracts.mjs';
import { parseMemory, parsePlan, renderMemory as formatMemory } from '../lib/formats.mjs';
import { readRecord, cacheRecords, renderMemory } from '../folder/local.mjs';
import { refreshCurrent } from '../folder/solution-sync.mjs';

// Solution memory is written when the person explicitly asks to remember
// something, and also automatically at plan finish, when the routing skill
// judges a decision, correction, error or tenant fact is worth keeping.
// Both paths write through this one `remember` command.
const SECTIONS = ['decisions', 'corrections', 'errors', 'notes'];
const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${label} is required.`);
  return value.trim();
};
const ownSolution = ctx => {
  const record = readRecord(ctx.home, 'solution');
  if (!record || record.id !== ctx.state?.solutionId || record.entityType !== 'e_solution') throw new UaError('NOT_STARTED');
  return record;
};
const lineCount = text => String(text ?? '').trimEnd().split(/\r?\n/u).length;
const resultFor = text => ({ lines: lineCount(text), overCap: lineCount(text) > 500 });
// A caller that copies a stored line's shape (as `memory get` shows it) sends
// the date and label too; they are added here, so a copy of them is dropped.
const ownPrefix = (label, text) => {
  const dated = /^\d{4}-\d{2}-\d{2} — /u.exec(text);
  return dated && text.slice(dated[0].length).startsWith(`${label} — `) ? text.slice(dated[0].length + label.length + 3) : text;
};
const stamp = (at, label, text) => `${String(at ?? new Date().toISOString()).slice(0, 10)} — ${label} — ${ownPrefix(label, String(text).replace(/\r?\n/gu, ' '))}`;

function planTitle(ctx, planId) {
  const record = readRecord(ctx.home, 'plan', planId);
  if (!record || record.properties?.solutionId !== ctx.state.solutionId) throw new UaError('NOT_FOUND', 'That plan is outside this solution.');
  try { return parsePlan(record.properties.plan).meta.title || planId; }
  catch { return planId; }
}

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command === 'remember') {
    ownSolution(ctx);
    const section = required(args[0], 'Memory section').toLowerCase();
    if (!SECTIONS.includes(section)) throw new UaError('USAGE', `Memory section must be one of: ${SECTIONS.join(', ')}.`);
    const text = required(args[1], 'Memory text');
    await refreshCurrent(ctx);
    const label = flags.plan === undefined ? 'session' : planTitle(ctx, required(flags.plan, 'Plan ID'));
    const line = stamp(new Date().toISOString(), label, text);
    const suffix = line.slice(10);
    let duplicate = false;
    const updated = await ctx.service.readMergeWrite('e_solution', ctx.state.solutionId, (properties, current) => {
      if (current.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
      const sections = parseMemory(properties.memory);
      duplicate = sections[section].some(existing => existing.endsWith(suffix));
      if (duplicate) return {};
      sections[section].push(line);
      return { memory: formatMemory(sections) };
    });
    if (updated.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
    cacheRecords(ctx.home, { solution: updated }); renderMemory(ctx.home, updated);
    return { data: { section, line, duplicate, ...resultFor(updated.properties.memory) },
      message: duplicate ? 'Already in solution memory.' : 'Saved to solution memory.' };
  }
  if (command === 'get') {
    const record = ownSolution(ctx);
    const sections = parseMemory(record.properties.memory);
    return { data: { ...sections, ...resultFor(record.properties.memory) }, message: 'Solution memory.' };
  }
  if (command === 'consolidate') {
    ownSolution(ctx);
    const file = required(flags.file, 'Consolidation file');
    let sections;
    try { sections = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new UaError('USAGE', 'Consolidation file must contain JSON.'); }
    for (const name of SECTIONS) {
      if (!Array.isArray(sections?.[name]) || sections[name].some(item => typeof item !== 'string')) throw new UaError('USAGE', `Consolidation needs a ${name} string array.`);
    }
    await refreshCurrent(ctx);
    const updated = await ctx.service.readMergeWrite('e_solution', ctx.state.solutionId, (_, current) => {
      if (current.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
      return { memory: formatMemory(sections) };
    });
    if (updated.id !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
    cacheRecords(ctx.home, { solution: updated }); renderMemory(ctx.home, updated);
    return { data: resultFor(updated.properties.memory), message: 'Solution memory consolidated.' };
  }
  throw new UaError('USAGE', `Unknown memory command: ${command}.`);
}
