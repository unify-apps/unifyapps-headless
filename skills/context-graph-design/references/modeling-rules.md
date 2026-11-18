# Graph modeling rules

Follow these rules before a graph is saved. Each rule ends with the check that proves it.

## Contents

- Keys
- Property types
- Relationships and foreign keys
- Defined vs matched edges
- How many edges
- Cleaning and identity
- Extraction at volume
- Checks before the plan is accepted

## Keys

1. Every node has one primary key. It is a field that never changes and is unique across the source. A name or a display label is not a key.
2. When no single field is unique, use a composite key (two or more fields together). Write every part down.
3. Write the key's format: case, spaces, leading zeros, country code. `A@x.com` and `a@x.com` are the same key only if the plan says keys are lower-cased.

4. Key on a stable id, never on a name. Names get renamed; ids do not. Keep the name as a property so answers stay readable.
5. Reference data that only means something inside a parent (a stage inside a pipeline, a status inside a workflow) needs a composite key such as `parent_id::child_id`. The same label can mean different things under different parents.
6. Never judge a record's state from a coded id or a flag alone. Store the reference record and read its label and meaning. Trim labels; source values often carry trailing spaces.

Check: count the source rows and count the distinct key values. The numbers must match, or the plan names the duplicates.

## Property types

1. Decide every property type before loading. Changing a type later needs the node to hold zero records.
2. A property is `{ id, dataTypeInfo: { type }, displayName?, primaryKey?, required?, unique?, pii?, searchable?, sortable?, filterable?, graphQueryable?, format?, defaultValue? }`, the Nodes wizard's own fields. Mark the key `primaryKey: true` and `required: true`, a property Cypher must filter on `graphQueryable: true`, and personal data `pii: true`.
3. Default to STRING. A DATE, DOUBLE, INTEGER or BOOLEAN property can project zero records *(unverified)*. Before another type goes on a tenant, create one node with it, load one record and run the projection check below; when it fails, keep STRING and convert in Cypher (`toFloat(...)`, `toInteger(...)`). Store dates as `YYYY-MM-DD` so text order is date order.
4. An edge's attributes are properties of the same shape, written in the Edges table's `Attributes` column.
5. The node's settings beside its properties — `category` (`core` for the things the questions are about, `secondary` for reference data, `derived` for what an enricher computes), Enable permissions (`skipRBAC: false`), SCD Type 2 (keeps every version of a record; fixed once the node exists), auditable — go in the spec's `Node settings` table when they depart from the defaults.

Check: after the first record of each node type, run `MATCH (n) RETURN DISTINCT labels(n)`. Every node type must appear. Catch it at record 1, not record 200.

## Relationships and foreign keys

A relationship needs a foreign key. A foreign key is a field on one record that holds the key of another record. Example: a ticket row has `author_email`, which is the key of a Person.

For every relationship, write down all five:

| Item | Example |
|---|---|
| From node | Ticket |
| To node | Person |
| Edge name | AUTHORED_BY |
| Foreign key field, and which side holds it | `Ticket.author_email` → `Person.email` |
| Cardinality | many tickets → one person |

Rules:

1. The foreign key must use the same format as the target key. Normalize both sides the same way.
2. One edge type per role. If a ticket has an author and an owner, both pointing at Person, that is two edge types (AUTHORED_BY and OWNED_BY), each with its own foreign key field. Do not merge roles into one edge.
3. Decide what happens when the foreign key is empty (no edge) and when it points at a missing record (skip, create a stub node, or report). Write the choice.
4. A relationship can also come from a join table, a separate table with one row per link (for example `ticket_id, tag_id`). Then the join table is the source of the edges, not a node.

5. Records never link themselves. Two records sharing a value creates no edge. Every edge is written on purpose, by a source relationship mapping or an automation step.

Check: for each edge type, count rows with a non-empty foreign key. The live edge count must match that number, minus the rows the plan says it skips.

## Defined vs matched edges

An edge type is created one of two ways: **matched** (the default, "Matched from your data" on the screen) or **defined** ("Defined by you" on the screen).

