# UnifyApps automation runtime reference

## Contents
- How to use this reference
- Graph execution model
- Failure routing and completion
- Action schemas and silent input loss
- Code nodes and pill contracts
- Storage object schemas
- Storage filters and search
- Reads, projections, sorting, and pagination
- Storage writes
- CallWorkflow and callable automations
- Validation and deployment
- Authentication, identity, and ID scope
- External integrations and secrets
- Run diagnostics
- Performance and scalability
- Pre-deploy verification checklist

This document collects reusable guidance and observed runtime behavior for
UnifyApps automations. It is a working reference, not a substitute for the
current action schema, object schema, deployment state, or a test on the current
tenant. Platform versions, connectors, and object metadata can differ. Inspect
the current schema first, then verify important behavior with a representative
read or test run.

Keep solution-specific discoveries, identifiers, volumes, performance results,
and operational decisions in that solution's feature docs or plan evidence.
Do not turn them into global facts here. This reference is updated deliberately;
no automation, hook, or session automatically writes global memory.

Examples use placeholders such as `<objectType>`, `<nodeId>`, and `<value>`.
They describe shapes, not records that should exist on a tenant.

## How to use this reference

Treat statements in three ways:

- **Action contracts**: an action input or output observed consistently and
  supported by the current schema. Confirm the schema before writing.
- **Runtime observations**: graph execution, pill resolution, failure routing, and
  deployment behavior observed in actual runs. Re-test after a platform change.
- **Tenant configuration**: indexing, retention, connector behavior, performance,
  and data constraints. Measure these on the tenant where the automation runs.

When this file and a live schema disagree, the live schema wins. When two
actions expose similar labels, do not assume they share a filter or payload
dialect. A wrong shape is often ignored instead of rejected.

## Graph execution model

### Nodes, edges, and outputs

- A workflow passes data through node outputs held by its execution instance.
  Large lists remain part of that execution state, so fetching several complete
  collections and joining them in code multiplies memory and payload cost.
- A successful HTTP or node response proves only that the call completed. It
  does not prove a row changed, a branch ran, or a deployment became active.
  Read the resulting entity, run, or deployment state back.
- A pill that points to a missing output usually resolves to no binding at all.
  Code may see an undefined variable rather than a variable whose value is
  `null`. Normalize optional values before downstream reads.
- Node type, `appName`, and `resourceName` must describe the same resource.
  A mismatched type can render incorrectly or fail only at runtime. Copy the
  context tuple from a healthy node of the same resource.

### Branches and parallel work

The runtime can execute independent work concurrently through a `BRANCH`.
Ordinary `loop_for_each` iterations are sequential; BATCH mode changes the
batch shape, it does not turn a loop into arbitrary parallel work.

- `BRANCH` split behavior depends on its configured split type. An AND-style
  split can fire several applicable outgoing branch edges. Debug execution may
  serialize work that a normal run executes concurrently.
- Each branch edge needs the `name` expected by the branch definition. Missing
  or mismatched names can leave an arm unstarted even when its condition reads
  correctly.
- Nodes inside an arm belong to that arm's group. The continuation after the
  join belongs to the branch's parent group, not to a default arm.
- Every arm's last node should connect to the shared join target. The parent
  resumes at the join after its child execution instances complete.
- For a callable trigger, every reachable leaf must end in the paired response
  node. A dangling branch arm can test successfully yet fail deployment
  validation.
- IF edges conventionally use `yes` and `no`. STOP nodes have no outgoing edge.
  Validate both the runtime path and the builder layout.

A reusable two-arm fork/join has this conceptual shape:

```text
trigger -> branch
             |-- arm 1 -> read A --|
             |-- arm 2 -> read B --|-> join/compute -> response
```

Use it only for independent operations. If one arm needs another arm's output,
make the dependency explicit instead of relying on timing.

### IF conditions

An IF/ELSE condition commonly uses a top-level filter block:

```json
{
  "operator": "AND",
  "filters": [
    {
      "property": "<pill-or-field>",
      "filter": { "operator": "EQUAL", "value": "<value>" }
    }
  ]
}
```

