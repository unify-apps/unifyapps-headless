# The loading check

## Contents

- What it proves
- Record the open
- Read the recording
- Judge and write the issues
- The result
- The fix task

A test runner serves one `loading` request per page and pass, on its own
reserved simulator, after the [protocol](../../native-device-pool/references/protocol.md)
steps 2–6 put the app's draft on screen. It writes into
`R/loading/<pageId>/pass-<n>/`. It looks at one composite per page and taps
only to reach the page.

## What it proves

That the page, opened fresh, never shows plain background where data will
land (a **blank**), and that nothing on screen while it loads moves once the
data arrives (a **shift**). The config already says a gate exists (X1 in
`page-audit.mjs`); only the device shows whether it is the right size and
whether it shows at all.

## Record the open

1. **Reach the screen one hop before the page**: the page that opens it, as
   a capture reaches a page (the route map), or the app's start screen for a
   bottom-bar tab. The page must load fresh: a tab already visited, or a page
   still in the stack, shows data it already has. For a tab page,
   `restart-app` first and wait on the start screen.
2. `await-screen-idle` with `minStableMs: 500`, so the recording starts on a
   still screen.
3. `argent run screen-recording-start --udid <udid> --trimStatic false --showTouches false --timeLimitSeconds 60`,
   then wait one second. Both flags matter: by default argent cuts still
   stretches out of the video, which drops a still skeleton and shortens the
   loading time, and draws a pulse where the tap lands, which reads as a
   change on screen.
4. **The last hop**: tap what opens the page, its point from `describe`.
   A page opened by link (`open-url`) is opened that way instead.
5. `await-screen-idle` with `minStableMs: 1000` and `timeoutMs: 20000`, then
   one more second, so the recording ends on a settled screen.
6. `argent run screen-recording-stop --udid <udid>`; copy the file its
   `video` names to `R/loading/<pageId>/pass-<n>/open.mp4`.

## Read the recording

```
node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-loading-states/scripts/loading-check.mjs" \
  --video R/loading/<pageId>/pass-<n>/open.mp4 --out R/loading/<pageId>/pass-<n> \
  --points-high <the simulator's screen height in pt> --json
```

The screen height is in the issue log's `Simulator:` header line (874 on the
pool's iPhone 16 Pro). The script takes ten frames a second, finds the frame
where the page first stands on screen (its header matches the settled
frame) and the settled frame, and compares every frame between them with the
settled one:

| `verdict` | Means | Next |
| --- | --- | --- |
| `pass` | a skeleton showed where data landed, and nothing moved | the result, with `loadingMs` |
| `fail` | one finding or more: `blank` (a band from–to pt, how long) or `shift` (a band, how far, up or down) | judge each finding (below) |
| `not-seen` | the data was there before the page stood on screen, so no loading frame exists | pass, with the line `loading not seen on the device (data in <ms> ms); X1 in the config is the proof` |
| `not-settled` | the screen still changed at the end | record once more with `timeoutMs: 30000`; still changing: `queue fail` with "the page never settles: <what moves>" |

Exit 3 means ffmpeg is missing: `queue fail` with that line; the
orchestrator's doctor check installs it.

## Judge and write the issues

1. **Look at `composite.png` once**: the first loading frame, the worst shift
   frame and the settled frame side by side; a red stripe at the left edge
   marks a blank band, an amber one the rows that moved.
2. **Confirm or dismiss each finding.** A blank is real when the settled frame
   holds data in that band and the loading frame shows plain background
   there. A shift is real when the same content sits higher or lower in the
   settled frame. Dismiss what the page itself moves on purpose (a toast, a
   banner that slides in, a carousel) and anything inside the Preview app's
   own overlays (the floating reload pill at the bottom right), with
   the reason; write each verdict to
   `R/loading/<pageId>/pass-<n>/verdicts.json` as
   `[{ "kind", "from", "to", "verdict": "confirmed" | "dismissed", "why" }]`.
3. **Name the region.** `describe` the settled screen and name the elements
   whose frames fall inside the band; with the run's `cache/<pageId>/outline.json`,
   give the region's block name and id when one matches.
4. **One issue per confirmed finding** in `issues/loading-<pageId>-<n>.md`,
   the issue log shape ([formats](../../loop-orchestrator/references/formats.md) § Issue log):
   id `UI<n>-<nn>` (n the pass), check `ui`, severity `major`, kind `state`,
   device `device`, owner `page`, and:

   | Finding | rule | expected | actual | fix hint |
   | --- | --- | --- | --- | --- |
   | blank | `X1` | a skeleton its region's size from first paint | `plain background <from>–<to> pt for <ms> ms` | a `CONTENT` Loader gate beside `<region>`, its box the region's |
   | shift | `H5` | nothing moves when the data arrives | `<band> moved <dy> pt <down or up> when <region> loaded` | the gate above the band is not its region's height: make them equal, or give `<region>` a fixed height or row count |

   Evidence: `loading/<pageId>/pass-<n>/composite.png`, the finding's
   `from`–`to` and `at` from `loading.json`.

## The result

Footer, which is also the `queue done --summary` line:

```
loading <Page> pass <n> · <verdict> · blank a · shift b · dismissed c · loading <ms> ms
```

Pass means no confirmed finding, or `not-seen`. Append one evidence row to
`R/evidence.md` with the version shown.

## The fix task

On a fail, the orchestrator turns the open issues of the page into one fix
task, as it does for a visual check's gaps:

```json
{
  "id": "t9",
  "kind": "page-bind",
  "title": "Leave Requests: loading states, pass 1",
  "entity": { "kind": "page", "name": "Leave Requests", "id": "<pageId>" },
  "dependsOn": [],
  "body": [
    "Read: UnifyApps Headless cache outline and UnifyApps Headless cache blocks for the page, live on a miss, and note the page version.",
    "Check the sheet list (get_app_builder_knowledge_map), then read the Loader block's native and web sheets and app-design references/ux-layer.md section 1 before the write.",
    "UI1-01 · pendingList b_… · blank 199–494 pt for 800 ms → add a CONTENT Loader gate beside pendingList, its box the list's box, shown while the source has neither data nor error.",
    "UI1-02 · footerActions b_… · moved 101 pt down when pendingList loaded → pendingList is not the last region: give it a fixed height of 300 pt, or four rows with a See all action.",
    "Write once: one apply_page_edits; read back get_blocks for every gate and region; report each issue id with what was written."
  ],
  "proof": "page-audit.mjs reports 0 blocking on X1, X3 and X4 for the page; get_blocks shows each gate's box equal to its region's"
}
```

Lint it with `task-lint.mjs`, then
`ua plan revise <planId> --tasks-file <fix-task.json> --impact absorbed --reason "loading check pass <n>: <k> findings on <regions>" --json`
(refused because a publish is pending: `--impact major`). When the task reports
done, queue pass n+1. At `limits.maxPasses` the escalation; what is left
becomes a `Not proven:` line of the spec.
