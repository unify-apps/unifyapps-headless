# Record edges, ids and lineage

How to write record-level edges in bulk, how graph ids are shaped, and where field lineage lives.

## Writing record edges in batches

An edge type only says a link may exist. A record edge links two real records, and it is written by the MDM action `mdm_by_unifyapps_add_edge_to_graph` inside an automation.

1. Build one reusable automation per graph for edge writes. It takes a list of edges as input: `primaryEntityType` and `primaryEntityId` (the from record), `associatedEntityType` and `associatedEntityId` (the to record), and `label`. The model id is the graph id. Set `updateIfPresent: true` so a replay does not add a second edge.
2. Author it with `get_dsl_reference`, save it with `compile_and_save_workflow`, and run it with `start_run` or `trigger_workflow_run`. Pass each batch as input. Never save a new automation per batch.
3. Send about 60 edges per run. One bad edge can fail the whole run, so small batches limit the damage.
4. Do not trust the run output. Count edges per type with Cypher `count()` through `run_context_graph_cypher_read`, and read one linked pair back with a `MATCH (a)-[r]->(b)` that returns both keys. `get_context_graph_record` can list no edges for a link that Cypher shows, so an empty `edges` there is not proof the edge is missing *(unverified)*. It takes the bare record key (`T-1`) as `recordId`, never the vertex id. If the Cypher read is refused for want of an OpenCypher graph store, follow `context-graph-verify` § When the Cypher read is refused.
5. After every batch is written, run the load again. Edge counts must not change.
6. A record whose key value goes blank in a later load loses its edge, with no error anywhere *(unverified)*.

## Id formats

| Thing | Format |
|---|---|
| Vertex | `{spaceId}::{unifiedEntityId}::{recordId}` |
| Record edge | `{fromVertex}::{toVertex}` |
| Cypher node label | the node's `unifiedEntityId`, in backticks |
| Cypher property | `_pr_` plus the property id, in backticks |

A record read can show an edge with `isDangling: true`. That means the link has no matching declared edge type. It still resolves and traverses. Treat it as an unplanned edge.

## Field lineage

Records loaded through MDM carry `properties.mdmRecordMetadata`:

| Field | Meaning |
|---|---|
| `sourceDetails[]` | per field: `fieldName`, `sourceAppName`, `sourceId`, `stageRecordId`, `modifiedTime` |
| `contributingSources[]` | every source that fed the record |
| `associatedStagingRecordIds[]` | the staged records merged into it |
| `dataQualityResult` | quality rule results, for example `ACCEPTED` |
| `modelId` | the graph id |

Use `sourceDetails` to prove which system a value came from when the verify step checks lineage.
