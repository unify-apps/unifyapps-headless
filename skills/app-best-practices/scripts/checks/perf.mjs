// Performance (PERF): what a page ships and runs that nobody sees.
import { visibilityOf } from '../config-read.mjs';
import { blockTarget, descendants, listOf, walkedFacts } from './shared.mjs';

// "Tens of blocks" (criteria §3) read as two tens: a subtree that size is a real share of a page's
// parse and render work, while a hidden spinner or one stashed card stays under it.
const LARGE_SUBTREE = 20;

/** Block ids a device variant stores or diffs: a hidden base block may be shown on that device. */
function deviceOverridden(page) {
  const ids = new Set();
  for (const device of Object.values(page.record?.properties?.devices ?? {})) {
    for (const id of Object.keys(device?.blocks ?? {})) ids.add(id);
    for (const id of Object.keys(device?.diffs?.blocks ?? {})) ids.add(id);
  }
  return ids;
}

export const perfChecks = [
  {
    // A condition or binding can show a block, and no action sets visibility. A root whose id a
    // device variant stores is skipped, since that device can show it.
    id: 'hidden-subtree-tens-blocks-one',
    run: page => {
      const overridden = deviceOverridden(page);
      const hidden = fact => visibilityOf(fact.visibility) === 'hidden';
      const roots = walkedFacts(page).filter(fact => hidden(fact) && !overridden.has(fact.id)
        && !fact.ancestors.some(id => hidden(page.walk.facts.get(id))));
      return roots.flatMap(root => {
        const subtree = [root, ...descendants(page, root.id)];
        if (subtree.length < LARGE_SUBTREE) return [];
        const sources = new Set(subtree.flatMap(fact => [
          ...fact.bindings.flatMap(binding => binding.sourceIds),
          ...listOf(page.blocks[fact.id]?.dataSourceIds),
        ]));
        const bound = sources.size ? `, bound to ${[...sources].join(', ')}` : '';
        return [{ target: blockTarget(page, root.id), evidence: `visibility.value is false on a subtree of ${subtree.length} blocks${bound}; it never shows and still ships with the page` }];
      });
    },
  },
];
