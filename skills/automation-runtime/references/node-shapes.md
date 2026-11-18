# Automation node and graph shapes

## Contents
- 1. Continue-on-error needs BOTH properties
- 2. A CALL_WORKFLOW's outputs are FLAT
- 3. A `cacheConfig` needs a real `cacheKey`
- 4. Input keys that are easy to confuse
- 5. `storage_by_unifyapps_count_records`
- 6. A sort entry is `{field, order}`, never `{property, order}`
- 7. A node reference inside a filter's PROPERTY NAME does not resolve
- 8. The graph vocabulary: `type`, `index`, edges, groups, connections
- 9. Storage shapes to confirm with `describe_storage_object`
- 10. What this file is for

Use the selected tenant's node schema and a working graph with the same
`resourceName` to confirm an input shape. These examples describe platform
contracts and observed behavior; they do not define an application's objects,
permissions, or relationships. The current schema takes precedence.

API field names are literal. Values such as `<object_type>` and
`<parent_record_id>`, and example node names, must be replaced with values read
from the selected solution. Never copy a connection, entity, or workflow ID
from an unrelated application.

Graphs can be nested, for example under `deployedAssets.LAST_DEPLOYED.nodes`.
When inspecting an exported definition, walk for its `nodes` arrays:

```python
def graphs(o, d=0):
    if d > 6: return
    if isinstance(o, dict):
        if isinstance(o.get("nodes"), list): yield o["nodes"]
        for v in o.values(): yield from graphs(v, d + 1)
    elif isinstance(o, list):
        for v in o: yield from graphs(v, d + 1)
```

---

## 1. Continue-on-error needs BOTH properties

Keep the builder's `fallbackMode` and the runtime's `options.stepError`
consistent. Runtime observations show that only `node.options.stepError`
controls error handling; an absent value defaults to `STOP`. Setting only the
top-level field can display CONTINUE while still stopping execution.

```json
{"fallbackMode": "CONTINUE",
 "options": {"stepError": "CONTINUE"},
 "inputs": {"...": "..."}}
```

**`options` sits on the node, beside `inputs`, not inside it.**
`inputs.options.stepError` is ignored. `cacheConfig` also belongs in the node's
options. The observed error modes are `STOP`, `CONTINUE`, and `MANUAL`;
unrecognized values stop execution. A MANUAL handler also needs an outgoing
`error` edge. Test the intended failure path; changing an error mode can change
the application's outcome. See [runtime guidance](runtime-facts.md).

## 2. A CALL_WORKFLOW's outputs are FLAT

The callee's response body **is** the outputs object. For a response
`{"status":"OK"}`, use `{{ n_CALL.outputs.status }}`. A path through
`outputs.result` is appropriate only when the response itself declares a
`result` field. This differs from a code node, whose return value is wrapped
under `outputs.result`. Confirm the callee's output contract before binding.

## 3. A `cacheConfig` needs a real `cacheKey`

An enabled cache needs a non-blank key. Example node names and fields below
stand for inputs your automation must declare:

```json
{"cacheKey": "{{ n_CONTEXT.outputs.scopeKey }}", "enabled": true,
 "timeToLive": "3600", "usagePolicy": "ALWAYS"}
```

```json
{"cacheKey": "{{ n_CONTEXT.outputs.scopeKey }}_{{ n_PAGE.outputs.limit }}_{{ n_PAGE.outputs.offset }}",
 "enabled": true, "timeToLive": "900", "usagePolicy": "ALWAYS", "useInMemoryCache": false}
```

A composite key can concatenate template pills. Include every input that
changes the result or its access scope: tenant, applicable application or
workspace scope, caller permissions, filters, and pagination. The example
`scopeKey` must encode the relevant boundaries; an application without a
workspace concept should use its actual scope. Lint rule **R17** rejects an
enabled cache with no key, but isolation also needs a test with distinct scopes.

## 4. Input keys that are easy to confuse

| node / field | wrong | right |
|---|---|---|
| `storage_by_unifyapps_create_record` | `fields: {...}` | `record: {...}` — with `fields` it answers 200 and writes EMPTY properties |
| a fetch's `fields` projection | `["<field>"]` | `["properties.<field>"]` — and on `/api/workflow/execute/node` a projection has dropped `properties` entirely in observed responses |
| `s_user_preferences.module` | an application name | a value from the schema's enum, such as `GLOBAL`, `AUTOMATION`, `COPILOT`, or `INTERFACE` |
| `standard_entities_fetch_user_preferences` filter | platform `op/values` | STORAGE `operator/filters/property` — it is the exception |
| entity type creation | `input.schema` only | ALSO a `schema` block, or the store can filter on nothing |

