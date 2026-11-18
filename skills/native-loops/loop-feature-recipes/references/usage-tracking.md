# Recipe: usage tracking

## Contents

- When
- Questions for the person
- Entities
- Security
- Performance
- Acceptance checks
- Limits

Records who opened which page and tapped which main action, and when: one
row per event, written by the server. It collects; showing the numbers is
the [analytics dashboard](analytics-dashboard.md) recipe.

## When

"Track usage", "log page views", "which buttons do people tap", "add
analytics" when the person means collecting events. When they also say
"show", "dashboard" or "report", add the analytics dashboard recipe to the
same plan.

## Questions for the person

1. **What to track.** Default: the open of every page in scope, and the
   main action of each page (named from `ua cache blocks`). Options: the
   default · only page opens · the actions I name.
2. **Visitors with no account** (a public app or page). Default: not
   tracked. Option: tracked as anonymous, with no user.
3. **What each event holds.** Default: the event, the page, the control and
   the time; never a form value, a search term or other typed text. Option:
   also one field I name.

## Entities

| # | Kind | What | Builder | Knowledge it loads |
| --- | --- | --- | --- | --- |
| 1 | object | `Usage event`: `event` (a picklist, one code per tracked event, such as `page_open`, `approve_tap`), `page` (text), `target` (text: the control's display name), `userId` (text, set by the automation), `occurredAt` (a date, epoch milliseconds). The platform's permission filter stays on. Reporting (`logging.captureReporting`) is turned on in this task, before the first row: Analytics sees only rows saved after it is on | `ua:fde-agent` | `ua:object-storage-manager`, `ua:ua-secure-by-default`; the main session plans the fields with `ua:object-schema-designer` |
| 2 | automation | `Track usage event`, callable, as a shell, its logic and its deploy. Inputs: `event`, `page`, `target` only. It refuses an `event` that is not a picklist code, sets `userId` from `USER.id` and `occurredAt` from `RUN.currentTime`, writes one row and returns. A run with `RUN.isAnonymousUser` true writes nothing, unless question 2 said anonymous; then `userId` stays empty | `ua:automation-agent` | `ua:unifyapps-data`, `ua:resiliency`, `ua:ua-secure-by-default` |
| 3 | page bind, one per tracked page | One manual data source (`runBehaviour: "manual"`) that calls `Track usage event` with its inputs from one object page variable. The page open: an `onPageLoad` action runs it after a `delayDuration`. Each tracked tap: one `setPageVariable` `MERGE` of the event's inputs, then `controlDataSource {dataSourceId, method: "trigger"}`, as the last two actions of the tap's chain. No `showNotification` on its success or failure | `ua:app-agent` | `ua:app-design`, `ua:app-page-build`, `ua:app-native`; the sheets `actions/control-data-source`, `actions/set-page-variable`, `ai-editing/action-nodes` |

No page shows the events. The dashboard reads them through an automation
of its own.

## Security

- **Identity from the server.** The automation sets `userId` from `USER.id`.
  No input, page variable or binding holds a user id, a name or an email. A
  source that sends a user id lets any caller write events as anyone: the
  build stage's rule H1 (no identity parameter) fails the bind.
- **Only codes and names.** `event` is checked against the picklist on the
  server; `page` and `target` are the names the build wrote. Typed text
  never goes into an event: it can hold personal data.
- **One writer.** Only the automation writes the object. The object keeps the
  platform's permission filter; no page reads it directly.
- **An empty user is never an owner.** A run with no signed-in user has an
  empty `USER.id`; the automation branches on `RUN.isAnonymousUser` first.
- **A public page.** A callable a public page reaches can be called by
  anyone, again and again. Default: no tracking on public pages (question 2).

## Performance

- **A tap never waits on tracking.** The track actions come last in the
  chain, after what the person sees (the navigation, the toast, the flipped
  state); nothing is chained after them, and their failure shows nothing.
- **The page open is deferred.** The `onPageLoad` track action waits a
  `delayDuration` of 150–300 ms, as the X5 rule defers work, so it never
  competes with the page's own first data.
- **Not a page-load source.** A source with `runQueryOnPageLoad` would count
  in the page's on-load budget (P3: advisory at 2–4, blocking at 5).
- **One small write.** The automation reads nothing before its write: no
  lookup, no loop.
- **Deliberate taps only.** Never typing, scrolling or each row of a list.
  The rows grow with use; only Analytics reads them in bulk.

## Acceptance checks

1. **`acceptance`: a page open is tracked.**

   ```
   1. Open <Page> (<route>)
   2. Expect: <Page> shows "<its title>"

   Effects:
   - run Track usage event (<automation id>) · success · after step 1
   - record Usage event (<object id>) · newest row of the test user · event = page_open
   ```

2. **`acceptance`: a tap is tracked, as the test user.**

   ```
   1. Open <Page> (<route>)
   2. Tap <action> (<block display name> b_…, label "<label>")
   3. Expect: <what the tap shows, unchanged by tracking>

   Effects:
   - record Usage event (<object id>) · newest row of the test user · event = <action>_tap
   - record Usage event (<object id>) · newest row of the test user · userId = <test user id>
   ```

   The second line proves the server set the user: no step could send it.

## Limits

- **Unknown:** whether a `controlDataSource` trigger holds the next action
  of a chain until its call answers. The builder reads
  `actions/control-data-source`; the track actions stay last either way.
- **Unknown:** whether the platform limits how often one caller may run a
  callable. UnifyApps Headless's knowledge does not say.
- **Not tracked:** time on a page and leaving a page. UnifyApps Headless's knowledge
  names no event for leaving a page (`onPageFocus` fires on a return).
- **Test rows stay.** The checks' events belong to the test user; removing
  them is a delete the person approves.
