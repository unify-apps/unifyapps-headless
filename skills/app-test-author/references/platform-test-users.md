# Test users of the platform

An app's users sign in only to their app, so a test of the platform itself runs as the platform's own test users:

- List them with `list_test_users` on a platform URL with no app
  (`https://<tenant>/p/0/test-studio/test-cases`) and
  `interfaceId: "__UA__PLATFORM__"`, never on the screen under test: an
  app's builder or overview lists that app's users. Use a user only when the
  reply's `interfaceId` is `"__UA__PLATFORM__"`, and offer every user it
  returns.
- When the listing has too few users, create one with
  `mcp__plugin_ua_app-testing__create_or_update_test_user` on that same
  platform URL, with `roles`: a platform user opens nothing until it has a
  role, so the tool refuses a create without one. The roles are the ones
  the person named for that user, in a loop its contract's test-user
  field; when none are named, ask once which roles the tested screens
  need, offering the role names
  `mcp__plugin_ua_application-builder__get_role_options` answers.
  Give it only those roles, never one the person did not name. Name the
  user as `local-adaptations.md`, _Naming a generated test user_, says, with `platform` in place of
  the app's short name (`platform-builder`). A reply that says the user
  was made but its roles were not stops the run with that user's id named,
  since it can sign in to nothing.
- Never flag the person's own account as a test user; the tool refuses it.
- Sign in at `https://<tenant>/login`: a user this run created is filled
  in as SKILL.md's **No test user exists** bullet does, an existing one as
  its **Test user(s) exist** bullet does.
