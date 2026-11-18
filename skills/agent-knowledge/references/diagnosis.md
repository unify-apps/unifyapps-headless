# When the agent says it does not know

Go in this order. Each step rules out one cause, and the early ones are the common ones. Stop at
the first step that finds the cause, fix it, and run the same question again.

1. **Does the agent reach the source?** `get_agent`: the source is under `knowledge`, or its set
   is under `knowledgeSets`. A source added to a set the agent was never given is not reached:
   `attach_knowledge_sets`.
2. **Is it indexed?** `check_knowledge_status` with the source's `knowledgeIds`, or the agent's
   `agentId`. Not `finished` means it is still working: wait. `enabled: false` means it is
   switched off.
3. **Was the knowledge tool offered and called?** `read_trace` on the run's `caseId`. The model's
   offered tools name the knowledge tool with the sets and sources it can search.
   - Offered but not called: the instructions do not tell the agent to search, or they keep it to
     another subject. Fix the instructions with `update_agent`.
   - Not offered: the agent holds no enabled source or set, or its capability is off. Go back to
     step 1, and check `list_capabilities {agentId}`.
4. **Did the source fail, or only partly index?** A FAILED source, or one with `partial: true`,
   carries an `error`. `list_knowledge_items {knowledgeId, status: "FAILED"}` names the items that
   failed and why. Fix what the error names, such as a connection that lost access or an input
   that points at nothing, then `resync_knowledge {knowledgeIds}`.
5. **Was the content crawled at all?** `list_knowledge_items {knowledgeId, query}` with a word
   from the missing content. Nothing found means the source never read it: a website page beyond
   `pageLimit` or `crawlDepth`, an app input that leaves it out, or a document that is not the
   right version. Change the source with `update_knowledge` and wait for it.
6. **Is it from an app the asking person cannot see?** Content from an app that signs in reaches an
   answer only where the asking person's own account in that app can see it. A COMPLETED app
   source whose content never comes back in the trace's knowledge chunks is this. No tool changes
   it: say so, and test with someone who has access in that app
   ([sources.md](sources.md) § An app).
7. **Was it archived?** An archived item is never found, and no tool brings it back. Say so.
8. **Did the set's embedding model change?** After a change, the set's sources are found only
   once resynced: `resync_knowledge` with all of them.

When every step passes and the agent still does not find it, report it with the question, the
`caseId`, and what each step showed. Do not keep rewording the question.
