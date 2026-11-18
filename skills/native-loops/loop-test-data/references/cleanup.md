# Clean up seeded data

Only when the person asks. Deletes follow [shared rules](../../loop-orchestrator/references/rules.md#ua-ownership).

0. Restore first: `data-undo.mjs check` must exit 0 ([undo log](undo-log.md)).
1. Delete only ids in the manifest. Never rows you did not make.
2. Brief `ua:fde-agent` with the ids. The delete waits for UnifyApps Headless's own yes/no dialog (`ua-safety`, § For the router).
3. Read back: each id is gone. Mark the manifest entry as removed.
