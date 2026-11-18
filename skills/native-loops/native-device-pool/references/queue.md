# The device queue

A run that reaches a device phase while every simulator is reserved does not wait for one. It writes one request to `$LOOPS_HOME/verify-queue/<id>.json`, carries on with the stages that need no device, and is woken when the request is done or a simulator frees up. Whoever gets a simulator next serves the request: the run itself, or a test runner of the loop orchestrator's test-and-fix stage, which holds one simulator and drains the queue (one test runner per pool simulator; see [the loops](../../loop-orchestrator/SKILL.md)). Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`.

A request is work, not a reservation: it has no owner pid and survives the session that wrote it. Only its take is bound to a session.

## Lifecycle

```
queued ──take──▶ running ──done──▶ done
   ▲                │ fail ──▶ failed ──requeue──▶ queued
   └── requeued ◀───┘ (the taking session ended, or its take went stale)
cancel removes the file in any state (the requesting session, or --force)
```

- `take` gets the oldest queued request (of `--kind`, when given, or a given id) of the test runner's platform for this session and records `takenBy {sessionId, ownerPid, udid, at, expiresAt}` (one hour). The test runner's platform is `--platform` (`mobile` by default, a simulator; `web` for a WEB test runner's browser folder, which takes with no `--udid`). A request of the other platform is passed over by age and refused by id (exit 4, `WRONG_PLATFORM`), so a simulator test runner never takes a web request and a browser one never a mobile one. A take is stale when that hour passed or the taking Claude process is gone; every command that reads the queue puts stale takes back, with the attempt counted.
- The `session-end` hook hands a running request back. `Stop` does not: a test runner keeps its take across turns.
- `done` records `result {dir, summary, shown, gaps, off, missing, by, at}`; `fail` records `failure {reason, by, at}`. Both clear the take. Every transition is one line of `history[]`.
- Nothing reaps a request: `done` and `failed` records stay until the requesting run cancels them, so a resumed run finds its result.

## The record

`makeRecord` envelope (`kind: verify`, `id`, `sessionId` of the requester, `cwd`, `task`) plus: `status` (`queued` | `running` | `done` | `failed`), `verifyKind` (`visual-check` | `retest` | `replay` | `touch-feedback` | `interaction` | `performance` | `a11y` | `responsive` | `acceptance` | `realtime` | `capture` | `loading` | `data-layer`, the kinds of the loops' device queue; `replay` runs the recorded steps of reproduced issues again, an argent flow on a simulator or the steps file in a browser; `touch-feedback` is the MOBILE check, a press-and-hold shot of every tappable, and `interaction` the WEB one (hover, focus and keyboard), and `add` refuses each on the other platform; `a11y` and `responsive` are WEB-only checks of the browser, and `add` refuses them without `--platform web`; `acceptance` does the steps of one acceptance line of a feature and checks the screen and, read-only, its `Effects:` lines; `realtime` does them on a second device and watches the first for the `Watch:` lines; `capture` takes screenshots only, judging nothing, to show the person what a run changed; `loading` records the page opening fresh and finds bands left blank and content that moves when the data arrives), `platform` (`mobile` or `web`, written only when `--platform` was given; a record without the field is mobile), `issues` (the issue log a `retest` re-measures or a `replay` runs again, required for both kinds; the issues whose states a `before` capture shoots), `side` (`before` | `after`, required for a `capture` and refused for every other kind; a `before` capture also needs `issues`), `steps` (the steps file an `acceptance` or `realtime` check runs, inside the run folder, stored as its real path; required for both kinds, refused for every other, and a `realtime` one must hold a `Watch:` block with a `- device 2 shows …` line), `runDir` and `runId`, `page {id, name}`, `pass` (the visual check's pass number), `regions[]`, `expect {version: draft | published}`, `app {id, endpoint, bundleId}`, `testUser`, `signInFlow`, `plan`, `solutionDir`, `note`, `attempts`, `takenBy`, `result`, `failure`, `history[]`. A stranger must be able to serve it from the record and the run folder alone, so the requester also exports into the run folder what the check reads: `board/spec.json`, `cache/<pageId>/outline.json` and `cache/<pageId>/blocks.json` (`loops cache-export <app-id> <page-id> --run <R>` writes the two cache files).

A queue file written before the loops renamed their words reads the same: the kinds `pixel-pass`, `recheck`, `press` and `perf-probe` read as `visual-check`, `retest`, `touch-feedback` and `performance`, and a `claimed` request with `claimedBy` as `running` with `takenBy`. The next write stores the new names. An old kind given to `--kind` means the new one.

## Commands

```sh
bash "$S/device-pool.sh" queue add --run <run folder> --page <pageId> --page-name <Page> --pass <n> [--kind visual-check|retest|replay|touch-feedback|interaction|performance|acceptance|realtime|capture|loading|a11y|responsive|data-layer] [--platform mobile|web] [--regions a,b] [--version draft|published] --app <appId> --endpoint <url> --bundle-id <id> [--test-user u] [--sign-in-flow f] [--plan p] [--solution-dir d] [--issues <issue log>] [--steps <steps file in the run folder>] [--side before|after] [--note "max passes 4"]
bash "$S/device-pool.sh" queue list [--status queued|running|done|failed] [--kind K] [--platform mobile|web] [--mine] [--run <run folder>]
bash "$S/device-pool.sh" queue take [<id>] [--kind K] --udid <udid>          # a simulator test runner (platform mobile)
bash "$S/device-pool.sh" queue take <id> --platform web                     # a WEB test runner: its browser folder, no simulator
bash "$S/device-pool.sh" queue done <id> --result <folder> --summary "<line>" --gaps k --off b --missing s --shown "draft vN"
bash "$S/device-pool.sh" queue fail <id> --reason "<what>"   |   queue requeue <id>   |   queue cancel <id> [--force]
bash "$S/device-pool.sh" queue await <id> --wait 3600 [--poll 15]
```

`await` blocks until the request is done (exit 0, the record on stdout), failed (exit 1) or still pending when the wait runs out (exit 3, `STILL_PENDING` with the queue position). A run starts it in the background so the session is re-invoked when a test runner has measured for it; the loop orchestrator combines the two waits: an agent never waits for a simulator, it queues the check and carries on. `device-pool status` shows the queue.

## Exit codes

0 ok · 1 error (and `await` on a failed request) · 2 usage · 3 busy (`QUEUE_EMPTY`, `NOT_QUEUED`, `STILL_PENDING`) · 4 refused (not the taker (`NOT_TAKEN` when nothing runs), not the requester, `WRONG_PLATFORM`).

## Seen on a machine

- The test suite: FIFO takes, `take --kind` passing over a request of another kind at the head, `--platform` keeping web and mobile requests apart (list, take by age, take by id refused), a `replay` needing its issue log and served by kind on its own platform, an `acceptance` or `realtime` check needing a steps file inside the run folder (a `realtime` one with its `Watch:` block) and a realtime test runner handing its request back when no second simulator frees, a dead taker's request back in the queue with its attempt counted, `session-end` handing a take back, `await` returning when another session marks the request done, the three exit codes of `await`, and queue files from before the rename served under the new names.

## Not confirmed

- That a background `queue await` (a background Bash call) re-invokes the session when it exits, in the CLI and in the Desktop app (experiment L10).
- A test runner serving a request whose page sits behind sign-in needs a recorded flow named in `signInFlow`; no run has recorded one through this queue yet.
