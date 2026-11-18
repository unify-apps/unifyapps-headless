---
name: loop-test-data
description: "Finds the record with the most rows across a UnifyApps page's data sources, seeds one through UnifyApps Headless's fde-agent when it is below the target (default 100 rows), and keeps a manifest of every id it made so cleanup deletes only those. A shared hidden block of the UnifyApps Headless loops (the audit performance check needs realistic rows), read when a page 'needs more rows' or 'realistic data', to 'seed a test record', 'find the biggest record' or 'clean up test data', or before profiling a list page."
user-invocable: false
---

# Native test data

A slow page is often slow only with many rows. Test with the biggest real record, or seed one big enough, and list everything you make. UnifyApps Headless and manifest rules are in [shared rules](../loop-orchestrator/references/rules.md#ua-ownership); `UnifyApps Headless` below is UnifyApps Headless's own CLI, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A record to test with; target rows (default 100) | [Find the record](references/find-record.md) | Key value and live row counts per object reported, sample size stated |
| The biggest record is below the target | [Seed](references/seed.md) | Triggers checked; live read-back count equals the rows file; manifest written |
| The person asks to remove the test data | [Cleanup](references/cleanup.md) | Every manifest id read back as gone and marked removed |
| A device check or test run is about to change stored data, or a run ends or resumes | [Undo log](references/undo-log.md) | An entry with the before value was written first; `data-undo.mjs check` exits 0 at the end of the run |

Scripts (Node 22, no packages): `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-test-data/scripts/page-row-sources.mjs" --help`, and `data-undo.mjs --help` in the same folder for the undo log.

Used by [loop-route-map](../loop-route-map/SKILL.md) row hops, [native-measured-fix](../native-measured-fix/SKILL.md) seeded saves and `native-audit` ([loop orchestrator](../loop-orchestrator/SKILL.md)).
