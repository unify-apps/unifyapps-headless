# scripts/profile.mjs

The solution folder's `.nebula/loops/profile.json`: everything a UnifyApps Headless loop run needs to know about the app, the design file, the device and the policies, written once by `native-setup` and read by every loop and skill. A profile an older loops plugin left in `<solution>/.agentic-loops/profile.json` is moved here the first time any command reads it (only when no new profile exists). `node "$S/profile.mjs" --help` lists every command.

```sh
node "$S/profile.mjs" init --dir <folder> --set tenant=<host> --set solution.id=<id> --set app.id=<id> --set app.endpoint=<url> ...
node "$S/profile.mjs" get --dir <folder> app.deepLink
node "$S/profile.mjs" set --dir <folder> loop.maxPasses=5 testUsers.empty=bob
node "$S/profile.mjs" validate --dir <folder>
```

`init` takes `--from-json <file>` and any number of `--set key=value` (defaults, then the file, then the sets). A value parses as JSON when it can (`5`, `true`, `null`, `{"nodeId":…}`), else it is a string; quote a JSON string to force one. `init` refuses to overwrite an existing profile unless `--force`. `set` takes dotted keys. Both validate before writing and write nothing on a violation. `validate` prints one violation per line and exits 1.

## Fields

| Field | Default | Read by |
| --- | --- | --- |
| `version` | `1` | every loop |
| `tenant` | from `solution context` | every loop, the memory line, each page lock |
| `solution.id`, `solution.name` | from `solution context` | every loop |
| `app.id`, `app.name`, `app.type` (`MOBILE` or `WEB`) | from `cache app` (`loops platform <app-id>`) | every loop; `validate` refuses any other type. The device, scaling and bundle fields are the MOBILE device's; a WEB app keeps their defaults, and its widths come from the design store |
| `app.endpoint` | the app URL the builder's Preview QR carries as `url=` | the deep link, `native-network-logs` proof |
| `app.deepLink` | derived: `matrix://open?url=<endpoint URL-encoded>` | device steps (`open-url`) |
| `app.bundleId` | the variant the pool installed (`com.unifyapps.matrix` until an installed build says otherwise) | the pool, `restart-app`, `simctl get_app_container` |
| `figma.fileKey`, `figma.pages.<slug>.{nodeId, sections}` | from the Figma URL (`/design/<fileKey>/…?node-id=11853-279124` → `11853:279124`) | the `build` and `fix` goals (design intake through [native-design-spec](../../native-design-spec/SKILL.md)) |
| `device.model`, `widthPt`, `heightPt`, `scale`, `runtime` | iPhone 16 Pro, 402, 874, 3, null (the pool's default, iOS 18.6) | the pool (model and runtime), the visual check (points) |
| `scaling.figmaFrameWidth`, `factor`, `grid`, `fontRound`, `textCapTrim`, `smallBelow` | 440, derived 0.9136, 4, `whole`, true, 7 | the design spec and gap table |
| `loop.maxPasses`, `loop.deviceProfile` | 4, `release` | the visual check passes per page of every loop; which device profile a reservation asks for |
| `loop.preApproved` | `[]` | approvals the run skips and logs as `preapproved`: `settings`, `plan`. Release approvals (publish, code, write-back, delete) are never accepted here. |
| `publish.policy` (`ask`, `draft-only`, `publish-on-pass`), `publish.versionLabel` | `ask`, null | unused: the loops never publish the app (the Preview app runs drafts); kept so older profiles still validate |
| `testUsers.withData`, `testUsers.empty` | null | the signed-in precondition, the empty state |
| `evaluate.pageVarsExpr` | null | the performance check on the dev profile |
| `preferredDevice.udid` | null | the reservation (`--prefer`); the simulator the person signed in on, which the pool clones ([signed in](../../native-device-pool/references/signed-in.md)) |
| `fixtures.<name>` (default names `recordMissingField`, `recordFreshData`) | null | the checks that need state a normal test user does not have ([fixtures](#fixtures)). Optional: an older profile without `fixtures` still validates. |
| `createdAt`, `updatedAt` | stamped | reports |

## Fixtures

A fixture is the id of a record the solution's team keeps for one purpose. The profile holds the id only; a check reads the record live and never stores a value from it. The names are free: a solution adds `fixtures.<name>` for each state its checks need. A value is a record id without spaces, `{ "id": "<record id>", "purpose": "<why it exists>" }`, or null.

| Fixture | The record | A check that uses it |
| --- | --- | --- |
| `fixtures.recordMissingField` | a record that lacks a field a check depends on | the check that expects the app's message for a missing field: open that record, tap the action, expect the message |
| `fixtures.recordFreshData` | a record whose fields are known and may be changed | a save that fails or succeeds on purpose, a state-changing flow: the check changes it after `data-undo.mjs add` ([test data](../../loop-test-data/references/undo-log.md)) |

An older profile that names these `fixtures.<other name>` keeps validating: any name is accepted.

How a check uses one:

1. Read the fixture from the profile: `profile.mjs get --dir <folder> fixtures.<name>`. `null` means the solution has none.
2. With none, the check ends `not checked (no fixture: fixtures.<name>)`. It never edits a shared record to make one, and never guesses a record id from the list.
3. A failed login with the test user's wrong password is never a fixture and is not allowed outside a local development tenant: the check is `not checked (no safe way to fail a sign-in)`.

Set one with `profile.mjs set --dir <folder> fixtures.<name>=<record id>`. A value with spaces is refused.

## The deep link, two ways

The profile builds `app.deepLink` locally, in the same shape as the platform's own preview links: `matrix://open` plus `url=<endpoint>` through `URLSearchParams`, so the endpoint is URL-encoded and the Preview app reads it back. It is rebuilt when the endpoint changes, as long as the link is still the derived one. When the tenant serves a preview-link tool, a run may store that tool's link instead (`set app.deepLink=<link>`): it can carry a `previewAuthToken`, and a link the person or a tool set is kept across endpoint changes.

## Git

When the folder is inside a git repo, `init` and `set` add `.nebula/loops/` to the repo's `info/exclude` (found with `git rev-parse --git-path info/exclude`, which also works in a worktree), once. `.gitignore` is never touched: it belongs to the team, and the profile holds names that are the person's own.

## Not confirmed

- The shape of the link a preview-link tool returns has not been seen; the profile only requires `matrix://open?url=` at the start.
- The endpoint cannot be derived from `cache app`; setup asks for it when solution memory does not hold one.
