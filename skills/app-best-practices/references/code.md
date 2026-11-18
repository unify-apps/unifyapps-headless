# Custom code and expressions

Page functions, scripts, bindings and custom CSS that are correct and earn their place.

130 rules: P0 1, P1 54, P2 54, P3 21.

## Contents

- P0
- P1
- P2
- P3

## P0

- Use only operators in the condition menu; an unknown one like ICONTAINS throws and the whole condition tree reads false.

## P1

- Custom CSS should be valid.
- Fix custom CSS marked invalid before publishing.
- Fix custom CSS the save marked invalid (`additional.isCustomCSSValid: false`).
- Make a page function read its source in the body as `{{ e_<dsId>[…] }}`, so `dataSourceIds` is non-empty.
- Store flags as condition objects, never a raw `{{ a && b }}` string.
- Test array emptiness with `.length == 0`, not an is-empty check.
- Remove IIFEs and parser-breaking filter operators from bindings; move aggregation into a page function.
- No early return followed by more logic.
- No window.open or document access in functions; use platform actions.
- Page-load code never reads block state before blocks mount.
- Variable types match their use (no .map on a string).
- Visibility operators and values match the bound property's type.
- Never leave `{{ }}` layout arithmetic inside display text.
- Never put a // comment inside a {{ }} binding; it silently empties the value. (web only)
- An automatic page function must not read a manual data source; it loses the dependency and goes blank after each refetch. (web only)
- No literal date or timestamp stands for today or now; compute it at run time in the user's time zone, not UTC.
- Mint record numbers on the server and show the returned code; never build them in the page with random, Date.now or count + 1. (web only)
- For a paginated source test emptiness on totalRecords or the first row's id; the pager wraps an undefined list as [null] so length is 1. (web only)
- Page and app scripts may reach only user, customer, environment and modules; they cannot read blocks, variables or sources. (web only)
- Write controlBlockMethod's methodName as a literal; a binding there matches nothing and the step does nothing.
- No async work (await, fetch, a promise) inside a binding; bindings are synchronous.
- Read a page function as func_<id>['value']; never call it with ().
- Never rely on a set-value action to fire the target's onChange; programmatic changes fire no user event.
- Treat platform dates as epoch milliseconds, never seconds; a date-only string means midnight UTC.
- Never read document, window, localStorage or fetch in a {{ }} binding; read-only evaluation answers undefined for all of them. (web only)
- Wrap a condition stored in appearance.disabled, readOnly or loading as {type:'filter',payload}; a bare group is truthy forever.
- Write a disabled condition for when the control should NOT work; an inverted one kills it exactly when it is needed.
- Treat a date field's epoch value as milliseconds when passing it on to an API.
- Never carry a {conditionalValueFilters, defaultValue} wrapper into appearance.disabled; it is not collapsed there and stays truthy.
- Gate a stepper's Next action with a runCondition; allowNavigation only blocks clicking the track.
- Match stepper visibility conditions on a step's value, never its label or an invented id.
- Write an IN or NOT_IN list as a {{ [...] }} binding; a raw JSON array is wiped the first time a maker opens the condition.
- Put page-state logic in {type:'filter'}; a {type:'boolean'} payload holding an expression string always reads true.
- Store a runCondition as a condition object; a bare string fails silently.
- Don't let a later action depend on a debounce or throttle node; those run unawaited and the next one can't see their work.
- Write emitPageEvent eventType verbatim from the page's declared events, never as a binding or invented key.
- Signal executeScript failure through a page variable; a throw inside the script is caught and onErrorActions never fire.
- Reference entities in scripts by id, never by display name, and never put {{ }} inside a script string.
- Guard importObjects with a runCondition on objectId; an empty id stalls the whole chain silently.
- Use SET_IN and path for session storage, SET and key for local storage; the wrong vocabulary stores nothing.
- Give every setPageVariable an operation valid for the variable's type; absent or misspelled silently does nothing.
- Wrap a single item as {{ [item] }} for array APPEND or PREPEND; a bare item is rejected and the array unchanged.
- Guard shareEntityRecord with a runCondition on entityId; an unloaded id reports success with no dialog.
- Never return a Promise from a page function; it becomes undefined with no error, so do async work in a data source.
- Gate a button on a validator with NOT_EQUAL "true", not EQUAL "false"; before the first run the value is undefined.
- Trigger a manual validator after each field write and on onPageLoad; it never runs by itself.
- Guard every level of a nested binding read with ?.; a missing key voids the whole expression, its fallback included.
- Test deviceContext biometric.available, not the biometric object, which is truthy on every web page.
- Compare envVariables against strings ('5', 'true'); a number or boolean comparison is always false.
- Format dates with MM for month (not mm) and pass values with a time; a date-only value prints a day early west of UTC.
- Never call utils.downloadFile from a displayed binding; it fires on every recompute.
- Read a block's own value in its handlers as b_<id>['value'], never self, this or bare value, which clear silently.
- Use only preset names in formatDateByFormatType and convert ISO or epoch text to a Date first; relative presets throw on the wrong text.
- Use /* */, never //, for comments inside {{ }}; bindings are joined onto one line and // empties the value.

## P2