Do not wrap this shape in an invented `conditions` property unless the current
action schema requires that wrapper. A flat filter entry such as
`{property, operator, value}` has also been observed to evaluate incorrectly
where `{property, filter:{operator,value}}` was required.

`EXISTS` means the key exists; an empty string may still count as present.
Where supported, `MIN_LENGTH: 1` is a clearer non-empty string check.
`NOT_EQUAL ""` has been rejected by workflow validation in observed versions,
even where runtime evaluation existed.

### Loops and mutable variables

`loop_for_each` commonly takes:

```json
{
  "repeatMode": "SINGLE",
  "listSource": "{{ <nodeId>.outputs.objects }}",
  "captureIterations": false
}
```

Inspect the current loop schema for BATCH options and batch size. Do not assume
the loop publishes a complete `outputs.iterations` collection. When results must
be accumulated, create a list before the loop, append inside it, and read the
list after the join.

`loop_while` can work with the variable actions
`variable_by_unifyapps_create_variables` and
`variable_by_unifyapps_update_variables`:

- Create state before the loop.
- Update state inside it.
- Read the variable node's current output in the loop condition.
- Use a clear sentinel to end the loop. Empty-string filter values may fail
  builder validation.
- Keep numeric counters in code if workflow variables arrive as strings.
- Prove the loop by its resulting state or side effect. Some run-inspection
  paths do not expose loop and variable nodes as expected.

An empty for-each list is a clean zero-iteration path. Still test it explicitly
when the response contract promises an empty list rather than an absent key.

### Node caching

Some nodes support `options.cacheConfig`, including a TTL and a choice between
process-local and shared storage. Its `timeToLive` is in seconds, and
`usagePolicy` is `ALWAYS` or `ON_ERROR`. A cache also needs a meaningful cache
key. Without one, an apparently configured cache may not cache anything.

Cache slowly changing, repeatable reads only. Do not cache a read whose answer
must include a write performed earlier in the same run. Include every input
that changes the answer in the key, including tenant, user, locale, and relevant
filter values.

## Failure routing and completion

### `options.stepError` is authoritative

Observed runtime versions route node failures from `options.stepError`.
A top-level `fallbackMode` can be decorative and should not be treated as the
failure policy.

Use only values supported by the current schema:

- `STOP`: end the run on failure.
- `CONTINUE`: record the failure and follow the normal continuation.
- `MANUAL`: follow an explicit `error` edge.

`MANUAL` without an outgoing `error` edge can terminate the token with no
response and produce a misleading completed-looking run. Configure MANUAL and
its error edge together. An unknown value or typo may fall back to STOP.

### No cross-node rollback

Workflow nodes do not provide a general transaction across side effects. If an
early connector call succeeds and a later storage write fails, the earlier
effect remains. Place uniqueness, authorization, existence, and other refusal
checks before the first side effect. Where partial completion is possible,
record identifiers needed for compensation and verify what actually landed.

### Responses and terminal nodes

- A callable can finish through any reachable response/STOP node. Polling only
  the final node in the definition misses early-return paths.
- A STOP node's resolved reply has been observed in its run inputs under
  `result`, rather than under a generic `parameters` wrapper. Inspect the
  actual run payload before writing diagnostic readers.
- A mapped-array expression sourced from an empty collection may omit the key.
  Use a literal `[]` when the public contract requires an array key even when
  empty.

## Action schemas and silent input loss

Unknown input keys are often dropped rather than rejected. This is one of the
most important reusable platform behaviors: a write can return success while
executing defaults or changing nothing.

- Read the exact action schema for the selected app and resource.
- Traverse conditional JSON Schema branches such as `if`/`then`/`else`,
  `allOf`, `anyOf`, `oneOf`, and dependencies. Conditional keys are real keys.
- Do not infer a key from a sibling action or connector.
- Compare the saved node inputs with what the builder renders.
- Read the resulting record or external resource back.

Some resources intentionally carry dynamic maps, such as `parameters`,
`result`, records, list items, or connector-specific nested payloads. This does
not make arbitrary top-level keys safe.

## Code nodes and pill contracts

### Groovy bindings

`code_by_unifyapps_groovy` receives each configured parameter as its own
binding. There is no implicit `inputs` map unless the node schema explicitly
creates one.

