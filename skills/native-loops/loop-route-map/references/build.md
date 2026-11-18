# Build the routes

You find every way into a page by reading config, not by tapping around. The output is a routes JSON file a device step walks, one tap per hop. Reads only; no tenant write, no device.

## What you need

- A folder set up for UnifyApps Headless, bound to the solution that holds the app. `UnifyApps Headless` and its read rules are in [shared rules](../../loop-orchestrator/references/rules.md#ua-ownership).
- The app id and the target page (id, name or slug). If the person gave an app link, the app id is in it. `ua cache app <app>` confirms the id and lists the pages.
- Node. The script has no dependencies.

## Steps

1. **Read the app's menu and page addresses.**

   ```bash
   UnifyApps Headless cache nav <app> --json > nav.json
   UnifyApps Headless cache paths <app> --json > paths.json
   ```

2. **Read the events of every page.** One file per page, in one folder. Use every page in `paths.json`, not only the ones you think matter. A route often passes through a page nobody expected.

   ```bash
   mkdir -p pages
   for id in $(node -e 'for (const p of require("./paths.json").pages) if (p.path) console.log(p.id)'); do
     UnifyApps Headless cache events "$id" --app-id <app> --json > "pages/$id.json"
   done
   ```

   `ua entity context page <id> --app-id <app> --json` output works too. It is larger, so use it only when you already have it.

3. **Build the routes.**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-route-map/scripts/page-routes.mjs" \
     --pages pages --nav nav.json --paths paths.json --target "<page>" --out routes.json
   ```

   `--from <page ids>` starts somewhere other than the default page. `--max-hops` (default 8) and `--max-routes` (default 10) bound the search.

4. **Read `notes` first.** They say when a page could not be read, when the target has no address, or when no route was found.

5. **Report** the routes as a short list: page names joined by `>`, and for each hop the block name and its event. Mark a hop that needs a row tap, a condition, or a data source to finish.

## The output

| Field | What it holds |
| --- | --- |
| `routes[]` | Easiest first: fewest hops, then plain taps before conditional, row or callback hops. Each hop has `use` (an edge index) and `alternatives` (other edges between the same two pages). |
| `edges[]` | Every page-to-page move: `from`, `to`, `action`, `history`, `pageInputs`, `modal`, `rowScoped`, `via`. |
| `incoming` / `outgoing` | Edge indexes into and out of the target. Use `outgoing` for "leave the page" steps. |
| `plainBacks` | Plain back actions on the target. |
| `dynamic` | Moves the graph cannot follow: an address path, a page id that is a binding, or an app data source no page triggers. |

`via` says where the event lives: `kind` (`block`, `page`, `data-source`, `menu`), the block or source `name` and `id`, `eventType`, and `conditional`. For a data source, `triggeredBy` lists the blocks that run it.
