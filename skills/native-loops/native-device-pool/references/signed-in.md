# Signed in: one sign-in, copied to the pool

An agent cannot type a password, and a new simulator is signed out. So a
person signs in once, on one simulator, and the pool copies that simulator's
state to the others. Nothing here types, reads, prints or stores a password or
a token. Below, `loops` is the loops CLI and `S` is this block's `scripts`
folder ([protocol](protocol.md) step 5 is the per-device check).

## The step (before the first device step of a run)

1. **Ask the CLI.** `loops signed-in --json` answers `preferred` (name and
   udid of the recorded signed-in simulator, from the profile's
   `preferredDevice.udid`), `others`, and the `commands` that copy it. Exit 1
   with `reason` `none-recorded` or `preferred-not-in-pool` means no
   simulator is recorded as signed in.
2. **Check the recorded one is signed in.** Reserve it
   (`device-pool reserve --prefer <udid>`), then `mcp__argent__describe`
   with its udid. Signed in is a page past the sign-in screen: the app's home
   or tab bar shows, and no sign-in field or Continue button does. The
   `preferredDevice` can be signed out after a token expiry, so this check runs
   every run.
3. **None is signed in: ask the person once.** One question: "Sign in on
   <pool name> yourself (the test user for this app), then say done." The
   person types the credentials on the simulator, through the farm view
   (`loops pool watch`) or the Simulator window. The agent waits and never
   fills a field. After the yes, `describe` again.
4. **Record it.**
   `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-preflight/scripts/profile.mjs" set --dir <folder> preferredDevice.udid=<udid>`.
   The profile keeps the udid only.
5. **Copy it to the others** with the commands `loops signed-in` printed:
   shut the signed-in simulator down (a clone needs its source off), remove
   each other pool simulator, `device-pool pool init --count <N> --clone-from
   <udid>` (it creates each missing `ua-sim-<nn>` as a clone, slims it, then installs the
   Preview app over it), and `pool boot` the source. Do this only when no
   other session holds a reservation: `pool remove` refuses a reserved device.
6. **Check each copy.** A clone is signed in only when `describe` shows it.
   One that shows the sign-in screen is reported, and the person is asked
   again for that simulator (step 3), not the whole pool.

## Rules

- Never type, paste, log or write a password, token or cookie. The person
  types on the device, or the device tool's secret placeholder carries it
  ([rules](../../loop-orchestrator/references/rules.md) § Safety).
- Asked once per run, only when no simulator is signed in. A signed-in
  `preferredDevice` is used without asking.
- The test user is the profile's `testUsers.withData` (else the user the
  person names). A signed-in session for another user is not reused.

## Limits

- The copy rests on the Preview app's session living in the simulator's own
  app data, which `simctl clone` carries and a reinstall of the same app keeps.
  That has not been seen on a real pool yet. The proof is step 6's `describe`
  on each clone, and a copy that comes out signed out is the case step 6
  handles.
- A session that expires (the platform's token lifetime) signs every copy out
  together. The next run's step 2 finds it and asks again.