```groovy
def safeString = { value -> value == null ? '' : value.toString() }
def caller = safeString(binding.hasVariable('callerId') ? callerId : '').trim()
return [caller: caller, valid: !caller.isEmpty()]
```

A parameter whose pill does not resolve may not be bound. Use
`binding.hasVariable` for optional values.

The Groovy runtime has no `groovy-dateutil` extension, so `Date.format(...)` and
`Date.parse(...)` fail on the first run with "No signature of method:
java.util.Date.format()" although the code saves clean. Format and parse dates
with `java.time` (`DateTimeFormatter`, `ZonedDateTime`).

Keep `inputs.input.properties` and the configured `parameters` in sync.
The builder has dropped undeclared parameters on open/save, even when a direct
test run used them successfully before that save. Re-read the saved node after
changing its parameter schema.

### Output nesting

A returned Groovy map is normally nested under `outputs.result`:

```groovy
return [items: rows, count: rows.size()]
```

```text
{{ <codeNode>.outputs.result.items }}
{{ <codeNode>.outputs.result.count }}
```

Storage, list, loop, and CallWorkflow outputs are generally flat for their
declared fields, for example `outputs.objects`, `outputs.items`, or
`outputs.status`. Do not apply the Groovy `result` wrapper universally.
Read one real output before wiring a downstream pill.

### Nulls, strings, and declared input types

- A map entry whose value is `null` may disappear from serialized node output.
  If the contract requires the key, choose and document an explicit sentinel.
- Groovy `GString` values can retain a runtime-specific type across a boundary.
  Convert externally visible values with `.toString()` when a plain string is
  required.
- A node input schema describing a value as `string` does not necessarily
  coerce a numeric pill before Groovy receives it. Normalize IDs before `==`,
  `List.contains`, map lookup, or concatenation.
- Avoid relying on implicit last-expression behavior. Return the complete map
  explicitly.

## Storage object schemas

### Read the live object definition

Before a create or schema-sensitive update, inspect:

- `metadata.primaryKeyField`
- required properties
- property types
- `uniqueKey` and top-level unique-key metadata
- filterability and searchability
- `foreignKeyConstraintEnforced`
- generated fields and sequences

Do not transfer assumptions between object types. One type may use its public
identifier as its row ID while another uses a generated platform ID.

### Type and schema behavior

Observed storage writes coerce values to declared property types even when
`skipSchemaValidation` is true. That flag does not mean "store this raw value."
Code nodes remain type-strict, so normalize values before comparisons even when
storage filters happen to coerce them.

Additional reusable observations, which should be confirmed on the current
tenant before a migration:

- `number` properties can round-trip fractional values; whole values may read
  back as floating-point values.
- Shrinking the required-property list has been accepted by entity-type update
  in observed versions.
- Retyping an existing property can be refused once records exist. A safer
  migration is often a new property plus an explicit data move.
- Filterable metadata can be derived from property-level flags rather than from
  directly editing a metadata list.
- Object-valued properties do not preserve JSON key order. Compare parsed
  structures, not serialized strings.
- An object type may be retired by an update that marks it deleted rather than
  by a dedicated delete endpoint. Verify current tenant support before relying
  on this lifecycle.

### Primary keys and row IDs

At create time, the store may synchronize a declared primary-key property and
the row ID. This does not guarantee they can never diverge later. An update to
the primary-key property may leave the stored row ID unchanged. Always decide
which identifier a downstream action expects and read both after a migration.

Caller-supplied IDs have also depended on whether the object declares a primary
key. Use the current action schema and verify the created row rather than
assuming the requested ID was honored.

### Unique keys

See `object-storage-manager` § Object schema format (unique keys and `E11000`).

### Foreign keys

With `foreignKeyConstraintEnforced: true`, invalid nonblank references can fail
at write time. Blank values have been treated as absent in observed schemas,
but this is action- and version-dependent; test SET, UNSET, and blank separately.

An enforced foreign key may protect writes without preventing deletion of the
referenced row. Do not infer delete protection or cascade behavior from write
validation. Implement delete policy from the accepted solution contract and
verify remaining references explicitly.