## 5. `storage_by_unifyapps_count_records`

Use a server-side count when the result should count matching records rather
than just the fetched page. Substitute the selected object's actual filter
field and ID in this illustrative payload:

```json
{ "object_type": "<object_type>",
  "triggerInputCondition": {
    "operator": "AND",
    "filters": [{
      "property": "properties.parentId",
      "filter": { "operator": "EQUAL", "value": "<parent_record_id>" }
    }]
  }
}
```

Output is `{count}` — read it as `{{ n_X.outputs.count }}`. It takes the same
filter dialect as `storage_by_unifyapps_fetch_records`. Verify nested paths
against the selected object. A count does not require sorting or downloading
all rows; measure its latency on the current tenant and data volume.

## 6. A sort entry is `{field, order}`, never `{property, order}`

`property` is the FILTER vocabulary. Inside `sortBy` it is ignored — no error,
no warning, the fetch just comes back in the store's default order. Both
directions then return the SAME list, which is the tell.

```json
{ "sortBy": [ { "field": "properties.<field>", "order": "ASC" },
              { "field": "id", "order": "ASC" } ] }
```

Use fields that exist in the object's schema and test both sort directions.

## 7. A node reference inside a filter's PROPERTY NAME does not resolve

Written as

```json
{ "property": "properties.<mapField>.{{ n_FIELD.outputs.id }}",
  "filter": { "operator": "EXISTS" } }
```

has behaved differently in single-node probes and full workflow runs. Do not
rely on a single-node result to prove a dynamic property-name guard.

Build the whole `triggerInputCondition` in a code node and pass it as ONE value.
Test the resulting filter in the full workflow with matching and non-matching
records before relying on it to authorize a mutation.

**And keep a templated reference out of Groovy entirely, comments included.** The
builder's validator scans the code for one and reports "Node referenced in input
no longer exists in Automation" when it cannot find the node - a comment
explaining the trap above was enough to make `validate` go dirty.

## 8. The graph vocabulary: `type`, `index`, edges, groups, connections

These graph conventions come from platform-authored definitions and runtime
observations. Use a current graph of the same node type to confirm nesting and
resource-specific details. See [runtime guidance](runtime-facts.md).

**`type` is decided by the resource.** Wrong, and the run dies with `No config
found for resource ... in app ...`. A missing type can also prevent execution
without identifying the responsible node.

| resource | type |
|---|---|
| `callables_from_automation` (the trigger) | `START` |
| `callables_return_to_automation` (the answer) | `STOP` |
| `callables_call_automation` | `CALL_WORKFLOW` |
| `if_else_condition` | `IF_ELSE` |
| `branch` / `branch_condition` | `BRANCH` |
| everything else | `ACTION` |

**`index` is unique across the whole array, trigger included.** The run follows
edges; duplicate indexes have broken the builder's canvas layout even when the
graph can execute.
Cloning is how you get one: the clone arrives with a START at index 1.

**Edges** are `{ fromNodeId, toNodeId, type, id: "<type>@<from>@<to>",
priority: 0 }`. Their `name` identifies branch routes and helps the builder
render the graph:

| where | type | name |
|---|---|---|
| IF_ELSE, true arm | `if` | `yes` |
| IF_ELSE, else arm | `next` | `no` |
| a BRANCH arm | `branch` | the arm's own id, `"1"`, `"2"`, ... |
| a BRANCH join | `branch` | `default` |
| into a loop body | `loop` | |
| last body node back to the loop | `next` | `loopback` |
| a MANUAL node's handler | `error` | `error` |
| the normal path beside an error edge | `next` | `success` |
| plain sequence | `next` | (none) |

A BRANCH arm with no `name` can be skipped while the saved graph still validates.
A parallel fork needs more than one passing arm; with one passing arm there is
no concurrent work to join. Verify each arm's output and the join continuation.

**Group ids** draw the nesting: inside an IF the group is
`<ifNodeId>@<itsOwnGroup>@y` or `@n`. Wrong group IDs can hide nodes in the
builder while the run works fine.

**A connection lives in `context.connectionId`, never in `inputs`**, beside
`appName`, `resourceName` and `type: "APPLICATION"`. The id belongs to ONE
tenant. Resolve a valid connection on the destination tenant when moving a
graph; successful deployment alone does not prove the connection can read or
write the intended system.

`deploy_workflow` refuses a connector node with an empty or missing
`connectionId`, even on an automation built for per-user `runtimeConnections`
(each run resolving its own connection at run time): the node still needs a
real connection id set on it to deploy.

**Two labels per node.** `subTitle` is the business purpose, `title` the
mechanics; the builder shows one line when they match.

