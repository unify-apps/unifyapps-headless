---
name: context-graph-query
description: Only for the graph-agent builder agent. Use when a real context graph consumer must resolve identities or answer bounded read-only questions with permissions, pagination, provenance and source references.
user-invocable: false
---

# Context graph query

Read graph scope, schema, permissions and limits first. Confirm the accepted question, identity type and expected output. The reads are `query_context_graph_records`, `get_context_graph_record`, `run_context_graph_cypher_read` and `get_context_graph_consumer_context`.

## Query flow

Resolve a declared record key, business number or alias. If several records match, return candidates and keep the question ambiguous. Run bounded read-only lookups or traversals with explicit depth, row limit, timeout and cursor where supported. Keep RBAC enabled.

For a question the record tools cannot express, call `run_context_graph_cypher_read`. It refuses write clauses, keeps RBAC on, adds `LIMIT` (default 100, max 1000) and reuses one query automation per graph. The node label is its `unifiedEntityId` and each property is `_pr_<name>`. `run_connector_operation` runs the graph's own query operation the same way, forced to RBAC on, and refuses `skipRBAC: true`; it refuses the graph's update operation outright. `query_context_graph_records` gives no total, so count with Cypher `count()` *(unverified)*. If the Cypher read fails because the tenant has no OpenCypher graph store, follow `context-graph-verify` § When the Cypher read is refused.

## Lookups

- To resolve a person, tag, graph model or connection by name, use `lookup_context_graph_entities` with `lookupType` `USER`, `TAG`, `UNIFIED_ENTITY_MODEL` or `CONNECTION`.
- With RBAC on, every node pattern needs a variable: `(:Label)` fails with "anonymous labelled node(s) cannot be gated", so write `(t:Label)` even when `t` is unused *(unverified)*.

## Result rules

- Keep record identity, node identity, edge type, and source identity separate.
- Preserve null, unknown, and zero. Convert dates, numbers, and currencies only under the declared field contract. Explain units in result metadata.
- Deduplicate records by stable identity when traversal returns repeated paths. Do not deduplicate away distinct relationships.
- Include authorized source references when present.
- A query response is evidence of returned data. It is not proof that ingestion, projection, or source sync succeeded.

## Consumer contract

The consumer agent reads the graph only through its bound graph search (`bind_graph_search`), within its explicit graph scope. It must not receive graph writes, source edits, ingestion controls or arbitrary tools.
