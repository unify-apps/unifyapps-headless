# Data sources and queries

The right query, bounded, triggered at the right time, refreshed after writes.

108 rules: P0 11, P1 68, P2 26, P3 3.

## Contents

- P0
- P1
- P2
- P3

## P0

- Delete and update mutations are constrained by a record id or filter.
- Callable data sources bind to a deployed automation; a saved but undeployed one fails at run time while the build looks fine. (web only)
- Every data source calls a deployed callable whose inputs match its parameters by name and type.
- Bind a FileUpload uploadFolderPath to a record, user or date; a constant path makes each upload replace the last.
- Give an entity Form an action, or submit reports success and writes nothing.
- Don't wire your own save onto an entity Form's submit; it already saves the record, so a second write duplicates it.
- Keep a Form's initialFormData to field keys only; an extra key like a record id makes submit fail and onSubmit never runs.
- Give a Table with editable columns an identifier; without it every edit is thrown away.
- Wire an onSave handler to a Table's saveAction add-on; without it inline edits are lost on reload.
- Write Razorpay amounts in the smallest unit (paise); 100 is one rupee.
- Send only uploaded files: filter mediaUploads on isUploaded before passing urls to a data source.

## P1

- Disable run on page load for automatic data sources.
- Use manual data sources for nested tables.
- Don't trigger a data source right before a Go to Page action.
- Run periodic queries no more often than every 5 seconds.
- Use debounce, not delay, for onChange data source triggers.
- Use `['context']['item']` inside rows and `['selectedItem']` in the Repeatable's own events.
- Point every Table column over a Storage source at `properties.<field>` in its `fieldKey`.
- Trigger one network refresh per interaction: one `setPageVariable` `MERGE`, no extra `controlDataSource`. (mobile only)
- List fetches set paginateBy and a limit; MULTIPLE without a limit is unbounded.
- Dependent reads refetch after a create, update or delete.
- refetchOnWindowFocus off for mutations and reference data.
- Fetch unchanging data once: no per-tap automation for local compute, no needless refetch, cache lookups. (mobile only)
- Each data source answers the question the screen asks.
- Aggregate at the source, not in a page function over thousands of rows.
- A selection-driven refetch never re-downloads an unfiltered heavy source.
- A page never falls back to a hardcoded demo user, record or file when its input id is missing; show a not-found state.
- Run filter, search, sort and counts in the source query; a client-side function over a capped page hides records.
- A list source's limit and offset must be exactly the list's pagination pills; any wrapper expression turns paging into one fetch. (web only)
- A variable copied from a page or module input is re-synced when the input changes; validation reads the live source, not the stale copy.
- Handle a mutation's outcome in its onSuccess and onFailure; sibling actions after the trigger run before the answer exists.
- Filter keyword fields with EQUAL or IN; CONTAINS on a keyword field in a storage fetch silently narrows to the viewer's own records. (web only)
- Inside a Table CUSTOM cell or Repeatable row, read a cell block's value from the row context or event, never b_<id>['value']. (web only)
- A source that reads variables or blocks not set yet on load carries a disable condition until its inputs resolve. (web only)
- A list source has no silent 200-row default cap; set paginateBy, limit and a pager or rows past the cap vanish. (web only)
- Keep holds, lockouts and expiry deadlines in a server-owned record; a page-variable timer restarts on reopen and blocks nobody.
- Refetch a page's main source on page focus when its data changes on another page, skipping the first open; native keeps old pages mounted. (mobile only)
- Filter page reads of tables that grow every day by date, with a default range when the user picks none.
- Resolve related names from one loaded list mapped by id; never one request per row.
- After a write, also refresh other sources the page derives from it, such as an audit trail or a count.
- Write a file into a file-uploader field as the file descriptor object, never a bare URL string; a string stores {}.
- Never store a file as base64 in a record field; store the uploaded file's URL or descriptor.
- Write the record only after the upload finishes; never save a preview blob: URL.
- Filter rows in the data source, never by fetching everything and filtering in a page function.
- Check every label a state binding picks against the row's real values; state names that don't match the data show wrong labels.
- Put a callable's inputs under inputs.parameters; inputs left under callable_loader are stored but never read.
- Turn refetchOnWindowFocus off on a source whose onSuccess sets page variables; each return to the tab resets that state. (web only)
- Run a data source that calls a writing automation as manual, never automatic.
- Never bind a page variable in an app-scoped data source; an app-level binding reads only global variables.
- Filter a storage fetch only through inputs.triggerInputCondition in its documented shape; any other shape silently returns every row.
- Totals computed from fetched rows count only the fetched page (limit 20 by default); compute totals at the source.
- Replace a layout's literal sample in content.data with a real binding before release; sample rows on screen prove nothing.
- Navigate or show a success toast only in the write's onSuccess, never earlier in the same chain.
- Every bound path exists in its source's output schema.
- A refresh timer triggers only its region's source, never every source or one whose onSuccess sets page variables.
- Leave no sample people, numbers or dates from the design where a source's data belongs.
- Never bind an editable input's default or seed value to a source that refreshes; each refresh overwrites what the user typed.
- Bind a Filters block's value into each consuming source's filter input; listing sources in dataSourceIds filters nothing.
- Don't test an untouched form checkbox or toggle for false; it submits no key at all.
- Never give a form option the value 0 or empty string; it is replaced by the label.
- Give form options explicit value and label when anything matches on value; bare strings get camel-cased values.
- Give a phone field a default country when the code is hidden; the submitted dialCode is otherwise 91 for everyone.
- Bind a Repeatable, TreeView or Table data to the record list, never the response envelope object.
- Keep an entity Table's inputs bindings; clearing them disconnects the toolbar filters from the server.
- Use controlDataSource method trigger only; refresh, run or reload run nothing.
- Don't add queryKeyPrefix to an ordinary trigger; its result is filed under another key and every binding reads nothing.
- Use deleteFile per file, not resetMediaUploads, to remove one block's files; reset clears every block on the page.
- Point exportData at a data source on this page to export all records; a bound visible-rows list exports only the browser view.
- Use REMOVE with a key, never CLEAR, to drop one local storage value; CLEAR wipes every key the app stored.
- Filter long lists on the server (triggerInputCondition or searchField); a {{ }} filter over fetched rows sees one page.
- Store a data source's resolvedFilter.filter as a string binding and IN lists flat; a nested list returns zero rows.
- Make a source page-scoped when its limit or offset binds to a Table or Repeatable's pagination state.
- Read fetch-records rows at data.objects and the total at data.total; never bind an invented result field.
- Run data-dependent work on the source's onSuccess, not onPageLoad; page-load queries are still outstanding there.
- Don't seed a page variable's initialValue from another page variable; it reads nothing at init.
- Seed boolean variables with "true" or "false" only; "0" or "no" start as true.
- Inside a row template read sibling blocks by plain id; never assemble runtime block ids from a row index.
- Trigger a manual source before a block needs it, and use queryDisabled to hold an automatic source with empty inputs.
- Bind an infinite Repeatable's source limit and offset to exactly its pagination pills; any expression around them stops paging.

