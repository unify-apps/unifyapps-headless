---
user-invocable: false
name: performance
description: Read when an automation may repeat work, process many items, or fetch a large result set. Covers caching, loop removal, batching, source-side filters and sorting, analytics, and pagination for Workflow Agent.
---

# Performance

Reduce work without changing results, ordering, or failure behavior. Read current operation schemas and use the TypeScript DSL.

## Caching

Honor explicit cache and no-cache requirements exactly. Without an explicit requirement, cache only when all of these are true:

- The operation is read-only.
- Its data changes slowly relative to the cache lifetime.
- Calls with the same business inputs are likely to repeat.
- A stale response cannot cause a wrong business action.

Do not cache writes, sends, triggers, approval state, inventory or prices, new-record polling, or reads whose freshness controls a mutation.

Put supported `cacheConfig` in `op(...)` options. Use its current shape, TTL unit, and policy values. Build the key from every business input that changes the response, not wrapper or node identity.

## Looping

Try to remove the loop before optimizing its body.

1. Push supported filter, sort, projection, and limit work into the source.
2. Use one bulk operation when it preserves item association, ordering, partial failures, retries, and recovery.
3. Replace one callable per item with a batch callable unless iterations branch, depend on earlier items, or need separate recovery.
4. Move invariant reads and calculations before the loop.

Common rewrites:

| Slow shape                                                    | Prefer                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fetch every record, then filter and sort in a loop            | Put the supported filter, sort, projection, and page limit on the fetch operation      |
| Fetch the same lookup or configuration inside every iteration | Fetch it once before the loop and reference that result inside the loop                |
| Call the same automation once per item                        | Use `callables_call_automation_batch` when its input and failure contract fit          |
| Run one count or sum query per item                           | Run one Analytics query grouped by the item key, then match the grouped rows in memory |

Do not put analytics inside a loop. Group once by item key, or query bounded key batches when one query cannot express the requirement.

After reshaping execution, re-read outputs and verify ordering, association, partial failures, retries, and call count.

## Data fetching

Push filtering, sorting, projection, grouping, and aggregation into the source. Fetch only what downstream uses.

Use Analytics for counts, sums, averages, ranks, groups, extrema, trends, or scans larger than a safe record page. Prefer one grouped query returning only needed dimensions and measures.

Keep every fetch within the operation's documented page and result limits. Do not request an unbounded result or assume the first page is complete.

For large data processing:

1. Choose a stable sort key. Add a unique tie-breaker when the primary key can repeat.
2. Fetch one bounded page.
3. Process or persist each page before the next. Accumulate all pages only when the final step requires it and the total fits.
4. Continue from the operation's documented cursor, token, offset, or last-seen key. Stop only on its documented completion signal.
5. Preserve continuation state for resume, and make page processing idempotent when retries can repeat a page.

Prefer cursor or keyset pagination when the source supports it and records may change during the run. Offset pagination can skip or repeat records when earlier rows are inserted or removed. If only offset pagination exists, use a stable order and account for that risk in the workflow's behavior.

Verify the final row count, page boundaries, duplicate handling, memory use, and the number of source calls.
