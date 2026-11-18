---
name: loop-run-metrics
description: "Fills a UnifyApps Headless loop run's receipt metrics from the files the run left behind (passes, waits, refusals, environment failures, questions, device calls, evidence rows) and the UnifyApps Headless plan record and argent's call log, and analyzes every run in the solution into ledgers: runs, where the time went, the refusals that keep coming back. Reads only. A shared hidden block of the UnifyApps Headless loops for MOBILE apps, read at the end of a run, and when asked 'how are the loops doing', 'analyse the runs', 'where did the time go' or 'which refusals keep coming back'."
user-invocable: false
---

# Native metrics

A run that cannot be measured cannot be improved. `collect` fills `receipt.json.metrics` once per run; `analyze` renders the ledgers across runs. Both read only. The run-analytics report (tokens per stage and agent, skill and loop calls, issue flow) is `native-report`, rendered from the run's run log only when the person asks; this block is the receipt and the cross-run ledger it can quote.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A run is finishing | [Receipt metrics](references/receipt-metrics.md) | `receipt.json` has `metrics` with `outcome` and every count sourced from a file |
| Someone asks how the loops perform | [Analyze](references/analyze.md) | the runs ledger, the question stats and the refusal and failure tables, with the run folders they came from |

Script: `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-run-metrics/scripts/metrics.mjs" --help` (Node 22, no packages). Every goal calls `collect` when it finishes.
