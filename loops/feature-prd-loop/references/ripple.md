# Ripple — the blast radius, computed

## Contents
- Why a script owns it
- Where the graph comes from
- What the script reads
- The seven layers
- The file it writes
- What you add on top
- The impact table
- Nothing is silently dropped

## Why a script owns it

"It will not break anything" is the claim a PRD most often gets wrong,
because the thing that breaks is never the thing being changed — it is
the third page that happened to read the same automation. Finding that
page is a graph walk, and a graph walk done by reading is a graph walk
done unevenly: thorough on the first target, tired by the fourth.

So the walk is a script's. Same app, same targets, same list, every run.
You rank it and add to it; you never shorten it.

## Where the graph comes from

The solution's own wiring, read from the cache on disk. Every edge is
one the platform records declare: a page data source that runs an
automation, a block event that triggers one, an automation that calls
another, an automation or data source that reads or writes an object.
Nothing is transcribed by hand, so an edge cannot be missed by being
overlooked.

`ua impact <kind> <id>` reads the same wiring and is the right thing
to type when you want one quick answer, but it stops one hop out and
knows nothing about forms, menus, lookups or drafts. This script walks
the same edges to the end of every chain and adds the four layers the
wiring has no edge for.

Four facts live outside the wiring, and the script reads each from the
view that owns it: a page's form fields and whether that form submits,
the app's menu, an object's lookups and indexes, and whether an
automation sits ahead of its deployed version.

**The roles are the one thing neither holds.** They are a live read, so
`targets.json` carries them: fill `roles` from that read when the feature
turns on who can see it. Left empty, the walk says so as an unknown
rather than assuming the feature is visible to everyone.

## What the script reads

`<firing>/targets.json` — the ask resolved. `kind` is `app`, `page`,
`automation`, `object`, `ai-agent` or `role`.

```json
{
  "ask": "let a manager bulk-archive invoices",
  "source": { "kind": "ticket", "key": "ENG-1234" },
  "targets": [
    { "kind": "object", "id": "OBJ_inv",
      "operations": ["write"],
      "fields": [ { "name": "archivedAt", "change": "add", "required": false } ],
      "why": "the ask names invoices",
      "proof": "cache grep invoice · OBJ_inv Invoice @5" },
    { "kind": "page", "id": "PG_1", "change": "add a bulk action",
      "why": "the list is where a manager selects rows",
      "proof": "cache nav APP_1 · NAV_1 opens PG_1" },
    { "kind": "automation", "id": "WF_1",
      "change": "add input archiveReason",
      "why": "the bulk action calls it",
      "proof": "cache ds PG_1 · DS_1 calls WF_1" },
    { "kind": "role", "id": "ROLE_1", "why": "the ask says a manager",
      "proof": "role read · ROLE_1 Manager" }
  ],
  "roles": [ { "id": "ROLE_1", "name": "Manager" },
             { "id": "ROLE_2", "name": "Viewer" } ],
  "unproven": [
    { "kind": "object", "named": "ledger",
      "lookedFor": "cache grep ledger · no match" }
  ]
}
```

`operations` is `read`, `write` or both. A `fields` row's `change` is
`add`, `alter` or `remove`, and `required` says what it will be after the
change — the single most dangerous value in the file, because a new
required field breaks every existing writer of that object.

`contractChange: true` forces the contract layer on an automation target
whose `change` does not happen to use the words that give it away.

`roles` is every role the live read found, which the cache cannot hold.

## The seven layers

Breadth-first from the targets, with a visited set, so a cycle in the
graph is walked once. A chain keeps the layer its first edge earned: a
page two hops downstream of a write conflict is still a write conflict,
because that is what will break there. Every row names the layer that
found it, the reason in words, and the chain that proves it.

**1. Direct.** Every target itself. These are the surfaces the feature
changes, not the ones it threatens. An app named whole brings its pages.

**2. Shared data.** Everything that reaches a target automation without
its contract moving: the data sources that run it, the blocks whose
events trigger it, and the pages that hold them. For a target page, the
other pages on the same automations and objects. These pages did not ask
to change and will change anyway.

**3. Write conflict.** Everything that already writes a target object:
every automation with a write node on it, and every page downstream of
one. A field added as `required: true` is the sharpest case — each
existing writer starts failing validation the moment the field exists,
and a page whose **submitting** form has no field for it will fail on
submit. A filter form that only reads the object is not breakage, and is
not listed as such. This layer catches the most real breakage and is the
one most often missed by reading.

