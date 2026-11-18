---
name: context-graph-repair
description: Diagnoses why an existing UnifyApps context graph, source, processor, mapping, agent, workflow, permission, or grounded answer is not working, and classifies the affected chain for a normal repair change.
user-invocable: false
---

# Context graph repair

A broken graph is a normal change, not a separate flow. The main session
reads the broken chain before it changes anything, the way it reads any
target (`ua-change` `quick-scope.md`, or a plan's `## Current state (READ)`
table); this skill owns only the diagnosis steps it follows first, and the
classification each fix carries into the builders' briefs or the plan's
tasks. A repair write needs what any change needs: the person's request, and
their yes for a release or a delete.

## Diagnose

1. Resolve the target from the current context and supplied IDs or names.
   Ask only when the target or intended behavior remains ambiguous.
2. Use the `context-graph` MCP tools for every platform read and write; a run's nodes are read with the automation tools.
3. Reproduce the reported symptom with the least costly safe read. Do not
   invoke a consumer until its bound tools are proven read-only. Do not run
   ingestion, cleanup, or an external connector action merely to reproduce
   a fault.
4. Capture a fresh, versioned snapshot of the affected chain. Start one hop
   from each resource likely to change. If a dependent also needs a change,
   treat it as changed and read its one hop until the local chain closes.
   Inspect the relevant graph schema, nodes, edges, source scope, processor
   schemas, projected fields, mappings, publication and sync state, agents,
   models, tools, access, deployed workflows, connections,
   runs, traces, and known downstream readers.
5. Use available dependency and reverse-reference reads. If MCP cannot
   enumerate a neighbor, say that impact coverage is partial, in the
   briefs or the plan's READ table. Block only writes that could affect the unknown consumer.
   Continue diagnosis and independent safe fixes.
6. For "a defined edge draws nothing", check these causes in order. Each
   is ruled in or out by its own read, so check that read before moving to
   the next cause:
   - No source mapping targets the edge at all. `get_context_graph_source_mappings`
     for the source shows no mapping naming this edge.
   - A mapping exists but a key attribute is unmapped. The same read
     shows `attributeMappings` missing one or both of the edge's key
     attributes.
   - A key value is blank in the source. No single read shows a blank
     value directly; a Cypher count with `run_context_graph_cypher_read`,
     drawn edges against source records with a non-blank key, shows the
     gap.
   - A node stopped qualifying: it started keeping history or lost its
     primary key. `get_context_graph_edge` reports `drawable: false` and
     names the node and the reason in `notDrawnBecause`.
   - The source never synced. `get_context_graph_source` gives its
     status and last sync time, read with the id the publish reply
     returned, not the draft id; a published source can still be syncing
     or hold no records yet. Check that settings were written before the
     first publish, and read how to start another sync in
     `context-graph-sources` § Processor and sync boundaries.

When `run_context_graph_cypher_read` is refused for want of an OpenCypher graph store, the counts above cannot be read: follow `context-graph-verify` § When the Cypher read is refused.

To see what one automation node received and returned, list the run's nodes
with `inspect_workflow_run`, then request only the suspect `nodeIds`.
`get_run` gives the run header and per-node status. Do not add a scratch
debug node or object to capture output; these reads show the same thing.

Classify every finding as configuration, schema, data, permission, runtime,
or backend:

- `configuration`: a saved value, binding, enabled state, or version is
  wrong
- `schema`: input, output, identity, projection, or mapping contracts
  disagree
- `data`: records, keys, lineage, or relationships are missing, stale, or
  inconsistent
- `permission`: authentication, role, grant, RBAC, or connector access
  blocks the path
- `runtime`: the configured workflow, source run, agent, or tool fails
  during execution
- `backend`: a platform service or dependency is unavailable even though
  the request reaches the correct resource

Keep evidence separate from inference. A timeout after a write is
uncertain. Read the resource or run history before deciding whether another
attempt is safe. A backend outage calls for exact error evidence and a
retry after recovery. Do not repeatedly reconfigure healthy resources.

## Traps that answer 200 and do the wrong thing

- **Deleting a defined edge can leave its drawn edges or its backing
  entity behind, with no error.** *(unverified)* Read the graph
  afterward: confirm the edge itself is gone with `get_context_graph_edge`
  and count what remains with `run_context_graph_cypher_read`. Do not
  report the delete complete on the delete call's own answer alone. A
  delete still needs the person's yes first, as this skill's opening
  paragraph says.

## From diagnosis to the fix

The fix is a normal change, made in chat through `ua-change`. It becomes a
plan only when the person asks for one (`/ua:plan`), as for any other
change.

- The symptom, classification and affected resources go in the builder
  brief, or in a plan's `## Current state (READ)`; never a separate file.
- Ask only the missing decisions: intended behavior, the destructive scope
  of any deletion or broad cleanup, and the rollback boundary. An explicit
  request to fix or repair authorizes ordinary reversible changes inside
  the named scope; destructive deletion, broad cleanup, or a change with
  unknown affected consumers needs its own explicit approval.
- `graph-agent` makes the fixes as `graph` work, in dependency order, same
  as a build. Most repairs touch one or two resources. In a plan they are
  the spec's `### Context graph` part and the plan's `graph` tasks.
- `graph-agent` reads each resource immediately before its write, preserves
  unrelated fields, sibling mappings, tools, permissions and settings, and
  never replays a timeout or ambiguous write blindly: it reads the
  resource, run list, or trace first, and retries only when the read proves
  the prior write did not land. A list write that answers `ok:false` with
  some items landed is not a failure of the whole call: resend only the
  failed items, by the `id` and `code` the call reported, never the ones
  that already landed.
- The task's proof replays the original symptom with the same lane and
  scope, and rechecks the affected chain plus a small healthy baseline that
  could regress. A configuration repair's proof is stored configuration
  read-back; a data repair's is projected records and lineage; a
  relationship repair's is materialized relationship IDs; a grounded Q&A
  repair's is a live trace with returned graph references. Report the
  original symptom resolved only when that read-back matches.

An accepted write, published version, queued job, or model answer alone
is not runtime proof — only the replayed symptom and the affected-chain
recheck are. Close with `ua-change` § Fix report: the classification and
its evidence as what was wrong, before and after per change, and the
replayed symptom as the check.
