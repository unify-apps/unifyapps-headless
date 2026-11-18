---
name: app-test-author
description: Authors end-to-end UI test cases for a UnifyApps application — explores it in the Playwright MCP browser as a test user, proposes scenarios, then hands each approved scenario to its own test-author-agent, several at once, which writes the typed step payload in a browser of its own and submits it to the app-testing MCP's `deliver_steps` tool, which compiles it, runs the green gate and saves it into Test Studio. Use when asked to generate, author or bulk-create UI tests for an app URL, fix failed test-case submissions, create or update a test user, update or auto-heal existing test cases, or reconcile the suite (add, update, remove) after app changes.
---

# Test Author — local authoring to platform submission

You author typed UI test cases against a live web application and submit
each one to the app-testing MCP's `deliver_steps` tool, one call per case.
The main session surveys the app with the `playwright` MCP server's
`browser_*` tools; each approved scenario is then walked, authored and
submitted by its own `test-author-agent` in a browser of its own, several at
once ([references/parallel-authoring.md](references/parallel-authoring.md)).
The platform, not you,
compiles steps, creates elements, runs the green gate and saves the test
case; your job ends at a well-formed submission and its parsed response.
Payloads violating the rulebook fail the submission pipeline, or worse, pass
it while testing nothing. Nothing checks your steps before the submission
call, so the rulebook's checks are your only pre-submission gate.

## Where it runs

Run this skill in the main Claude session, never inside a plan builder agent
and never as a plan task. It asks the person questions: approval of the
scenarios, which test users to use, a password typed in the browser, and
whether to submit. A router loads it when the person asks to write, fix,
heal, update or reconcile UI test cases for an app.

## Requirements

- The `playwright` MCP server the plugin declares (`npx @playwright/mcp`,
  started through `${CLAUDE_PLUGIN_ROOT}/scripts/playwright-mcp.sh`); its
  `browser_*` tools are the main session's only way to touch the app under
  test. Every session gets its own browser profile, so parallel sessions never
  share or wait on one browser, and every new session starts signed out of the
  app: sign in again (below) rather than expecting an earlier session's login.
  After 10 minutes with no browser call the browser closes, and the next
  call reopens it on a blank page: navigate back to where you were, and sign
  in again if the app asks. Its browser is Playwright's Chrome for Testing, a
  separate app from the person's Chrome, so their links never open in it.
  Before the first `browser_*` call, run
  `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" --install`
  once: it installs that browser when it is missing (about 100 MB, once per
  machine). A `browser_*` call that says the browser is not installed means
  this step was missed: run it, then call again.
- `node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs"`
  for each helper's own browser: it runs `playwright-cli` (`npx
  @playwright/cli`) in a folder of the helper's own, with an on-disk profile
  there.
- `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/private-folder.mjs"`
  makes and removes the run's private folder in the system temp folder,
  which holds every test user's saved sign-in and every browser signed in as
  one.
- The `app-testing` MCP server the plugin declares, bridged to the signed-in
  tenant like the builders' servers: its tools
  (`mcp__plugin_ua_app-testing__<tool>`, loaded with one ToolSearch)
  are the only way you reach Test Studio, and `deliver_steps` on it takes the
  submission.
- A UnifyApps Headless session signed in to the tenant (`/ua:setup`). Run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/login.mjs" <tenant> --check --quiet`
  once, before the first platform call. It prints one JSON line: `host` is
  the platform host every platform call goes to; the bridge sends that
  session's cookie itself, and you never see or handle the value. Exit code
  3 (`"loginRequired": true`) means the session is gone: sign in again by
  loading the `setup` skill yourself. Never ask the person to type the command.

## Read order

1. [references/local-adaptations.md](references/local-adaptations.md) before
   Phase 1. It maps the rulebook's tool names to this environment, adds the
   local-only phases, and wins over the rulebook wherever they conflict.
2. [references/local-rules.md](references/local-rules.md) (the rulebook, binding verbatim),
   [references/durability.md](references/durability.md) (what keeps a case green past its first run)
   and the dialect file the adaptations tell you to pick, at the START of Phase 2, not earlier:
   exploration needs only the adaptations file. In an authoring run or fix round each helper reads
   them itself; the main session reads them before it authors steps of its own, in the update,
   auto-heal and reconcile runs.
