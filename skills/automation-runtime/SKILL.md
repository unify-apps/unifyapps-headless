---
user-invocable: false
name: automation-runtime
description: Only for the automation-agent builder agent. Runtime behaviours of UnifyApps automations that a clean save does not catch — dropped input keys, `options.stepError`, CallWorkflow output shape, action-specific filter dialects, E11000 collisions, projections that drop system fields, the draft-versus-deployed gap, callable inputs that are never checked — plus node JSON shapes for reading runs and `open_workflow` output. Read before writing or changing an automation node, filter, storage write or error edge, and when a run does something the definition does not explain.
---

# How the automation runtime actually behaves

A successful save does not prove the resulting behaviour. Everything below is a
run-time fact: the platform accepts the definition and then does something the
definition does not say. Check each one against the selected tenant's schema and
current run evidence.

## The seven that bite

- **An input key the platform does not know is DROPPED**, and the action then
  runs its own defaults. Nothing is reported. So the operation's schema
  (`get_operation_schema`) is the list of keys to work from, and you read its
  `layout` beside its `schema`: the layout holds the per-field hints, and a
  field whose layout shows a `LookupWidget` is not a free string — `run_lookup`
  with that field's `ua:payload` is the only way to get its legal values. That
  schema is the EDITOR FORM shape and not a payload contract, so a key it does
  not declare is a hint to check rather than a proven error. `compile_and_save_workflow`
  is what proves it, and it reports a bad key as a line in your code. Every key
  you write comes from that schema, from a lookup, or from a node that has
  actually run — never from memory and never from the shape of a sibling
  parameter.
- **Continue-on-error is `options.stepError` ON THE NODE** — not
  `fallbackMode` beside it, and not `inputs.options`. The runtime reads
  `node.options.stepError` and nothing else; a node that reads as CONTINUE
  anywhere else stops the run. Three values, `STOP`, `CONTINUE`, `MANUAL`;
  absent or unreadable is `STOP`, so a typo is STOP and `RETRY` is STOP.
- **`MANUAL` without an outgoing `error` edge ends the run there.** No
  respond node runs, the caller gets nothing, and the log says `COMPLETED`.
  The two always come together.
- **A CallWorkflow returns the callee's response shape.** For a response
  `{"status":"OK"}`, use `{{ n_X.outputs.status }}`. Use
  `n_X.outputs.result.status` only if the callee declares a `result` object.
- **A filter's shape belongs to the ACTION, not to the app**, and a wrong one
  crashes at run time, not save time. Two fetches on the same app disagree.
  Copy the shape from a node of the same `resourceName` that already works.
- **Unique-key `E11000` collisions and system-field aliases** (`cTm`, `mTm`,
  `v`, …): `object-storage-manager` § Object schema format is the canonical
  rule. In an automation, pre-check with a filtered fetch and answer a distinct
  `DUPLICATE_<FIELD>` status. That pre-check only catches a collision with a
  row already written: a "read max id, add 1" generator still races under
  concurrent runs, since two runs can read the same max before either writes,
  so a sequential id needs a real unique index to catch the collision, not
  just a read-then-write pattern. And an `update` with `replace: true`, or an
  `upsert`-style edit that matches an existing row, overwrites it silently —
  it is not a collision at all, so no `E11000` ever fires to catch a write
  that should have been a `create`.
- **Callers only ever hit the DEPLOYED copy.** The draft and the deployment are
  separate objects, a callee runs its deployed copy even inside a test run of
  its caller, and a teammate can deploy at any moment. "What is live" has one
  answer, `deploymentState` on the record; a caller's surprising reply is
  usually a deploy gap, not a defect.

**A callable's `setup` types and `required` list are not checked when it is
called.** On a test tenant on 2026-09-30, with `a` and `b` declared `integer` and
required, test runs with `{}`, with `a: "abc"` and with `a: 2.5` all came back
`COMPLETED`. When the contract must refuse bad input, build that check as
nodes: an `if` on each input that returns an error answer.

Two rules sit above those. **A green test is not proof** — a case only goes red
when it expects something to HAPPEN, so "nothing happened" assertions pass
forever; break the thing on purpose and watch it fail. And **anything not
checked by a script is not a status**: `deploymentState` is a status because
something reads it, a tick box is a wish.

## The two references

Read the section you need, not the whole file.

| File | Holds | Read it when |
|---|---|---|
| [`references/runtime-facts.md`](references/runtime-facts.md) | 30 sections on graph execution, failure routing, action schemas, code nodes, storage schemas, filters, reads and projections, writes, CallWorkflow, deployment, identity, integrations, run diagnostics, performance | A run did something the definition does not explain, or you need the exact contract for a storage read, write, filter or projection |
| [`references/node-shapes.md`](references/node-shapes.md) | 10 numbered node and graph examples, plus the graph vocabulary (`type`, `index`, edges, groups, connections) | You are reading a run or `open_workflow` output and need to know what a node's shape means. Never copy it into workflow JSON: you write TypeScript and the platform compiles it |

Neither file defines an application's objects, relationships, or tenant
configuration. Use the tenant selected for the solution, and fixtures authorized
for that task. Production is refused. Support any performance conclusion with
measurements on the relevant data and environment, and keep solution-specific
evidence in that solution's documentation.
