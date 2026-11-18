# The reservation

One simulator per session, held as one file `$LOOPS_HOME/reservations/<udid>.json` that only this session may renew or release. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`.

```sh
bash "$S/device-pool.sh" reserve --task "build Home" [--prefer <udid>] [--profile release] [--wait 90] [--ttl 1800]
```

Prints the reservation: `deviceId`, `udid`, `name`, `bundleId`, `scheme`, `profile`, `provider: local-simctl` and `expiresAt`. Skills use only `deviceId`, `bundleId` and `profile`; the udid is never copied from memory or from an older message, because a reservation can move between runs.

## Semantics

- **Session.** `--session`, else `LOOPS_SESSION_ID`, else `CLAUDE_CODE_SESSION_ID`, else a usage error (exit 2). The SessionStart hook exports `LOOPS_SESSION_ID`; outside Claude Code pass it by hand.
- **Idempotent.** A session that already holds a reservation gets the same one back, renewed, whatever `--prefer` says. After a compaction or a resume, `reserve` again is the way to learn which simulator is yours.
- **A second simulator.** A step that needs two devices at once (the loops' `realtime` check: device 1 writes, device 2 watches) reserves the second under a role of the session, `--session "$LOOPS_SESSION_ID.<role>"` (`.writer-<n>`), and releases it with the same `--session`. The guard hooks read `<session>.<role>` as this session's own device, and `Stop` and `SessionEnd` release it with the session's own.
- **Choice.** `--prefer` first, then the simulator this session held last (`sessions/<id>.json` keeps `lastUdid`), then devices with the app installed before those without, least recently released first.
- **Profile.** Always `release` ([profiles](profiles.md)); a pool whose app is a development build (`debug-metro`) is refused.
- **TTL.** 30 minutes (`config.reservation.ttlSec`), renewed by every argent call on the device (the hooks) and by `renew`. `renew` refuses once the reservation has been held longer than `config.reservation.maxHoldSec` (4 h): release and reserve again.
- **Stale.** A reservation is dead when its TTL passed, its owner process (the `claude` process above the call) is gone, or the file is unparsable. `reserve`, `reap` and the SessionStart hook drop dead reservations; nothing else needs a human.
- **Release.** `release` (own reservations), `release --udid U`, `release --all --force` (everyone, on purpose). A reservation of another session is refused (exit 4) unless `--force`, which prints whom it evicted. `Stop` releases the session's reservations when `config.reservation.releaseOnStop` is true (default); `SessionEnd` releases reservations, locks, page locks and tickets.

## Hold a simulator only during a device phase

A reservation is never held for a whole run. A loop reserves before its first argent call of a phase and releases on every exit path of that phase, including errors and the person saying stop; the next phase reserves again and usually gets the same device back. Six simulators serve more than six sessions only because of this rule.

## Exhaustion

Without `--wait`, exit 3 with `{error: "POOL_EXHAUSTED", holders, waiters}` on stdout and a table of holders on stderr. With `--wait SEC` the session takes a FIFO ticket in `queue/` and polls (`config.reservation.pollSec`, jittered); a ticket at position `r` may reserve once `r + 1` simulators are free, so no newer waiter passes an older one. A ticket outlives one call by two minutes, so a loop that retries `--wait 90` up to six times keeps its place. Loops run `reserve` with a Bash timeout of at least 120 s.

## Compaction and resume

`sessions/<id>.json` survives compaction, and the SessionStart hook prints the session's reservation in its status line on `compact` and `resume` with the reminder to re-read it. The reservation itself is unchanged; only the model's memory of the udid is suspect, which is why `reserve` is idempotent and cheap.

## Coordination beyond devices

- `lock acquire|release|status <name> [--ttl 600]`: a named lock, e.g. `publish-<appId>` around a publish (`config.locks.publishTtlSec`).
- `page-lock acquire|release <tenant> <appId> <pageId> [--plan P] [--ttl 21600]` and `page-lock list [tenant [appId]]`: a page lock other sessions on this machine see (`config.locks.pageLockTtlSec`, 6 h). Acquiring it again renews it, so a loop renews per phase. Teammates on other machines do not see it; they see the run's in-progress UnifyApps Headless plan and the pages it `touches`, which [native-lint](../../native-lint/references/drift.md)'s drift check reads.
- `status`: sessions, reservations, page locks, locks, waiters and the device queue in one table. `who <udid>` answers for one device.

## Exit codes

0 ok · 1 error · 2 usage · 3 busy (`POOL_EXHAUSTED`, `HELD`) · 4 refused (not the owner, past `maxHoldSec`).

## Before the rename

A machine set up before the loops renamed their words keeps working: the first command that opens the state moves `leases/` to `reservations/` and `claims/` to `page-locks/` once (logged in `logs/migrate.log`), and `config.json`'s old `lease`, `budget` and `locks.claimTtlSec` are read as `reservation`, `limits` and `locks.pageLockTtlSec` until `config set` writes the new names. A hook on a machine with no pool moves nothing.

## Seen on a machine

- 20 concurrent `reserve --wait` calls on a fake pool of 6: 6 reservations, 14 tickets, drained in ticket order as holders released (the test suite, every run).
- Reservation, lock and page lock files from a killed owner are reaped on the next `reserve` or SessionStart.