## Storage filters and search

### Filter dialects are action-specific

Common storage filter blocks use:

```json
{
  "operator": "AND",
  "filters": [
    {
      "property": "properties.<field>",
      "filter": { "operator": "EQUAL", "value": "<value>" }
    }
  ]
}
```

Other actions use platform-query shapes such as:

```json
{
  "op": "AND",
  "values": [
    { "field": "properties.<field>", "op": "EQUAL", "values": ["<value>"] }
  ]
}
```

These are not interchangeable. Some storage resources or older definitions use
an underscore spelling such as `properties_<field>` in a particular input.
The dot spelling is used by other filters, projections, and API searches. Read
the exact current schema and prove the filter with one matching and one
nonmatching record.

A wrong filter key can fail in either dangerous direction: zero matches or an
unfiltered full collection. Always compare returned IDs and counts with the
intended predicate.

### Composition and list values

- Nested OR groups inside AND groups have worked in storage filters.
- A top-level OR has also worked where the action schema exposed it.
- A list-valued pill can resolve as the value of an `IN` filter.
- An empty `IN` list has been observed to match nothing, which makes optional
  lookup lanes a clean no-op. Confirm this on the selected action.
- Dynamic pills belong in filter values. A pill embedded in a property name is
  not a portable way to select a field.

### Missing, blank, and existence

A missing property is different from a present property whose value is `""`.
`EQUAL ""` may match only the second. `EXISTS` may include empty strings.
Design filters around the stored states that actually occur, including legacy
rows where a newer property is absent.

Where `MISSING` or `EXISTS` is a unary operator, omit the `value` key entirely.
Sending an empty `value` has inverted the result in observed filters. Confirm
both present and absent cases with the current action.

A filter whose value comes out empty (an optional trigger input that was not
sent, for example) is dropped by the runtime, and storage then rejects the
filter: the run fails with errorCode 5004 "No Value found in filter with field:
..." instead of matching nothing. Guard that filter with a branch, or send a
value that cannot match.

To clear a property, use the action's UNSET operation where available. Writing
an empty string is not equivalent to removing the key and can violate a foreign
key or non-empty rule.

### String and array operators

String search behavior depends on property metadata and current backend
version:

- `CONTAINS` has been case-sensitive in observed storage queries.
- Later observations showed `CONTAINS` matching array members or substrings on
  some actions. Do not assume arrays can never match.
- `ICONTAINS` may require the property to be searchable. On a non-searchable
  field it can silently return no rows.
- Search indexes may lag a recent write while exact filters already see it.

Treat these as tenant-dependent empirical behavior. Test the chosen operator on
the exact property, including case variants, arrays, missing values, and a row
written immediately before the search.

### Standard entities use their own contracts

`standard_entities_fetch_entities` has exposed more than one filter shape over
time and across resources. Its projected rows can wrap fields under `columns`
rather than `properties` or top-level fields. Read the current schema and a real
output before joining.

Platform identity and membership in a specific application are different
questions. An application filter is appropriate for membership validation but
can wrongly exclude a platform user during display-name enrichment. Decide which
set the feature needs.

A direct `/api/workflow/execute/node` result does not prove every
standard-entity resource behaves the same inside a real workflow. Test
resources that depend on workflow context inside a real workflow run.

## Reads, projections, sorting, and pagination

### Fetch outputs

`storage_by_unifyapps_fetch_records` commonly returns:

```json
{
  "objects": [],
  "hasMore": false,
  "cursor": null
}
```

The declared output schema lists `objects`, `hasMore`, `cursor` and
`innerHits`, and no count. `includeTotalCount` is an input flag, and a pill on a
`total` output has resolved empty, so `eq(rows.total, 0)` never matched. For a
zero-rows check, test the first row: `missing(rows.objects[0])`, or
`exists(rows.objects[0].id)` for the opposite. For a count, use
`storage_by_unifyapps_count_records`.

Choose the narrowest read resource the current schema provides:

- `storage_by_unifyapps_count_records` returns a count without transferring all
  matching rows.
