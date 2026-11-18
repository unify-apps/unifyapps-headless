# Receipt metrics

`node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-run-metrics/scripts/metrics.mjs" collect --run <run folder> [--plan <planId> --solution-dir <folder>] [--argent-log ~/.argent/mcp-calls.log] [--json]`

Reads, in the run folder: `state.json` (`phases[]` the loop appends to: `{name, startedAt, endedAt, waitingOn}`), `questions.jsonl` (one line per approval or question: `{approval, answer, recommended, seconds, at}` — the loop appends it right after every AskUserQuestion), `evidence.md` (rows by kind and verdict), `visual/pass-*/gaps.json` (one entry per visual check pass), `handoff.md` presence, `receipt.json` (what the loop already wrote: route, inputs, stage, fixes, `needs`). From the solution folder when `--plan` is given: `records/plans/<planId>.json` (tasks with `attempts`, `handBacks`, `startedAt`, `endedAt`, `moves`, refusal `error` strings; the frontmatter's `revisionHistory`). From argent's log: every `tool_called`/`tool_result` between the run's `startedAt` and `endedAt` (device calls, errors, PNG results that entered a context).

Writes `receipt.json.metrics`:

```json
{
  "mode": "interactive",
  "phases": [{ "name": "gather", "startedAt": "…", "endedAt": "…", "waitingOn": null }],
  "passes": [{ "n": 1, "gaps": 7, "off": 5, "missing": 1, "accepted": 0 }],
  "builderBatches": 6,
  "tasks": { "total": 9, "retried": 1, "handedBack": 0 },
  "revisions": [{ "impact": "absorbed", "reason": "visual check pass 1: 7 gaps on Scroll top" }],
  "refusals": [{ "tool": "apply_page_edits", "message": "unknown op …", "count": 2 }],
  "envFailures": [{ "kind": "tenant_5xx", "count": 1 }],
  "questions": { "asked": 4, "recommended": 3, "medianSeconds": 20, "rows": [] },
  "deviceCalls": { "total": 41, "errors": 2, "images": 6, "byTool": { "screenshot": 6 } },
  "evidence": { "rows": 18, "byKind": { "measure": 9 }, "unverified": 2, "manual": 1 },
  "tokensApprox": null,
  "publishes": 1,
  "outcome": "done",
  "needs": null,
  "collectedAt": "…"
}
```

`tokensApprox` stays `null` unless the run recorded it; a guessed number is worse than none (token sums are `loops.mjs log tokens`, from the run log `run-log.jsonl`, only when the person asks for a `report`). `outcome` is `done | stopped | escalated | not-reproduced | failed`, and `needs` names what blocked the run.
