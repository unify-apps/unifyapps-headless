---
user-invocable: false
name: agent-knowledge
description: "Only for the agent-builder builder agent. Gives a UnifyApps AI agent knowledge to search — documents, websites, apps read through one of their knowledge actions, and data catalogs — either as the agent's own sources or through a knowledge set that several agents share. Builds, changes, publishes and deletes knowledge sets, adds, changes and removes their sources, follows indexing to the end, resyncs, reads what a source crawled, and finds out why an agent says it does not know something. Load it before the first knowledge write, and whenever an agent's answer depends on what it can search."
---

# Knowledge an agent can search

**Knowledge** is what an agent reads to answer: a **source** is one document, one website, one
app read through one of its knowledge actions, or one data catalog. A **knowledge set** is a named
group of sources that several agents share; the screen calls the set's sources its Sources. An
agent reaches a source in one of two ways:

- **its own source**, added to the agent itself, which no other agent sees;
- **a knowledge set** given to the agent, and every source in that set.

Put sources in a set whenever more than one agent needs them, or when the person names a set.
Give the agent its own source only when it alone needs it.

Every tool here is an MCP tool on the `agent-builder` server. Every call takes `host`: the
signed-in tenant's bare host name, with no `https://`, such as `<tenant>.unifyapps.com`.

The knowledge-set tools and the newer inputs below are not live on every tenant yet. A tool that
ToolSearch does not find is not on this tenant: say so in the report, and NEVER reach for it
another way.

## The rules that cost the most when broken

1. **The agent MUST be told to search.** A source the agent holds is used only when its
   instructions tell it to search its knowledge. Without that line it answers "not in my
   knowledge" while holding the document. `add_knowledge` and `attach_knowledge_sets` warn when
   the instructions never mention it; act on the warning with `update_agent`.
2. **Indexing MUST finish before a test means anything.** A new or changed source indexes on its
   own, from seconds for a small file to many minutes for an app. Call `check_knowledge_status`
   until `readyToTest` is true before you believe a test that says the agent does not know.
3. **Prove it with a run.** A source read back by id proves it exists, not that the agent finds
   it. The proof is `send_test_message` with a question only the source answers, and `read_trace`
   showing the knowledge tool was offered and called.
4. **Ask before anything you cannot undo.** `delete_knowledge_sets`, `remove_knowledge` and
   `archive_knowledge_items` cannot be undone here. Ask the person first; with nobody to ask,
   report `needs_confirmation`.

## Giving an agent knowledge, in order

The order matters: a source that is not indexed, or an agent that is not told to search, looks
exactly like a source that is missing.

1. **Read the agent** with `get_agent`. Its `knowledge` and `knowledgeSets` say what it already
   reaches. NEVER add a source it already holds.
2. **Upload each document** with `upload_file {filePath}`. Keep the `file.url`, `file.fileName`
   and `file.size` it answers.
3. **Find what an app source needs:** `list_knowledge_apps {appNames}` gives each
   knowledge action's `sourceId` and `inputSchema`, and says whether the app signs in.
   `list_connections` on this server, given the app's name, lists its connections. A data
   catalog's id comes from `list_data_catalogs`.
4. **Add the sources**: `add_knowledge` with `agentId` for the agent's own sources, or with
   `knowledgeSetId` to put them in a set, and `sources`, a list. Each source is exactly one of
   `file`, `website`, `application` or `dataCatalog`. Shapes are in
   [references/sources.md](references/sources.md).
5. **Give the set to the agent**, when the sources went into a set: `attach_knowledge_sets
   {agentId, knowledgeSetIds}`.
6. **Tell the agent to search**: one line in its instructions with `update_agent`, sent as the
   whole new instruction text.
7. **Wait for indexing**: `check_knowledge_status` with `agentId` or `knowledgeSetId`, until
   `readyToTest` is true.
8. **Prove it**: `send_test_message` with a question only the new source answers, then
   `read_trace`.

`add_knowledge` and `attach_knowledge_sets` switch on the agent's `companyKnowledge` capability.
On a tenant whose capability library has none, they say `capability.onTenant: false`; the agent
is still offered the knowledge tool for the sets and sources it holds.

## Building a knowledge set, in order

1. **Look for one first**: `list_knowledge_sets {query}`. NEVER make a second set with a name
   that is already there.
2. **Create it**: `save_knowledge_sets {knowledgeSets}` with a `name` and `description` for each
   new set. A new set starts with the tenant's default indexing settings.
3. **Add its sources**: `add_knowledge {knowledgeSetId, sources}`.
4. **Give it to each agent**: `attach_knowledge_sets {agentId, knowledgeSetIds}`, once per agent.
5. **Wait and prove** as in steps 6 to 8 above, for every agent the person named.

Changing a set's settings, publishing it and deleting it are in
[references/sets.md](references/sets.md).

## The tools

### Reading

