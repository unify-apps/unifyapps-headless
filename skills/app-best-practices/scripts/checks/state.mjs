// Loading, empty and failure states (STATE): what a block shows while, or after, something runs.
import { blockTarget, EMPTY_SOCKET_IDS, isBinding, liveActions, oncePerTarget, walkedFacts } from './shared.mjs';

/**
 * Why a stored appearance.loading is on for good, or null. A `{ type, payload }` condition and a
 * `{{ }}` binding are resolved before the button renders; any other value reaches it as stored and
 * a truthy one keeps the spinner on and the press off. A
 * `boolean` condition is returned verbatim, so a non-empty string payload is on too
 * (ai-editing/condition-objects.md). Only an IconButton unwraps conditionalValueFilters.
 */
function stuckLoading(loading) {
  if (!loading || isBinding(loading)) return null;
  if (typeof loading !== 'object') return JSON.stringify(loading);
  if (loading.type === 'filter') return null;
  if (loading.type === 'boolean') return loading.payload ? `{ "type": "boolean", "payload": ${JSON.stringify(loading.payload)} }` : null;
  if (Object.hasOwn(loading, 'conditionalValueFilters')) return null;
  return `the object ${JSON.stringify(loading).slice(0, 60)}`;
}

/** The leaves that make the whole condition true on their own: every leaf under ORs and one-child groups. */
function sufficientLeaves(node) {
  if (!Array.isArray(node?.filters)) return node && typeof node === 'object' ? [node] : [];
  if (node.filters.length === 1 || node.operator === 'OR') return node.filters.flatMap(sufficientLeaves);
  return [];
}

const DATA_READ = /(?:\[\s*['"]data['"]\s*\]|\.data)\s*\}\}\s*$/u;

/** Why a Table with an empty-state block shows it at the wrong time, or null. */
function emptyStateProblem(isDataEmpty) {
  if (isDataEmpty === undefined || isDataEmpty === null) return 'content.isDataEmpty is absent, so the empty-state block replaces the rows for good';
  if (isBinding(isDataEmpty)) return null;
  if (isDataEmpty === true || (isDataEmpty?.type === 'boolean' && isDataEmpty.payload === true)) return `content.isDataEmpty is pinned on (${JSON.stringify(isDataEmpty)}), so the rows never show`;
  if (isDataEmpty?.type !== 'filter') return null;
  const missing = sufficientLeaves(isDataEmpty.payload).find(leaf => leaf.filter?.operator === 'MISSING' && DATA_READ.test(String(leaf.property ?? '')));
  return missing ? `content.isDataEmpty is true whenever "${missing.property}" is MISSING, which it is before the source loads, so the empty state shows first` : null;
}

const submits = action => action.actionType === 'submitForm' || (action.actionType === 'controlBlockMethod' && action.payload?.methodName === 'submitForm');

// The steps a failed submit must not reach (submit-form.md § Chaining names the success message and the close).
function dependsOnSuccess(action) {
  const { actionType, payload } = action;
  if (actionType === 'showNotification') return payload?.type === 'success' ? 'shows a success notification' : null;
  if (actionType === 'controlModal' || actionType === 'controlDrawer') return payload?.operation === 'hide' ? `closes with ${actionType}` : null;
  if (actionType === 'controlBlockMethod' && ['hideModal', 'hideDrawer'].includes(payload?.methodName)) return `closes with ${payload.methodName}`;
  return actionType === 'navigateToPage' || actionType === 'navigateBack' ? `leaves with ${actionType}` : null;
}

export const stateChecks = [
  {
    id: 'never-bind-appearance-loading-value',
    run: page => walkedFacts(page, 'Button', 'IconButton').flatMap(fact => {
      const why = stuckLoading(fact.appearance.loading);
      return why ? [{ target: blockTarget(page, fact.id), evidence: `appearance.loading is ${why}, which reads as true, so the ${fact.type} spins and never takes a press` }] : [];
    }),
  },
  {
    id: 'set-tables-isdataempty-row-count',
    // The phone's Table reads neither isDataEmpty nor the emptyState slot.
    run: (page, app) => (app.type === 'MOBILE' ? [] : walkedFacts(page, 'Table', 'GroupTable').flatMap(fact => {
      const slotBlock = fact.slots?.emptyState?.blockId;
      // The web Table counts any slot id that is not an empty-socket marker.
      if (!slotBlock || EMPTY_SOCKET_IDS.has(slotBlock)) return [];
      const problem = emptyStateProblem(fact.content.isDataEmpty);
      return problem ? [{ target: blockTarget(page, fact.id), evidence: problem }] : [];
    })),
  },
  {
    id: 'put-step-run-failure-failing',
    run: page => {
      const findings = [];
      const submitted = new Map();
      for (const { target, path, eventType, targetId, branch, action } of liveActions(page)) {
        if (branch !== 'main' || target.kind !== 'block') continue;
        const handler = `${target.id}|${eventType}|${targetId}`;
        if (submits(action)) {
          if (!submitted.has(handler)) submitted.set(handler, path);
          continue;
        }
        const effect = submitted.has(handler) && !action.runCondition ? dependsOnSuccess(action) : null;
        if (effect) findings.push({ target, evidence: `${path} ${effect} on ${eventType} as a sibling after the submitForm at ${submitted.get(handler)}, so it runs even when the submit fails; move it into that node's onSuccessActions` });
      }
      return oncePerTarget(findings);
    },
  },
];
