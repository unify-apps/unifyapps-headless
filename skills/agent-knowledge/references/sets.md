# Knowledge sets

## Contents

- What a set is
- Creating and changing a set
- Giving a set to agents
- Publishing a set
- Deleting a set

## What a set is

A knowledge set is a named group of sources with one set of indexing settings: how documents are
parsed and chunked, which embedding model indexes them, PII masking and metadata enrichment.
Every source in the set is indexed with them. A set holds no list of agents of its own to edit
by hand: `attach_knowledge_sets` and `detach_knowledge_sets` are the only way an agent gains or
loses it.

## Creating and changing a set

`save_knowledge_sets {knowledgeSets}` takes up to 20 sets, each on its own.

- **A new set** has no `knowledgeSetId` and needs a `name`; `description`, `tags` and `projectId`
  (the workspace) are set only when it is created. It starts with the tenant's default indexing
  settings. UnifyApps Headless adds its own tag to it.
- **A change** names `knowledgeSetId` and only what changes: `name`, `description`, and
  `settings {indexing, enrichment, piiMasking, embeddingModel, vectorStore,
  retentionPeriodInMonths}`. Each setting replaces the stored value whole, so read the set with
  `get_knowledge_sets {knowledgeSetIds, full: true}` first and send the value back with only your
  change in it.

Each answer reads the set back; `notStored` names any path that did not stick.

**Changing the embedding model leaves the set's sources unfindable** until they are indexed
again: the answer says `reindexNeeded`. Resync every source of the set with
`resync_knowledge {knowledgeIds}` straight after, and wait for `check_knowledge_status
{knowledgeSetId}`. Change the model only when the person asked for it.

## Giving a set to agents

`attach_knowledge_sets {agentId, knowledgeSetIds}` gives sets to one agent; call it once per
agent. Each set is read back after, and one that did not take the agent is listed under
`failures`. `detach_knowledge_sets` takes sets off one agent and leaves every other agent's link
alone. Neither changes the agent record, so neither needs the agent published.

A set is searched as it is now, published or not, by every agent it is given to. A change to a
set's sources reaches all of them at once: say so to the person before changing a set more than
one agent uses (`get_knowledge_sets` lists its agents).

## Publishing a set

`publish_knowledge_sets {knowledgeSetIds, notes}` saves a version of each set. An agent does not
need it to search the set. Publish only when the person asks for a version, such as before
moving the set to another environment.

## Deleting a set

Deleting a set takes it away from every agent it is given to. Its sources are NOT deleted: they
stay and keep indexing, reachable by no agent. So:

1. `delete_knowledge_sets {knowledgeSetIds, dryRun: true}`. It deletes nothing and lists, per set,
   the agents that lose it and the sources that stay, with `agentCount`.
2. Show the person exactly that, and ask. With nobody to ask, report `needs_confirmation` with
   the list.
3. When the sources should go too, remove them first:
   `remove_knowledge {knowledgeSetId, knowledgeIds, confirmed: true}`.
4. `delete_knowledge_sets {knowledgeSetIds, dryRun: false, expectedAgentCount}`, with the dry
   run's `agentCount`. A different count means the sets changed since the dry run: nothing is
   deleted. Run the dry run again and show the person what changed.

A set cannot be brought back.
