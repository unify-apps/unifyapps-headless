# Analyze the runs

`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-run-metrics/scripts/metrics.mjs" analyze [--runs <folder>] [--solution-dir <folder>] [--since 2026-10-01] [--json]`

Runs are read from `<solution>/.nebula/loops/runs/` (the `--solution-dir`, else the current folder) when it exists, else from `$LOOPS_HOME/runs`.

Prints, as Markdown:

1. **Runs ledger** — one row per run: loop, page, started, wall time, mode, outcome, passes (n and the last pass's gaps), builder batches, tasks retried, refusals, environment failures, questions (asked, % recommended, median seconds), evidence rows (unverified count).
2. **Totals** — by loop and overall; where the wall time went (phases with `waitingOn` summed by what they waited on: builders, device, person, tenant).
3. **Refusals** — the top messages across runs, with counts and the runs they came from. A message that keeps coming back is a lint rule waiting to be written ([known traps](../../native-lint/references/known-traps.md)).
4. **Environment failures** — by kind.
5. **Plans** (with `--solution-dir`) — the UnifyApps Headless plan ledger from `records/plans/*.json`: plans, tasks, attempts > 1, revisions and their reasons, `Unverified: device` lines; the same table the loops were designed from.

Every number names its source file. The report never estimates; a missing value prints as `—`.
