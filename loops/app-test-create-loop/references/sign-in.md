# Sign-in — every test user once, at kickoff

## Contents
- Which users
- Where sign-ins live
- A sign-in saved by an earlier run
- The platform path
- The fallback path
- Only test users
- The role check
- Keeping sessions alive

Every test user the contract names is signed in at kickoff, the only
stage the person is present for. After it, a session is kept alive or
refreshed by the loop alone; a session that cannot be refreshed parks the
cases that need it.

## Which users

The contract's test-user field names one per role. By default the loop
takes the app's users with `testUser: true` from `list_test_users` (its
default `testUsersOnly`), one per role, in the order the list gives them:
the first for the first role, the next for the next. A role left with no
user gets one made with `create_or_update_test_user`
(`app-test-author/references/local-adaptations.md`, _Naming a generated
test user_) only when the
field permits creating one; otherwise its cases park `capability missing`.
For a test of the platform the create also passes the roles the field
names for that user (`app-test-author/references/platform-test-users.md`);
with none named, kickoff asks once.

## Where sign-ins live

In the loop's private home, the one the heal loop keeps, so a resumed run
and a later run reuse them:

```bash
node "${CLAUDE_PLUGIN_ROOT}/loops/app-test-heal-loop/scripts/loop-home.mjs" sign-in <tenant host> <interfaceId> <user id>
```

It prints the user's `signInFile` (0600, in a 0700 folder under the UnifyApps Headless
home) and `exists`. It makes the file empty at 0600 when it is missing, on
purpose, so a later `state-save` never creates it readable by others;
`exists` is `true` only when the file holds a saved browser state with
cookies. Each run-file `users` entry points at that file. The per-run
private folder (`private-folder.mjs prepare`) still holds the helpers'
browser profiles and the keepers, and is deleted at the end of the run as
`parallel-authoring.md` says; the saved sign-ins stay. Never save a
sign-in to a `private-folder.mjs sign-in` file.

## A sign-in saved by an earlier run

When `exists` is `true`, load it before signing in again: open the user's
keeper, `browser.mjs <folder>/login-<user id> open <appUrl>`, then
`state-load <signInFile>` and `reload`, and run the user-context read
(`app-test-author/references/local-adaptations.md`, _Resolving the user
id_) through `browser.mjs <folder>/login-<user id> eval`. When it answers
that user's id and _Only test users_ passes, the sign-in still loads: keep that keeper, and that user
needs no new sign-in. Any other answer, or `exists: false`, signs the user
in as below.

## The platform path

When the `app-testing` tools list `mint_test_user_session`:

1. Call `mint_test_user_session` with the user's `testUserId`. Write the
   storage state it answers, whole, to that user's `signInFile`, then
   load it in the user's keeper and run _Only test users_.
2. The helper loads it into its browser with `state-load`, as it does
   today; nothing in the helper changes.
3. On a 401, or a user-context read that names another user, the watch
   calls `refresh_test_user_session` for that user and writes the new
   state to the same file. Helpers never call either tool.

No password is typed on this path, and no window opens.

## The fallback path

While the tenant does not serve those tools:

1. **One visible window per test user**, at kickoff, each in a browser
   folder of its own inside the private folder:
   `browser.mjs <folder>/login-<user id> open --headed <the app's login URL>`,
   with the username filled. Never the `playwright` MCP browser. The person
   types the password in that window, never in chat.
2. **A user the loop just created** is filled in that window by the loop,
   password included, and submitted. Its password is never written in
   chat, in a file or in the report, and the loop keeps no copy of it; it
   overrides `app-test-author`'s "show the generated credentials once".
   That user can therefore never be signed in again by the loop: when its
   saved sign-in and its keeper both lapse, its cases park `capability
   missing`.
3. **Detect the sign-in by polling the page**, never by a reply: run the
   user-context read through `browser.mjs <folder>/login-<user id> eval`
   every 5 seconds, for up to 5 minutes per user. It is done when it
   answers that user's id and _Only test users_ passes. A user who is not signed in by then is left out,
   and their cases are parked `capability missing`.
4. **Save it:** `browser.mjs <folder>/login-<user id> state-save
   <signInFile>`. Keep that window open: it is the user's keeper, the
   browser the watch refreshes the file from.

## Only test users

A loop drives a browser only when it is signed in as a test user of the
subject's pool: the app's users for an app, the platform's for the
platform. Never the person's own account, and never a user the pool does
not flag as a test user. Check it every time a browser is signed in, by
any path above, before it opens anything else:

1. The user-context read in that browser, saved to
   `<folder>/context-<user id>.json` as `{ "status", "userId" }`.
2. `list_test_users` on the subject's pool with `userIds: [<that id>]`
   (`url` the app's platform screen URL, or for the platform
   `https://<tenant>/p/0/test-studio/test-cases` with `interfaceId:
   "__UA__PLATFORM__"`), its reply saved to `<folder>/listed-<user id>.json`.
   A tenant that does not take `userIds` is asked with `limit: 200`.
3. `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/loop.mjs" test-user-check --pool <interfaceId> --context <folder>/context-<user id>.json --listed <folder>/listed-<user id>.json --expected <user id>`.

It exits 0 with `ok: true`, or 1 with `NOT_A_TEST_USER` and the reason.
On a refusal, close that browser and delete the user's `signInFile`.
At kickoff the run stops there: tell the person in one line which
account was signed in and that the loop runs only as test users, and
name the fix (pick a test user in the contract, or let the loop create
one). After kickoff, every case or surface of that user parks
`capability missing: <user> is not a test user`. The check is never
skipped, and its answer is never overridden.
A public app, whose browser never signs in, has no user to check.

## The role check

Before a case is dispatched, for each of its users: open the case's
`startingUrl` in that user's keeper (or a browser loaded from the user's
`signInFile`) and read the page. It passes when the page loads as that
user, not a sign-in page, an access-denied page or an empty app. A user
who fails it parks every case that needs that user on that surface:
`capability missing: <user> cannot open <page>`, with the page read as
evidence. At kickoff the same check runs once per user on `appUrl`.

## Keeping sessions alive

The heartbeat starts as soon as the users are signed in at kickoff, so a
long survey cannot outlast a keeper's 10-minute idle close, and from the
first dispatch it is one step of every watch tick (`stalls.md`, _The
watch_). For each user:

- **Heartbeat:** the user-context read in the keeper. It keeps the
  keeper's page in use, so the 10-minute idle close of a browser never
  fires, and it says whether the session is still good.
- **Refresh:** a good session is saved to the `signInFile` again
  (`state-save`) so every helper that loads it next gets the fresh one,
  and recorded in `sessionsRefreshed`. On the platform path,
  `refresh_test_user_session` takes its place.
- **Expired:** a helper's session that answers 401 while the keeper's is
  still good is refreshed once, from the keeper. The current case of that
  user goes to `waiting` and is re-dispatched from its checkpoint once the
  refresh succeeds. When the keeper's own session has expired, nothing can
  refresh it: every remaining case of that user is parked `capability
  missing: session for <user> expired`, and the report says so. The person
  is not asked to sign in again.
- **After a resume:** the windows the person signed in at kickoff are
  gone. Each user's keeper is opened again from the saved sign-in, as _A
  sign-in saved by an earlier run_ says, and kept alive the same way, but
  a session that expires after a resume cannot be signed in again: its
  user's cases park `capability missing`.
