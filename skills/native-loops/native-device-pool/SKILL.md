---
name: native-device-pool
description: "Owns the iOS simulators the UnifyApps Headless loops drive for a UnifyApps MOBILE app: the device pool of ua-sim-NN simulators on iOS 18, the one reservation per session, page locks and named locks, the device queue, the release device profile, the device-step protocol and the guard hooks (argent MCP calls and `argent run` from Bash). A hidden block of the UnifyApps Headless loops, read before any step that drives a simulator: 'get a simulator', 'reserve a device', 'set up the simulator pool', 'install the Preview app', when argent reports a dead HID transport or a stale service, or when a hook blocks an argent call."
user-invocable: false
---

# Native device

One machine, many sessions, a pool of simulators. A session holds one simulator at a time, through a reservation it makes at the start of a device phase and releases at the end. Everything lives under `LOOPS_HOME` (default `~/.unifyapps-solutions/loops`, or `$UA_HOME/loops`; a legacy `~/.agentic-loops` is moved there once, the first time a script runs). The plugin's hooks keep sessions off each other's devices. Shared rules are in [rules](../loop-orchestrator/references/rules.md#device-reservation-and-profiles).

Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"` and `device-pool <cmd>` is `bash "$S/device-pool.sh" <cmd>`. `native-setup` builds the pool and installs the Preview app; this block is what it and every device step call.

| Situation | Read | Acceptance |
| --- | --- | --- |
| No pool yet, a new Preview build, or `pool status` shows a device missing its app | [Pool](references/pool.md) | `device-pool pool status` lists every `ua-sim-<nn>` as `Booted` on the iOS 18 runtime, `slim`, with the app `installed` and the app's `kind` |
| A goal or a test runner needs a simulator for a device phase | [Reservation](references/reservation.md) | `device-pool reserve` prints a reservation with `udid`, `profile` and `expiresAt`; `release` ran on every exit path |
| Driving the device inside a run: boot, connect, app state, sign-in, fresh-config proof | [Protocol](references/protocol.md) | Every device evidence row carries `version` (draft vN or published vM) and how the refetch was proven |
| No simulator is signed in, or a new simulator is signed out | [Signed in](references/signed-in.md) | One simulator is signed in by the person and recorded as `preferredDevice.udid`; the others are copies that `describe` shows signed in; no password was typed or stored |
| Which argent tools a session may use | [Profiles](references/profiles.md) | No tool that needs a development build is called |
| argent answers with a dead transport, `restart_required`, `service_stale`, `init_failed`, or the app is missing | [Recoveries](references/recoveries.md) | The named recovery ran once on the session's own device and the step was retried once |
| A hook denied or asked about an argent call (MCP or `argent run` in Bash), or you are testing the hooks | [Hooks](references/hooks.md) | The decision matches the table; stdin fixtures reproduce it |
| A run found no free simulator, or a test runner drains what others queued (a WEB app's browser test runners share the queue with `--platform web`) | [Device queue](references/queue.md) | The request is one file in `verify-queue/`, visible in `device-pool status`, and ends `done`, `failed` or cancelled; a test runner never writes to the tenant |

Other sessions, their reservations, page locks, locks and the queue: `device-pool status`. Scripts need Node 22 or newer and no packages; `LOOPS_FAKE_SIMCTL=1` swaps `simctl` for an in-memory fake.

Next: the protocol's fresh-config proof ([protocol](references/protocol.md) step 6) proves the page version the device runs.
