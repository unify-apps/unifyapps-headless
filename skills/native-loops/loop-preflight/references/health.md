# scripts/health.mjs

One cheap read before a builder attempt is spent. `node "$S/health.mjs" --help` lists every option.

```sh
node "$S/health.mjs" check --json                      # folder and session
node "$S/health.mjs" check --json --app <app id>       # plus the one tenant read
```

Run it from the solution folder (or pass `--dir`). It runs UnifyApps Headless's CLI from the plugin it ships in; `--root` and `UA_CLI_OVERRIDE` exist for tests only. Reads only: `solution context` reads the folder's own records; `cache app <id> --refresh` is the one network call, and it links nothing and writes nothing on the tenant. Without `--app` the tenant is not touched at all, so `tenant_5xx` and `bridge_down` can only come from a run with `--app`.

## When a run calls it

Before a UnifyApps Headless loop run dispatches its first builder; before every builder batch retry; after any builder report that says `fetch failed`, `AUTH_EXPIRED` or an HTTP 5xx. A run dispatches nothing on any status but `ok`; it shows `nextAction` and hands back. (The session-start line of `loops.mjs health --quick` is a different check: the laptop's toolchain and pool, not the tenant.) Attempts are expensive and the history shows where they went: HTTP 500 ×36, bridge down ×18, AUTH_EXPIRED ×6.

## Statuses

The classification reads the `--json` error envelope `{"error":{"code","message"}}` first, then the message text, then the exit code.

| Status | Evidence | `nextAction` |
| --- | --- | --- |
| `ok` | exit 0 and no `error` in the payload | `none` |
| `not_started` | code `NOT_STARTED` or `NO_SOLUTION` (exit 1) | `run /ua:setup` |
| `auth_expired` | code `AUTH_EXPIRED` or `NO_SESSION` (exit 3) | `sign in again` |
| `tenant_5xx` | the message names `HTTP 5xx`, a `5xx` status, `Internal Server Error`, `Bad Gateway`, `Service Unavailable` or `Gateway Timeout` | `wait` |
| `bridge_down` | code `PLATFORM_UNREACHABLE` (exit 6), or `fetch failed`, `ECONNREFUSED`, `ENOTFOUND`, `socket hang up`, or no answer in time | `start the local tools server (local build)` on a local build, else `wait` |
| `ua_missing` | no `scripts/ua.mjs` in the plugin the script ships in (a copy taken out of it), or the CLI cannot start | `reinstall UnifyApps Headless: run the installer again (see the README)` |
| `unknown` | anything else; `detail` carries the message | `type /reload-plugins` on `RESTART_NEEDED`, else `read the message` |

## Retries

`--retries 3` tries in all, with `--backoff 20000,60000` milliseconds between them (20 s, then 60 s), and only for `tenant_5xx` and `bridge_down`: every other status is settled by the first answer. A run that is still failing after the last try hands back with `wait`.

## Output

`{status, detail, triedAt[], nextAction, app?, tries[]}`. `triedAt` has one ISO time per try; `tries[]` keeps each try's status, code, detail and step (`solution context` or `cache app --refresh`); `app` carries `{id, name, version}` from the refresh. Without `--json`, one line: `HEALTH <status>: <detail> → <nextAction>`.

Exit codes: 0 `ok`, 1 any other status (the JSON still prints), 2 usage.

## Not confirmed

- `auth_expired`, `tenant_5xx` and `bridge_down` were classified from fixtures that copy UnifyApps Headless's own error codes and messages, not from a live failure.
- `cache app --refresh` on a stale or deleted app: what UnifyApps Headless answers has not been seen; it classifies as `unknown` with the message.
