---
user-invocable: false
name: object-performance
description: Only for the fde-agent builder agent. Makes a Storage object fast to read as it grows. Lists every read the solution makes on it (its filter, its sort, how often it runs, who waits for it), sizes the object now and at 10 and 100 times its records, picks the indexes that serve those reads within the limit of five, checks that each one finished building, and reports what it chose and which reads it left without an index. Load it on every task that creates an object, adds or changes a field that something filters or sorts on, or changes indexes, and when a brief names an index that a read needs.
---

# Make an object fast

A read is fast when the store can go straight to the rows it returns. Without an index on the fields a read filters by, the store looks at every row. At 200 rows nobody notices. At 200,000 rows every page that reads the object waits, and it gets worse every day the object grows. So you design indexes for the object the solution will have, not the one it has today.

`object-schema-designer` plans indexes from the reads named at design time. This skill checks those indexes against every real read, before and after you change the object. `object-storage-manager` holds the index ops and their rules.

## 1. List the reads

Write one line per read before you add, change or remove an index:

`<who reads it> · filter <field = / in / range> · sort <field> · <how often> · <who waits>`

- **Where reads come from.** The task and its `Speed:` line, the spec lines the task carries, and an `index needed:` line another builder sent. On an object that already exists, `impact object <id>` lists every page, automation and AI agent that uses it. For a page, `cache ds <pageId> --app-id <appId>` shows each data source's filter and sort. For an automation, `entity read automation <id> --source build --json` reads and caches its stored definition, which holds each step's filter.
- **How often.** Once per page open, once per click, once per run of a schedule, or once per item of a loop. A read inside a loop, or inside a small automation that many others call, runs far more often than it looks.
- **Who waits.** A person on a page, a person after a click, or a background job. A person waiting comes first.

When nothing names a read yet (a new object), work out the ones it will get. See § 5.

## 2. Size it

- **Records now.** `get_records` with `limit: 1` gives the total.
- **Growth.** Use the growth the brief or the person gave. Without one, judge it from what each record is. One row per customer grows slowly. One row per event, message, log line or status change grows every day, and those objects are often the biggest in a solution.
- **At 10 and 100 times.** For each read, ask how many rows it would look at with no index. A read that is fine now and slow at 100 times is a read to index now. Adding an index later means someone first has to notice the slowness.

## 3. Pick the indexes

- **Equality first, then sort, then range.** Lead with the fields the read matches exactly (`EQUAL` or `IN`). Then the sort field. Then the range field (`LT`, `GT`, `BETWEEN`, before, after). An index in another order helps less, or not at all.
- **One index serves many reads.** An index on `(a, b, c)` serves a read on `a`, on `a + b`, and on `a + b + c`. It does not serve a read on `b` alone. Before you add an index, see whether you can extend one that already exists so it serves both reads. Add the new fields at its end, and never extend a unique index: that would let duplicates in.
- **Lead with a field that splits the rows well.** An id, an owner or a parent splits rows into small groups. A yes/no flag or a status with three values does not, so put it after a field that does. One exception: a status read for a rare value, such as the few `pending` rows of a queue, splits well. Index it with the sort field after it.
- **Negative filters do not narrow.** `NOT_EQUAL` and `NOT_IN` still look at most rows. Lead the index with the read's positive equality field, and put the negative test after it.
- **Text search does not use an index.** `CONTAINS`, `ICONTAINS` and `ENDS_WITH` look at every row. Only `STARTS_WITH` can use one. Report such a read as left without an index, with the rows it would look at at 100 times.
- **Expect a read by each field that holds another record's id.** A child is read by its parent's id, and a link object from both sides. Count those reads in the ranking below.
- **A sort field must be `sortable: true`** (`object-storage-manager`). It is off until written.
- **The limit is five custom indexes.** Rank the reads by how often they run times the rows they would look at. A read a person waits for comes first. Cover the top ones, and join reads that overlap into one index on several fields. When all five are taken, keep every index a read uses, and report the read that has no index instead.
- **Remove or change an index only when the task names it.** A read outside this solution may use it. For any other index, report the change you would make as `needs_confirmation`.
- **Unique only when the task says so.** A unique index decides which writes succeed. A field marked `uniqueKey: true` already has its own index, so do not add a second one.
- **Indexes cost writes.** Every index makes each write a little slower. An object written in bulk and rarely read needs few indexes.
- **Old rows.** For an object of short-lived rows (events, logs, notifications), say in your report whether it needs a retention rule or an `expireAfterSeconds` index. Both delete rows, so set one only when the task names it.

## 4. Prove it

1. **Read the index status.** Index builds run in the background. After the write, `get_objects` with `parts: ["indexes"]` must show every index you added as built. Report the real status, never just "created".
2. **When an index stays in progress,** read the object's settings (`parts: ["settings"]`). The tools set a data store on every object they create, but an object made another way may have none, and then its indexes never finish building. Setting the store changes the object, so report it as `needs_confirmation` with that fix, unless the task already names it.
3. **Count the slots.** A removed index can stay listed with an error status and still take one of the five slots. Count what `get_objects` lists, not what you meant to keep.
4. **Check one read that matters.** Run the same filtered `get_records` before and after the change. The answer must stay the same. An index makes no time difference you can see on a small object, so never report a timing as proof.

## 5. Think past the task

The task names the reads someone thought of. Ask these questions for every object, and index for the answers that are likely:

- What list will people open most, and what will it filter by: owner, status, parent, team or date?
- Is there a "my items" view? Then it reads by the person's user id.
- Is there a lookup by a key people type, such as a code, an email or a number? That read wants an index.
- Is it a feed in time order? Then it reads by owner or parent and sorts by time, so it needs one index on both, such as `(ownerId, occurredAt)`.
- Will a dashboard count or group these rows? Then the grouping field is read across many rows.
- Does a list page deep into its results with `offset`? Each skipped row is still read, so deep pages slow down even with an index.
- Which read runs inside a loop, or in a small automation that many others call?
- What is the slowest read if the object grows 100 times?

## Report

End each object task with one `speed:` note per object, in its `notes`:

`speed: <object> · <records now> records, <growth> · reads: <read> → <index it uses, or none> ; … · indexes: <each index with its status> · left without an index: <read and why, or none>`

When a read must stay without an index (the five are full, or the read cannot use one), say so in `unverified` as well, with the read and the rows it would look at at 100 times.