3. [references/platform-tools.md](references/platform-tools.md) before the
   session's first app-testing MCP call and before the run's first
   submission; the tools table and the calling rules are there.
4. [references/parallel-authoring.md](references/parallel-authoring.md) right
   after the sign-in, before the survey: every helper works from its run
   file.

## Hard rules

**No dependency on pre-existing data. Every scenario provisions the data it
verifies.** A test never names, searches for, filters to, sorts against,
counts, opens or compares records it did not create in its own steps. Such a
test catches no regression and goes red when the data moves. Every scenario
has the shape **create → act → verify (→ delete own)**: earlier steps create
the record(s) with `<<random:N>>` identities stored into variables; the
feature under test then operates on those records and asserts through the
`<<var>>`s. The rulebook's "scenario-stated literal" licence covers values the
scenario tells the test to TYPE, never an existing record's name, position
or count. Doctrine and worked shapes: `local-adaptations.md`,
_Self-provisioning_.

**The readiness pair follows EVERY navigation, unconditionally.** After every
`navigate`, `reload` and `navigatesTo` click, the next two steps are the
settle (`wait_for_hidden` on an observed loader, else `wait_for_ajax`) and
`wait` `2`, before any fill, click, store or assert on the destination. No
page is exempt as "static" or "a plain form". A fill that lands before the
client mounts is silently discarded and the submit never enables. Doctrine
and pre-flight check 7: `local-adaptations.md`, _The readiness pair is
unconditional_.

**Walk discipline.** A ref is valid only until the next page-changing action;
re-acquire it with `browser_find` before every action. Read only the region
an action changed (full `browser_snapshot` only on first arrival at an
unmapped surface). Save or discard through the app's own control before any
navigation away from a surface you edited, in the walk AND in the authored
steps (pre-flight check 8). Provision the minimum and split any scenario over
40 steps or covering more than one behaviour. Doctrine:
`local-adaptations.md`, _Walk discipline_.

**Every behaviour the survey saw is covered, by default.** Each inventory
id of each survey file gets a scenario or a "not covered, and why" row with
a fixed reason; `scenarios.md`'s `## Coverage` table adds up to the survey,
so the person never has to ask for more. A cap or named areas from them
narrow what is proposed, the rest is `outside the cap or the named areas`,
and you never set a cap of your own (`local-adaptations.md`, Phase 1 step 4).

**Test Studio is never operated through the browser.** Existing test cases
and elements are read with the MCP read tools (`get_test_case`,
`get_element`, `search_elements`) and changed only with the MCP write tools;
a write is verified by an MCP re-read. Never open a case in Test Studio's UI
to read its steps, and never click, retype or save anything there. The
browser exists to walk the **app under test**, nothing else.

## Resolve the target, then sign in as a test user

**The target.** A URL matching `*/interfaces/*` is a **platform screen URL**
(e.g. `https://<tenant>/p/0/interfaces/<interfaceId>/overview`),
and the run then has two possible subjects: the deployed **matrix** app that
interface points to (where submitted tests actually run) or the platform page
itself. **Ask the user which one before surveying anything; never assume.**
If the matrix app: call `derive_matrix_url` (`platform-tools.md`) and survey
and author against the deployed URL it returns. **That tool is the ONLY
source of the deployed URL**: never derive it from the app's overview page
in the platform UI, never assemble it from domain conventions, never take it
from memory. The platform screen URL remains the run's anchor for every
platform-tool call and for the submission host. If the platform page: author
against that URL directly. A platform URL with no `/interfaces/` segment
(such as `…/p/0/agent-governance/overview`) is the platform itself: author
against it without asking. A non-platform URL (`https://<app-host>/…`)
is already the app under test, and its platform screen URL you resolve
yourself, never by asking: `platform-tools.md`, _Resolving the platform
screen URL from a deployed app_. Ask the user for it only if one of those
GETs fails. Settle the subject before any test-user call.

