# Recipe: analytics dashboard

## Contents

- When
- Questions for the person
- Entities
- Security
- Performance
- Acceptance checks
- Limits

A page of numbers: tiles, charts and a short table, from one automation that
groups the rows with Analytics. The rows may be the app's own records or the
events of the [usage tracking](usage-tracking.md) recipe.

## When

"Add analytics" when the person means showing numbers, "a dashboard of …",
"KPI tiles", "show requests by week", "how many were approved". When the
numbers are about use of the app and nothing collects it yet, add usage
tracking to the same plan.

## Questions for the person

1. **Which numbers.** Default: from the person's words and the objects in
   the cache, a count per day for the last 30 days and a total per status.
   Options: the default · the tiles and charts I name.
2. **Whose data.** Default: the signed-in person's own rows, when the object
   holds an owner. Option: everyone's, for one existing permission group I
   name.
3. **Where.** Default: a new page with a tab.
   Option: a region on <an existing page from the cache>.
4. **The time range.** Default: the last 30 days, fixed. Option: a picker on
   the page.

## Entities

| # | Kind | What | Builder | Knowledge it loads |
| --- | --- | --- | --- | --- |
| 1 | object (change) | Reporting (`logging.captureReporting`) on for each object the dashboard groups. Analytics sees only rows saved after it is on; rows already stored are not copied | `ua:fde-agent` | `ua:object-storage-manager` |
| 2 | automation | `<Dashboard> numbers`, callable, as a shell, its logic and its deploy. One call returns every tile and every series of the page. Inputs: the time range only (question 4). It groups with Analytics, one grouped query per series, never one query per item; it filters by owner from `USER.id` (question 2, own rows), or checks the caller's group from `USER`'s `staticUserGroups` and `dynamicUserGroups` (everyone's rows). It returns numbers, never rows of other people | `ua:automation-agent` | `ua:unifyapps-data` (§ Analytics and reports), `ua:data-fetching`, `ua:performance`, `ua:dates-and-time`, `ua:ua-secure-by-default` |
| 3 | page layout | `stat-card` tiles (the shared web block); a `chart` only as line (a trend), pie or gauge (bar and column draw nothing on the phone); a comparison as rows or tiles. A loader over each data region, and empty and error states (X1, X4). Charts below two screens deferred (X5) | `ua:app-agent` | `ua:app-design`, `ua:app-craft`, `ua:app-page-build`, `ua:app-native`; the sheets `blocks/chart` (and its sub-sheets), `blocks/stat-card` |
| 4 | page bind | One automatic data source (`runBehaviour: "automatic"` with `runQueryOnPageLoad: true`) calling `<Dashboard> numbers`; every tile and chart binds to it | `ua:app-agent` | as row 3 |
| 5 | page review | The page against its `job` and `design` lines, with real numbers | `ua:page-reviewer` | — |
| 6 | tab | A tab or a push for the new page, as the run settings say, limited to the permission group of question 2 when there is one | `ua:app-agent` | `ua:app-native` (navigation) |

## Security

- **Identity from the server.** "My numbers" filter on `USER.id` inside the
  automation. No input holds a user id.
- **Everyone's numbers need a group.** The page's tab is limited to an
  existing permission group, and the automation checks the group too: a
  page's permission does not protect a callable. UnifyApps Headless cannot make a role;
  a missing group is an `unverified` line naming the admin who makes it.
- **Numbers, not rows.** The automation returns counts and sums. A table of
  people or records is shown only when the person asked for it.
- **SQL only with bound values.** A structured report first; reporting SQL
  only with resolved tables and columns, and values bound through the
  operation's parameters, never joined into the text (`unifyapps-data`).

## Performance

- **One source, one call.** Every tile and chart reads one on-load source
  (P3: the page's on-load budget). Never one source per tile.
- **Grouped at the source.** Analytics groups and counts; the automation
  never fetches rows to count them, and never runs Analytics in a loop
  (`performance` § Data fetching).
- **A cache only on a yes.** The read writes nothing; a cache with a time to
  live fits when the person accepts numbers a few minutes old (`performance`
  § Caching). Default: no cache.
- **Charts are heavy.** A chart below the fold waits behind a deferred page
  variable or a tab (X5).

## Acceptance checks

1. **`acceptance`: the dashboard opens with numbers.**

   ```
   1. Open <Dashboard> (<route>)
   2. Expect: the tile "<label>" shows a number, and the chart "<title>" shows at least one point

   Effects:
   - run <Dashboard> numbers (<automation id>) · success · after step 1
   ```

2. **`acceptance`: a new row moves a number** (only when the run settings
   allow the check to save).

   ```
   - Writes: one <record> named ZZ_LOOP_build_<n>, as the test user — allowed in the run settings
   1. Open <Dashboard>; note the tile "<label>" (value A)
   2. Open <the page that adds a record>; add one named ZZ_LOOP_build_<n>
   3. Open <Dashboard> again; reload every 10 s, at most 60 s, until the tile changes
   4. Expect: the tile "<label>" shows A + 1

   Effects:
   - record <Object> (<object id>) · name = ZZ_LOOP_build_<n> · status = <status code>
   ```

## Limits

- **Charts:** only line, pie and gauge render on the phone; bar and
  column draw nothing, and every other type draws as a pie
  (`app-native`'s block catalog).
- **Unknown:** how long a new row takes to reach Analytics
  (`unifyapps-data`: Analytics results may be eventually consistent). Check
  2 waits at most 60 s; a row that is saved but not yet counted is reported
  to the person before a fix task is planned.
- **Unknown:** which structured reports the tenant has. The automation agent
  resolves them live.
- **Old rows:** turning reporting on copies no row already stored. Counting
  them means saving them again, a task of its own the person asks for.
- **Roles:** UnifyApps Headless cannot make a permission group.
