---
name: native-visual-check
description: "Measures a MOBILE UnifyApps page on an iOS simulator through argent (accessibility tree plus full-resolution screenshots), compares it with the page's design spec at ±2pt, writes the gap table and the HTML pass report, and turns the open gaps into one UnifyApps Headless page-layout fix task. A hidden block of the UnifyApps Headless loops: the audit's UI check and the visual-check and retest kinds of the test-and-fix stage's device queue. Read when asked to 'compare the page with the Figma', 'run a visual check', 'measure the page on the simulator' or 'write the fix brief for pass n'."
user-invocable: false
---

# Native visual check

One pass of the visual check is measure → compare → judge the visual rows → fix brief. It needs a device reservation from [native-device-pool](../native-device-pool/SKILL.md) (the `release` profile) and the page's `spec.json` from [native-design-spec](../native-design-spec/SKILL.md) (the run's `board/`, filled from the solution's design store). Measurement screenshots never enter the context and a pass looks at one composite and at most two crops ([rules § Evidence](../loop-orchestrator/references/rules.md#evidence)). Every fix is a draft save through a UnifyApps Headless builder ([rules § UnifyApps Headless ownership](../loop-orchestrator/references/rules.md#ua-ownership)).

| Situation | Read | Acceptance |
| --- | --- | --- |
| Run pass n of a page (a test runner or a goal calls this once per pass) | [Check](references/check.md) | `gaps.json` written; the approval text printed with `composite.png`; one of `matched`, `accepted`, `stopped`, `exhausted` reached |
| Offsets look wrong, a sheet or a LogBox banner is in the dumps, the page did not scroll, `native-describe-screen` answers a status | [Measurer](references/measurer.md) | every viewport `offsetConfidence` exact or high; overlays listed and excluded; each status recovered once |
| Read a row, judge a `visual` row, accept a row, write the approval message | [Gap reading](references/gap-reading.md) | every non-match row has a status you can explain; verdicts in `visual-verdicts.json` |
| Turn the open rows into the UnifyApps Headless task | [Fix brief](references/fix-brief.md) | `fix-task.json` passes `fix-brief.mjs --lint`; the `plan revise` line says `absorbed` or `major` for the right reason |
| Open or explain `pass-report.html` | [Report](references/report.md) | expected (dashed blue) and measured (solid red) boxes on both sides, the table filtered by status |

Scripts under `scripts/` (Node 22, no packages; `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-visual-check/scripts"`): `measure.mjs` (two dumps per viewport, `--runner` for a scripted argent), `measure-merge.mjs`, `gap-table.mjs`, `fix-brief.mjs`; each answers `--help` and `--json` and exits non-zero on a failed stage.

Next: the fix stage of the UnifyApps Headless loops sends the fix task through UnifyApps Headless ([loop orchestrator](../loop-orchestrator/SKILL.md)); the next pass measures again.