## P2

- Move data source triggers before page navigation.
- Merge data sources fetching the same resource with the same inputs.
- Check every page variable's `initialValue` parses; no literal newline inside a JSON string.
- Read a block's own state like `b_<id>['value']` instead of a page variable copying it. (mobile only)
- The limit matches what the UI shows; no 1000-row limit for a list view.
- Use MQTT instead of polling where a topic exists; poll no faster than 5 s.
- Give UI-gating page variables an initial value.
- Store ids, not row indexes, for selections.
- Page a Repeatable past ~50 rows as `INFINITE`; turn `collectChildStates` off when nothing reads `instances`. (mobile only)
- runQueryOnPageLoad only when the page needs the data before any action.
- Independent sources run in parallel, not chained through dpOn.
- Do not trigger a run-on-load source again from a page focus or load event; one fetch per open.
- Expect an analytics-store record to reach list reads after a delay; don't show it from a refetch right after the save.
- After a write, refresh only the sources it changed, never every source on the page.
- Fetch a value every page needs once, as an app-scoped source, not as a page source repeated on each page.
- Name the Repeatable, never the data source, in a row child's dpOn.
- Don't both run a source on page load and trigger it again from onPageLoad.
- Give an onChange-triggered source a runCondition when only some values need its result.
- Don't refetch a source from onPageFocus when it already refetches on window focus.
- Feed every dashboard tile and chart from one on-load source, never one source per tile.
- Sort a paginated fetch on a stable key with a unique tie-breaker so pages don't skip or repeat rows.
- On mobile, turn on Refetch on page focus for a list a pushed page edits; it is off by default, so the list is stale on back. (mobile only)
- Give a storage SET or SET_IN a value; an absent value deletes the key.
- Chain page-load sources through onSuccess when one needs the other; independent sources are released together.
- Don't expect a page variable to survive a reload; persist values that must last in storage or a record.
- Wrap even a single data filter condition in a group, and use field ids, not output schema paths.

## P3

- Delete page variables nothing reads when this task created them; report the others.
- includeTotalCount only when a paginator shows the total.
- Know that textTransform changes the stored value, not just how it looks.
