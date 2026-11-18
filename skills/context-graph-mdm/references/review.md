# Golden-record review

A match rule with `FLAG_FOR_REVIEW` (or `RELEVANCE_BASED` between its thresholds) parks the staged record instead of merging it, and a data-quality `REJECT` parks a record that failed a check. Both wait for a person. Nothing in the graph changes until someone decides.

## Reading the queue

1. `list_context_graph_review_queue` lists the parked matches of the graph's Ontology model — every node, or one node with `nodeId`. Each row carries `stageRecordId`, `matchedRecords`, `sourceId` and `modifiedTime`.
2. `list_context_graph_matched_records` shows, for one `stagingRecordId`, the golden records it matched, with the rule and the score for each.
3. `list_context_graph_rejected_records` lists the records a REJECT action or a review turned away.

Report each staged record beside its candidates, with the rule and score, as needing the person's decision, and apply only a decision the task names. Never decide for them.

## Deciding

`review_context_graph_matched_record` applies one decision; `confirmStageRecordId` repeats `stageRecordId`.

| `type` | What happens | Undo |
|---|---|---|
| `MERGE` | the staged record joins the golden record passed as `record` (the candidate's `record` from `list_context_graph_matched_records`, with any value that should win set in its properties) under the survivorship rules | none |
| `REJECT` | the staged record is discarded | none |
| `EDIT_AND_RESUBMIT` | the corrected `record` you pass goes through matching again | the new record can be rejected later |
| `CREATE_NEW_RECORD` | the `record` becomes its own golden record | a later merge |

`review_context_graph_rejected_records` takes `requestType` `APPROVE` (let the records through, with `resubmitRejectedRecordRequests` carrying corrected properties) or `REJECT` (discard for good), over `rejectedRecordIds`, with `confirmRejectedRecordIds` repeating them in the same order.

## In a plan

- A review is its own `graph` task, after the load that fills the queue. Its body names the decision per record, in the person's words, and names the records it will MERGE or REJECT in `deletes`, so `plan ready` asks before it is sent.
- Proof is the queue read after the decision (the record is gone from `list_context_graph_review_queue`, which lists only undecided rows) and the golden record read (`get_context_graph_record`), quoted as `readBack` lines. The tool's own `stillQueued` is a hint, not the proof.
- A queue that keeps filling means the rule is too loose: go back to the spec's Rules row, not to the queue.
