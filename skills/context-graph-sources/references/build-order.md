# Build order

The order a graph build must follow, and the facts that fail silently when
skipped. `record-edges-and-ids.md` covers the edge-write
batch pattern and id formats; this file does not repeat them. The plan
splits the order into three `graph` tasks (`ua-change` `task-kinds.md` rule 22, or three pieces in a chat build): the order's steps
1 to 5 and the source path's steps 1 to 4 first; the source path's steps 5
to 7 and the order's steps 6 and 7 second, after the processors' `ai-agent`
tasks; the order's steps 8 to 10 last. Steps 11 and 12 are `agent-builder`'s consumer `ai-agent` task
and its `publish` task, after the last stage.

## Contents

- The order
- The source path
- Node types can move
- Facts that trip a build
- Links to show the person

## The order

1. **Create the graph** with `create_context_graph`, or `clone_context_graph`
   when an existing graph already has the shape. Read it back with
   `get_context_graph`: `unifiedEntityModelId` is the Ontology model the rule
   and review tools are keyed on, and `version` is what the next step needs.
2. **Publish it** with `publish_context_graph`, giving the `expectedVersion`
   you just read, before any record is written. A record written to a DRAFT
   graph saves to the entity store but never reaches Cypher, and nothing
   errors. `MATCH (n)` on that node type returns nothing forever, even after
   the graph is later published.
3. **Create node types** with `create_context_graph_node`: the name, a
   `category` (`core`, `secondary` or `derived`; `core` when the spec's
   `Node settings` row says nothing), typed `properties` (see
   `context-graph-design/references/modeling-rules.md`), `recordTitleFormat`,
   and the wizard's settings: `skipRBAC` (false means Enable permissions, the
   default), `color`, `tagIds`, `entityMetadata.scdType2Enabled` (fixed once
   the node exists) and `entityMetadata.auditable`. Change a node later with
   `update_context_graph_node`; it merges properties by id, so siblings
   survive, and `removePropertyIds` drops one.
   **A property left without `graphQueryable: true` cannot be read by a graph
   query**, with no error at write time: set it on the property item in
   `properties` when the property is created, or add it later with
   `update_context_graph_node`'s `properties` list before the query that needs
   it runs. The same flag gates a matched edge's join key (step 5 and the
   source path's step 6): a property that is not graph-queryable is refused
   there too.
4. **Set each node's rules** the spec's `Rules` table names:
   `save_context_graph_node_survivorship`, `save_context_graph_node_match_rule`
   and `save_context_graph_node_data_quality_rule`, shapes in
   `context-graph-mdm/references/rules.md`. They write to the Ontology
   entity, which every graph over the same model shares.
5. **Create edge types** in one `create_context_graph_edge` call: its `edges`
   list holds every edge type at once, and each item lands or fails on its
   own. Give each item's `creationMethod`, `matched` (the default: records are
   linked by a join key on each node) or `defined` (each record of a source
   object becomes one edge; both nodes need a primary key and no SCD Type 2
   history), and `attributes` when the Edges table has an `Attributes` cell.
   See `context-graph-design/references/modeling-rules.md` for which method
   to choose.
6. **Load records**: the source path below, or a loader automation when the
   connector cannot filter to the scope the person needs (say why). Records
   must come after publish. Node types must exist before the records that
   use them.
7. **Verify projection after the first record of each node type.** Run
   `MATCH (n) RETURN DISTINCT labels(n)` through `run_context_graph_cypher_read`.
   A node type missing from that list has records that will never be
   queryable. Catch it at record 1, not record 200. Fix and reload that
   node type before moving on; do not batch-load the rest of a node type
   that failed this check.
8. **Write record edges** through the MDM action
   `mdm_by_unifyapps_add_edge_to_graph`, run inside an automation, about 60
   edges per run. Verify with a Cypher `count()` per edge type and one
   `MATCH (a)-[r]->(b)` read of a linked pair, never by trusting the run
   response; the record read's `edges` can be empty for an edge Cypher shows
   (`record-edges-and-ids.md`). If the Cypher read is refused for want of an OpenCypher graph store (this step and step 7), follow `context-graph-verify` § When the Cypher read is refused.
9. **Share the graph** with `share_context_graph` to every group or user the
   spec's `users_access` row names, one role each, and a source someone else
   maintains with `share_context_graph_source`. Read `get_context_graph_access`
   first: it lists the role mappings and the roles the tenant offers, and the
   share takes one of those role ids, never a guessed name. Claude Code's auto
   mode refuses a share from a builder as a permission grant even with the
   person's yes, so a share that is refused is a manual step for the main
   session, not a retry. A consumer's users need the graph read as well as
   the agent (`set_graph_agent_access`, an agent-builder step).