**The run's device and browsers.** A matrix app's case runs as one device
(its size and, for a tablet or phone, a user agent and touch, compiled into
its script) on one or more browsers, and the app picks its layout from both
once per page load. So call `get_app_run_viewport` as soon as the platform
screen URL is known, take a device the person named over it, make the MCP
browser that device before the sign-in opens the app, and read
[references/devices-and-browsers.md](references/devices-and-browsers.md)
for the helpers, existing cases and browsers. A platform-page subject skips
this.

**Sign in as a test user, automatically, in every mode that opens the
deployed app in the browser.** The walk never rides the end user's own
account and you never ask them to sign in manually. A test of the platform
itself follows _Test users of the platform_ below in place of the **No test
user exists** and **Test user(s) exist** bullets. For an app, as soon as the
platform screen URL is known, call `list_test_users` on it:

- **No test user exists** → create one yourself, without asking: generate
  the identity (a readable name, username and email, and a strong random
  password — `local-adaptations.md`, _Naming a generated test user_), call
  `create_or_update_test_user` (the one sanctioned automatic write), then
  sign the MCP browser in by filling the app's login form with those
  credentials. Show the generated credentials ONCE in chat; never write them
  to any file, payload or report.
- **Test user(s) exist** → never create a duplicate unprompted. Ask the end
  user which one to use (name + username, via AskUserQuestion), navigate the
  browser to the app's login page, pre-fill the username/email field, and ask
  the end user to type only the password in the browser window; continue
  once the session is signed in. Never ask for the password in chat.
- Once signed in, resolve the user id (`local-adaptations.md`, _Resolving
  the user id_), and check it is a test user of the subject's pool before
  the browser opens anything else: `list_test_users` with `userIds: [<that
  id>]`, then `loop.mjs test-user-check`
  (`app-test-create-loop/references/sign-in.md`, _Only test users_). An
  account that is not a test user, the person's own included, stops the
  run there; never walk or author as it. Every submission's `userIds`
  starts with that id. Record the
  test user's username (never a password) in the run header of
  `scenarios.md`; a resuming session reuses that identity. If the session
  lapses mid-run, repeat this same sign-in.
- **Other roles' test users**, for a scenario with more than one person,
  are chosen at the approval (step 5 below) and signed in after it
  (`parallel-authoring.md`, _Another test user_).
- A **public app** (no login wall ever appears) skips sign-in entirely: no
  test user is created, and submissions send `userIds: []`. The `list_test_users`
  check is still made, but a create fires only when the app demands a login.

**Test users of the platform.** A test of the platform itself runs as
the platform's own test users, listed, created with their roles and
signed in as [references/platform-test-users.md](references/platform-test-users.md)
says; read it whole before the first test-user call of such a run.

## Authoring run (the default)

The user gives an app URL, optionally areas to cover or a test-count cap.
When they also bring the scenarios themselves, in an Excel or CSV file, a
document or pasted into the chat, the survey proposes none: steps 1.1–1.3
run as written, then the run file and its ledger are built from that source
instead of steps 1.4–1.5
([references/parallel-authoring.md](references/parallel-authoring.md),
_Scenarios from another source_), and the run continues at step 2.

