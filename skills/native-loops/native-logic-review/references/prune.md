# Prune: config that does nothing

`prune.mjs` lists what one page holds that does nothing, runs twice or can never run. It reads UnifyApps Headless cache views only. It takes the same inputs as `page-lint.mjs` ([page lint](../../native-lint/references/page-lint.md)): live through the UnifyApps Headless CLI with `--app-id`, or saved views with `--from <dir>`.

```bash
node prune.mjs <pageId> --app-id <app> [--refresh] [--json] [--rules R1,R2] [--out <file>]
node prune.mjs <pageId> --from <dir> [--json]
```

Exit 0 when nothing blocks, 1 on a blocking finding, 2 when the views cannot be read.

## Rules

Only what UnifyApps Headless's config-review (`${CLAUDE_PLUGIN_ROOT}/skills/app-verify/references/config-review.md`) does not already list. Unused page variables, one-child wrappers, links to missing pages, back controls with no event and hand-built Repeatables are in that checklist; run it, do not repeat it here.

| id | Finds | Severity | Check by hand before you report it |
| --- | --- | --- | --- |
| R1 | A data source nothing uses: not on page load, no block reads it, no event triggers it, no binding names it | prune | `search_app` for its name: an app-level function or another page may call it |
| R2 | Two data sources calling the same automation with the same parameters | prune | The two may differ in timing or callbacks; read both with `cache ds --id` |
| R3 | A page function nothing calls | prune | A page input or the page that opens this one may read it; `search_app` for its id |
| R4 | A block whose visibility is the literal `false` | prune | Someone may hide it while they work on it; ask before you call it dead |
| R5 | An empty container: no children, no data, no events, no fixed size | prune | A container with only padding or a background is a spacer: check H13 |
| R6 | The same action twice on one event with the same payload | prune | A second `trigger` may be on purpose after a write; read the order of the chain |
| R7 | A data source set to run on page load and also triggered by `onPageLoad` | advisory | Not confirmed that both fire. Prove it on the device: two calls in `native-network-logs` on open |
| R8 | A Pressable, Button, IconButton, Link or Chip with no event, outside a Form | blocking | A Form's submit button has no event of its own; the rule skips blocks inside a Form |

A finding is `{ rule, severity, kind, id, name, detail, fix }`. R3 needs `entity context page`; without it R3 reports `unverified` instead of guessing.

## Not confirmed

- R7 assumes `runQueryOnPageLoad` and an `onPageLoad` trigger are two separate calls. Prove it on the device before you report it as waste.
- R1 and R3 match ids as text. A binding built from parts at run time (`'var_' + name`) is missed and the item looks unused. This is why every prune finding is checked by hand.
