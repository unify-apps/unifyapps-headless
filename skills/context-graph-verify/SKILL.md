---
name: context-graph-verify
description: Only for the graph-agent builder agent. Use when verifying a real context graph, its source projection, permissions, model-bound read-only agent, or grounded answer through read-only MCP evidence.
user-invocable: false
---

# Context graph verification

Read graph, schema, source, processor, mapping, version, permission, run and agent state before judging a result.

## Verification flow

Turn the accepted spec into checks for populated nodes, every edge type, identity resolution, source lineage, document references, access, freshness and consumer questions. Validate configuration before sampling. Report stale versions, missing keys, unresolved mappings, disabled tools and publication state.

Read `context-graph-agent/references/agent-lifecycle.md` and check every required role's `ai-agent` task separately. The consumer needs read-only graph retrieval and answer evidence. The discoverer needs classification evidence from a real source run. The cleaner needs projected canonical records. One working consumer cannot satisfy the discoverer and cleaner entries.

For a sample, compare stored entity records with their graph projections and links. Check stable identities, values, endpoints, direction, counts, lineage, completeness and truncation. Follow source and sync evidence to terminal state where supported. Verify allowed and denied identities, missing and ambiguous outcomes, and that read-only inspection has no mutation side effect.

Verify the agent separately: graph attachment, effective query scope, model connection, access, retrieval evidence and grounded answer. Do not claim completion until an authorized user asks an agreed question and the answer uses actual graph retrieval.

Report each role as `planned`, `selected`, `configured`, `bound`, `published`, `runtime_verified` or `blocked`. Do not collapse configured and runtime-verified into one status.

## Discover and enrich checks

For every row of the spec's Source objects table, re-read `get_context_graph_source_discovery_configs`. The saved mode, discoverer, entities and enrichers must match the row. For `enrich_all` and `discover`, the enriched fields must appear in `get_context_graph_source_objects`. Quote the config id and the field list as `readBack` lines.

## Node settings and rules checks

`get_context_graph_node` must show the category, `skipRBAC`, `entityMetadata` and properties the spec's Node settings row and Nodes row name. `get_context_graph_node_survivorship`, `list_context_graph_node_match_rules` and `list_context_graph_node_data_quality_rules` must show the Rules row. A share's proof is the `roleMappings` `share_context_graph` returned, naming the principal and role the `users_access` row promised.

## Relationship checks

- Read `list_context_graph_edges`. Every live edge type must be in the spec's Edges table, and every planned edge must be live. Report an extra edge as unplanned; do not delete it without the person's approval.
- Read each edge type's full record with `get_context_graph_edge`, passing every id to check in one call as `edgeIds`. A failure whose code is `NOT_FOUND` means that edge type is gone, not that it holds no links: report it as missing, never as an edge with zero links.
- For an edge whose `creationMethod` is `defined`, check `drawable` before counting anything. A node that lost its primary key or started keeping history stops the edge drawing, and `notDrawnBecause` names which endpoint. A `defined` edge that draws nothing — `drawable: false`, or `drawable: true` with no links counted below — is a diagnosis, not a verification finding: see `context-graph-repair`.
- For each planned edge, read the record counts of both nodes. An edge whose node holds no records cannot hold a link.
- Run `MATCH (n) RETURN DISTINCT labels(n)` through `run_context_graph_cypher_read`. Every node type that holds records must appear.
- For each edge type that is drawable, count its drawn edges with a Cypher read through `run_context_graph_cypher_read`, and compare that count with the source rows that hold a non-empty foreign key (a matched edge) or a complete pair of key attribute values (a defined edge).
- Read one record that has several links with a Cypher `MATCH (a)-[r]->(b)` on its key, through `run_context_graph_cypher_read`. Every link must be there, and none twice.

## When the Cypher read is refused

If `run_context_graph_cypher_read` fails because the tenant has no OpenCypher graph store (the reply says the query "requires an OpenCypher-backed graph"), say so once in your report and do not retry it. Check what the other reads can. `list_context_graph_nodes` gives each node type's `recordCount`, `query_context_graph_records` lists a node's records by its `unifiedEntityId`, and `get_context_graph_record` reads one record with its edges. A link listed on a record is evidence; an empty list is not proof the edge is missing. Report every edge count as unverified, and the label check as not run.

## Evidence rules

- Use exact read-back records, IDs, versions, run states, cursors, and source references. Include truncation and pagination flags.
- Distinguish entity storage from graph projection. A stored record without its expected projection is a failure or unknown, not a pass.
- Distinguish graph facts from document content. A graph summary cannot prove full policy wording or exclusions.

If a needed read is unavailable and this skill names no stand-in for it, report the gap instead of working around it.