1. Default to a matched edge: one node's record holds the other node's key, as in the foreign key relationship above.
2. Choose a defined edge when the relationship itself lives in its own table or object — a junction table, an assignment list, a membership export — or when the relationship carries data of its own.
3. A defined edge is eligible only when both nodes have a primary key and keep no history (SCD Type 2). It is refused before any write when either node fails this.
4. A defined edge's label cannot change once it is created. To rename it, delete the edge type and create it again.
5. `edgeKey` is a defined edge's only primary key, built from its two key attributes. Never mark one of its own attributes `primaryKey`.
6. A defined edge type draws nothing by itself. One edge appears only once a record lands through a source mapping onto it (see `context-graph-sources`).

Check: before naming an edge `defined` in the plan, confirm both endpoint nodes already have a primary key and keep no history.

## How many edges

A common mistake: the data holds many links per record, but the graph defines only one edge per record.

1. Look at real rows before deciding cardinality. Do not guess from the field name.
2. If a field holds a list (`"a;b;c"`, a JSON array, repeated columns like `owner_1`, `owner_2`), split it. Create one edge per item.
3. If the same pair is linked by many rows, decide: one edge, or one edge per row with properties such as date or amount. Write the choice.
4. Many-to-many needs a join table or a list field. It never fits in a single foreign key column.
5. Replaying the same load must not add edges a second time.
6. Build only the edges in the accepted plan. An edge added during the build, even a useful one, goes back to the plan first, whether or not it joins nodes that already hold records.

Check: pick one record that has several links and read them with a Cypher `MATCH (a)-[r]->(b)` on its key. Every link must be there, and none twice.

## Cleaning and identity

Real data is dirty. Plan cleaning before loading, not after.

1. Profile the source first: empty values, typos, different formats for the same thing, trailing spaces, mixed case.
2. Write one normalize rule per key and foreign key field (trim, lower-case, one phone format).
3. Ask whether one real person or thing can appear under two keys (two emails, an old and a new id). If yes, write the merge rule and which record wins.
4. A merge inside the graph does not fix the source. The next resync brings the duplicate back unless the source is fixed or an alias list maps the old key to the new one. Write which one the plan uses.
5. For each field, write which value wins in a conflict: newest, a named source, or manual review.

6. When an agent extracts records (an enricher), it must: emit one row per extracted thing, never a cross product (2 commitments and 1 blocker are 3 rows, not 6); build ids from the source record id, never invent them; look up existing records before assigning an id, or every run makes duplicates; name each output field after the node property it fills, so mapping stays one-to-one. Read the object's fields first. An enricher outputs only what the source object does not already have; map the object's own fields directly, never copy them through the model. An enricher output must never reuse a field name of the source object it enriches: the two would share one id and nothing could tell them apart. Only when the enricher deliberately produces its own version of an existing field, prefix it (for example `ai_description`) and map it onto the node property. The tools refuse the clash, so a refusal that names a shared field means rename the output.
7. Do not use a model for plain capture. Map fields that already exist (id, text, time) directly. Use a model only where meaning is added.

Check: load the same data twice. Record and edge counts stay the same.

## Extraction at volume

1. Estimate before you pick a scope: records × links × about 45 ms per link write, and model calls × about 3.6 s each.
2. Send about 10 records per model call. Each returned item carries its source key. Drop an item whose key was not in the batch.
3. Keys like `<source>::<kind>::<n>` mean a rerun that finds fewer items leaves the old higher-numbered ones behind. Choose the cleanup before a rerun with a changed prompt.
4. A digest post (a daily task list, a QA list) can give 30–45 items from one record. Decide per source whether to cap it or mark it as a digest.
5. Prompt rules for clean extraction: a progress report is not an action; waiting on someone is a blocker; a plain statement of current state is not a decision.

## Checks before the plan is accepted

- Every node has a key and its format.
- Every edge type has the five items in the relationship table.
- Every list field and join table is split into one edge per item.
- Empty and missing foreign keys have a written rule.
- Cleaning and merge rules are written, and so is how a resync keeps them.
- The acceptance questions include a many-link record and a not-found record.
