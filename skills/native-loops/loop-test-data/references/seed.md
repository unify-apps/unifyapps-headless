# Seed a test record

Writes go through `ua:fde-agent` only, as [shared rules](../../loop-orchestrator/references/rules.md#ua-ownership) say. Every id goes in the [manifest](../../loop-orchestrator/references/rules.md#safety).

## 3. Check what a write would set off

Do this before any seed write.

- `ua impact object <object>` lists the automations that use each object.
- For each one, read its trigger: `ua cache wf <automation>` (or `open_workflow` live when the cache misses). A record-change trigger fires on your seed writes.
- If such an automation calls an outside system (a connector, an API, a message), tell the person what it does and ask before seeding.

## 4. Plan rows that matter to each other

Copy the shape of real rows from the biggest record: the same fields, the same kind of values, the same picklist codes. Then make the rows depend on each other, so the page does real work:

- Rows that add up into totals, so a change to one row changes a sum.
- Rows on every tab or category the page shows, so each tab has a full list.
- A few edge rows: a zero amount, a long name, an empty optional field.
- A key value nobody will mistake for real data, such as `TEST-<date>-<n>`.

Make the parent record too, if the page reads one (the row the key points at). Fill every required field.

Write all rows into one file in your session's drafts folder. That file is the spec for the write.

## 5. Seed through fde-agent

Brief `ua:fde-agent` the way `ua-change` says (§ The brief): the rows file, the object, the read-back you expect.

UnifyApps Headless's rules for seed rows apply. A builder writes every row the spec names, but rows it makes up stop at 20 per object, and more than 200 rows into one object is an automation task or an import (`task-kinds.md`, § Facts every body follows, "Seed rows" and "Test data"). So name every row in the file.

## 6. Read back and record

- `get_records` filtered on the key, per object. The count must match the file.
- Write the manifest. Keep it in the run folder, not in the repo.

```json
{
  "app": "<app id>", "page": "<page id>", "key": { "field": "<plain name>", "value": "<seeded value>" },
  "made": [ { "object": "<object>", "ids": ["<id>"], "at": "<ISO time>", "why": "<one line>" } ],
  "triggersSeen": [ "<automation name>: <what it does on write>" ],
  "removed": []
}
```

## Seen in real work

- A record-change trigger or automation can fire on seed writes and call an outside system. Check step 3 every time.
- A required-field validation can reject a merge update. `apply_record_edits` update reads the row and merges your fields, yet the write was still refused. A replace write (`replace: true`) overwrites the whole row: read the row first, send every field with your change, then read it back. A field you leave out is lost.
