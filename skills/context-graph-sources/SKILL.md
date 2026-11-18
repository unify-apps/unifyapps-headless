---
name: context-graph-sources
description: Only for the graph-agent builder agent. Use when a real context graph needs a connector, a source, object scope, cleaning or discovery processors, mappings, source settings, a source publish or its sync status.
user-invocable: false
---

# Context graph sources

Configure real source data through the `context-graph` tenant MCP bridge. Use MCP for every platform action; never scripts, raw HTTP or browser writes.

Follow [references/build-order.md](references/build-order.md) for the step order — graph, publish, node and edge types with their settings and rules, source and scope, Discover & Enrich, mappings, source settings and publish, projection check, record edges, sharing, search automation, consumer. Steps done out of order fail silently. Its § The source path walks the Sources wizard tool by tool.

## Discovery and enrichment

Read `context-graph-agent/references/agent-lifecycle.md` when the source plan names an agent processor. Keep the discoverer and cleaner `ai-agent` tasks separate from the read-only consumer's. A processor is `agent-builder`'s `ai-agent` task: it creates, configures and publishes the agent and reports the agent id and published version; this skill binds that version to the source.

1. Save the source object's scope first. Then call `get_context_graph_source_discovery_configs`. It returns each `objectId` and its saved `objectDiscoveryConfigId`. Discovery saves use that config ID, not the connector object ID. If the object is absent, fix scope before continuing.
2. Pick a deployed processor and its version. Read a discovery agent or automation with `get_context_graph_discoverer_schema`. Read an enrichment agent or automation with `get_context_graph_enricher_schema`. These are separate API contracts. Check `outputSchema.schema` and, for automations, `inputSchema.schema` before building input mappings. An agent receives the full source record without input mappings.
3. Build `discoveredEntities` from the actual discoverer output fields. Each entity needs an alphanumeric `id` and `displayName`. Its `discoveryFilter` uses those output field paths, and its `enrichments` list holds that entity's enricher. A discoverer classifies source records. An enricher extracts fields for a matched entity. An enricher output array does not by itself create filterable discoverer fields.
4. Call `configure_context_graph_source_discovery` with `entries`, one per source object. An entry carries `discoveryEnabled: true`, its `discoveryConfig` (`discoveryMethod`, `discovererId`, `version`) and the `discoveredEntities`, and names the object by `objectId` so the tool resolves the saved scope config ID. For discovery off, use `objectEnrichments` for flat enrichment of every record.
   - An enrichment entry, in `enrichments` or `objectEnrichments`, carries `enrichmentMethod` (`AGENT` or `AUTOMATION`), `enricherId`, `version`, `index` and, for an automation, optional `inputMappings`. Each `inputMappings` item pairs a `sourceField` with a `destinationField`, and each names a `fieldName` and a `fieldType`.
   - Pass the processor's id and version, not its name. The tool fills `enricherName` and `discovererName` from the id, and refuses the call when it cannot read the name. Never make up a name.
   - The tool also refuses an enricher whose output reuses a field name of the source object. Rename the output as `context-graph-design/references/modeling-rules.md` says.
5. Inspect `verified` and `savedEntries` in the result. `verified` also needs the saved processor name, because the screen shows a bound processor by that name. A successful save response alone does not prove the entity or enricher binding persisted. If `verified` is false or the readback fails, read the discovery configs again before any retry. Continue to mapping only after the discovered or enriched source fields appear in `get_context_graph_source_objects`.

## Connector actions

Use `run_connector_operation` only for reads. It cannot post to Slack or another external system. When the requested graph workflow must write to a connector, discover the operation with `search_operations`, read its payload with `get_operation_schema`, and author a supported automation DSL flow. Use `get_dsl_reference` when the DSL contract is not already loaded. Save with `compile_and_save_workflow`, then run the saved automation through `start_run` using `workflow_test` for a mocked builder test or `workflow` for a real external action. Poll the returned run with `get_run` until terminal and inspect the node result.

Use the real `workflow` lane only after the person authorized the external write. For graph relationships, use the MDM action `mdm_by_unifyapps_add_edge_to_graph` through a shared automation and read the links back with Cypher ([references/record-edges-and-ids.md](references/record-edges-and-ids.md)). Do not bypass permissions, call raw HTTP, or weaken read-only tools.

Connector facts:

