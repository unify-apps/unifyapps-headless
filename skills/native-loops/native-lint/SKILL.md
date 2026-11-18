---
name: native-lint
description: "Runs three read-only checks on a UnifyApps MOBILE app before a write is spent: known-traps lint on builder briefs and plan task bodies (with UnifyApps Headless's own task rules), house-rules lint on UnifyApps Headless cache reads of a page, and the live-drift guard that snapshots a page before a write and checks it after. A hidden block of the UnifyApps Headless loops (every fix and build brief, the audit logic and touch feedback checks, around every write), read before a brief or tasks file is sent ('lint this brief', 'will plan propose accept this', 'check the tasks for traps'), when a page must pass the house rules ('page lint', 'house rules on Home'), and when someone else may edit the same page ('did the page change', 'who edited this', 'snapshot before the write')."
user-invocable: false
---

# Native lint

Three checks that refuse, rewrite or warn before a write is spent. Each reads files or the UnifyApps Headless cache; none writes to a tenant. UnifyApps Headless reads follow [shared rules](../loop-orchestrator/references/rules.md#ua-ownership). The scripts run UnifyApps Headless's own CLI from the plugin they ship in, from the solution folder.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A brief or tasks file is about to be sent | [Task lint](references/task-lint.md) | `task-lint.mjs` exits 0: no UnifyApps Headless rule broken, no applicable trap; advisories carried into the brief |
| A page must pass the house rules | [Page lint](references/page-lint.md) | `page-lint.mjs` reports 0 blocking on the chosen rules; every unverified row named in the evidence |
| Someone else may have edited the page | [Drift](references/drift.md) | a snapshot before the write and a check after it: `same` or `advanced-by-plan`; anything else stops the run's job |

The traps are in [known traps](references/known-traps.md) (T01–T24) and the rules in [house rules](references/house-rules.md) (H1–H17); the UnifyApps Headless task rules are copied from this plugin's own `scripts/lib`, and the plugin's tests keep the copy equal. The UnifyApps Headless loops (`/ua:native-fix-loop`, `/ua:native-build-loop`) and `native-audit` run task-lint before every batch they send, page-lint in the audit and on every page the fix stage touched, and drift around every write.

Scripts need Node 22 and no packages (`L="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts"`): `task-lint.mjs`, `page-lint.mjs`, `drift.mjs`; each answers `--help`.
