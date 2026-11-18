# Context — the whole app, cheaply

## Contents
- The budget rule
- One refresh, then the cache
- What each read gives
- Draft against deployed
- The context index
- What the cache cannot answer

Every command runs as

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" <area> <command> … --json
```

## The budget rule

One cached page is around 140 KB and a whole app around 900 KB. Reading
an app page by page fills the session before a single requirement is
written, and the stages that matter — ripple, decisions, the document —
all come after.

So the main session reads **counts-and-names views only**. Every `cache`
command below answers from the local snapshot, in one screen, with no
round trip.

When a page needs reading in full — a page the ask rewrites, a page whose
logic nothing shallower explains — dispatch a subagent for that page with
one question, and take its summary. Never read the page body in the main
session.

## One refresh, then the cache

The cache is a copy. Refresh it once, at the start, and everything after
reads from disk:

```bash
ua entity read app <appId> --source feature-prd-loop --json
```

That links the app to the solution and caches a version snapshot. Read
each object and automation the app's data sources name the same way, in
one comma-separated call per kind:

```bash
ua entity read object OBJ_a,OBJ_b --source feature-prd-loop --json
ua entity read automation WF_a,WF_b --source feature-prd-loop --json
```

An id that cannot be read is named in `failed`. Record it in
`context.md` as unread, and treat every fact that would have come from it
as unverified. Never infer a field list from a page that reads it.

**Every `cache` answer says which version it read and when that copy was
validated.** Record the version with the fact. The PRD's provenance lines
are built from them.

A command that answers `miss` or `stale` names the tool to use instead.
`stale` here means a write this session sent, not drift by another
person — and this loop writes nothing, so a `stale` answer means the
refresh did not land. Refresh that entity again rather than reading
around it.

## What each read gives

| Read | What it answers |
|---|---|
| `cache app <appId>` | every page with its block, variable and data-source counts, the app's type, device, mode and access, and what is deployed |
| `cache nav <appId>` | the menu: every primary and secondary item with what it opens, the default page, each device's navigator |
| `cache paths <appId>` | every page's path, the folder tree, public pages, two pages at one path |
| `cache page <pageId>` | one page as counts and names: blocks by component type, variables, layout slots, data sources |
| `cache outline <pageId>` | the block tree as componentType and displayName, in stored order, then the slots |
| `cache ds <pageId>` | the page's data sources with the automation each calls, its parameters, and the blocks that consume it |
| `cache events <pageId>` | every event chain: the page's own, each block's, each data source's success and failure callbacks, with the action type and its target by name |
| `cache form <pageId>` | each Form block's fields in order with type, label, widget, required, limits, lookup data source and the binding that reads each |
| `cache deps <pageId>` | the edges the page declares, from every block `dpOn` and `dataSourceIds` |
| `cache keys <pageId>` | the names a binding on the page can read, each with its expression |
| `cache obj <objectId>` | the object's fields with types, formats, picklist codes, lookup targets, required and query flags, and its indexes |
| `cache wf <automationId>` | the automation's nodes with titles and resources, its trigger with inputs and outputs, and what is deployed |
| `cache grep <pattern>` | every block, page function, page variable and data source of every cached page whose text, name, binding or config matches |
| `cache limits` | what the cache never holds, and which tool owns each answer |

`cache grep` is how a target is grounded by name when the ask names a
thing rather than an id: grep the word, read the ids it lands on, and
cite them. It is also how the write-conflict and contract layers of the
ripple find callers.

## Draft against deployed

`cache app` says what the app has deployed, and `cache wf` says whether
the cached automation is ahead of its deployed version. **A PRD reasons
about what a user sees, which is the deployed version.**

So: when a target or a blast-radius row sits as an undeployed draft, the
PRD says so on that row, and any requirement resting on the draft's
behaviour is marked unverified. A feature specified against an
undeployed draft is a specification of something nobody has.

## The context index

Write `<firing>/context.md` as one line per entity, grouped: pages,
objects, automations, menu items. Each line carries the name, the id, the
version it was read at, and one short phrase for what it is for. This is
the file the targets and the PRD's provenance cite.

**The ripple does not read this file.** It reads the solution's own
wiring off the same cache, so the graph it walks is never a
transcription of these reads (`ripple.md`, _Where the graph comes
from_). What this index is for is the human half: knowing what exists,
naming a target by id, and citing a version in the document.

The refresh is still what makes the ripple correct. An entity this stage
did not refresh is an entity the walk reads at its older version, or
reports as stale.

## What the cache cannot answer

Run `cache limits` once and keep its answer in mind. Four gaps matter
here:

- **Runtime behaviour.** What a condition hides, what a role actually
  sees, what an automation really returns with real data. That is the
  look stage, and nothing else answers it.
- **Dangling references.** `cache deps` leaves them out; only the live
  `get_dependency_graph` reads them. A feature that depends on whether a
  reference is live asks for a live read, or the fact is unverified.
- **Records.** The cache holds schemas, not rows. A requirement that
  depends on how much data exists, or what shape the real values take,
  needs a live read or stays unverified.
- **Permissions as applied.** Roles and grants are read live; the cache
  holds neither. Every role fact in the PRD comes from a live read or
  from the look, and says which.