1. **Explore and propose.**
   1. Right after the sign-in, save it for the helpers and write the run
      file ([references/parallel-authoring.md](references/parallel-authoring.md),
      _Right after the sign-in_).
   2. Create the run folder and put every artifact inside it:
      `tests/<slug>/` in the working folder, beside `records/`, `plans/` and
      `docs/`. Name `<slug>` after the surface you surveyed, never after the
      URL host on the platform (that is the tenant). Distinct surfaces get
      distinct folders.
   3. Survey the app read-first (one full snapshot per new surface, scoped
      `browser_find` / `browser_evaluate` reads after that), and write each
      surface's survey file as you go (`local-adaptations.md`, _Survey
      file_): the authoring helpers start from it. The survey builds a
      numbered inventory per surface and derives candidate scenarios under
      the Phase 1 rubric in `local-adaptations.md`, every one self-provisioning
      and the set covering every inventory id (step 4).
   4. Write `<run-folder>/scenarios.md`: a one-line run header (starting URL;
      the subject the detection returned; both URLs of the pair, platform screen
      and deployed, whichever direction they were resolved in; the username of
      each test user the run signed in, the first marked as the default; the
      device the run walks as, and the browsers when the person named them),
      then `## <Module>` headings (the app's name; for the platform, the product
      area: `submission-contract.md`) holding `### <Feature>` headings (2–3
      words, noun phrase) holding `#### <Scenario>` groups (2–3 words), each
      with numbered test-case entries (title ≤ 8 words, 2–4 sentences with the
      stated outcome and starting URL, P1–P3 priority, for a scenario with more
      than one person its roles in order, for one that uploads, its source
      (_Generated or uploaded file_, below), and for one that acts in an
      extension's side panel, which extension (_Browser extension_, below).
      End with the `## Coverage` table and the "not covered, and why" rows,
      each with a fixed reason and its inventory ids (Phase 1 step 4).
   5. **STOP for approval, with the submit choice in the same question.**
      The availability probe ran before your first app-testing call
      ([references/submission-contract.md](references/submission-contract.md)).
      When it listed `deliver_steps`, ask one question: approve the scenarios
      in `scenarios.md`, with the options "Approve, and submit each case as
      it's authored" and "Approve, but don't submit yet"; edits come through
      the free-text row, so apply them and ask again, quoting the Coverage
      line, and never ask whether to propose more. When it did not, say so
      once and wait for approval in chat. When scenarios name roles beyond
      the first, ask once per role name which test user plays it; the answer
      holds in every scenario with that role. Each question offers up to
      three of the app's other test users from `list_test_users` (name +
      username) and "Create a new test user"; the signed-in one is never
      offered. For a test of the platform itself, offer platform test users
      only (_Test users of the platform_); "Create a new test user" then
      also asks which roles it gets. The approval
      question carries up to three role questions; ask
      the rest right after it, four per call. No test user plays two roles in
      one scenario: when the answers put one in two roles of the same
      scenario, ask again for the later role. Record each role's test user in
      the run's ledger. A yes to submitting covers the
      whole run; any case not submitted ends `authored, not submitted` and
      is submitted on a later go-ahead. A login wall at any point is handled
      by the sign-in flow above. **Never ask the user for ids.** You resolve
      `interfaceId` and the user id yourself. When an approved scenario
      uploads a real file, get that file now (_Generated or uploaded file_,
      below), and likewise the build of every extension an approved
      scenario acts in (_Browser extension_, below).
2. **Prepare the helpers** (`parallel-authoring.md`, _After the approval_):
   sign in each other test user the approval chose, then one run-file entry
   per approved scenario, and `submit` set from the approval.
3. **Dispatch one `test-author-agent` per approved scenario**, several at
   once (`parallel-authoring.md`, _Dispatch_). Each walks its scenario in a
   browser of its own per test user, authors its steps and, on a yes,
   submits the case, then reports. Each helper's name, browser folder, work folder and payload file
   carry its scenario's unique key, so no two helpers ever share a file
   (`parallel-authoring.md`, _One key per scenario_).
4. **Collect.** Record each helper's report in the run's ledger
   (`scenarios.md`, or `results.md` for scenarios from another source) as it
   arrives. A `created` report is followed at once by the case's grouping: add
   the case to its feature's suite, `<Module> · <Feature>`, and that suite to
   the app's plan, creating either when absent, read both back and record them
   on the case's ledger line (`suites-and-plans.md`, _Where a new case
   belongs_). Put every `needs_answer` question to the person and send the
   answer back to that helper (`parallel-authoring.md`, _Reports and
   questions_); a question asking for a file to upload is answered by the
   section below. A scenario the walk contradicts gets its text fixed or moves
   to "not covered". A helper's `uncovered:` observation becomes a late entry
   (`parallel-authoring.md`, _Reports and questions_).
5. **Report.** When every helper has reported, clean up per
   `parallel-authoring.md`, _End of the run_, set any browsers the person
   named (`devices-and-browsers.md`, _Browsers_), then report the Coverage line
   and 2–3 lines per test case — created (with its attempts) or failed (with
   the error) — plus anything dropped. When step 4 wrote late entries, ask in
   that same message to approve them (step 1.5); a yes runs steps 2–5 for
   them. Each created case's line names its suite and plan (step 4); nothing
   about grouping is asked.

### Generated or uploaded file

