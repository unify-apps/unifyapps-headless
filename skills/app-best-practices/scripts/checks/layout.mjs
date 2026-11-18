// Layout and sizing (LAYOUT): boxes a block needs before it can draw its content.
import { blockTarget, walkedFacts } from './shared.mjs';

const NO_HEIGHT = /^(?:min-)?h-(?:auto|fit|min|max|0|none)$/u;

/** Does the block set a height or min-height in any form that is not "size to content"? */
function setsHeight(page, id) {
  const block = page.blocks[id];
  const styles = block?.component?.appearance?.styles ?? {};
  const sized = ['height', 'minHeight'].some(key => {
    const value = styles[key];
    const text = value && typeof value === 'object' ? value.custom : value;
    return text !== undefined && text !== null && text !== '' && !NO_HEIGHT.test(String(text).trim());
  });
  // Web custom CSS can size the block too, and it is not parsed here.
  return sized || /height/iu.test(String(block?.additional?.customCSS ?? ''));
}

export const layoutChecks = [
  {
    id: 'give-page-mode-repeatable-explicit',
    // A paginated web list draws its rows in a virtualized list at size-full, so with nothing above
    // it sized it measures 0px and draws no rows.
    run: page => walkedFacts(page, 'Repeatable').flatMap(fact => {
      if (fact.content.addOns?.page?.type !== 'PAGE' || fact.content.containerId) return [];
      if ([fact.id, ...fact.ancestors].some(id => setsHeight(page, id))) return [];
      return [{
        target: blockTarget(page, fact.id),
        evidence: 'content.addOns.page.type is "PAGE" and neither this Repeatable nor any block above it sets appearance.styles height or minHeight, so the pager draws and the rows do not',
        confidence: 'medium',
      }];
    }),
  },
];