- Use `Reset Fields` instead of `Reset Field`.
- Use `Set Fields Value` instead of `Set Field Value`.
- Reuse the page function instead of a Run Script with the same code.
- Remove banned custom CSS: viewport units, `position:fixed`, `cursor` without an event.
- Check custom CSS keys are real CSS properties.
- Move app-chrome rules from a block's custom CSS into the app's custom code header.
- Scope app-wide header/footer CSS under `.nocode-navigation-container`, `.interface-theme` or `html:not(:has(.ua-builder-side-nav))`.
- Name the block, `[data-block-id='<id>']`, in every top-level rule of a block's custom CSS.
- Move a `{{ }}` out of custom CSS into an HTML attribute and select on that attribute.
- Move `@font-face` and `@import` out of block custom CSS into the page or app header.
- Narrow page or app header `<style>` rules to a block id, a set attribute or an app-wide scope.
- Lift every `<script>` in page or app code to the top level.
- Make a page function read every source in its body; split multi-source automatic functions. (mobile only)
- No WIP names (Temp_, _v2, _copy) or TODO and FIXME left in bodies.
- A function's name matches what its body does.
- One return shape per function.
- Guard nested reads of variables that may not be set yet.
- Time-axis aggregations fill empty buckets with zero.
- Empty array, null and missing key are handled the same way.
- Compare and format dates with an explicit timezone.
- Wait for a script loaded in the app custom code header (such as the Teams SDK) before On page load code reads it from window. (web only)
- Never pick a page, branch or value by matching visible text such as a title or label; use an id or key from the data.
- Keep one copy of each mapping (status to stage, category list, catalogue); copies drift and give different answers.
- Put a device-specific CSS change in @media; a device on a block customCSS edit is ignored. (web only)
- Don't read var(--ds-*) from page header or footer markup; it sits outside .interface-theme and gets no value. (web only)
- Guard globals in page and app scripts and undo timers and listeners on __CLEANUP__; a script can run twice and throws silently. (web only)
- Never write a bare app-header rule on [data-nav-root], .ua-side-nav-item, .MuiDrawer-content or .bg-workspace; it restyles the builder. (web only)
- Guard a controlBlockMethod whose blockId comes from storage with a runCondition that the key exists.
- Write session storage through its action, never the setValue method, which resolves and stores nothing.
- Keep regex, length checks and validation messages out of blocks and actions; read one validator function's result.
- No condition that is always true or always false.
- Read a Table's page size as b_<id>['content']['page'], with no addOns segment.
- Never store an empty condition group; empty AND is always true and a group without filters is always false.
- Write condition operands as strings ("0", "true"), never raw numbers or booleans.
- Don't use MIN_LENGTH or MAX_LENGTH on arrays; they are string-only and read false.
- Keep block-condition operators and form-validation operators apart; each surface offers a different menu.
- Don't rely on executionType debounce or throttle inside onSuccessActions or onErrorActions; it is ignored there.
- Guard actions whose target id is a binding (blockId, drawerId, modalId) with a runCondition; empty on first run they reject.
- Put ackPreStart or ackPreEnd first in a walkthrough hook chain; the tour waits only one second.
- Copy JSON to the clipboard with {{ JSON.stringify(x) }}; a bound object copies as unquoted text or [object Object].
- Write navigate preserveSearchParams as a real boolean; a binding or "false" counts as true.
- Write each validation rule, pattern or message once in a manual validator function and have blocks read its result.
- Escape third-party {{ }} templates in custom code scripts; every {{ }} in script text is evaluated. (web only)
- Don't use page custom code to style or read blocks; it can't see app state and breaks when markup changes. (web only)
- Call action members (navigateToPage, showNotification) from event actions, never inside a read-only binding.
- Read Razorpay errors by description, reason and numeric code; read UAE Pass errors by message.
- Never name a local storage key setValue, clear or values; they are shadowed.
- Guard queryMeta.basePath and location.origin before joining them into a URL; absent values write undefined.
- Compare pageParams as text and pageInputs as their declared type; mismatched types never match.
- Read user phone at contactDetails.phoneNumber and tenant attributes under customProperties.
- Pass formatNumber an object with value and an explicit locale; a bare number renders NaN and grouping varies per visitor.
- Compare deviceContext location status in UPPER case (USER_DENIED) and networkType as Wifi; lowercase never matches. (mobile only)
- Key app-wide custom CSS on data-* attributes, not block ids, which change when blocks are cloned or re-created. (web only)
- Test for an empty string with MIN_LENGTH "1" or MAX_LENGTH "0"; there is no IS_EMPTY and EXISTS is true for "".

## P3

- Use Reset Fields Instead of Reset in Forms.
- Use setFieldValues instead of setFieldValue in forms.
- Avoid executeScript where a native action exists.
- Every evalJS, executeScript and page function earns its place over native actions.
- Currency, units and locale formatting are consistent.
- Write an effect many blocks share as one header rule on a shared HTML attribute, not the same CSS pasted into each block. (web only)
- In custom CSS animate only transform and opacity, easing out, never bounce. (web only)
- Keep transitions at 100 to 150 ms for a press, 200 to 300 ms for hover, 300 to 500 ms to open, at most 800 ms for an entrance. (web only)
- No !important in theme or block CSS unless the base rule it overrides uses it. (web only)
- Give a button one plain action chain; render one button per mode instead of runConditions on each step.
- No page variable that only copies a data source's data and never changes; bind the source.
- No customCSS key that repeats appearance.styles or sets a value back to its default.
- Store literal text as plain text, not as {{ "hello" }}; a wrapped literal stays a live expression that is evaluated.
- Write a constant disabled flag as {type:'boolean',payload:true}, not a bare true the condition panel cannot read.
- Bind appearance.loading through a filter condition, not a raw {{ }}, so the panel shows it.
- Lower-case the property side of IN and EQUAL conditions when data casing varies; matching is case-sensitive.
- Put meta tags and page-wide stylesheets in the custom code header, never the footer. (web only)
- Test navigation activeItem for null, not undefined, and check item type before reading url or pageId.
- Compare theme colorScheme with lowercase dark and let light fall through.
- Use relative-time-ago, not relative-time-to-now, where a date can be in the future.
- Format durations with a precision no coarser than the shortest value; formatTime returns an empty string below it.
