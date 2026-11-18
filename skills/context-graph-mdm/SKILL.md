---
name: context-graph-mdm
description: Only for the graph-agent builder agent. Sets a context graph node's survivorship, match and data-quality rules, stages and matches records for its golden records, and reviews parked matches, through the graph MCP tools. Use when source records from several systems describe the same real thing and must become one trusted record, when a load needs matching or quality rules before it reaches the graph, or when a FLAG_FOR_REVIEW rule has parked matches for a person.
user-invocable: false
---

# Context graph MDM

MDM (master data management) turns records from several sources into one golden record per real thing. Use it when the same customer, product or person arrives more than once under different keys, from several sources or from one. A record that arrives again with the same key is an update, not a duplicate.

## Contents

- [references/rules.md](references/rules.md) — the survivorship, match-rule and data-quality bodies the save tools take, their allowed values, and what each rule does to a load.
- [references/review.md](references/review.md) — the review queue a FLAG_FOR_REVIEW rule fills and the decisions a person can take on it.

## Before you start

- The graph and its node already exist. Node create needs a category; the tool defaults it to `core`.
- A graph source exists for each system that feeds records. Every staged record names its `sourceId`.
- Read the node's `unifiedEntityId` from the node read. The staging and search tools take it, not the node name; the rule and review tools take `graphId` and `nodeId` and resolve it themselves.
- Pass the graph id as `graphId`. The rule and review tools resolve the Ontology model from the graph's `unifiedEntityModelId`; the staging, matching and quality automations pass the graph id as the model id.
- Rules live on the Ontology entity behind the node, which every graph over the same model shares. A rule saved through one graph's node applies to every graph on that model: say so in `notes`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `get_context_graph_node_survivorship`, `save_context_graph_node_survivorship` | How the golden record picks a value when sources disagree | save: yes |
| `list_context_graph_node_match_rules`, `save_context_graph_node_match_rule`, `set_context_graph_node_match_rule_active`, `delete_context_graph_node_match_rule` | The rules that decide when two records are one thing, and what a match does | save, set, delete: yes |
| `list_context_graph_node_data_quality_rules`, `save_context_graph_node_data_quality_rule`, `delete_context_graph_node_data_quality_rule` | Validation, cleansing and enrichment rules | save, delete: yes |
| `stage_mdm_records` | Stages up to 100 raw records for one node, each batch an `INSERT`, `UPDATE` or `DELETE` event | Yes |
| `run_mdm_matching` | Applies the matching rules again to records already staged (each by its `stageRecordId` with its properties). Returns records to create, records to update and flagged matches | No |
| `run_mdm_quality` | Applies the quality rules again to records already staged, by `stageRecordId`. Returns valid and quarantined records with rule results | No |
| `list_context_graph_review_queue`, `list_context_graph_rejected_records`, `list_context_graph_matched_records` | What a FLAG_FOR_REVIEW rule or a REJECT action parked and nobody has decided yet | No |
| `review_context_graph_matched_record`, `review_context_graph_rejected_records` | A person's decision on a parked record | Yes |

The staging, matching and quality tools each reuse one automation per graph and action, named `nebula-mdm-<action>-<graphId>`, and check it is the one they made before running it. A second call never creates a second automation.

## Flow

1. Set the node's rules first, from the spec's `#### Rules` table ([references/rules.md](references/rules.md)). Read them back with the list tools.
2. Stage with `stage_mdm_records`, at most 100 records per call. The platform runs the node's quality and matching rules on every staged batch itself; the stage call answers only an acknowledgement, and a staged record's id is not readable afterwards.
3. Verify with a graph read (`run_context_graph_cypher_read` or `query_context_graph_records`), not the stage response. A record whose key already exists is an update, never a match; a match is a record with a new key that a rule field ties to an existing golden record.
4. When a rule is FLAG_FOR_REVIEW, read the queue and bring the parked matches to the person ([references/review.md](references/review.md)); a REJECT action's records are on the rejected list.
5. `run_mdm_matching` and `run_mdm_quality` re-apply the rules to records the queue or a report already names by `stageRecordId`, for example after a rule changed. They are not a dry check of raw records: there is no dry check, so a rule is proven by staging one sample record and reading the queue.

## Rules

- Staging `DELETE` events removes golden records. It is behind the delete gate: the task names the records in `deletes`, so the person is asked before it is sent.
- A `review_context_graph_matched_record` MERGE or REJECT and a `review_context_graph_rejected_records` REJECT cannot be undone. A task that will take one names the records in `deletes` too, so the person says yes first; the tool also asks for the id a second time.
- Arbitrary Cypher updates (`mdm_by_unifyapps_execute_opencypher_update`) are not exposed, and `run_connector_operation` refuses them on this server. Do not build an automation to reach them.
- Report the stage acknowledgement, the quality and matching results, the rule read-backs and the graph read-back as quoted `readBack` lines in the task's JSON report.