An `upload` step's file comes one of three ways, and each scenario that
uploads says which in its `scenarios.md` entry, so the person sees it and
can change it at approval:

- **Generated** — Test Studio makes the file during the run: one of
  twelve types (PDF, PNG, JPEG, GIF, CSV, TXT, XML, HTML, Markdown, Python,
  JavaScript, RTF), any size under 50 MB, with an optional name, holding
  filler content ([references/local-rules.md](references/local-rules.md),
  _Input_). Use it when the scenario only needs a file of a supported type
  and what is inside does not matter: the upload is accepted or refused,
  its name or size shows, a size or type limit is checked.
- **Uploaded** — a real file the person gives, put at a public link the run
  downloads. Use it when the scenario names a type Test Studio does not
  generate (a Word or Excel file, a zip, a video); when what is inside
  matters (an import whose rows the app reads, an image whose content is
  checked, a document whose text is shown); or when the scenario or the
  person asks for a real file, or for no generated one.
- **Generated folder** — the only source a folder-picking control takes:
  Test Studio builds the folder from generated files, subfolders included,
  during the run (`local-rules.md`, _Input_). No real folder can be
  uploaded, so a scenario that needs real files inside a folder goes to
  "not covered". When a helper's `needs_answer` says the field picks a
  folder, answer `generated_folder`, or move the scenario to "not
  covered" if it needs real files.

When neither the scenario nor the person settles it, write the one the
rules above pick and let the approval change it. For an uploaded file, you
make the link: never ask the person to upload the file themselves and paste
one.

1. **Ask for the file** in chat: its path on this machine. Ask once per
   file the run needs, at approval when the scenarios already show it,
   otherwise when a helper's `needs_answer` asks for it.
2. **Warn before anything is uploaded.** Ask with AskUserQuestion:
   "`<file name>` will be uploaded to `<tenant>` as a public file: anyone
   who has the link can download it, and it stays there after the run.
   Continue?", with `Upload it publicly` and `Don't upload`. When the file
   looks private (a key, an `.env`, a spreadsheet of customers or staff),
   say so in the question. Only `Upload it publicly` uploads, and it covers
   this one file. On anything else nothing is uploaded: the step takes a
   generated file when the scenario can do with one, otherwise the scenario
   moves to "not covered" with the reason.
3. **Upload it.** Copy the file into `<run-folder>/files/` (the bridge
   reads an upload only from the working folder or a temp folder), then call
   `upload_public_file` with the platform screen `url`, `filePath` set to
   that copy, and `mimeType` when you know it. Its reply's `step` is the
   upload step's `file`, holding the public link.
4. **Hand it on.** Put the link in the `uploadFiles` of every run-file
   entry that uploads this file, or send it to the helper that asked
   (`parallel-authoring.md`), and add it to `scenarios.md`'s run header, so
   a fix round or a later run reuses it instead of uploading again.

Upload only a file the person named for this. A helper never calls
`upload_public_file`; it asks through `needs_answer`.

### Browser extension

A scenario that acts in an extension's side panel names the extension in
its `scenarios.md` entry. Get each build once per run, at approval, by
[references/browser-extension.md](references/browser-extension.md): the
`.zip` path, its manifest, the public upload after a warning, and its
entry in the run file's `extensions` and `panelApps`. Only the side
panel is supported.

## Fix round

For failed submissions (the failures this run's ledger recorded, or a case the user
names): map each recorded error (`errorAt` + its evidence, or the `isError` message)
through the failure table in `local-adaptations.md`. **Separate infrastructure
failures from authoring defects first.** A `DEADLINE_EXCEEDED`, "service in
fail-fast" or 5xx error means the platform's run service failed, not your steps:
never rewrite steps for these; resubmit the same case unchanged once the service
recovers. Each failed case goes to its own `test-author-agent`, several at once, the
same way as the authoring run, with the recorded error in its run-file entry's
`lastAttempt` (`parallel-authoring.md`). The helper resubmits through the same
contract with `module`, `feature`, `scenario`, `description`, `interfaceId` and the
entry's `userIds` carried through unchanged and `name` unchanged unless the user
asks to rename. Repeat until every case passes or only infrastructure errors remain.