- `storage_by_unifyapps_get_record_by_id` reads one known row.
- `storage_by_unifyapps_get_records_by_ids` avoids a per-ID loop when several
  row IDs are already known.
- `storage_by_unifyapps_fetch_records` supports general filtering, projection,
  sorting, and pagination.
- `storage_by_unifyapps_fetch_distinct_values` and
  `storage_by_unifyapps_aggregate_records` have not behaved uniformly across
  object types and tenants. Verify support and output shape before relying on
  either one.

`get_record_by_id` takes `id`, not `recordId`. A wrong key or an unresolved ID
pill has left runs stalled with a null-pointer error despite CONTINUE. Normalize
optional inputs and branch before the read when no ID is available. An ID that
never existed has returned an empty response, while a hard-deleted row has
produced an error in observed runs; exercise the missing-record path rather
than assuming either outcome universally.

### Projections

`fields` projections reduce user-property payload but have important caveats:

- Property names commonly use `properties.<field>`.
- Unprojected rows can include system fields such as `ownerUserId`,
  `createdTime`, `modifiedTime`, `lastModifiedBy`, and `version` at the row's
  top level.
- A projection can drop those system fields, and requesting their logical names
  may not restore them.
- In observed versions, projected rows could report `version: 0`. Do not use a
  projected row for optimistic concurrency or ownership proof.

Use an unprojected read when the answer depends on system metadata.

System-field query aliases (`cTm`, `mTm`, `v`, …): see `object-storage-manager`
§ Object schema format.

### Sorting

`sortBy` commonly accepts entries such as:

```json
[{ "field": "properties.<field>", "order": "ASC" }]
```

Some storage backends expose aliases for system timestamps rather than their
logical names. A logical name can be silently ignored. Read the current action
schema and verify ascending and descending orders. Add a stable unique
tiebreaker such as row ID because bulk writes can share a timestamp.

Sorting on a foreign-key property has produced duplicate rows in observed
queries. If that sort matters, verify unique IDs and page boundaries on the
current object before depending on it.

### Pagination

A finite limit is a correctness boundary, not just a performance choice.
For every list read, decide what happens after the limit:

- paginate until `hasMore` is false;
- narrow with a server-side filter;
- aggregate or count server-side; or
- return an explicit truncation signal.

Offset pagination needs a deterministic sort. Ties without an ID tiebreaker can
duplicate or skip records across pages. Grouped pagination and aggregation have
shown tenant- and version-specific limitations; validate their token and
projection behavior before replacing a straightforward paginated read.

For `/api/entity` record searches, pass the returned cursor inside `page.cursor`.
A top-level `cursor` has been accepted but ignored, repeatedly returning the
first page. Follow the current response's next-page token and verify that the
record IDs advance; do not infer progress from a successful HTTP response.

## Storage writes

### Single-record create and update

`storage_by_unifyapps_create_record` enforces current object constraints at
runtime. The result ID can use a platform prefix or a declared primary key,
depending on the object.

`storage_by_unifyapps_update_record_fields_by_id` has returned only a success
flag in observed versions, not the updated row. Re-fetch before returning
post-update values.

`storage_by_unifyapps_update_records` in SINGLE mode has behaved like an
internal compare-and-set: it searches one matching row and updates by its ID and
current version. A concurrent change can make the result false with no update.
This is different from accepting a caller-supplied version as a portable
compare-and-set contract. Verify the result and read the row back.

MULTIPLE mode updates only the selected page. The observed default page limit
has been 20. Set the page explicitly, check `count`, `failedCount`, and
`errors`, and repeat safely if the contract requires more rows.

For updates with `skipIfBlank: true`, an empty string has been skipped while
boolean `false` was still written. Do not treat `false` as an omitted value.
Test absent, empty-string, `false`, and UNSET inputs separately when they carry
different meanings in the accepted contract.

### Bulk create

`storage_by_unifyapps_bulk_create_records` returns an `inserted` count,
`insertedIds`, and `errors`; read their current schema and returned values.
Each input record has been a flat property map, without a `properties` wrapper.
A wrapped record can fail required-field validation even when its nested values
are present.

Inserted IDs have followed input order in observed implementations. A duplicate
inside the batch can throw for the whole node instead of returning one friendly
per-row error. Verify landed rows before retrying a batch.