- **`get_agent`** — the agent's own sources (`knowledge`) and its sets (`knowledgeSets`).
- **`list_knowledge_sets`** `{query, agentId, limit, offset}` — the sets, newest first, each with
  the agents it is given to. `agentId` lists one agent's sets.
- **`get_knowledge_sets`** `{knowledgeSetIds, full}` — each set with its sources and where each
  stands, its agents and a summary of its settings; `full` gives the settings whole.
- **`get_knowledge`** `{knowledgeIds}` — sources whole: what each reads, under the same names
  `add_knowledge` takes, its owner, schedule, next sync and indexing settings.
- **`list_knowledge_apps`** `{appNames, query}` — the apps a source can read; with `appNames`,
  each app's knowledge actions and their inputs.
- **`list_data_catalogs`** `{query, limit, offset}` — the data catalogs a source can read.
- **`check_knowledge_status`** `{agentId | knowledgeSetId | knowledgeIds}` — where each source's
  indexing stands, and `readyToTest`.
- **`list_knowledge_items`** `{knowledgeId, status, type, query}` — what one source crawled in
  its current run: each page, file or record, with its status and error.

### Writing

- **`upload_file`** `{filePath}` — puts a document on the platform for a `file` source. At most
  20 MB. The uploaded file stays on the platform: no tool removes it.
- **`add_knowledge`** `{agentId | knowledgeSetId, sources}` — adds sources, each on its own.
- **`update_knowledge`** `{items}` — changes sources, each on its own. Which changes send a source
  back to indexing is in [references/sources.md](references/sources.md).
- **`resync_knowledge`** `{knowledgeIds, itemIds}` — reads sources again; with `itemIds`, indexes
  those crawled items again.
- **`save_knowledge_sets`** `{knowledgeSets}` — creates sets, or changes them by `knowledgeSetId`.
- **`attach_knowledge_sets`** / **`detach_knowledge_sets`** `{agentId, knowledgeSetIds}` — gives
  sets to an agent or takes them away. The other agents a set is given to keep it.
- **`publish_knowledge_sets`** `{knowledgeSetIds, notes}` — publishes a version of each set.

### One-way

- **`remove_knowledge`** `{agentId | knowledgeSetId, knowledgeIds, confirmed}` — deletes sources.
  Every id MUST belong to the owner you name, or nothing is deleted. Pass `confirmed: true` only
  after the person said yes.
- **`delete_knowledge_sets`** `{knowledgeSetIds, dryRun, expectedAgentCount}` — deletes sets.
  Run it with `dryRun: true` first, show the person the agents that lose each set and the sources
  that stay, and only after their yes call it with `dryRun: false` and the dry run's `agentCount`
  as `expectedAgentCount`. **Deleting a set does not delete its sources**: they stay and keep
  indexing. When they should go too, remove them first with `remove_knowledge {knowledgeSetId}`.
- **`archive_knowledge_items`** `{itemIds}` — the agent stops finding those crawled items. No tool
  brings an archived item back.

Every tool that takes a list does each item on its own. A reply with `ok: false` may still have
written some items: they are under `added`, `updated`, `saved`, `removed` or `deleted`, beside
`failures`. NEVER send the whole call again; send only the failed items, after fixing what each
failure names.

## Traps that answer 200 and do the wrong thing

- An agent that holds a source but whose instructions never say to search it.
- An agent whose instructions keep it to one subject: it is offered the knowledge tool and still
  refuses a question outside that subject. Read the trace before blaming the source.
- A test run before indexing finished: it says "I do not know" about a source still syncing.
- A source FAILED, or is COMPLETED with an `error` (`partial: true`): either way some items failed
  to index, so some of the content is missing. `list_knowledge_items {status: "FAILED"}` names
  them.
- A set's embedding model changed after its sources were indexed: they are found only once
  resynced (`save_knowledge_sets` answers `reindexNeeded`).
- A set deleted while its sources were meant to go too: the sources keep indexing, reachable by
  no agent.

## What no tool does

- **Search an agent's knowledge directly.** Prove what an agent finds with `send_test_message`
  and `read_trace`.
- **Bring back an archived item**, or delete crawled items for good.
- **Remove an uploaded file** from platform storage.
- **Share** a source or a set with people. That stays on the screen.
- **Enterprise Search knowledge**, which is set up from Enterprise Search, not from an agent.
- **Generate an evaluation dataset from a set**, which belongs to the `eval-datasets` skill.

Say plainly that the job is not available here, and do not look for another way.

## When the agent says it does not know

Follow [references/diagnosis.md](references/diagnosis.md) in its order. Most answers are found in
its first three steps.

## Reference files

| File | Read it when |
|---|---|
| [references/sources.md](references/sources.md) | adding or changing a source: each kind's inputs, what the screens fill in, and which change re-indexes |
| [references/sets.md](references/sets.md) | creating, changing, publishing or deleting a knowledge set, or giving it to agents |
| [references/diagnosis.md](references/diagnosis.md) | an agent answers "not in my knowledge", answers wrong, or a source does not finish |