## Platform-tool modes

Test-user, update, auto-heal, heal, reconcile and suite/plan-management runs
call the app-testing MCP. Their procedures are in
[references/platform-tool-modes.md](references/platform-tool-modes.md); the
tool contracts and the element write pipeline are in `platform-tools.md`. Every write (`create_or_update_test_user`,
`update_test_case`, `delete_test_cases`, `create_element` /
`create_elements`, `update_element`, `delete_elements`, `create_test_suite`,
`update_test_suite`, `delete_test_suites`, `create_test_plan`,
`update_test_plan`, `delete_test_plans`) fires only on the
user's explicit request or per-item confirmation, with exactly one
exception: the sign-in flow's automatic `create_or_update_test_user` when
the app has no test user at all, never on a test of the platform itself.
Element writes that persist the elements of
a step write-back the user already approved are part of that approved write.
`deliver_steps` is the submission itself and follows the authoring run's
one-time go-ahead instead; grouping cases into a suite, suites into a plan,
or running one, is pure Test Studio organization and never touches
`deliver_steps` or step content at all — and `run_test_suite`/
`run_test_plan` need no separate go-ahead of their own either: like
`run_test_cases`, they never mutate a record, only run one that was
already approved
([references/suites-and-plans.md](references/suites-and-plans.md)). The
run's one go-ahead also covers putting each case it creates into its
feature's suite and that suite into the app's plan, creating either when
absent; any other suite or plan write still waits for the person's request.

## Boundaries

- Elements are `{ "pageUrl", "locator", "name" }` only; candidates, ids and
  page ids are derived platform-side at submission.
- Test cases are created only through the submission contract's
  `deliver_steps` call, never by any other write endpoint,
  never with an id from anywhere but the deployed-interface GET
  (`interfaceId`) and the user-context call (every id in `userIds`).
- Existing test cases and elements are changed only through the MCP write
  tools, never by operating Test Studio's UI with browser tools. In update,
  auto-heal and reconcile runs the browser opens the app under test only.
- A process this session did not start is not yours to stop. When a browser
  call fails because the browser or its profile is already in use (for
  example `Browser is already in use for <profile>`):
  - never `kill`, `pkill` or restart any process, never delete the profile
    or its lock files, and never edit the plugin's `.mcp.json` or
    `plugin.json` or change how the `playwright` server starts (such as
    adding `--isolated`). The holder is usually another session's live
    browser, often from an older plugin copy that shared one profile, and
    stopping it breaks that run;
  - find the holder read-only with
    `ps -Ao pid,command | grep -F -- '<profile>' | grep -v grep`;
  - stop and tell the person the locked profile and the holder's PID and
    command, then ask whether to wait, close that browser themselves, or
    restart the `playwright` server themselves with `/mcp` so you can retry.
- The pre-flight checks and the in-position JS dry-run are the only
  verification your payloads get before the platform's gate; they are
  mandatory, not advisory.
- Each saved sign-in file (`parallel-authoring.md`) holds one test user's
  live session cookies. They live in the private folder, readable only by
  your OS user. Only the wrapper's `state-load` reads them; they are never
  printed, copied or described. The UnifyApps Headless guard refuses a helper's Bash,
  Read or Grep that names the saved sign-in or a browser profile, except the
  wrapper's `state-load` and `state-save`. It is a text match, so it stops
  the plain ways, not a determined shell. A helper drives a signed-in
  browser anyway, so the real protection is the private folder: outside the
  working folder, readable only by your OS user (folder 0700, file 0600),
  and deleted at the end of the run.
- The only credentials you ever type are a test user's, through the sign-in
  flow. Never enter, request or handle the end user's own credentials; never
  author steps that reach outside the app under test or destroy data the
  test did not create. Records the test created in its own steps are the
  test's to edit, act on and delete.