### Bulk upsert by ID

`storage_by_unifyapps_bulk_upsert_records_by_id` expects `updates`, and each
resolved row uses `updateFields`. This example shows the resolved values:

```json
{
  "updates": [
    {
      "id": "<rowId>",
      "updateFields": [
        {
          "fieldName": "properties.<field>",
          "actionType": "SET",
          "setValue": "<value>"
        },
        {
          "fieldName": "properties.<optionalField>",
          "actionType": "UNSET"
        }
      ]
    }
  ]
}
```

The saved builder input is a separate layer: observed definitions require
`updates` to use a `mappedArray` wrapper with the literal keys `ua:type`,
`source`, and `items`, where `ua:type` is `"mappedArray"`. Use the current schema
and a working node to map the source rows into the per-item shape above. Do not
paste the resolved array into a graph input that expects this wrapper; a valid
save alone does not prove that any update will run.

Do not send fetched rows back as `{id, properties:{...}}`, do not flatten the
fields beside `id`, and do not rename `updates` to `records`. Those malformed
shapes have produced zero writes with little or no error detail.

Read `successCount`, `failedCount`, and `errors`; never treat `success` alone as
proof. An empty `updates` list is a clean no-op. A mid-batch unique violation
has caused broader batch failure in observed versions, so read every intended
ID back.

This action does not provide a reliable caller-version compare-and-set. A
`version` in the input has been ignored in observed implementations. Use an
appropriate single-row guarded update or redesign the conflict boundary.

Observed versions of this bulk action have also mishandled empty-string and
array values: an empty string could become a missing property, while an array
could fail with an unhelpful service error. Where the current tenant still
shows that behavior, use a verified hierarchical action or bulk create path and
read the exact fields back.

### Ownership and system fields

Observed behavior:

- `ownerUserId` and `createdTime` have been writable on CREATE through
  `standard_entities_create_update_delete_or_restore_hierarchical_entity` in
  observed versions.
- Later UPDATE attempts did not replace those creation fields.
- `ownerUserId` therefore commonly describes the creator, while
  `lastModifiedBy` describes a later editor.

The observed create shape separates entity metadata from declared record
properties:

```json
{
  "entity": {
    "entityType": "<objectType>",
    "id": "<optionalRowId>",
    "ownerUserId": "<optionalPlatformUserId>"
  },
  "record": { "<field>": "<value>" },
  "requestType": "CREATED"
}
```

The sibling `record` is required by the observed create path. Related-entity
input shapes were not established; do not guess them.

If the accepted contract requires an explicit `entity.createdTime`, supply the
intended timestamp as a numeric epoch-millisecond value. Otherwise omit it and
let the platform set creation time.

Do not use projected rows to prove this, and do not assume every action accepts
the fields. Check the current schema and read the unprojected row back.

### Delete actions

Use the plural `storage_by_unifyapps_delete_records` resource exposed by the
current schema. A guessed singular resource has not existed in observed action
catalogues.

For MULTIPLE deletion, drive selection with the documented filter and page.
An invented `recordIds` input can be ignored and may delete an arbitrary
matching page. An empty `IN` filter has been a clean zero-delete path, but verify
the returned count and then confirm that the intended IDs are absent.

`delete_records` takes no row id: the compiler refuses `recordId` on it.
`SINGLE` deletes the first row its filter matches and returns `{ result }`;
`MULTIPLE` deletes up to `page.limit` matches (20 without `page`) and returns
`{ count }`. To delete one known row, use
`storage_by_unifyapps_delete_record_by_id`, whose id input is `entityId`:

```json
{
  "object_type": "<objectType>",
  "entityId": "<rowId>"
}
```

Its `success` output is a `{ t1, t2 }` pair, not a boolean: `success.t1` says
whether the row was deleted. Confirm that the intended row is absent. Do not
invent alternative key spellings or infer an ID-list input from another action.

Before any MULTIPLE delete, require isolation evidence:

1. Use at least two predicates when the model permits it: the target ID set and
   an independent scope such as the owning parent, solution, workspace, or
   tenant property.
