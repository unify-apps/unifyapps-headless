# Setup — saving the test users' sign-ins

`/ua:app-test-heal-loop setup for <app URL>` runs these steps, once
per app and again when a sign-in has expired. `loop-home.mjs sign-in` is
the command the skill's _Setup_ section names; `<folder>` is the private
folder step 3 prints.

1. Resolve the app (`app-test-author`'s _Resolve the target_: platform
   screen URL, `derive_matrix_url`, `interfaceId`). `list_test_users`
   (`url`, `interfaceId`).
2. For every test user a case of the app runs as (`get_test_case` → the
   failing cases' users, or every case's when the person asks for the
   whole app), or the ones the person names, run `sign-in`.
3. Prepare this setup's own private folder, with this session's id:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/private-folder.mjs" prepare <sessionId>`.
   It prints the folder the browsers below live in.
4. A user with `exists` true: check the sign-in still loads, in
   `<folder>/check-<user id>` through the wrapper
   (`node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" "<browser folder>" <command>`):
   `open about:blank`, `state-load "<signInFile>"`, `goto <app URL>`, the
   user-context read (`app-test-author/references/local-adaptations.md`,
   _Resolving the user id_)
   through `eval`. That user's id, and
   `app-test-create-loop/references/sign-in.md`, _Only test users_,
   passing → `close`; anything else → step 5.
5. A user with `exists` false, or whose check failed: sign in exactly as
   `app-test-author/references/parallel-authoring.md`, _Another test user_, steps 3 to 5 do, in
   `<folder>/login-<user id>` — the person types the password in that
   window, never in chat — and `state-save` to the loop's `signInFile`,
   not the private folder's. Never write a password anywhere. Then run
   _Only test users_ in that window: a refusal stops the setup for that
   user, deletes the file, and tells the person in one line that the
   loop replays only as test users. `sign-in` for that user must then
   print `exists: true`.
6. Record one ledger row, with no `firingId`: write `{ "loop":
   "heal-loop", "executionId": "setup:<YYYY-MM-DD>", "users": [<the ids
   saved or checked>] }` to `<working folder>/tests/<app slug>/setup-row.json`,
   then `loop.mjs ledger upsert --file <ledger> --row @<that file>`.
7. `close` every browser, then
   `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/private-folder.mjs" remove <sessionId>`.
   Tell the person which users the loop can now replay as. The sign-ins
   stay at the printed paths, 0600, in a 0700 folder;
   `loop-home.mjs remove <tenant> <interfaceId>` deletes them.
