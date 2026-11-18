# Procedure

One page, one run. Work from the solution folder (where UnifyApps Headless is set up for the app's tenant). Below, `R="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-logic-review/scripts"` and `L="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts"`. `UnifyApps Headless` commands below are UnifyApps Headless's own CLI (`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`). Write every file to `OUT`: inside a UnifyApps Headless loop run, `<run>/findings/logic/<pageId>/` of the run folder ([shared rules § Run folder](../../loop-orchestrator/references/rules.md#run-folder)); on its own, `<solution folder>/.nebula/loops/reviews/<pageId>-<version>/`.

## 1. Preflight

Run [loop-preflight](../../loop-preflight/SKILL.md) `check`. Read `.nebula/loops/profile.json`. Stop when `app.type` is not `MOBILE`; on a WEB app, say "This is a WEB app. Use /ua:app-fix-loop; its find-issues way in runs the logic check." and stop.

## 2. Pin the version

`solution refresh`, then `cache page <pageId> --app-id <app> --refresh --json`. Note the page version. Every later read and every finding names this version. When the version moves during the run, someone else edited the page: say so and start again from this step.

## 3. Machine checks

```bash
node "$L/page-lint.mjs" <pageId> --app-id <app> --app-wide --json --out $OUT/lint.json
node "$R/prune.mjs"     <pageId> --app-id <app> --json --out $OUT/prune.json
```

The lint gives the house rules H1–H17. Prune gives R1–R8 ([prune](prune.md)). Then run UnifyApps Headless's own checklist: `${CLAUDE_PLUGIN_ROOT}/skills/app-verify/references/config-review.md`, all of it plus its **Mobile only** part. It covers block choice, navigation, bindings, scroll, loading, empty and error states, names, tokens and dead config. Use it as written; do not restate it in the report. All three are starting points, not verdicts. Check each row by hand in step 5.

## 4. Read the page as a reviewer

Read in this order, from the cache: `cache outline`, `cache events`, `cache ds`, `cache keys` (with `--name` for each function body), then `cache blocks --id` for the blocks the outline and events point at. Write down, in your own words, what the page is for: who opens it, what it shows, what a person does on it. Every finding is judged against that.

## 5. Critical checks

Go through every group in [checks](checks.md). It holds only what the three machine checks and UnifyApps Headless's checklist do not. For each group write findings, `clean`, or `unverified` with the reason. Confirm or drop every lint and prune row from step 3. A row you cannot prove from the config goes to the device list for step 6.

## 6. Verify

Follow [verify](verify.md). It decides `simulator` or `mcp-only` and proves the device list from step 5.

## 7. Report

Write `review.json` and `review.md` per [report](report.md). Inside `native-audit` (and the fix loop's quick audit) the logic check stops here: each finding becomes one issue on the board ([formats](../../loop-orchestrator/references/formats.md)), and fixing is the `fix` goal. On its own, show the person the table and ask which findings to fix, as one multi-select question, the blocking ones pre-marked as recommended. Fix nothing they did not pick. Each picked fix goes through [native-measured-fix](../../native-measured-fix/SKILL.md), one fix per call. Never publish.
