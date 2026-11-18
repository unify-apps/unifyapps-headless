# Rule bodies

What the three save tools take. Every tool takes `host`, `graphId` and `nodeId`, resolves the node's Ontology entity, and reads the rules back. A save with `ruleId` and `expectedVersion` saves the whole rule again and refuses when the version moved; `set_context_graph_node_match_rule_active` is the one field update.

## Survivorship

`save_context_graph_node_survivorship` takes `survivorship`:

- `defaultStrategy`: a strategy `{ name, sourcePrioritySequence?, excludedConnections?, winnerAttribute? }` with `name` one of `RECENCY` (newest value), `FREQUENCY` (most common), `SOURCE_SYSTEM` (the first connection in `sourcePrioritySequence`, connection ids best first; `excludedConnections` never win), `MINIMUM`, `MAXIMUM`, `WINNER_CROSSWALK` (the record `winnerAttribute` names).
- `customEnabled: true` and `survivorshipRules`: one `{ fieldName, primaryStrategy, fallbackStrategies?, filter? }`, each strategy the same shape as `defaultStrategy` per field that departs from the default. Every `fieldName` must be a property of the node; the tool refuses one that is not, before it writes.

Read it back with `get_context_graph_node_survivorship`.

## Match rules

`save_context_graph_node_match_rule` takes `rule`:

- `ruleName`, `description?`, `active?`, `index?` (the order among the node's rules).
- `ruleDefinition`: a tree `{ operator: AND | OR, values: [ { field, operator } ] }`. A leaf's `operator` is `EXACT_MATCH`, `EXACT_OR_NULL_MATCH`, `EXACT_OR_ALL_NULL_MATCH` or `FUZZY_MATCH`; a fuzzy leaf adds `comparisonMethod` (`LEVENSHTEIN_DISTANCE`, `JARO_WINKLER_DISTANCE`, `METAPHONE_COMPARATOR` or `SEMANTIC_COMPARATOR`) and may set `enableTokenization`.
- `mergePolicy`: `{ postMatchAction }` with `AUTO_MERGE` (merge with no person), `FLAG_FOR_REVIEW` (park the match for a person, see [review.md](review.md)) or `RELEVANCE_BASED` (merge above `autoMergeThresholdStart`, park between `flagForReviewThresholdStart` and `flagForReviewThresholdEnd`).
- `matchRuleFilter?`: which staged records the rule looks at.

`set_context_graph_node_match_rule_active` flips one rule's `active` flag without sending it again. `delete_context_graph_node_match_rule` needs `confirmRuleId` to repeat `ruleId`, and is behind the delete gate.

## Data-quality rules

`save_context_graph_node_data_quality_rule` takes `rule` with a `type`:

- `VALIDATION`: `validationRule: { type: 'STANDARD', filter }` where `filter` is the platform's UI filter, `{ operator: AND | OR, filters: [{ property: '<field>', filter: { operator: <op>, value? } }] }` where `<op>` is one of `EQUAL`, `NOT_EQUAL`, `CONTAINS`, `NOT_CONTAINS`, `ICONTAINS`, `NOT_ICONTAINS`, `IN`, `NOT_IN`, `REGEX`, `NOT_REGEX`, `IREGEX`, `NOT_IREGEX`, `STARTS_WITH`, `NOT_STARTS_WITH`, `ENDS_WITH`, `NOT_ENDS_WITH`, `MIN_LENGTH`, `MAX_LENGTH`, `EXISTS`, `MISSING`, `LT`, `LTE`, `GT`, `GTE`, `BETWEEN` or `WITHIN`; a record that fails the filter breaks the rule. Any other filter shape is saved as empty without an error. Then `postQualityAction: { rule: REJECT | ACCEPT_WITH_WARNING, messageTemplate? }`. REJECT sends the record to the rejected list ([review.md](review.md)); ACCEPT_WITH_WARNING lets it through with a warning in the record's `mdmRecordMetadata.dataQualityResult`.
- `CLEANSING` or `ENRICHMENT`: `automationRule` naming a deployed automation that returns the cleaned or enriched fields.
- All three: `name`, `enabled?`, `index?`, `description?`, `filter?: { modes: [CREATED | UPDATED | DELETED], filter }`.

To show the person what a rule would reject, stage one sample record and read the rejected list; there is no dry check. `delete_context_graph_node_data_quality_rule` needs `confirmRuleId` and is behind the delete gate.

## What the spec's Rules table becomes

| Column | Becomes |
|---|---|
| Survivorship | `defaultStrategy`, and one `survivorshipRules` entry per `field: strategy` |
| Match rule | one match rule; the arrow names its `postMatchAction` |
| Data quality | one VALIDATION rule per line; the arrow names its `postQualityAction.rule` |
