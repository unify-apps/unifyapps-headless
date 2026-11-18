# Drift: someone else may have edited the page

Four sessions once worked in parallel on one app and still collided: a revert to v276 undid six done tasks while the plan showed them done; cards were rebuilt in another session; teammates re-pointed data sources. `drift.mjs` is the guard: a snapshot before every write, a check after it, and a clear instruction per outcome.

With `L="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts"`:

```bash
node "$L/drift.mjs" snapshot <pageId> --app-id <app> --out snap.json
# … the write (one builder batch) …
node "$L/drift.mjs" check <pageId> --app-id <app> --since snap.json --plan <planId> [--json]
```

`snapshot` runs `cache page --refresh`, `cache outline` and `cache blocks --match '.*'` and writes `{ takenAt, pageId, appId, version, blockCount, order, blocks: { id: sha256 } }` — one hash per stored block (keys sorted). `check` takes a fresh snapshot the same way and compares.

| status | meaning | instruction | exit |
| --- | --- | --- | --- |
| `same` | version and every block hash unchanged | continue | 0 |
| `advanced-by-plan` | the version rose and the plan in `--plan` ran a task on this page after the snapshot | continue; the plan's own writes | 0 |
| `foreign-edit` | the version rose and no task of the plan explains it | ask who edits this page; re-read and rebuild the brief on the fresh read | 1 |
| `reverted` | the version went down | re-read before trusting done tasks: every done task on this page is re-verified by a live read-back | 1 |
| `unknown` | same version, different content | a stale cache copy: `cache page --refresh` and snapshot again | 2 |
| `elsewhere` | only with `--targets`: the version rose, no plan explains it, and none of the target blocks changed or went | continue; write the target blocks and report the version seen | 0 |

`--targets b_one,b_two` names the blocks a job writes. The page version moves
with every save, so a job compares its own blocks' before-values (the hashes in
the snapshot), not the version: a foreign save elsewhere on the page is
`elsewhere`, a foreign save that changed or removed a target block stays
`foreign-edit`, and a block a job expects but that is gone is `foreign-edit`
too. Without `--targets` the check is as before.

`who` is best effort: with `--plan`, `plan get <planId> --json` gives the runner (email, Claude session id) and the task that touched the page; otherwise `plan list --status in_progress --json` is searched for a plan whose `touches` name the page. When the CLI cannot answer (no solution folder) `who` is null and the instruction still stands. `--now <snap.json>` compares two saved snapshots and `--plan-file <plan.json>` takes a saved `plan get` output, for tests and offline reads.

## In a loop

1. Snapshot right after the plan's read of the page, before `plan start` or `plan revise` sends a batch.
2. Check after every batch report and before any check that trusts the page (visual check, page lint, read-backs).
3. `foreign-edit`: stop, show `who`, ask once (inside a UnifyApps Headless loop run the orchestrator re-reads and continues only when `changedBlocks` is disjoint from the batch's block ids; else the row goes back to the person). `reverted`: re-verify every done task of the plan on this page by a live read-back before anything else, then continue from the first task that no longer holds.
4. The page lock in [native-device-pool](../../native-device-pool/SKILL.md) tells other sessions a loop owns the page; drift tells this session when they wrote anyway.

Unconfirmed: a block's stored `v` counter is part of the hash, so a save that rewrites a block byte-for-byte still shows as changed; `plan get` task `startedAt`/`endedAt` are assumed ISO strings (a task without them counts as the plan's when its status is done or running).
