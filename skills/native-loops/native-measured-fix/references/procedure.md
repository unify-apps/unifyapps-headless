# Apply and verify one fix

A fix is kept only when the page still does the same thing and the targeted step got better. Anything else is undone. Writes, read-backs and drafts follow [shared rules](../../loop-orchestrator/references/rules.md#ua-ownership).

`UnifyApps Headless` below is UnifyApps Headless's own CLI, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`, run from the solution folder.

You need a UnifyApps Headless folder, a reserved simulator with the Preview app ([native-device-pool](../../native-device-pool/SKILL.md)), a test record ([loop-test-data](../../loop-test-data/SKILL.md)), and the fix: what to change, on which blocks, variables or data sources, and the step it should improve. The fix comes from the performance check, [native-logic-review](../../native-logic-review/SKILL.md), a ticket, or the person.

Before the trial, follow [controlled comparisons](../../loop-orchestrator/references/comparisons.md).
Record its acceptance threshold and required checks. Verify the fixture can
perform them before collecting the baseline.

## 1. Back up

Read fresh copies of everything the fix touches, and save them in the run folder:

```bash
UnifyApps Headless cache blocks <page> --app-id <app> --id <block ids> --refresh --json > backup-blocks.json
UnifyApps Headless entity context page <page> --app-id <app> --json > backup-page.json
```

`backup-page.json` holds the page's `properties.pageVariables`, `properties.pageFunctions`, `properties.dataSources` and the page's own data sources. Note the page `version` in `backup-blocks.json`.

Then write the undo as a ready-to-send brief: "set these blocks, variables and data sources back to exactly these values", with the values from the backup.

Before any write, check the backup files exist, are not empty, and hold every id the fix touches. A write can remove something with no confirm step, so the backup is the only way back.

## 2. Take the "before" snapshot

Open the page on the device with the test record, walking a route from [loop-route-map](../../loop-route-map/SKILL.md) with taps from the screen tree. Record:

- **Rows**: the row count of each list, and on each tab.
- **Values**: the key values on screen (totals, labels, statuses), from the screen tree, not a screenshot.
- **Tab contents**: open each tab and record what it shows.
- **Save payload**: find the save action. `ua cache events <page> --app-id <app> --name <save button>` shows its chain to the data source. `ua cache ds <page> --app-id <app>` shows that source's parameters and what they read (`depends on`). Write down each binding and the value it has now. The app's values are not readable from outside, so save on a seeded row only (from the test-data manifest) with `native-network-logs` capturing, and keep the request body.

Prove the baseline version with the device-step protocol's fresh-config proof
([protocol](../../native-device-pool/references/protocol.md) step 6). An
unproven baseline cannot support a comparison.

Then measure the targeted step as the performance check does
([audit-perf](../../loop-orchestrator/references/stages/audit-perf.md) § Device:
first paint, requests and native hangs). That is the "before" count.

## 3. Brief the builder

Send the fix to the builder that owns it, the way `ua:ua-change` says (§ The brief, and its `references/task-kinds.md` for which builder); inside a UnifyApps Headless loop run the fix stage writes the brief from the loops' builder brief. Page blocks, events, variables and data sources go to `ua:app-agent`. Lint the brief with [native-lint](../../native-lint/SKILL.md)'s `task-lint.mjs` first. Add:

- `Done when:` the exact config that must be true after the write.
- `Draft save only. Do not publish.`

## 4. Read back live

```bash
UnifyApps Headless cache blocks <page> --app-id <app> --id <block ids> --refresh --json
UnifyApps Headless cache diff <page> --app-id <app> --versions <new version>,<version from step 1>
```

The `--refresh` reads in step 1 and here each keep a cached copy of the page, so the diff compares the version before the fix with the version after it.

The diff must show only the change you asked for. Anything else changed is a reason to stop and look before going on. No read-back means not done.

## 5. Load the draft

`restart-app` (or the reload pill), then the protocol's fresh-config proof
(step 6) until the device runs the saved version.

## 6. Check: same behaviour

Repeat step 2 on the same record. Every row count, value, tab and save payload must match the "before" snapshot. A difference fails the check, even if it looks harmless.

## 7. Check: better

Profile the same step under the matched conditions from the baseline. Keep
raw samples, count and spread. Compare counts to explain the change, and the
target runtime metric to judge the claimed gain. Compare first opens with
first opens, and later opens with later opens. If conditions drifted, rerun
the baseline within the budget or mark the comparison incomplete.

## 8. Keep or undo

- Both checks pass with comparable evidence and the target threshold is met: keep it.
- A required check is missing, version proof fails, or conditions differ: the
  experiment is incomplete, not a proven regression. Restore the unproven
  trial change through the undo brief, verify restoration as below, and
  record blocked with the missing check. Do not undo unrelated working changes.
- Either check fails on a proven variant: send the undo brief from step 1 to the same builder. Read it back and compare with the backup, value by value. Load the draft again and check the page opens as before. Record "tried, undone" and why.
