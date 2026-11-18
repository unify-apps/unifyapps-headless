// Custom code correctness (CODE): conditions and expressions the runtime evaluates.
import { blockTarget, isBinding, isPlainObject, liveActions, oncePerTarget, pageTarget } from './shared.mjs';

// The leaf operators the platform's condition parser accepts. A name outside them throws, and the
// whole condition tree reads false.
const CONDITION_OPERATORS = new Set([
  'EQUAL', 'NOT_EQUAL', 'CONTAINS', 'NOT_CONTAINS', 'REGEX', 'NOT_REGEX', 'IREGEX', 'NOT_IREGEX',
  'MIN_LENGTH', 'MAX_LENGTH', 'EXISTS', 'MISSING', 'LT', 'LTE', 'GT', 'GTE', 'IN', 'NOT_IN',
  'STARTS_WITH', 'NOT_STARTS_WITH', 'ENDS_WITH', 'NOT_ENDS_WITH',
  'DATE_IS_BEFORE', 'DATE_IS_AFTER', 'DATE_IS_ON_OR_BEFORE', 'DATE_IS_ON_OR_AFTER',
  'TIME_IS_EQUAL_TO_OR_AFTER', 'TIME_IS_EQUAL_TO_OR_BEFORE', 'TIME_IS_BEFORE', 'TIME_IS_AFTER', 'TIME_IS_EQUAL_TO',
]);

/** Unknown leaf operators in one condition payload, as `{ path, operator }`, walked the way the parser walks it. */
function unknownOperators(node, path, out) {
  if (!isPlainObject(node)) return out;
  if (node.operator && Array.isArray(node.filters)) node.filters.forEach((child, index) => unknownOperators(child, `${path}.filters[${index}]`, out));
  const operator = node.filter?.operator;
  if (typeof operator === 'string' && !isBinding(operator) && !CONDITION_OPERATORS.has(operator)) out.push({ path: `${path}.filter.operator`, operator });
  return out;
}

/**
 * Every condition object (`{ type: 'filter', payload }`) under `value`. Anything under an `inputs`
 * key is skipped: data-source and entity-table filters are server queries with their own operator
 * vocabulary, where ICONTAINS is legal.
 */
function conditionObjects(value, path, out) {
  if (Array.isArray(value)) value.forEach((item, index) => conditionObjects(item, `${path}[${index}]`, out));
  if (!isPlainObject(value)) return out;
  if (value.type === 'filter' && isPlainObject(value.payload)) out.push({ path: `${path}.payload`, payload: value.payload });
  for (const [key, nested] of Object.entries(value)) if (key !== 'inputs') conditionObjects(nested, `${path}.${key}`, out);
  return out;
}

function badOperators(value, path) {
  return conditionObjects(value, path, []).flatMap(condition => unknownOperators(condition.payload, condition.path, []));
}

const describe = bad => bad.map(({ path, operator }) => `${path} is "${operator}"`).join('; ');

// A flag stored as raw boolean logic. Only `&&` / `||` is counted: that is the AND/OR a condition
// group expresses, while a single bound value at a boolean key is legal (concepts/blocks.md, Bindings).
const isRawLogic = value => isBinding(value) && /&&|\|\|/u.test(value);
const FLAG_PATHS = [
  ['visibility', block => (typeof block.visibility === 'string' ? block.visibility : block.visibility?.value)],
  ['component.appearance.disabled', block => block.component?.appearance?.disabled],
  ['component.appearance.loading', block => block.component?.appearance?.loading],
  ['component.appearance.readOnly', block => block.component?.appearance?.readOnly],
  ['component.content.readOnly', block => block.component?.content?.readOnly],
  ['component.content.readonly', block => block.component?.content?.readonly],
];

export const codeChecks = [
  {
    id: 'operators-condition-menu-unknown-one',
    run: page => {
      const onBlocks = page.walk.order.flatMap(id => {
        const bad = badOperators(page.blocks[id], 'block');
        return bad.length ? [{ target: blockTarget(page, id), evidence: `${describe(bad)}, not a condition operator, so the whole condition reads false` }] : [];
      });
      const bad = badOperators(page.events, 'interactions.events');
      const onPage = bad.length ? [{ target: pageTarget(page), evidence: `${describe(bad)}, not a condition operator, so the whole condition reads false` }] : [];
      return [...onBlocks, ...onPage];
    },
  },
  {
    id: 'store-flags-condition-objects-never',
    run: page => {
      const raw = (target, where) => ({ target, evidence: `${where} is a raw {{ }} boolean expression, not a condition object` });
      const onBlocks = page.walk.order.flatMap(id => FLAG_PATHS.filter(([, read]) => isRawLogic(read(page.blocks[id]))).map(([path]) => raw(blockTarget(page, id), path)));
      const inActions = liveActions(page).filter(({ action }) => isRawLogic(action.runCondition))
        .map(({ target, eventType, action }) => raw(target, `the runCondition of the ${action.actionType} action on ${eventType}`));
      return oncePerTarget([...onBlocks, ...inActions]);
    },
  },
];
