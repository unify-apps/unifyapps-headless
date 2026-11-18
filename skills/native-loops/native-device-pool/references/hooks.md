# The guard hooks

## Contents

- Wiring and the fast path
- PreToolUse: the decision table
- The Bash guard: `argent run` and friends
- PostToolUse
- Session events
- Testing with stdin fixtures
- Not confirmed

## Wiring and the fast path

The plugin runs the same six hook events two ways, both through `scripts/plugin-hook.mjs`:

| Claude Code event | Matcher | `<event>` | Started by |
| --- | --- | --- | --- |
| `SessionStart` | — | `session-start` | `hooks/hooks.json`: `run-node.sh skills/native-loops/native-device-pool/scripts/plugin-hook.mjs <event>` |
| `SessionEnd` | — | `session-end` | the same |
| `Stop` | — | `stop` | the same |
| `PostToolUse` | `mcp__argent__.*` | `post-tool` | the same |
| `PreToolUse` | `mcp__argent__.*` | `pre-tool` | UnifyApps Headless's `scripts/tool-guard.mjs`, which already runs before every tool call and calls `deviceHook` |
| `PreToolUse` | `Bash` naming `argent` | `pretool-bash` | the same, so a Bash call starts no second process |

They run in every UnifyApps Headless session, mobile or not, so `plugin-hook.mjs` decides before it loads anything heavy:

- no `LOOPS_HOME/pool.json` → return at once, no output, no file created (a hook never moves the legacy home or a pre-rename `leases/` folder; the first `device-pool` command does);
- `pretool-bash` whose command does not contain `argent` → never reaches this file: the tool guard checks first.

`bash "$S/device-pool.sh" hook <event>` still runs the same handlers, for testing with stdin fixtures below.

Past that, hooks read files only, never `simctl`; on any internal error they print nothing and exit 0, except the stop-all check, which needs no state and runs first. Errors go to `logs/hooks.err` when the folder exists.

## PreToolUse: the decision table

Targets of a call are `tool_input.udid`, `tool_input.device_id` and `tool_input.devices[]`. A device is *foreign* when another session's live reservation names it; *unreserved* when it is in `pool.json` with no live reservation; *own* when this session reserved it, itself or under a role of its own (`--session <session id>.<role>`, the second simulator of a `realtime` check).

| Call | Decision |
| --- | --- |
| `stop-all-simulator-servers` with no or empty `devices` | deny: one argent tool-server serves every session; unscoped it tears them all down |
| `stop-all-simulator-servers` naming a foreign device | deny |
| `stop-simulator-server`, `reinstall-app`, `restart-app`, `boot-device {force: true}`, `settings-permissions`, `screen-recording-start` on a foreign device | deny |
| any other tool on a foreign device | ask, naming the holder, task and expiry |
| any tool on an unreserved pool device | allow, with an `additionalContext` warning to reserve first; after three warnings in the session, ask |
| no device in the input, a device outside the pool, or own device | allow; an own device renews the reservation |