10. **Build the search automation**, in exactly the shape `bind_graph_search`
    verifies before it binds: three nodes and nothing else. A callable
    trigger whose setup has one string input `cypherQuery`; one
    `mdm_by_unifyapps_execute_opencypher_query` step on the graph's own
    connection with `modelId` = the graph id, `query` = the trigger's
    `cypherQuery` and `skipRBAC: false`; a return of that step's outputs.
    No write-clause check, no branch, no second stop: the binding refuses a
    five-node automation (`threeNodes`, `connected`, `returnsQuery`), and the
    MCP route already refuses writes. Deploy it.
11. **Bind it to the consumer** with `bind_graph_search`, using the graph's
    explicit ID. This is `agent-builder`'s `ai-agent` task.
12. **Publish the consumer** with `publish_agent` when the person asked for
    it, or after their yes: in a plan, its `publish` task.

## The source path

The Sources wizard, step by step, each step a tool. A loader automation
replaces steps 3 to 7 only when the connector cannot filter to the scope.

1. **Connector**: `list_context_graph_connectors` lists the connectors a
   graph source can use (module `ecg`); `get_context_graph_connector` and
   `get_context_graph_connector_settings` give one connector's default
   processor type, static objects and the wizard steps it disables.
2. **Connection**: the graph makes its own `mdm_by_unifyapps` connection,
   named `<graph name> UDM/Ontology Connection`. Use that one: a
   hand-created connection for the graph fails validation. The source needs a
   connection to the external system. Creating or changing one is a manual
   task the main session does with the `connection-manager` skill on the
   `connection` server (`ua-change` `task-kinds.md` § What each builder can do);
   it reads `get_connection_dependencies` there before touching a connection
   other assets use.
3. **Source**: `create_context_graph_source` with `appName`, `connectionId`
   and `graphId`; read it back for its `version`.
4. **Scope**: `list_context_graph_connector_objects`, then
   `configure_context_graph_source_scope` with explicit `objects`, each with
   a `scopeConfig`: its `scopeActionId` and the `actionInputs` that action
   takes, read from `get_context_graph_connector_resource`. A connector with
   a scoped import, such as SharePoint, refuses an object without
   `scopeConfig`. An empty scope can mean everything.
5. **Discover & Enrich**: `configure_context_graph_source_discovery` with
   the published discoverer and enricher versions the `ai-agent` tasks
   reported (`context-graph-sources/SKILL.md` § Discovery and enrichment).
   With mode `none`, save the entry with discovery off: source objects stay
   empty until discovery is saved.
6. **Map**: `suggest_context_graph_source_mapping` shows the platform's Auto
   Map pairs and saves nothing; then `map_context_graph_source_object` and
   `map_context_graph_source_field` write node and field mappings. Map every
   edge type of one source object in a single `map_context_graph_source_edge`
   call: its `mappings` list holds one item per edge type, and an item that
   fails a check is reported and left out while the rest still save. A
   matched edge's item gives `fromPropertyId` and `toPropertyId`, the join
   key on each node — both must be live, graph-queryable properties, or that
   item is refused. A defined edge's item gives no join properties: map a
   source field onto each of the edge's two key attributes in
   `attributeMappings`, and never onto `edgeKey`, the defined edge's own
   computed primary key; either mistake refuses only that item.
7. **Settings and publish**: read `get_context_graph_connector_settings` for
   the connector and write its default values with `update_context_graph_source`
   `settings` (sync schedule, retention) and the `expectedVersion` you read,
   before the first publish. Then `publish_context_graph_source` with the
   current `expectedVersion`, and `get_context_graph_source` (status, last sync
   time) on the id the publish reply returns, not the draft id, until a sync has
   run (`context-graph-sources/SKILL.md` § Source settings and publish). Then
   step 7 of the order.

## Node types can move

Node types can be created before or after the graph is published. Records
cannot — they must always come after publish.

## Facts that trip a build

- **Record titles show raw ids** unless `recordTitleFormat` is set to
  `{{ mdm.field.<prop> }}`.
- **Deleting records:** a plain entity DELETE answers 405. Use
  `delete_context_graph_records` with explicit ids (it needs `confirmIds`
  and the person's yes, like every delete), or
  `storage_by_unifyapps_delete_records` inside an automation.
- **The `ecg_by_unifyapps` connector** exposes the ingestion pipeline as
  steps — `ecg_by_unifyapps_run_discovery`,
  `ecg_by_unifyapps_translate_raw_record`, `ecg_by_unifyapps_apply_enrichment`,
  `ecg_by_unifyapps_publish_record`. All four need a published source config
  first, so this connector does not skip source setup; it only runs the
  pipeline once setup is done.

## Links to show the person

Relative paths, no host:

- Canvas: `/p/0/context-graphs/{graphId}?tab=nodes|edges|sources|records`
- Best-record screen: `/p/0/context-graphs/{graphId}?tab=records&recordNodeId={nodeId}&recordId={recordId}`
- Agent config: `/p/0/ai-agents/{agentId}/configuration/{instructions,knowledge,actions,capabilities,topics,ai-models,indexing,...}`
- Agent traces: `/p/0/ai-agents/{agentId}/observability`