- HubSpot search rejects the `CONTAINS` operator; use `CONTAINS_TOKEN` for text matches.
- HubSpot has no record-updated trigger. Its triggers are polling for new contacts, list members, form submissions and new records, plus `on_event`. To catch changes, poll on `hs_lastmodifieddate`.
- HubSpot `hubspot_get_deal` takes `propertiesWithHistory` and returns each value with its timestamp. Use it for stage history.
- HubSpot stage ids and the `isClosed` flag cannot be trusted. A stage id such as `closedwon` can belong to an open stage, and the first stage can carry `isClosed` true. Key a Stage node on `pipeline_id::stage_id`, read `displayOrder` from `hubspot_get_pipelines`, and treat a stage as closed only when its order is past the last open stage. Trim labels, which can end in a space.
- Slack `slack_get_user_info_by_id` takes `user`, not `userId`. `slack_list_conversation_history` takes `channel` (bot token) or `channel_user` (user token), while `slack_get_conversation` takes `channelId`.
- Slack history returns only `reply_count` for a thread. Read the replies with `slack_list_conversations_replies` (`channel` and `ts`).

## Loading checks

- Check that the source reads rows, not only files or documents. If it only lists files, load rows through an automation instead.
- Check whether a record write replaces the whole record or merges fields. A writer that sets only some fields must not wipe the others.
- Map every edge type from its foreign key field, as in `context-graph-design/references/modeling-rules.md`. Split list fields into one edge per item.
- Run the same load twice. Record and edge counts must not change.

- Always set source scope explicitly. On some connectors an empty scope list means everything.
- Pick the path per connector. A graph source fits a broad, continuous sync. When the connector cannot filter records the person needs filtered, use a loader automation instead, and say why.
- Write edges in small batches and check each batch by reading the graph, not the run response. One failed step can fail the whole run. Follow [references/record-edges-and-ids.md](references/record-edges-and-ids.md) for the reusable edge automation, batch size, id formats and field lineage.
- Use the connection the graph created for itself. Do not hand-create one.
- To check a record's links, use Cypher as [references/record-edges-and-ids.md](references/record-edges-and-ids.md) step 4 says. `get_context_graph_record` can list no edges for a link Cypher shows. If the Cypher read is refused for want of an OpenCypher graph store, follow `context-graph-verify` § When the Cypher read is refused.
- Do not trust the `toNodeId` in an add-edge run output. It can name a different node. Check the link with Cypher instead.
- In OpenCypher, the node label is its `unifiedEntityId` and each property is `_pr_<name>`, for example `m._pr_scan`. Take the exact names from `get_context_graph_consumer_context`. Other names return 0 rows, not an error.
- `run_connector_operation` refuses the OpenCypher query action. Run it inside an automation.
- On Slack, the bot is often not a member of public channels (`not_in_channel`). Read their history with the user token.
- `slack_list_users` pages at 1,000 users and a later page can repeat page 1. Remove duplicates by user id.
- A loader can write records with `mdm_by_unifyapps_create_staging_records` and links with `mdm_by_unifyapps_add_edge_to_graph` (`updateIfPresent`). A replay leaves the same records and links.

## Mapping rules

- `suggest_context_graph_source_mapping` is the wizard's Auto Map: it answers the field pairs the platform would pair by name and type and saves nothing. Review the pairs, then write each with `map_context_graph_source_field` or `map_context_graph_source_object`.
- `map_context_graph_source_edge` saves every edge mapping of one source object in a single call: its `mappings` list holds one item per edge type, and an item that fails a check is reported and left out while the rest still save. A matched edge's item gives `fromPropertyId` (the foreign key on the from node) and `toPropertyId` (the key on the to node), both live, graph-queryable node properties; the read-back shows it under `associatedEdgeMappings`. A defined edge's item takes no join properties: map a source field onto each of the edge's two key attributes in `attributeMappings`, and never onto `edgeKey`, the defined edge's own computed primary key.
- `map_context_graph_source_object` takes the node's `unifiedEntityId` as `destinationObjectId`, not its node id.
- Every mapping write raises the source object's version. Re-read it and pass the current `expectedSourceObjectVersion` before the next map call.
- A calculated field cannot be mapped. Map a field of the selected object or an enricher output, and use an enricher for a computed value. A saved mapping from a calculated field is dropped on the next save, as the Map screen does, and the reply says so. An edge attribute mapped from one is refused until you remap it.
- `get_context_graph_source_objects` stays empty until discovery is saved for the object, even with `discoveryEnabled: false`. Scope alone is not enough.

