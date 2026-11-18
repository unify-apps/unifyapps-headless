---
user-invocable: false
name: node-inputs-and-pills
description: Read before validating runtime node inputs, using a lookup or search result that may be empty, a maybe-absent upstream value, a dynamic input schema, a mapped array, or an output path that is not explicit in the operation schema. The core prompt owns ordinary required and optional fields plus basic pill reachability.
---

# Node inputs and pills

## Resolve the effective schema

Read `get_operation_schema` before writing a node. A lookup or dynamic loader needs tenant data from `run_lookup`, `describe_storage_object`, or `describe_callable_workflow`.

Do not weaken a schema to pass validation. If a dynamic contract requires a value with no source, add an appropriate caller input when that stays within the approved design, or report the missing requirement.

## Runtime internal metadata

The runtime may add platform-owned keys starting with `__`, such as `__internals__`, to node inputs for request tracking and debugging the original installable. Their presence and contents are not part of the business input contract and they may or may not be present.

- Validate declared business fields by name. Do not require the runtime object to have exactly the schema's keys or key count.
- If the business contract rejects unknown keys, exclude `__`-prefixed keys from that check. Continue rejecting other unknown keys according to that contract, and still check required fields, types, and business rules.
- Treat internal metadata as opaque. **Do not** require it, validate its contents, add it to authored input schemas, or use it as business data.

For example, a contract with `A`, `B`, and `C` must accept valid values in `{ A, B, C, __internals__: {} }` as well as `{ A, B, C }`. The empty metadata object is illustrative; its shape is runtime-owned. See the "Validate a few inputs with if/else" and "Validate many inputs in one Groovy node" examples for field-by-field validation and sanitized outputs.

## Dynamic output paths

Use DSL references such as `node.outputField` instead of writing raw pill strings. The compiler owns serialization.

- Read the producer's output schema. Do not infer wrappers such as `data`, `result`, `objects`, `rows`, or singular and plural names.
- Code node fields are below `node.result` in the DSL.
- Called-automation parameters and outputs come from the live callable contract.

A required schema does not prove a pill exists at runtime. Decide missing-value behavior before mapping it into a required consumer.

A successful lookup may return no rows. Prove the list is non-empty before reading item zero, using a loop or branch before any dependent operation.

## Nullable filter values

Do not put JavaScript operators or fallback expressions inside a pill.

For a required source field, use the value directly unless the operation says otherwise. For an optional dynamic filter value, choose behavior explicitly:

- Use a type-correct, collision-safe sentinel only when absence should make a positive comparison match nothing.
- Add a guard branch for negated comparisons, arrays, range comparisons, numeric or date fields without a safe sentinel, or when absence should skip, default, or fail the step.
- `EXISTS` tests the stored property. It does not prove that a separate comparison pill resolved. An empty string may still count as present.

Never use an empty-string sentinel when empty text is valid. Guard missing values under negated operators because they can broaden the query.

## Arrays

Use a fixed array when authored elements determine the result. Pills inside it do not make it a mapped array.

Use the DSL's `.map()` expression to project every item of an upstream array. Map destination property names from verified source fields. The source and destination names do not need to match. Do not invent `item` or `$item`; use the callback value supplied by the DSL.

Confirm the source is an array and each result matches the destination item schema. A bare pill is not a projection.

## Final check

Before checking, verify required keys, literal types, dynamic identifiers, reachability, output paths, array items, and missing-value behavior. Run it when the user authorizes the effects.