## 9. Storage shapes to confirm with `describe_storage_object`

These tables summarize observed schemas for `create_record`, `fetch_records`,
and `get_record_by_id`, including conditional keys. They are starting points, not proof that a new tenant or resource version has
the same schema. Read the object's live shape with `describe_storage_object`, and the
operation's own schema and layout with `get_operation_schema`, before writing a
node against an unfamiliar or changed input.

`required` and defaults below reflect those schema observations. `help` and
`inputFooter` are builder presentation fields.

**`storage_by_unifyapps_get_record_by_id`** — required `object_type`, `id`; no
conditional branch.

| key | type | default |
|---|---|---|
| `object_type` | string | — |
| `id` | string | — |
| `readThroughSessionVariables` | boolean | `false` |
| `includeCurrentUserPermissions` | boolean | `false` |
| `includeRoleMappings` | boolean | `false` |
| `translationsOption` | `DEFAULT` \| `INCLUDE_AND_RESOLVE_TRANSLATIONS` \| `RESOLVE_TRANSLATIONS_ONLY` | `DEFAULT` |
| `routing` | string | — |

Output is the record itself: `id`, `entityType`, `properties.<field>` (the
object's own schema, `required` and enums included), `version`, `createdTime`,
`modifiedTime`, `ownerUserId`, `lastModifiedBy`, `projectId`, `tags`,
`standard`, `deleted`, `_loadedFromSessionVariables`, `_hasPermission`. A
missing id THROWS, which is why the builder's node carries
`options.stepError: CONTINUE` (§1) when its job is to find out whether the
row exists.

**`storage_by_unifyapps_fetch_records`** — required `object_type`,
`numberOfRecordsToFetch`.

| key | type | default |
|---|---|---|
| `object_type` | string | — |
| `numberOfRecordsToFetch` | string — the builder writes `MULTIPLE` | `SINGLE` |
| `triggerInputCondition` | object — the storage filter, `{ operator, filters: [{ property, filter: { operator, value } }] }` (§7 for what must not go in a property name) | — |
| `page` | **only under `numberOfRecordsToFetch: MULTIPLE`** (`if`/`then`): `{ paginateBy: CURSOR \| OFFSET, limit }` with `paginateBy` required; `offset` joins it under OFFSET, `cursor` under CURSOR | `paginateBy OFFSET`, `limit 20`, `offset 0` |
| `includeTotalCount` | boolean, same branch | `false` |
| `fields` | string[] — the projection: dot form, and it drops the system fields (§4) | — |
| `sortBy` | `[{ field, order: ASC \| DESC }]` (§6) | — |
| `searchField` | `{ fields: string[], expression }` | — |
| `collapse` | `{ field, maxConcurrentGroupSearches, innerHits: { name, size, from, sorts: [{ field, order }] } }` — one top row per distinct value of `field` | — |
| `additional` | object, `additionalProperties: true` | — |
| `fetchDeployedEntity` | boolean; `dependencies`: when it is anything but `false`, `deployedEntityVersion` (integer) joins it | — |
| `shouldSearchInAnalyticsStore` | boolean | `false` |
| `includeCurrentUserPermissions`, `includeRoleMappings`, `readThroughSessionVariables` | boolean | `false` |
| `translationsOption` | as above | `DEFAULT` |

Output: `objects[]`, `hasMore`, `cursor`, `innerHits`. The observed default
`page.limit` is 20; the local builder writes 100. A schema without a declared
maximum is not an assurance of unlimited results. Use pagination when the
matching set can exceed a page.

**`storage_by_unifyapps_create_record`** — required `object_type` only.

| key | type | default |
|---|---|---|
| `object_type` | string | — |
| `record` | object — the object's own schema, loaded: `properties`, `required`, enums, `minItems`, `foreignKey` and `foreignKeyConstraintEnforced` all appear here (§4: `record`, never `fields`) | — |
| `useRawPayload` | boolean; `allOf` `if` true → `rawPayload` (object) is the branch's key, else `record_loader` (object) is — the schema declares both, neither has been used here | `false` |
| `writeThroughSessionVariables`, `skipIfBlank`, `useUuid`, `batching`, `inlineRefresh` | boolean | `false` |

Output: `id`, `entityType`, `properties`, `version`, `createdTime`,
`modifiedTime`, `ownerUserId`, `lastModifiedBy`, `deleted`.

## 10. What this file is for

Before hand-building a node, inspect the current schema and a working graph
with the same `resourceName`. Adapt its shape to the selected solution and
exercise the actual outcome. Validation and lint success do not prove that
filters, error branches, permissions, or output bindings behave correctly.
