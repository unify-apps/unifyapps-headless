# Loading, empty and error states

Every data-bound surface says what is happening.

77 rules: P0 3, P1 27, P2 46, P3 1.

## P0

- Never bind appearance.loading to a value that stays true; the button never presses.
- Set a Table's isDataEmpty to a row-count test; unset shows the empty state forever, a missing-data test shows it before load.
- Put a step that must not run on failure in the failing node's onSuccessActions; sibling actions run even after an error.

## P1

- Add empty state condition when using empty state slot in tables.
- Gate every data region with a `CONTENT` Loader shown when neither `data` nor `error` exists; render chrome immediately. (mobile only)
- Bind `appearance.loading` on source and submit buttons, and add `showNotification` on success and error of writes. (mobile only)
- Give every data region an empty state tested by length and an error state on `['error']`. (mobile only)
- Every data-bound block has a fallback or an error block driven by failureEvents.
- Mutations have onErrorActions or the source has failureEvents.
- Show the empty state only when the source succeeded; a failed or refused answer never reads as no items yet.
- After a successful submit, close the modal or reset the form, and disable submit while the write runs, so no duplicate booking.
- Guard each create or save tap with a runCondition on the source's isLoading and send a client request id so repeats are ignored.
- Bind each upload slot to the upload's uploading and error state (progress, failed, retry) and disable Continue or Save while any upload runs.
- Format-check every field whose name implies a format: email, phone of 7 to 15 digits, number in range, a real date.
- Never clear a form's fields before its write resolves.
- Remove a new Form's seeded 'Form submitted successfully' notification unless a real save runs before it.
- Write and read a value pages share under one name in one store (app variable, session, local storage, page input) on every page.
- Reset the variable bound to a ConnectionFormModal's isOpen in On Close; it opens on change, so a leftover true never reopens it. (web only)
- Set resetFormWhenHidden false on a Form inside a Modal or Drawer whose typed values must survive closing it.
- Use a validation rule, not required, to force a box ticked or a toggle on; required passes when it is off.
- Write form validationRules for the VALID state; a rule written for the invalid state passes every bad value.
- Pair date field minDate and maxDate with dateRangeLimit, or out-of-range values from defaults or bindings submit.
- Don't rely on required for an OTP field; a single digit passes, so validate the full length.
- Give a CONTENT Loader styles.width w-full and a real height; a w-fit skeleton renders nothing.
- Test emptiness on the bound row path plus ['length'], never data['length'] on the envelope or data MISSING.
- Hang refetch success toasts and retries on the data source's own onSuccess and onFailure, not on a controlDataSource node.
- Check mediaUploads errors after an upload; maxFiles drops extra files silently and success fires on partial uploads.
- Save unsaved input on the action that navigates away; there is no leave or unload event, except the Android back button a mobile page takes with the onPageBack trigger.
- Give bindings on required page inputs a fallback or an on-page message; required stops no navigation.
- Read upload failures from mediaUploads errors[blockId], never an entry's error or hasError.

## P2

- Provide loading feedback for button-triggered data sources.
- Add failure handling for manual data sources.
- Use Content loader type for enhanced UX.
- Provide Loading Feedback for Action-triggered Data Sources.
- Apply loading, empty and error rules only where a data source exists.
- Bind `appearance.loading` on submit and data-calling buttons to the source's `['isLoading']`.
- Don't also set `disabled` on a button that has `appearance.loading`.
- Add a sibling Loader beside every data-bound Repeatable, Table and Chart.
- Use the `CONTENT` skeleton loader, not the arc spinner.
- Give a `CONTENT` skeleton an `appearance.styles.backgroundColor`.
- Give the data block the inverse visibility of its loader.
- Leave press feedback on (`appearance.interactions`).
- Give every data-bound block an empty state.
- Add error states bound to the source's `['error']`.
- Don't use a Repeatable's header slot as an empty state.
- Flag a submit or action control wired to only one of success or failure.
- On a pre-integration app, map every place a data source will land as the integration checklist.
- Size the skeleton to the real block's box.
- Flip small toggle and favourite writes optimistically, reverting with a snackbar on error. (mobile only)
- Apply the U1 and X1 fixes to the navigation target page too. (mobile only)
- Empty states tell "no results" from "nothing yet".
- Optimistic updates revert in onErrorActions.
- A batch mutation's failure says which items failed.
- A control with a cap or precondition tells the user why it refuses; no silently ignored tap, no enabled button with nothing chosen.
- An error state offers a retry that re-runs the failed source or download.
- Give every network-dependent mobile page a No internet state and a separate Network error state, not only an empty or loading one. (mobile only)
- Give every Map block a no-location fallback (hide it or show a state) when a record has no coordinates, instead of a blank map. (mobile only)
- Show a skeleton or nothing until the user context resolves; never a fallback person like 'John Doe' or 'Demo User'.
- Format-check an optional field once the user types in it; optional means it may be empty, not that anything goes.
- Never disable submit as the way to block invalid input; run validation and show the errors. Disable only while saving.
- Never format-check sign-in username and password, or free-text notes fields.
- Give a load error a plain message and a retry action, not only an error flag.
- Handle 401 by sending the user to sign in and 429 with a rate-limit message, apart from 403 and 404.
- Show a read-only view with the reason when a user may view a record but not edit it.
- Branch a callable source's onSuccess on the automation's returned status; a failed run still answers HTTP 200.
- Disable a validator-gated button with canContinue NOT_EQUAL 'true' so it stays disabled before the validator first runs.
- Keep a value the flow needs after a reload in local storage or the page address, not only a page variable.
- Under userContext['context'] read device and geography; paths through deviceInfo or location read nothing there.
- Tell users the allowed range on number fields; an out-of-range value is cleared with no message.
- Don't treat TextArea maxCharacters as validation; values from defaultValue or setValue are not truncated.
- Don't hide a Drawer to clear its inputs; reset the fields, since reopening shows the old values.
- Show an infinite list's bottom loader on isFetchingNextPage; isLoading stays false for page 2.
- Don't use a page's loader key for its own slow data; only template component placements read it.
- Treat a missing device permission as not asked yet, not denied, before showing a blocked message. (mobile only)
- Seed a ButtonGroup-driven view from a page input or variable; selectedOptionId is empty until the first click.
- Render a count that has not loaded as a loader or dash, never 0.

## P3

- Don't give KeyValue fields a fallbackValue when hideNilValueFields is on; fallback fields are never hidden.