- Outside the UI you make exactly four kinds of requests: (a) the read-only
  `GET /api/user-context?includeRoles=false` on the app's own origin, to
  resolve the user id; (b) the read-only `GET /auth/interface/deployed` on
  the app's own origin, to resolve the interface id: the submission's
  `interfaceId` and, on a deployed-app run, the platform screen URL; (c) the
  read-only, unauthenticated
  `GET /auth/domain-mapping/platform` on the app's own origin, to resolve the
  platform host when the run started from a deployed URL; (d) calls to the
  `app-testing` MCP server's tools, and only through that server: read tools
  as a mode needs them, write tools only on explicit request plus the
  sign-in flow's one automatic create, `upload_public_file` only after the
  person's yes to that file's public upload (_Generated or uploaded
  file_), and the submission (`deliver_steps`) exactly per the
  submission contract, only after the run's one-time go-ahead.
- The session cookie is credential material you never hold: the bridge reads
  it from the UnifyApps Headless session and sends it in-process, never acquired by asking
  the user to sign in to the platform or by scraping the browser, sent only to
  that tenant, never printed, never written into any file, any report, or any
  authored step.

## Reference files

| File | Read it when |
|---|---|
| [references/local-adaptations.md](references/local-adaptations.md) | before Phase 1; tool mapping, dialect detection, user id, self-provisioning, readiness pair, walk discipline, Phase 1 rubric and coverage rule, failure table |
| [references/local-rules.md](references/local-rules.md) | at the start of Phase 2; the rulebook: step grammar, locator vocabulary, assertions, safety |
| [references/durability.md](references/durability.md) | with the rulebook, and before an update job: the shapes that went red on the next run — a model's reply, shared account state, counts and names on shared lists, cleanup, JS steps, the pointer and focus, redirects, a hook the app lacks, and pre-flight check 9 |
| [references/builder-app-dialect.md](references/builder-app-dialect.md) | the detected subject is a builder app (`data-block-*` DOM) |
| [references/code-app-dialect.md](references/code-app-dialect.md) | the detected subject is a code app (no shell, no `data-block-*`) |
| [references/platform-dialect.md](references/platform-dialect.md) | the detected subject is the platform UI itself |
| [references/windows-tabs.md](references/windows-tabs.md) | a scenario or the app involves a popup, target-blank link or new tab |
| [references/control-flow.md](references/control-flow.md) | a scenario demands branching, iteration or per-item repetition |
| [references/charts.md](references/charts.md) | a scenario involves a chart, graph or plotted visualisation |
| [references/multi-user.md](references/multi-user.md) | a scenario involves more than one person: `user` on a step, each user's browser, and seeing another user's change |
| [references/browser-extension.md](references/browser-extension.md) | a scenario acts in a browser extension's side panel: getting its build, reading its manifest, and the panel app's URL and frame |
| [references/network-rules.md](references/network-rules.md) | a scenario is about the network: a call that fails, is slow, gets a set answer or goes out changed (a network rule), or a user going offline (`go_offline` / `go_online`); or a case you replay holds rules or an offline step |
| [references/api-requests.md](references/api-requests.md) | a scenario or the person's own prompt describes a step that calls an API, however it's phrased — a pasted `curl` command, an API path, "call the API", "api req", "req api", "hit this endpoint", or anything else meaning the same; never gated on matching one exact keyword or phrase — before authoring any `api_request` step |
| [references/platform-tools.md](references/platform-tools.md) | before the first app-testing MCP call and the first submission of a session; the tools table, case reads and the element write pipeline |
| [references/platform-tool-modes.md](references/platform-tool-modes.md) | a test-user, update, auto-heal, reconcile or suite/plan-management run |
| [references/suites-and-plans.md](references/suites-and-plans.md) | the person asks to group test cases into a suite, suites into a plan, or to run one — or an authoring run just created cases and it's time to propose grouping them |
| [references/heal.md](references/heal.md) | a heal run: fixing test cases whose last execution failed on a locator; the unattended form is the `app-test-heal-loop` skill, and the run analysis that feeds it is `app-test-triage-loop` |
| [references/submission-contract.md](references/submission-contract.md) | building or reading a submission |
| [references/devices-and-browsers.md](references/devices-and-browsers.md) | as soon as the platform screen URL is known: the device a run or a case walks as, how each browser becomes it, and the browsers a case, suite or plan runs on |
| [references/parallel-authoring.md](references/parallel-authoring.md) | right after the sign-in: the saved sign-in, the run file, dispatch, reports and questions, the end-of-run clean-up |
