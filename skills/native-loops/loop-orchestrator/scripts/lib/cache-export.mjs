// `cache-export`: the page reads a test runner needs, written into the run folder before the
// orchestrator queues a device check, because a test runner never calls UnifyApps Headless.
//
//   R/cache/<pageId>/outline.json   `ua cache outline <page> --app-id <app>`: { pageId, total, nodes[] }
//   R/cache/<pageId>/blocks.json    `ua cache blocks <page> --app-id <app> --match ^ --limit <all>`:
//                                   { pageId, matched, shown, blocks[] }, every block whole
//
// native-visual-check (gap-table.mjs --blocks --outline) and fix-brief.mjs (--outline) read these two shapes.
// `--match ^` matches every block (an empty display name too); a page with no blocks gets
// { blocks: [] } without the second read, since cache blocks answers "no block matches" there.
import path from 'node:path';
import { ua } from './blocks.mjs';
import { cliFailure } from './impact.mjs';
import { failed, missing, usage } from './output.mjs';
import { writeJson } from './paths.mjs';

const EVERY_BLOCK = ['--match', '^', '--limit', '1000000'];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

/** Pure: where the two files of a page go in a run folder. */
export function exportPaths(runDir, pageId) {
  const dir = path.join(runDir, 'cache', pageId);
  return { dir, blocks: path.join(dir, 'blocks.json'), outline: path.join(dir, 'outline.json') };
}

export function cacheExport({ appId, pageId, run, solution, session }) {
  if (!appId || !pageId) throw usage('cache-export needs the app and the page: cache-export <app-id> <page-id> --run <run>');
  if (!run) throw usage('cache-export needs the run: --run <id or folder>, or LOOPS_RUN_ID');
  const outline = ua(['cache', 'outline', pageId, '--app-id', appId], { cwd: solution, session });
  if (outline.status !== 0 || outline.json?.error) throw cliFailure(outline, `cache outline ${pageId}`);
  if (!Array.isArray(outline.json?.nodes)) {
    throw missing(`page ${pageId} of app ${appId} is not in the cache (${outline.message || outline.json?.cache?.status || 'miss'}); run solution refresh, then cache-export again`);
  }
  const id = String(outline.json.pageId ?? pageId);
  if (!SAFE_ID.test(id)) throw failed(`cache outline answered page id "${id}", which cannot name a folder`);
  const total = Number.isInteger(outline.json.total) ? outline.json.total : outline.json.nodes.length;
  let blocks = { pageId: id, validatedAt: outline.json.validatedAt ?? null, version: outline.json.version ?? null, matched: 0, shown: 0, field: null, notFound: [], blocks: [] };
  if (total > 0) {
    const read = ua(['cache', 'blocks', id, '--app-id', appId, ...EVERY_BLOCK], { cwd: solution, session });
    if (read.status !== 0 || read.json?.error) throw cliFailure(read, `cache blocks ${id}`);
    if (!Array.isArray(read.json?.blocks)) {
      throw missing(`the blocks of page ${id} are not in the cache (${read.message || read.json?.cache?.status || 'miss'}); run solution refresh, then cache-export again`);
    }
    blocks = read.json;
  }
  const files = exportPaths(run.dir, id);
  writeJson(files.outline, outline.json);
  writeJson(files.blocks, blocks);
  const counts = { blocks: blocks.blocks.length, nodes: outline.json.nodes.length, total };
  const complete = counts.blocks === total && counts.nodes === total;
  const data = { appId, pageId: id, run: run.id, dir: files.dir, blocks: files.blocks, outline: files.outline, counts, complete };
  const text = [
    `Exported page ${id}: ${counts.blocks} blocks, ${counts.nodes} outline nodes.`,
    `  ${files.blocks}`,
    `  ${files.outline}`,
    ...(complete ? [] : [`The cache answered ${counts.blocks} blocks and ${counts.nodes} outline nodes for a page of ${total}; run solution refresh, then cache-export again.`]),
  ].join('\n');
  return { data, text };
}