**4. Schema.** Everything that reads the shape of a target object: every
automation and data source that reads it, with the pages downstream;
every object whose lookup field points at it, with everything downstream
of that object in turn. A changed field that sits in an index says so on
the row, because an indexed field is being filtered or sorted on
somewhere, and a removal or a type change there is a break, not a
migration. Where an edge records which output keys the consumer binds,
the row names them.

**5. Contract.** For a target automation whose trigger inputs or outputs
move: every data source that calls it with its page, and every automation
that calls it, chased to the end of the chain. A caller passing an input
that no longer exists, or reading an output that moved, breaks silently —
which is why this layer is chased further than any other.

**6. Navigation and roles.** Every menu item that opens a target page. A
new page, or a feature the ask puts behind a role, also brings one row
per role from `targets.json`: a new page is seen only by the roles it is
granted to, and a feature behind a role nobody has is a feature nobody
sees. With `roles` empty the walk records an unknown instead, so who sees
the feature is never assumed.

**7. Deploy.** Any row whose automation sits ahead of its deployed
version carries `draft: true`, and `counts.deploy` is how many do. Every
requirement resting on a draft is unverified: the behaviour being
described is not the behaviour anybody has.

## The file it writes

Run it from the working folder, so the cache reader reads this solution:

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/feature-prd-loop/scripts/feature.mjs" ripple \
  --targets <firing>/targets.json --out <firing>/blast-radius.json \
  [--home <solution folder>] [--max-rows 200]
```

It refuses rather than guessing when the folder holds no cached entity:
refresh the app first.

```json
{
  "solution": { "entities": 32, "edges": 126 },
  "targets": 4,
  "rows": [
    { "key": "page:PG_2", "kind": "page", "id": "PG_2",
      "name": "Invoice detail", "layer": "shared-data",
      "reason": "its data source invoiceRows reads List invoices through a data source (rows)",
      "path": ["target:automation:WF_1", "page:PG_2"],
      "draft": false, "stale": false,
      "risk": null, "mustNotBreak": null }
  ],
  "counts": { "direct": 4, "shared-data": 5, "write-conflict": 3,
              "schema": 2, "contract": 1, "nav-roles": 1, "deploy": 0,
              "semantic": 0 },
  "truncated": { "rows": 0, "reason": null },
  "unknown": [ { "key": "ai-agent:AG_1",
                 "why": "its tools are not in the cache (get_agent)" } ]
}
```

`risk` and `mustNotBreak` are written as `null` by the script and filled
by you in the next step. `prd-check` refuses a row still holding `null`
in either.

## What you add on top

The script finds every edge the app declares. It cannot find what the app
only means.

1. **Rank each row.** Set `risk` to `high`, `medium` or `low`, and
   `mustNotBreak` to one sentence naming the behaviour that has to keep
   working. `high` is anything in the write-conflict or contract layer,
   anything on a required-field change, and anything a role boundary runs
   through. A row you judge harmless keeps `risk: "low"` with the
   sentence saying why — a row is never deleted to shorten the list.
2. **Add the semantic rows.** `layer: "semantic"`, with `reason` saying
   what it rests on and `path` left empty. Two features competing for the
   same state. An ask whose assumption the app's current behaviour
   contradicts. A workflow a person does today that the feature quietly
   ends. None of these is an edge in any graph, and all of them break
   someone's day.
3. **Resolve every `unknown`.** Each is a hole the walk can see and
   cannot fill: an AI agent, whose tools no snapshot holds; a stale or
   uncached entity; a page that could reach a target only through an
   app-level data source, which declares no edge; a feature behind a role
   with no roles read. Read it again, or carry it into the PRD as an
   unverified fact. Never treat unknown as empty.

## The impact table

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/feature-prd-loop/scripts/feature.mjs" impact-table \
  --blast <firing>/blast-radius.json
```

It prints the Markdown table for the PRD's _Impact on the existing app_:
one row per blast-radius row, highest risk first, with the entity, its
kind, the layer, what changes, what must not break, and the proof. Paste
it whole. **It is computed, never typed**, and `prd-check` compares the
document against the file: a row missing from the table fails the check.

## Nothing is silently dropped

`--max-rows` exists so a large app cannot produce a list nobody reads. A
row beyond it goes to `truncated` with the count and the reason, the
impact table prints that line under itself, and the PRD repeats it in
_Impact on the existing app_. A bounded walk the reader knows about is
honest; a bounded walk that looks complete is not.
