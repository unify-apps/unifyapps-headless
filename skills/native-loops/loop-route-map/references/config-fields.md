# Config fields and edge cases

## Fields the script reads

Each was confirmed in the UnifyApps Headless plugin's code (`scripts/lib/cache-views.mjs`, function `eventView`) and in real `cache events`, `cache blocks` and `entity context page` output.

| Where | Field |
| --- | --- |
| Block events | `properties.blocks[<id>].events[]`, each `{ id, eventType, action }` |
| Page events | `properties.interactions.events[]` |
| Data source callbacks | `properties.callbacks.successEvents[]` and `.failureEvents[]` (`cache events` shows them as `onSuccess` / `onFailure`) |
| The action | `action.actionType`, `action.payload`, `action.id`, `action.runCondition` (a condition) |
| `navigateToPage` payload | `pageId`, `pageInputs`, `history` (`push` or `replace`), `target`, `overridePageAnimation`, `pageTransitionBehavior`, sometimes `pageParams` |
| `navigateBack` payload | `navigateToSpecificPage`, `pageId`, `pageInputs`, `pageParams` |
| `navigate` payload | `path`, `history`, `target` |
| Who runs a data source | `controlDataSource` actions, payload `dataSourceId` and `method` |
| Menu | `cache nav` JSON: `defaultPage.id`, `primary[].pageId`, `primary[].type`, `devices[].navigator` |

The payload meanings come from the UnifyApps Headless `app-design` skill (`references/navigation.md`, § Page events that move the person) and the `app-native` skill (iron rules 11, 15 and 16). Read them there.

## Things to know

- An app data source shows up in every page's `cache events` output. The script counts it once, and gives it the pages whose blocks trigger it.
- A `navigateBack` is a jump to a page only when `navigateToSpecificPage` is `true` and `pageId` is set. Otherwise it is a plain back, which depends on the stack.
- `rowScoped: true` means a page input reads `['context']['item']`. That is a tap on one row of a list. The hop needs a row with data ([loop-test-data](../../loop-test-data/SKILL.md)).
- A `replace` hop removes the page underneath. Back after it does not return to that page.
- Unconfirmed: a hop on a block inside a bottom sheet, drawer or modal needs that container open first. The script does not detect this. Check the block's parents with `ua cache outline <page> --app-id <app>`.
- Unconfirmed: conditions (`conditional: true`) are not evaluated. A route through one may need specific data.