2. Count and list the exact AND-filtered matches before deletion.
3. Refuse the operation if any returned ID falls outside the intended set or
   the count exceeds it.
4. Compare the same count and IDs afterward. Never loop a destructive call to
   convergence when the first result differs from the request.

Deletion may not enforce foreign-key protection. The automation must implement
the accepted delete policy explicitly and must not infer a customer-specific
deletion order from this reference.

## CallWorkflow and callable automations

`callables_call_automation` invokes another automation. Reusable observations:

- The node type must be `CALL_WORKFLOW` where the current resource requires it.
- Inputs have supported direct parameters, a `parameters` object, and list/map
  values depending on the callee contract. Inspect the callee and current node
  schema.
- Callee response fields are normally flat at `outputs.<field>`, not nested
  under `outputs.result`.
- The callee must be deployed even when the caller itself is being test-run.
  CONTINUE does not make an undeployed callee callable.
- A registered `platform_automation` record has been required for some callable
  execution paths. Removing that registration revokes the call. Treat this as
  platform configuration, not as a row an ordinary business automation should
  create opportunistically.
- Batch-call resources exist. Check their schema before wrapping a CallWorkflow
  in a large sequential loop.

The live version comes from the automation record's `deploymentState`, including
its status and version. A "deployed definition" read has returned draft content
in observed tooling. Compare draft version with deployment state instead of
inferring that a teammate has not deployed.

## Validation and deployment

Workflow validation is a deployment gate. A draft may save and a test may run
while deployment still fails on graph violations.

Validate before deployment and inspect every violation. Common structural
issues include:

- a callable path without a response leaf;
- a dangling branch arm;
- an edge name that does not match the branch or IF contract;
- a STOP node with an outgoing edge;
- mismatched node type, app, and resource;
- a MANUAL failure route without an error edge; and
- an input that the builder schema considers incomplete.

Deployment permission remains separate from technical validation. A green
validate or test does not authorize deploy.

## Authentication, identity, and ID scope

### Caller identity

`{{ __USER__.outputs.id }}` is a platform user ID. It is not automatically an
application-specific member ID, connector user ID, or external-channel ID.
Translate between identity spaces through the appropriate live directory or
mapping.

The value can reach Groovy as a number even when the code-node input schema says
string. Normalize before comparing with string-valued storage properties:

```groovy
def callerValue = binding.hasVariable('callerId') ? binding.getVariable('callerId') : null
def normalizedCallerId = callerValue == null ? '' : callerValue.toString()
```

Platform-user existence and membership in an application are separate facts.
Apply an application filter only when membership is the question.

### Record IDs

IDs returned by storage actions, entity APIs, application records, connectors,
and external systems can inhabit different scopes or use different prefix
forms. Never compare or store them interchangeably without an explicit mapping.
Keep field names specific enough to show which scope they contain.

### Authentication failures

Treat HTTP 401/403 as authentication failure and stop the current write path.
Do not silently switch credentials or launch interactive login from a builder
agent. The session-level router handles sign-in and retry.

## External integrations and secrets

### Connector actions

Connector action schemas can contain conditional fields and connector-specific
nested payloads. Read the complete current schema, including conditional
branches. Unknown top-level keys may be dropped, while a nested payload map may
permit connector-defined fields. Verify the external effect through a safe read
or test account.

Do not assume `/api/workflow/execute/node` can invoke every connector or code
resource. Observed allow-lists have accepted selected platform datasources while
rejecting connector and `code_by_unifyapps` resources with a forbidden-datasource
error. Test those nodes inside a scratch workflow or the actual automation.

A connector can answer a rejected call as a normal output. A Slack post that
Slack refuses completes the node and the run with `{ok: false, error:
"invalid_auth"}`, and `list_connections` can still show the connection active.
Check `ok` on the node's output before treating the post as sent, and prove a
connection with a live read such as `slack_get_user_info`, not with its status.

### Environment variables and secrets

A secret can be intentionally absent from environment-variable listing APIs.
"Not listed" does not prove "not configured." The safe check is a workflow node
that binds the secret and reports only a boolean such as `configured`, never the
value. Do not log, return, or store secret contents in run evidence.

