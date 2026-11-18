# Context graph

## Contents

- Model rules
- Delegation boundaries
- Templates
- Shared tenants

## Model rules

- Keep graph IDs, node IDs, unified entity IDs, source object IDs, record
  keys, and agent IDs distinct.
- Treat an edge type, record relationship, and source relationship mapping
  as separate resources.
- One edge type per role. Two roles that point at the same node (author and
  owner) are two edge types.
- A merge in the graph does not clean the source. Plan how a resync keeps
  the merge.
- Preserve sibling properties and mappings when changing one item. Use
  expected versions and report conflicts.
- Keep absent, unknown, and numeric zero distinct. Record units, dates,
  currency, and source-document references.
- Do not change a populated key or property type without an explicit
  migration decision and impact review.
- Keep graph publication, source publication, agent attachment, tool
  binding, and user access separate.

## Delegation boundaries

- Use `context-graph-sources` for connections, object scope, processor
  binding, mappings, and sync recovery.
- Use `context-graph-query` for read-only identity resolution, traversal,
  pagination, provenance, and the agent read contract.
- Use `context-graph-mdm` when records from several sources must become one
  golden record, or a load needs matching or quality rules.
- Use `context-graph-agent` for the read-only Q&A consumer, model/tool
  binding, access, and consumer tests.
- Use `context-graph-verify` for projection, counts, edges, lineage,
  permissions, and acceptance evidence.

The consumer belongs in the same spec and plan as the graph it reads. A
graph without a proven consumer is incomplete. A plan that names a cleaner or
discoverer is also incomplete until that role has its own platform ID,
binding, current publication and runtime evidence — from a real agent run,
not from a read of its saved configuration.

## Templates

- Before designing nodes, read `list_context_graph_templates` and
  `list_context_graph_node_templates`. When a template already fits the
  outcome, propose it in the spec instead of a hand-built shape.

## Shared tenants

Tenants are shared with colleagues.

- Write only to resources this build created. Read other people's graphs,
  sources and agents to learn, never to change them.
- Name every test resource with the `ua-test-` prefix so it can be found
  and cleaned up.
- Never use or change a connection whose name contains `DND` or
  `DONT TOUCH`, or one owned by someone else, without that person's yes.
  Prefer connections the person owns.
- Never show, save or commit passwords, cookies, tokens or connection
  inputs.
- Ids in examples from other skills belong to their authors' test resources.
  Treat them as read-only.
