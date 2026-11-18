# The design contract

The design contract is the one place the person decides how
`/ua:app-discover-test-loop` runs on an app. It lives in the working folder at
`tests/<app slug>/design-contract.md`, is filled at kickoff, and is read
again by every later run of the same app, so the second run asks nothing.
The file is the table below with a `Value` column added; the person may
edit it between runs.

At kickoff each field is filled from its source, in order: what the person
sent with the command first, then the folder, then the file. A field that
stays empty takes its default. Only a field with no default and no source
is asked, in one AskUserQuestion call of at most four questions; in a
session with no AskUserQuestion (a headless one), the same questions go in
one plain message, and the loop waits for the answer. Fields the folder
already answers are never asked again. The filled contract is written back
to the same path, whole. One field, the reviewer, is filled after the first
review instead.

| Field | Source | Default |
|---|---|---|
| Tenant and solution | the folder's UnifyApps Headless link; never asked again when linked | none: an unlinked folder runs `/ua:setup` first |
| App | the command's name, id or URL, else the solution's one app | none: asked when the solution has several apps |
| PRD | the solution, `prd get <app> --part prd` | none: an app with no PRD stops with the scope loop's command |
| Scope | the command's words naming flows, a ticket or a document, else the contract | the whole PRD |
| Existing cases | the contract | `add`: keep every case in `cases.json` and mark each new, changed or unchanged; `restart` moves the old file into the firing folder and begins again |
| Case id prefix | the contract, else the ids `cases.json` already uses | the app's initials in capitals, at most four letters (`Order Desk` gives `OD`) |
| Walk | `--walk` on the command, else the contract | `none`: the cases come from the PRD, the cache and the test data. `walk` runs `/ua:app-test-discover-loop` on the published app first and brings its scenarios in as walked cases; it needs a published app and its test users signed in, and takes that loop's own contract and time |
| Reviewer | the name typed on the review page, written here after the first review | `unnamed` |
