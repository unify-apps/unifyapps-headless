# Find the biggest record

A "record" here is one value of the page input that picks the rows, such as one case number. Its "rows" are the rows the page's data sources fetch for that value. UnifyApps Headless reads follow [shared rules](../../loop-orchestrator/references/rules.md#ua-ownership).

## 1. Find what picks the rows

```bash
UnifyApps Headless entity context page <page> --app-id <app> --json > page.json
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-test-data/scripts/page-row-sources.mjs" --page page.json --out sources.json
```

`sources.json` lists, for the page:

| Field | Meaning |
| --- | --- |
| `reads` | Storage fetches and counts, with the object, each filter's plain field name, and the page inputs the filter reads. |
| `keys` | For each page input, the objects and fields whose rows it picks. Usually one key matters, such as a record number. |
| `automations` | Data sources that call an automation. Their rows cannot be read from config. `ua cache wf <automation> --deps` lists the objects it reads. |
| `writes` | Data sources that create, update or delete rows. These are the save and delete paths. Never run them while profiling, except on seeded rows. |

The script reads these confirmed config fields: `properties.context.resourceName` (such as `storage_by_unifyapps_fetch_records`), `properties.inputs.object_type`, `properties.inputs.triggerInputCondition.filters[].property` and `.filter.value`, `properties.inputs.page.limit`, `properties.inputs.numberOfRecordsToFetch`, and for automations `properties.inputs.automationId` and `.parameters`. Data sources name a field by its storage column (`properties_<name>`). Object tools take the plain name; the script strips the prefix (UnifyApps Headless `ua-change`, `references/task-kinds.md`, § Facts every body follows, "Field names in object steps").

## 2. Count rows per record

Rows are stored rows, so read them live with `get_records` on the `object` server. The cache never holds rows.

1. Pick the object with the most rows per key. It is usually the list the page is about.
2. Sample: `get_records` with `limit: 200` (its maximum), sorted newest first. Count rows per key value.
3. Confirm the top few: `get_records` with a filter `{field: <key field>, op: "EQUAL", values: [<value>]}` and `limit: 1`. Read `total`.
4. Do the same on the other objects in `keys` for the winner, so you know the rows on every tab of the page.

The sample is a shortcut, not a full count. Say so in the report. If the object has far more rows than the sample, page with `offset` for a few more samples.

If the biggest record has at least the target rows, use it. Report the key value and the row counts per object. Stop here. Otherwise [seed](seed.md).
