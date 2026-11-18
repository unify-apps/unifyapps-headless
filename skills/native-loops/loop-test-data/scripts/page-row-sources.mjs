#!/usr/bin/env node
// Lists what a page reads and writes, and which page input picks the rows, from UnifyApps Headless page configs.
// Reads files only. Never calls the tenant.
import { readFileSync, writeFileSync } from 'node:fs';

const HELP = `page-row-sources — what a page reads and writes, and which page input picks its rows.

Usage
  node page-row-sources.mjs --page <file>[,<file>...] [--out <file>]

Inputs
  --page <files>  The --json output of "ua entity context page <page> --app-id <app>",
                  one file per page, comma separated.
  --out <file>    Write the JSON here instead of stdout.
  --help          Print this help.

Output (JSON), per page
  reads        Storage fetches and counts: object, filters with the plain field name, the
               page inputs each filter reads, limit, single or many.
  automations  Data sources that call an automation, with the parameters that read page inputs.
               Their rows cannot be counted from config; read the automation's dependencies.
  writes       Data sources that create, update or delete rows, by object.
  keys         For each page input: the objects and fields whose rows it picks.
`;

const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const PAGE_INPUT = /pageInputs\[['"]([^'"]+)['"]\]/gu;
const inputsIn = (value) => [...new Set([...JSON.stringify(value ?? '').matchAll(PAGE_INPUT)].map((m) => m[1]))];
// Data sources show the storage column (properties_<name>); object tools take the plain name.
const plainField = (column) => (typeof column === 'string' ? column.replace(/^properties_/u, '') : column);

const READ = new Set(['storage_by_unifyapps_fetch_records', 'storage_by_unifyapps_count_records']);
const CALL = 'callables_call_automation';
const WRITE = /^storage_by_unifyapps_(create|bulk_create|update|bulk_upsert|delete)/u;

function describe(file) {
  const cache = asObject(JSON.parse(readFileSync(file, 'utf8')).cache);
  if (cache.status !== 'hit') return { file, skipped: `cache ${cache.status ?? 'unknown'}${cache.reason ? ` (${cache.reason})` : ''}` };
  const page = asObject(cache.page);
  const out = { file, pageId: page.id, pageName: asObject(page.properties).name ?? null, reads: [], automations: [], writes: [], other: [], keys: {} };
  const sources = [...(cache.dataSources ?? []).map((s) => ['page', s]), ...(cache.appDataSources ?? []).map((s) => ['app', s])];
  for (const [scope, source] of sources) {
    const p = asObject(source.properties);
    const resource = asObject(p.context).resourceName ?? null;
    const inputs = asObject(p.inputs);
    const base = { id: source.id, name: p.name ?? null, scope, resource };
    if (READ.has(resource)) {
      const condition = asObject(inputs.triggerInputCondition);
      const filters = (condition.filters ?? []).map((f) => ({
        field: plainField(f.property), column: f.property, operator: asObject(f.filter).operator ?? null,
        value: asObject(f.filter).value ?? null, pageInputs: inputsIn(asObject(f.filter).value),
      }));
      out.reads.push({ ...base, objectType: inputs.object_type ?? null, match: condition.operator ?? null, filters,
        many: inputs.numberOfRecordsToFetch ? inputs.numberOfRecordsToFetch !== 'SINGLE' : null,
        limit: asObject(inputs.page).limit ?? null, sortBy: inputs.sortBy ?? null });
      for (const f of filters) for (const key of f.pageInputs) {
        out.keys[key] ??= [];
        out.keys[key].push({ objectType: inputs.object_type ?? null, field: f.field, source: p.name ?? source.id });
      }
    } else if (resource === CALL) {
      const params = asObject(inputs.parameters);
      out.automations.push({ ...base, automationId: inputs.automationId ?? null,
        pageInputParams: Object.fromEntries(Object.entries(params).filter(([, v]) => inputsIn(v).length).map(([k, v]) => [k, inputsIn(v)])) });
    } else if (WRITE.test(resource ?? '')) {
      out.writes.push({ ...base, objectType: inputs.object_type ?? null });
    } else {
      out.other.push(base);
    }
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) { process.stdout.write(HELP); return; }
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`Bad argument ${argv[i]}. Run with --help.`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.page) throw new Error('--page is required. Run with --help.');
  const result = args.page.split(',').map((f) => describe(f.trim()));
  const text = JSON.stringify(result.length === 1 ? result[0] : result, null, 2);
  if (args.out) writeFileSync(args.out, text); else process.stdout.write(`${text}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exit(1); }
