---
name: native-logic-review
description: "Reviews one built page of a UnifyApps MOBILE app critically: its logic, redundant blocks, data sources, variables, functions and JS, interactions that do nothing or run twice (the R1–R8 prune rules), block best practice and UI, then proves each finding on an iOS simulator when a Preview build is there, or through the platform's read tools when it is not. Reports findings with evidence; changes nothing. A shared hidden block of the UnifyApps Headless loops (the audit logic check), read when asked to 'review this page', 'critique page X', 'what can we prune on this page', 'is this page built right' or 'audit the logic on Home', or before a page is handed over."
user-invocable: false
---

# Native review

A critical second look at one page that is already built. It finds what is wrong, what is extra and what can go, and proves each finding before it reports it. It writes nothing to the tenant. In `native-audit` (and the fix loop's quick audit) it is the logic check and its findings become issues; on its own, fixes go through [native-measured-fix](../native-measured-fix/SKILL.md), one at a time, after the person picks them. Shared rules are in [shared rules](../loop-orchestrator/references/rules.md).

| Situation | Read | Acceptance |
| --- | --- | --- |
| Review a page, start to end | [Procedure](references/procedure.md), steps 1–7 | `review.json` and `review.md` written; every finding has evidence or is marked `unverified` |
| Find config that does nothing, runs twice or can never run | [Prune](references/prune.md) | `prune.mjs` ran on the saved version; every prune finding checked by hand before it is reported |
| Block practice, bindings, states, UI | UnifyApps Headless's `skills/app-verify/references/config-review.md` (with its Mobile part) and its page reviewer's 7 qualities, as the [procedure](references/procedure.md) step 3 says | Every rule evidenced or listed as unverified |
| Logic, redundant JS and interactions UnifyApps Headless does not check | [Checks](references/checks.md) | Every group has a verdict: findings, `clean`, or `unverified` with the reason |
| Prove the findings on a device, or without one | [Verify](references/verify.md) | The path taken (`simulator` or `mcp-only`) is named, with the reason; each finding proven on a device carries its version and refetch proof |
| Write the result | [Report](references/report.md) | One table, worst first; each row says what, where, why it matters, the fix and the proof |

Script: `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-logic-review/scripts/prune.mjs" --help` (Node 22, no packages). It reads the same UnifyApps Headless cache views as [native-lint](../native-lint/SKILL.md)'s `page-lint.mjs`, through that block's `cache-shapes.mjs`.

Next: the findings go to the board (in a run) or to the person; each fix goes through [native-measured-fix](../native-measured-fix/SKILL.md).