Ordinary nonsecret configuration may be enumerable. Keep the distinction clear
when diagnosing an unresolved environment pill.

### Files and attachments

File actions and connector attachments use action-specific metadata. Preserve
the returned file identifier, media type, and URL/reference fields exactly as
the consuming action schema requires. Do not infer an attachment payload from a
different connector. Test missing, empty, and oversized inputs on the current
tenant without recording customer data in this reference.

### Custom HTTP and event triggers

Webhook and custom HTTP trigger outputs are commonly flat. A pill copied from a
different trigger shape can be unresolved and kill a downstream code node.
Inspect one test run's trigger output before wiring fields.

A Storage record-change trigger works only on an object with webhooks enabled
(`supportsWebhook` under its logging settings). The save fails with
"Webhooks are not enabled for object ..." otherwise, so check the object, and
turn the setting on in the plan, before building on such a trigger.

For custom HTTP actions, the request and response shape is connector-specific.
Verify status, headers, body encoding, timeout behavior, and authentication with
safe fixtures. Never treat one successful external call as proof of retry or
idempotency behavior.

## Run diagnostics

### Read the execution that actually ran

A workflow can have a root execution and child execution instances for branch
arms or nested calls. A lookup scoped only to the root can make child nodes look
unreached. Use the run's execution tree, inspect join-side inputs, or verify the
external effect.

For CallWorkflow, nested child nodes may not be exposed by a general entity
lookup. Use the workflow/run diagnostic endpoint intended for nested execution.

### Status and assertions

Distinguish:

- a node that failed;
- a node that returned zero matches;
- a node whose input pill never resolved;
- a node that was skipped by branch logic;
- a failure swallowed by CONTINUE; and
- a run record whose queue/status view has not caught up.

These states can produce similarly empty outputs but require different fixes.
Read failed-node details, node inputs, node outputs, assertions, and the final
response together.

Test-suite records can remain RUNNING or show cases QUEUED after the workflow
execution itself has finished. Use the supported wait command with a bounded
cap instead of manual sleep loops. Inline cases can provide a faster feedback
lane while authoring, but a representative suite is still needed before deploy.

Run-history retention is tenant- and version-dependent. An observed environment
kept only a short rolling window. Query current health/retention and export any
long-lived operational evidence to an approved system.

Unknown run IDs can be returned as structured errors inside a successful MCP or
HTTP response. Inspect the inner result and error fields, not transport status
alone.

## Performance and scalability

Do not copy performance numbers between solutions. Record tenant-specific
measurements in the solution docs with date, data volume, action, and run type.

Stable design guidance:

- Push selective filters, counts, and aggregation toward the server when the
  current action proves correct.
- Avoid fetching a complete collection only to count or filter it in code.
- Project only the user properties needed, unless system metadata is required.
- Paginate with deterministic ordering.
- Keep API calls out of per-item loops when a bulk or batch action exists.
- Use parallel branch arms only for independent operations.
- Include an explicit truncation signal when a hard cap remains.
- Measure both runtime execution and queue/reporting delay.

Aggregation resources and indexes have shown tenant-specific limitations. A
declared custom index may build asynchronously or fail to become usable, and an
unindexed sort may work at one volume but fail later. Inspect index state and
measure the actual query plan or latency before stating scale characteristics.

## Pre-deploy verification checklist

Before calling an automation complete:

1. Read the current trigger and action schemas, including conditional fields.
2. Read every touched object schema: primary key, required, unique, filterable,
   searchable, foreign keys, and generated fields.
3. Confirm each filter dialect and field spelling with a matching and a
   nonmatching record.
4. Confirm every projected output and pill path from a real run.
5. Exercise blank, missing, malformed, duplicate, unauthorized, and empty-list
   cases that the accepted contract requires.
6. Verify write counts and read every changed record back.
7. Verify branch arms, loop exit, error routes, and every response leaf.
8. Validate the complete graph before deployment.
9. Read the best practice score of the saved version, and bring it toward 90
   or name each exception (`automation-testing`).
10. Read `deploymentState` after an authorized deploy.
11. Record solution-specific facts in the solution docs, without secrets or
    copied customer data.
