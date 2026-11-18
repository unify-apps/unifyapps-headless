import fs from 'node:fs';
import { UaError, mergeRefs, refsMatch, slug } from '../lib/contracts.mjs';
import { parseFeature, renderFeature, parsePlan } from '../lib/formats.mjs';
import { readRecord, readRecords, cacheRecords, renderDocs } from '../workspace/local.mjs';
import { refreshCurrent } from '../workspace/solution-sync.mjs';

const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new UaError('USAGE', `${label} is required.`);
  return value.trim();
};
const ownSolution = ctx => {
  const record = readRecord(ctx.home, 'solution');
  if (!record || record.id !== ctx.state?.solutionId || record.entityType !== 'e_solution') throw new UaError('NOT_STARTED');
  return record;
};
const featuresFrom = records => records.flatMap((record) => {
  const text = record?.properties?.document;
  if (typeof text !== 'string') return [];
  try {
    const parsed = parseFeature(text);
    return parsed.meta?.nebula === 3 && parsed.meta.slug ? [{ ...parsed, record, text }] : [];
  } catch { return []; }
});
const projection = feature => ({ ...feature.meta, body: feature.body });

const received = (value) => {
  if (value === undefined) return 'missing';
  const rendered = JSON.stringify(value) ?? String(value);
  return `${Array.isArray(value) ? 'array' : typeof value} ${rendered.length > 60 ? `${rendered.slice(0, 60)}…` : rendered}`;
};

/** Every problem in one pass, so a fix never uncovers the next error one write later. */
function validateInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UaError('USAGE', 'Feature file needs a JSON object.');
  const issues = [];
  const text = (field) => typeof value[field] === 'string' && value[field].trim() ? value[field].trim() : null;
  if (!text('name')) issues.push(`name must be a non-empty string (got ${received(value.name)}).`);
  if (!text('summary')) issues.push(`summary must be a non-empty string (got ${received(value.summary)}).`);
  if (!Array.isArray(value.entities)) issues.push(`entities must be an array of {kind, name} objects (got ${received(value.entities)}).`);
  else value.entities.forEach((ref, index) => {
    if (!ref || typeof ref.kind !== 'string' || typeof ref.name !== 'string' || !ref.name.trim()) {
      issues.push(`entities[${index}] must be {kind, name} with non-empty strings (got ${received(ref)}).`);
    }
  });
  if (!Array.isArray(value.planIds)) issues.push(`planIds must be an array of plan id strings (got ${received(value.planIds)}).`);
  else value.planIds.forEach((id, index) => {
    if (typeof id !== 'string' || !id.trim()) issues.push(`planIds[${index}] must be a plan id string such as "e_…" (got ${received(id)}).`);
  });
  if (typeof value.body !== 'string') {
    issues.push(`body must be the feature's Markdown as a string (got ${received(value.body)}). The input field is body; document is the stored record's column, not an input field.`);
  }
  if (issues.length) throw new UaError('USAGE', `Feature file is invalid — ${issues.length} problem${issues.length === 1 ? '' : 's'}: ${issues.join(' ')}`);
  return { fileSlug: slug(value.slug || value.name), name: value.name.trim(), summary: value.summary.trim(), entities: value.entities, planIds: value.planIds, body: value.body };
}

function readEntities(source) {
  const value = required(source, 'Entities');
  let parsed;
  try { parsed = JSON.parse(value.startsWith('[') || value.startsWith('{') ? value : fs.readFileSync(value, 'utf8')); }
  catch { throw new UaError('USAGE', 'Entities must be a JSON array.'); }
  if (!Array.isArray(parsed) || parsed.some(ref => !ref || typeof ref.kind !== 'string' || typeof ref.name !== 'string')) throw new UaError('USAGE', 'Entities must be a JSON EntityRef array.');
  return parsed;
}

function staleFeature(feature, plans) {
  const updated = Date.parse(feature.meta.updatedAt ?? '');
  if (!Number.isFinite(updated)) return true;
  return plans.some(record => {
    let parsed;
    try { parsed = parsePlan(record.properties.plan); } catch { return false; }
    if (parsed.meta.nebula !== 3) return false;
    const touched = [...(parsed.meta.touches ?? []), ...parsed.tasks.map(task => task.entity).filter(Boolean)];
    const modified = Number(record.modifiedTime) || Date.parse(parsed.meta.endedAt || parsed.meta.runningAt || parsed.meta.createdAt || '');
    return modified > updated && touched.some(ref => (feature.meta.entities ?? []).some(entity => refsMatch(ref, entity)));
  });
}

export async function run(command, args = [], flags = {}, ctx = {}) {
  if (command === 'upsert') {
    ownSolution(ctx);
    const file = required(flags.file, 'Feature file');
    let input;
    try { input = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new UaError('USAGE', 'Feature file must contain JSON.'); }
    const value = validateInput(input), updatedAt = new Date().toISOString();
    await refreshCurrent(ctx);
    const existing = featuresFrom(readRecords(ctx.home, 'doc')).find(feature => slug(feature.meta.slug) === value.fileSlug);
    const documentFor = currentText => {
      let current;
      try { current = parseFeature(currentText); } catch { current = null; }
      const meta = { nebula: 3, slug: value.fileSlug, name: value.name, summary: value.summary,
        entities: mergeRefs(current?.meta?.entities ?? [], value.entities),
        planIds: [...new Set([...(current?.meta?.planIds ?? []), ...value.planIds])], updatedAt };
      return renderFeature(meta, value.body);
    };
    const created = !existing;
    const updated = existing
      ? await ctx.service.readMergeWrite('solution_document', existing.record.id, (properties) => {
        if (properties.solutionId !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
        return { document: documentFor(properties.document) };
      })
      : await ctx.service.create('solution_document', { solutionId: ctx.state.solutionId, document: documentFor(null) });
    if (updated.entityType !== 'solution_document' || updated.properties?.solutionId !== ctx.state.solutionId) throw new UaError('NOT_STARTED');
    cacheRecords(ctx.home, { docs: [updated] }); renderDocs(ctx.home, readRecords(ctx.home, 'doc'));
    return { data: { slug: value.fileSlug, created }, message: `Feature ${value.name} documented.` };
  }
  if (command === 'list') {
    ownSolution(ctx);
    const data = featuresFrom(readRecords(ctx.home, 'doc')).map(projection);
    return { data, message: `${data.length} features.` };
  }
  if (command === 'get') {
    const wanted = slug(required(args[0], 'Feature slug'));
    ownSolution(ctx);
    const feature = featuresFrom(readRecords(ctx.home, 'doc')).find(item => slug(item.meta.slug) === wanted);
    if (!feature) throw new UaError('NOT_FOUND', 'Feature not found in this solution.');
    // The shape `feature upsert --file` takes, as `feature list` gives it: the
    // fields used to sit under `meta`, so a get fed back to upsert was refused.
    return { data: projection(feature), message: `Feature ${feature.meta.name}.` };
  }
  if (command === 'match') {
    const refs = readEntities(flags.entities); ownSolution(ctx);
    const plans = readRecords(ctx.home, 'plan').filter(plan => plan.properties?.solutionId === ctx.state.solutionId);
    const data = featuresFrom(readRecords(ctx.home, 'doc')).filter(feature => (feature.meta.entities ?? []).some(entity => refs.some(ref => refsMatch(entity, ref))))
      .map(feature => ({ ...feature.meta, stale: staleFeature(feature, plans) }));
    return { data, message: `${data.length} matching features.` };
  }
  throw new UaError('USAGE', `Unknown feature command: ${command}.`);
}
