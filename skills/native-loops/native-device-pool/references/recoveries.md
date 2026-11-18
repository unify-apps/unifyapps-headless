# Recoveries

Each one runs once, on the session's own device, then the step is retried once. A second failure ends the phase with the recovery named in the report. `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`.

| Symptom | Recovery | Then |
| --- | --- | --- |
| argent says the CoreDevice HID transport is dead (taps and swipes fail, screenshots still work) | `mcp__argent__stop-simulator-server {udid}` on your own device only; `boot-device {udid, headless: true}` reattaches | retry the step; happened 23 times in one earlier app build |
| a `native-*` tool answers `restart_required` | `mcp__argent__restart-app {udid, bundleId}`; the PostToolUse hook clears the device's `currentApp`, so redo [protocol](protocol.md) step 4 | retry |
| `service_stale` | `argent server stop && argent server start --detach`, only when `device-pool status` shows no other session mid-phase (every session shares the one tool-server); otherwise wait and retry | retry |
| `connect_pending` | wait and retry the tool, up to five times with a few seconds between | retry |
| `init_failed` (the devtools injection never attached) | `bash "$S/device-pool.sh" pool boot --udid <udid>` (shutdown + boot), then `boot-device` again | redo steps 2–4 |
| Preview app missing (`launch-app` fails, `pool status` shows `missing`) | `bash "$S/device-pool.sh" pool install --udid <udid>`; happened 9 times in one earlier app build | redo steps 3–4 |
| `AUTH_EXPIRED` from UnifyApps Headless during a device phase | not a device problem: release the reservation, hand the run back with the message | stop |
| `POOL_EXHAUSTED` after the retries | report the holders table; do not evict (`release --force` is for a human) | stop |
| argent's tool-server will not start, or answers for the wrong service: its default port 3001 is held by another local server (`lsof -nP -iTCP:3001 -sTCP:LISTEN`) | `argent server start --detach --port 0` (any free port), only when `device-pool status` shows no other session mid-phase; `argent server status --json` names the port, and `argent run` and the MCP read it from argent's state file. `loops.mjs doctor` reports the holder | retry |
| every MCP call answers "fetch failed", UnifyApps Headless says "signed out" although the sign-in is valid | the machine's file table is full: `sysctl kern.num_files kern.maxfiles` (or `loops.mjs doctor`). A local dev server under `--watch` (`bun --watch`, `node --watch`) held about 160k descriptors in one session. Ask the person to stop the `--watch` process (never kill a process you did not start) and start it without `--watch` | retry the call once; a false "signed out" is not `AUTH_EXPIRED` until the file table is below 80% |
| sign-in stuck: after Continue the app stays on the sign-in screen although the login call answered 200 (`native-network-logs`); a known platform bug | `restart-app {udid, bundleId}` once, then [protocol](protocol.md) steps 4–5; a second miss → one more `restart-app`. Record it: an evidence row `kind: log`, verdict `manual: sign-in stuck, recovered by restart` and `receipt.metrics.envFailures[{kind: "signin-stuck", count}]` | continue; after two restarts stop the phase with `needs: sign-in` |
| a simulator outside the pool is free and the pool is full | do not drive it directly (no reservation, no hooks, other sessions cannot see it): add it to the pool ([pool](pool.md#add-a-device-to-the-pool)) and `reserve` | continue |
| a hook denied the call | read its reason: you are on another session's device, or the call was unscoped; `device-pool reserve` tells you yours | redo the call on your device |
| a LogBox banner over the screen | dismiss it (tap "Dismiss" from the tree) before the first tap; in an audit or a retest its text is evidence (a `bundle` issue), never hidden | continue |
| the page shows stale config after a save | you skipped step 6: `restart-app` and prove the refetch | continue |

## Not confirmed

- The argent status names (`restart_required`, `service_stale`, `connect_pending`, `init_failed`) are those of argent 0.27.0's native devtools; the mapping to these recoveries comes from the design and the history, not from a run that hit each one through this skill.
- `stop-simulator-server` as the fix for a dead HID transport was what worked by hand in earlier build sessions; it has not been replayed through the protocol.
