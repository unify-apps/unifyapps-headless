// Configuration integrity (INT): ids resolve and the stored tree keeps its shape.
import { visibilityOf } from '../config-read.mjs';
import { blockTarget, EMPTY_SOCKET_IDS, isBinding, isBlank, isFixedId, liveActions, pageRef, pageTarget, routedPages, walkedFacts } from './shared.mjs';

const LAYOUT_SOCKETS = ['body', 'header', 'footer'];

// The runtime reads only block.visibility (concepts/blocks.md).
const canHide = visibility => visibilityOf(visibility) !== 'shown';
const MISPLACED_VISIBILITY = [
  ['component.visibility', block => block.component?.visibility],
  ['component.appearance.visibility', block => block.component?.appearance?.visibility],
  ['component.appearance.styles.visibility', block => block.component?.appearance?.styles?.visibility],
];

function formBlockNamed(page, app, formId) {
  if (page.blocks[formId]) return page.blocks[formId];
  for (const other of app.pages) if (other.global && other.blocks[formId]) return other.blocks[formId];
  return null;
}

export const intChecks = [
  {
    id: 'never-store-both-content-blockid',
    run: page => Object.entries(page.blocks)
      .filter(([, block]) => {
        const content = block?.component?.content;
        return content && 'blockId' in content && 'blockIds' in content;
      })
      .map(([id]) => ({ target: blockTarget(page, id), evidence: 'component.content has both blockId and blockIds' })),
  },
  {
    id: 'point-page-layout-body-header',
    run: page => {
      const layout = page.record?.properties?.layout ?? {};
      return LAYOUT_SOCKETS
        .filter(socket => typeof layout[socket] === 'string' && !EMPTY_SOCKET_IDS.has(layout[socket]) && !page.blocks[layout[socket]])
        .map(socket => ({ target: pageTarget(page), evidence: `layout.${socket} is "${layout[socket]}", which names no block on the page` }));
    },
  },
  {
    // Folder segments match exactly, but the page tools refuse two sibling slugs that differ only
    // in case, so the slug is compared lowercased.
    id: 'remove-duplicate-page-slugs-duplicate',
    scope: 'app',
    run: app => {
      const byAddress = new Map();
      for (const entry of routedPages(app)) {
        const key = `${entry.path.slice(0, -entry.slug.length)}${entry.slug.toLowerCase()}`;
        byAddress.set(key, [...(byAddress.get(key) ?? []), entry]);
      }
      const named = id => app.pages.find(page => page.id === id) ?? { id, name: id };
      return [...byAddress.values()].filter(entries => entries.length > 1).map(entries => {
        const first = named(entries[0].id);
        const addresses = [...new Set(entries.map(entry => entry.path))].join(', ');
        return { page: pageRef(first), target: pageTarget(first), evidence: `${entries.length} pages share one address (${addresses}): ${entries.map(entry => entry.id).join(', ')}` };
      });
    },
  },
  {
    // A moduleId alone falls back to this app, which is right for a module of this app; which app a
    // module belongs to is not in the stored config, so only the two halves that cannot load are flagged.
    // An empty-string app id is not nullish: the published web app looks the module up in no app,
    // while native resolves it from the module record, so that half is web only.
    id: 'set-both-moduleid-moduleinterfacerecordid-module',
    run: (page, app) => walkedFacts(page, 'Module').flatMap(fact => {
      const { moduleId, moduleInterfaceRecordId } = fact.content;
      if (isFixedId(moduleId) && !moduleId.includes('$$') && moduleInterfaceRecordId === '' && app.type !== 'MOBILE') {
        return [{ target: blockTarget(page, fact.id), evidence: `content.moduleInterfaceRecordId is an empty string beside content.moduleId "${moduleId}", so the published app looks the module up in no app` }];
      }
      if (isBlank(moduleId) && isFixedId(moduleInterfaceRecordId)) {
        return [{ target: blockTarget(page, fact.id), evidence: `content.moduleInterfaceRecordId is "${moduleInterfaceRecordId}" but content.moduleId is not set, so the block draws the choose-a-module placeholder` }];
      }
      return [];
    }),
  },
  {
    // An omitted templateInterfaceRecordId falls back to this app (fine for this app's component);
    // an empty string takes no fallback (the fallback applies only to a nullish id).
    id: 'set-both-templatecomponentid-templateinterfacerecordid-templatecomponent',
    run: page => walkedFacts(page, 'TemplateComponent').flatMap(fact => {
      const { templateComponentId, templateInterfaceRecordId } = fact.content;
      if (isFixedId(templateComponentId) && templateInterfaceRecordId === '') {
        return [{ target: blockTarget(page, fact.id), evidence: `content.templateInterfaceRecordId is an empty string beside content.templateComponentId "${templateComponentId}", so the lookup misses and the placement renders nothing` }];
      }
      if (isBlank(templateComponentId) && isFixedId(templateInterfaceRecordId)) {
        return [{ target: blockTarget(page, fact.id), evidence: `content.templateInterfaceRecordId is "${templateInterfaceRecordId}" but content.templateComponentId is not set, so the placement renders nothing` }];
      }
      return [];
    }),
  },
  {
    // Only a Form carries the submitForm block method; any other target, or none, reports success.
    id: 'point-submitform-formid-existing-form',
    run: (page, app) => liveActions(page)
      .filter(({ action }) => action.actionType === 'submitForm' && isFixedId(action.payload?.formId))
      .flatMap(({ target, action }) => {
        const formId = action.payload.formId;
        const form = formBlockNamed(page, app, formId);
        if (!form) return [{ target, evidence: `submitForm payload.formId "${formId}" names no block on the page` }];
        const type = form.component?.componentType;
        return type === 'Form' ? [] : [{ target, evidence: `submitForm payload.formId "${formId}" names a ${type ?? 'block with no componentType'}, not a Form` }];
      }),
  },
  {
    id: 'store-block-visibility-block-visibility',
    run: page => page.walk.order.flatMap(id => {
      const block = page.blocks[id];
      if (canHide(block.visibility)) return [];
      const misplaced = MISPLACED_VISIBILITY.find(([, read]) => canHide(read(block)));
      if (!misplaced) return [];
      const shape = visibilityOf(misplaced[1](block)) === 'conditional' ? 'a condition' : 'value false';
      const root = block.visibility ? 'block.visibility shows it' : 'block.visibility is not set';
      return [{ target: blockTarget(page, id), evidence: `${misplaced[0]} holds ${shape}, but ${root}, so the block always shows` }];
    }),
  },
];