- A node mapping selects a source object and destination node. Use distinct `schemaMappings[].id` values when author and owner map to the same Person node. Select that ID with `mappingId` for granular field and outgoing edge edits. An ambiguous destination is rejected. Live ingestion must prove the platform materializes both roles. A field mapping maps one source field to one destination field. A relationship mapping supplies endpoint keys for an edge type. They are separate resources.
- Use source-object versions, not only a graph version. Reject stale writes and reread before retrying.
- Keep filters, joins, retention, permission settings, and source-document references explicit.
- A node mapping's `filter` limits which source rows load. It is an `operator` of `AND` or `OR` over a `filters` list, and each item names a source `property` and an inner `filter` holding an `operator` and a `value`. The inner operator names come from the platform's list, for example `EQUAL`, `NOT_EQUAL`, `CONTAINS`, `GT`, `LT` or `EXISTS`, never `EQUALS` or `EQ`. Use only names from that list, then read the mapping back with `get_context_graph_source_mappings` and check the filter is still there. A `value` is one string, number or boolean, sent as a string; the tool refuses a list, an unknown operator, and a condition without a `property` or an operator. When the read-back differs from the request, the reply says `unverified` and lists what differs under `mismatches`.
- Do not post a read model as a write model. Normalize only through the discovered MCP contract.
- Do not broaden scope to compensate for an unclear connector. Surface the capability gap and ask for a decision.

## Processor and sync boundaries

Bind an existing compatible discoverer or enricher by its discovered ID and version. Validate its input/output schema and selected source object. The basic Q&A agent is a consumer, not a source processor.

For cleanup, exact composite keys remain the default. A record that arrives again with the same key is an update, not a duplicate. Records with different keys that describe the same thing go through MDM, from one source or several: a match rule ties the new record to the existing golden record, and a FLAG_FOR_REVIEW match waits for a person's `MERGE` in the review queue (`context-graph-mdm`). There is no separate record dedupe tool. Do not treat a cleaner, mapping, source publication, or sync status as deduplication proof. After an uncertain source operation, read `get_context_graph_source` before any retry. A graph source has no per-sync run id, no resync action and no per-item retry. Publishing the source again is the only way to start another sync *(unverified)*, so do it only once the read shows the last sync did not finish. A stalled crawl shows as 0 crawled *(unverified)*; no graph tool reads that count, so judge it from the last sync time and the node record counts (`list_context_graph_nodes` gives each node's `recordCount`). Do not infer ingestion completion from configuration state.

## Connector catalogue

`list_context_graph_connectors` lists the connectors a graph source can use, the way the Sources wizard does (module `ecg`), with a `query` to narrow by name. `get_context_graph_connector`, `get_context_graph_connector_settings` and `get_context_graph_connector_object` describe one connector: its default processor type, static objects, the wizard steps it disables and each object's fields and scope action. Pick `appName` from the catalogue; a connector absent from it cannot be a graph source, and a loader automation is the path then.

## Source settings and publish

Write the source's settings before its first publish, the way the wizard's Settings step does. `get_context_graph_connector_settings` answers the connector's settings schema and layout. Build the `settings` object from each property's default value, including a default that sits inside an `allOf` branch, and write it with `update_context_graph_source`. A source published with no settings can sit unsynced *(unverified)*. If the schema declares no defaults, write nothing and say so.

`update_context_graph_source` writes the source's `name`, `description`, `connectionId` and `settings` (sync schedule, retention) only with the `expectedVersion` you read. `settings` replaces the whole object, so send every key. Read the source again for its new version, then call `publish_context_graph_source`. It publishes the configuration you read, refuses when the version moved, and answers the status and version before and after; it proves publishing, not ingestion.

After the publish, status and last sync time live on the published copy. Read `get_context_graph_source` with the source id in the publish reply's `response`, not the draft id you sent. The `before` and `after` in that reply are read from the id you sent. Then run the projection check: a published source can still be syncing or hold no records yet. `search_context_graph_sources` finds the sources of one graph, by name when you pass `query`, and `clone_context_graph_source` copies one.

## Connections

A builder only reads connections. Creating or changing one, including the credentials and the telemetry or rate-limit settings a connector keeps, is a manual task the main session does with the `connection-manager` skill on the `connection` server, because it may need the person's own sign-in (`ua-change` `task-kinds.md` § What each builder can do). Before touching a connection other assets use, the main session reads the connection's dependencies first, as [references/build-order.md](references/build-order.md) § The source path step 2 says. The graph's own `mdm_by_unifyapps` connection is made by the graph; never hand-create one. Never put credentials in tool arguments or chat.

## Sharing

`share_context_graph` grants a user (`principalType` `u`) or group (`ug`) one role on the graph, keeps the roles they already hold, and reads the role mappings back; `share_context_graph_source` does the same for a source. Grant what the spec's `users_access` row names, one role per principal, after the graph is published. Access to the consumer agent is `set_graph_agent_access`, an agent-builder step; its users need both.
