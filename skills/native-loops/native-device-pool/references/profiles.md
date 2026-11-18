# Device profile: release

The pool runs one profile, `release`: the UnifyApps Preview app's simulator build with `main.jsbundle` embedded (`kind: release-embedded`). `device-pool reserve` reports it, and a pool whose app is a development build (`kind: debug-metro`, no bundle inside) is refused.

| | `release` |
| --- | --- |
| App | Preview build with `main.jsbundle` embedded |
| Needs | nothing beyond the pool |
| Refresh after a config save | `restart-app`, or the floating reload pill (top half: `reloadAppAsync`, keeps the page) |
| Proof the config was refetched | `native-network-logs` shows the refetch call ([protocol](protocol.md) step 6) |
| Draft or Published | the DebugMenu switch, recorded in `pool.json` |

## Argent tools

`list-devices`, `boot-device`, `launch-app`, `restart-app`, `reinstall-app`, `open-url`, `screenshot`, `describe`, `await-ui-element`, `await-screen-idle`, `gesture-tap`, `gesture-swipe`, `gesture-custom`, `gesture-pinch`, `gesture-rotate`, `run-sequence`, `keyboard`, `paste`, `button`, `shake`, `rotate`, `fold`, `settings-permissions`, `screen-recording-start|stop`, `screenshot-diff`, `native-describe-screen`, `native-find-views`, `native-full-hierarchy`, `native-view-at-point`, `native-user-interactable-view-at-point`, `native-network-logs`, `native-devtools-status`, `native-profiler-start|stop|analyze` (xctrace), the `flow-*` tools, `stop-simulator-server` (own device only).

Never: `stop-all-simulator-servers` without `devices`. The [hooks](hooks.md) enforce it. The `debugger-*`, `react-profiler-*`, `profiler-*` and `view-network-*` tools need a development build connected to a JavaScript server, which the pool does not run: they answer nothing on the Preview app.

## Not confirmed

- The tool list comes from argent 0.27.0's catalogue and the design evidence; which `native-*` tools answer on a release build has not been run through on a device.
