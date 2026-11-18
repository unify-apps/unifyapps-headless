# Page lint: a page must pass the house rules

`page-lint.mjs` checks one page of a MOBILE app against the [house rules](house-rules.md) H1–H17 from UnifyApps Headless cache reads. No tenant call unless `--refresh`.

```bash
cd <solution folder>   # where UnifyApps Headless is set up for the app's tenant
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/page-lint.mjs" <pageId> --app-id <app> [--refresh] [--app-wide] [--json] [--rules H1,H2] [--out report.json]
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-lint/scripts/page-lint.mjs" <pageId> --from <dir> [--json]   # saved views; what the tests use
```

Live mode runs, through UnifyApps Headless's CLI from the plugin the script ships in (`bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" … --json`; `--ua-root <dir>` points at another checkout, for tests): `cache page`, `cache outline`, `cache blocks --match '.*' --limit 100000`, `cache ds` plus `cache ds --id <source>` per source (the parameter bindings come only from the per-source view), `cache events`, `cache keys`, `cache nav`, `cache paths`, `entity context page` (the only read that carries page settings), with `--app-wide` `cache ds --app-id <app>`, and for every static page the events navigate to, that page's `cache outline`, `cache blocks` and `cache events` (`--no-targets` skips them). A miss or stale read stops with UnifyApps Headless's own message; `--refresh` or `solution refresh` fixes it.

`--from <dir>` reads `page.json`, `outline.json`, `blocks.json`, `ds.json`, `events.json`, `keys.json`, and when present `nav.json`, `paths.json`, `entity.json`, `app-ds.json`, `assets.json`, `targets/<pageId>/{outline,blocks,events}.json` — each the `--json` output of the command of the same name. `scripts/lib/cache-shapes.mjs` documents every shape with the function of UnifyApps Headless's `scripts/lib/cache-views.mjs` that makes it.

## Rules

| id | severity | reads | when it cannot decide | overlaps UnifyApps Headless |
| --- | --- | --- | --- | --- |
| H1 identity in data-source parameters | blocking (`userContext`, an email literal, a user id literal in an identity-named parameter); advisory when an identity-named parameter is bound to a variable | ds bindings | bindings not read → unverified | — |
| H2 Repeatable inside a Scrollable | blocking: a vertical, scrolling Repeatable under a Scrollable or a scrolling Stack | outline, blocks | — | P1 |
| H3 adaptation in a block input | blocking: a binding over 200 characters or calling `.filter(`, `.map(`, `.sort(`, `.reduce(` in `component` or `visibility` | blocks | — | P2 |
| H4 press feedback | advisory: Pressable or Card without `appearance.interactions` | blocks | — | U1 |
| H5 skeleton shape | advisory: a container shown on `isLoading` whose Loader count differs from its content sibling's leaves by more than half | outline, blocks | — | — |
| H6 status bar | advisory: no `properties.statusBar.style` | entity | entity not read → unverified | — |
| H7 cross header vs transition | blocking: `navigateToPage` into a cross-headed page as a push, or a back-arrow page as `adaptive_sheet` | events, the target's outline and blocks | target not read, or both icons → unverified | U8 |
| H8 session storage | blocking: `sessionStorage` anywhere in blocks, chains, variables or functions | blocks, events, keys, entity | — | — |
| H9 minified customCSS | advisory: one line over 80 characters | blocks | — | — |
| H10 constants, validator, one chain | advisory: UPPER_SNAKE variables outside a `constants` folder; conditional validation actions on a button with no validator function; two conditional actions on one button event | entity, keys, events | folders not read → unverified | — |
| H11 duplicate names | blocking: a data source, variable, function or folder name used twice on the page; with `--app-wide`, a data source name on two pages | ds, keys, entity, app-ds | app-wide or folders not read → unverified | — |
| H12 changed asset, same name | advisory, only with `assets.json` `[{ url, sha256, previousSha256 }]` | blocks, assets | absent → silent | — |
| H13 tab-page spacer | blocking: the body's trailing block is an empty Stack with a fixed height ≥ 40pt on a page the bottom bar opens | nav, outline, blocks | nav not read → unverified | — |
| H14 canvas widths | advisory: a fixed width ≥ 380pt | blocks | — | — |
| H15 public page reads | blocking: a public page reading a `var_` that is not its own; a folder inside a folder | paths, keys, blocks, events, entity | paths not read → unverified | — |
| H16 navigateBack result | advisory: `navigateToSpecificPage` with `pageInputs` into a page with no `onPageFocus` event | events, the target's events | target not read or chosen at run time → unverified | — |
| H17 back button kept | advisory: a page `onPageBack` chain with no `navigateBack`, `navigateToPage`, `navigate` or `controlUser` `logout` | events | the only leaving action is conditional → unverified | — |

## Output

The JSON is the shape of UnifyApps Headless's `skills/app-page-quality/scripts/page-audit.mjs`, so a quality pass can consume both: `{ page: { id, name, version }, app: { id, appType }, summary: { blocking, advisory, blocks, onLoadSources, unverified }, findings: [{ rule, severity, blockId, blockName, path, detail, fix }], candidates: { interactions, navigation, lists, writes, heavy, functionBound } }`, plus `unverified: [{ rule, detail }]` and `rules: { ran, skipped }`. The text output is a Markdown table of the same findings. Exit 1 on a blocking finding, 0 otherwise, 2 when the views cannot be read.

When UnifyApps Headless's quality pass runs too, de-duplicate by the `overlaps` column (H2→P1, H3→P2, H4→U1, H7→U8): keep UnifyApps Headless's row and this lint's severity.

## From findings to one task

A loop turns the blocking findings into one `page-bind` task on the page (never a `q<n>` id: only `plan audit` writes those), in the body style UnifyApps Headless's quality tasks use: line 1 what to read first (the cache outline and live `get_blocks` for the named ids), then one line per finding `H<n> <blockName> (<blockId>): <fix>`, then "leave every other block as it is", then the read-back line. Proof: `page-lint reports 0 blocking on <rules> after the write; get_blocks shows <the values>`. Run `task-lint.mjs` on that task before it goes out.

Unconfirmed: live mode was checked against views produced by UnifyApps Headless's own view functions over the cached entities of one app, not against a running `UnifyApps Headless` CLI in a solution folder; `entity context page` is assumed to print `{ cache: { page } }` as `page-routes.mjs` reads it. H10's "validator" and "one chain" heuristics are approximations of the memory lines; H5 compares counts, not geometry.