A deny or ask comes as `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny" | "ask", "permissionDecisionReason": "…"}, "systemMessage": "[loops] …"}`; a warning as `permissionDecision: "allow"` with `additionalContext`. A plain allow of an argent MCP call prints `permissionDecision: "allow"`, so the call runs with no permission prompt (argent drives local simulators, and the guard has already refused another session's device); with no pool yet, every argent MCP call is allowed the same way. A Bash command made of argent calls and nothing else (`argent run|flow …` joined by `;`, `&&`, `||` or new lines, with no `$`, backtick, pipe, redirect, background `&` or parenthesis outside single quotes) is approved the same way; any other Bash command that names argent prints nothing on a plain allow, so the person's own permission rules apply to whatever else it runs. Denies and asks are appended to `logs/hooks.log`.

## The Bash guard: `argent run` and friends

Builders have no argent MCP tools; they drive the device with the CLI from Bash (`argent run <tool> --args '<json>'`). `pretool-bash` reads `tool_input.command`, finds every argent call in it and applies the same table, as if each were `mcp__argent__<tool>`:

| In the command | Read as |
| --- | --- |
| `argent run <tool> --args '<json>'` (or `--args=<json>`) | `mcp__argent__<tool>` with that JSON as `tool_input`; `--args` overrides the flags, as in argent |
| `argent run <tool> --udid U` / `--device_id U` / `--devices-json '[…]'` / `--force` | the same fields |
| `argent flow run <flow> --device U` | `mcp__argent__flow-execute` on `U` |
| `argent server stop` | ask when another session holds a live reservation (it ends the one tool-server every session shares); allow otherwise |

- The command is split with a small shell lexer: quotes and backslashes are resolved, and `;`, `&&`, `||`, `|`, `&` and newlines end a call, so `cd x && argent run …` is found. Variables and `$(…)` are not expanded.
- A command with several argent calls gets the most severe decision of them (deny over ask over allow), and every own device in it is renewed.
- `--args -` (stdin) or a JSON the hook cannot parse leaves the targets unknown: the call is allowed with an `additionalContext` note to name the reserved udid in the command.
- The reason starts with `Bash:` so the person sees which tool asked. `npx argent` and a path ending in `/argent` count as argent.

## PostToolUse

Renews the session's reservation on every device the call named; `restart-app` and `reinstall-app` clear the device's `state.currentApp` (so the protocol redoes step 4); `boot-device` records `lastBootAt`. Bash calls have no post hook: their renewal happens in `pretool-bash`.

## Session events

- `session-start`: writes `sessions/<id>.json` (cwd, `ownerPid` = the nearest ancestor process named `claude`, found with `ps -o pid=,ppid=,comm=`; null when there is none), appends `export LOOPS_SESSION_ID` and `LOOPS_HOME` to `$CLAUDE_ENV_FILE` so later Bash calls have them, and reaps stale records. It prints nothing: the plugin's own SessionStart adds one cached health line (`loops.mjs health --quick`). Only on `compact` and `resume`, when this session still holds a reservation, it prints one line naming the device and: "Re-read your reservation with `device-pool reserve` (idempotent); never reuse a UDID from memory."
- `stop`: releases the session's reservations (with those held under `<session id>.<role>`) when `config.reservation.releaseOnStop` is true (default) and remembers the device in `lastUdid`, so the next `reserve` gets it back.
- `session-end`: releases reservations (with those held under `<session id>.<role>`), locks, page locks, waiter tickets and the device-queue requests it was running (back to `queued`), and drops the session record.

A killed Claude never fires `session-end`; its records die with the pid, on the next reap.

## Testing with stdin fixtures

A hook is a process reading one JSON object on stdin:

```sh
S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"
printf '%s' '{"session_id":"me","hook_event_name":"PreToolUse","tool_name":"mcp__argent__stop-all-simulator-servers","tool_input":{},"cwd":"/tmp"}' \
  | LOOPS_HOME=/tmp/loops-test bash "$S/device-pool.sh" hook pre-tool
printf '%s' '{"session_id":"me","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"argent run restart-app --args '"'"'{\"udid\":\"<udid of another session>\"}'"'"'"},"cwd":"/tmp"}' \
  | LOOPS_HOME=/tmp/loops-test bash "$S/device-pool.sh" hook pretool-bash
```

The first prints the deny once `/tmp/loops-test` holds a pool; both print nothing without one. `LOOPS_HOME` points the hook at any state folder, and `LOOPS_FAKE_SIMCTL=1` lets `pool init` build a pool without Xcode, which is how the plugin's tests set up a foreign reservation and an unreserved device before replaying each row of the tables.

## Not confirmed

- That `additionalContext` on an `allow` reaches the model, and that `SessionEnd` fires when the desktop app closes a session, are read from the hook documentation, not seen in a live session.
- `ownerPid` was found through the `claude` ancestor in a terminal session; in the desktop app or an IDE extension the process name may differ, in which case the record is null-owned and only its TTL ends it.
