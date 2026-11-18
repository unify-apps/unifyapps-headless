---
name: native-measured-fix
description: "Applies one config fix to a UnifyApps app page and proves it on the app's device: backs up every touched block, variable and data source, briefs the UnifyApps Headless builder for a draft save, reads back live and diffs, loads the draft on the device, checks the page behaves the same and the targeted counts got better, then keeps the fix or undoes it from the backup. A shared hidden block of the UnifyApps Headless loops (the fix stage for perf-loop findings and perf rows), read when asked to 'apply this fix and check it', 'change the config and verify', or for any single config fix that must be proven on a device."
user-invocable: false
---

# Native fix verify

One fix at a time. Never publish; every write is a draft save through a UnifyApps Headless builder, per [shared rules](../loop-orchestrator/references/rules.md#ua-ownership).

| Situation | Read | Acceptance |
| --- | --- | --- |
| One fix to apply and prove | [Procedure](references/procedure.md), steps 1–7 | Backup holds every touched id; live diff shows only the fix; device on the saved version |
| A check failed, or both passed | [Keep or undo](references/procedure.md#8-keep-or-undo) | Kept, or undo read back value by value against the backup |
| Report the result | [Receipt](references/receipt.md) | One record per fix with before/after counts and KNOWN/GUESS |

The fix stage of the UnifyApps Headless loops calls this once per perf or behaviour fix it must prove on a device ([loop orchestrator](../loop-orchestrator/SKILL.md)); fixes come from the performance check, [native-logic-review](../native-logic-review/SKILL.md), a ticket or the person.
