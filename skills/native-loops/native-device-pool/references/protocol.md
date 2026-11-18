# Device-step protocol

What a loop does in every device phase, in this order. Steps 1 and 8 are the reservation; 2 to 6 are preconditions the history showed were skipped (Home behind sign-in, a stale tree after a save, a device check on the wrong app version); 7 is the work. Argent tool names are the MCP names; a builder without the MCP runs the same tools as `argent run <tool> --args '<json>'` from Bash with its own reservation; the [Bash guard](hooks.md#the-bash-guard-argent-run-and-friends) applies the same rules to those calls, so name the reserved udid in `--args` or `--udid`. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`.

1. **Acquire.** `bash "$S/device-pool.sh" acquire --task "<loop> <page>"` with a Bash timeout of at least 120 s. Loops pass `--wait 90` and retry up to six times; the output's `udid`, `bundleId` and `profile` are the only device values the phase uses. Exit 3 after the retries: report the holders and stop the phase.

2. **Boot.** `mcp__argent__boot-device {udid, headless: true}`. A no-op on a booted device; it also attaches argent's transport to the simulator, which the pool's own `simctl boot` does not.

3. **Launch.** `mcp__argent__launch-app {udid, bundleId}`.

4. **App state.** Read the device's `state.currentApp` from `pool.json` (`device-pool pool status --json`). When its `endpoint` is not the run's app endpoint:
   - another app open → `mcp__argent__shake`, then "Exit Application" in the DebugMenu (take the tap point from the tree the shake returned);
   - `mcp__argent__open-url {udid, url: "matrix://open?url=<app endpoint>"}`;
   - the first deep link on a simulator shows iOS's "Open in UnifyApps Preview?": `mcp__argent__await-ui-element {condition: "visible", selector: {text: "Open"}, timeoutMs: 3000}` and tap "Open" once; record it with `pool set <udid> deepLinkPromptSeen=true`;
   - choose Draft or Published as the run requires (the DebugMenu's switch): the fix and build loops always open Draft, since the Preview app runs drafts and the loops never publish; Published only when the person saw the issue on the published app. A client build (the app's own store or test build, which the test loop uses) runs the published app only, and record what the device now shows: `bash "$S/device-pool.sh" pool set <udid> currentApp.endpoint=<endpoint> currentApp.version="draft v<N>"` (or `published v<M>`).

   Dismiss a LogBox banner before the first tap of the phase.

5. **Signed in.** `mcp__argent__describe` must show a signed-in page for the run's test user. A signed-out simulator of the pool is not signed in by the agent: the run's [signed-in step](signed-in.md) has the person sign in once and copies it to the pool. Otherwise replay the recorded flow `signin-<user>` with `mcp__argent__flow-execute`; without such a flow, stop the phase with "sign in needed" and the device name. Never type a password. When the person gave a sign-in for this run in chat, the person types it on the device or it goes through the device tool's secret placeholder ([rules § Safety](../../loop-orchestrator/references/rules.md#safety)); it is never written into a brief, a report, a flow file or a commit.
   - **Sign-in stuck.** After Continue the app sometimes stays on the sign-in screen although the login call answered 200 (a known platform bug). Detect it: `describe` still shows the sign-in fields 10 s after Continue. Recover with `restart-app` and redo steps 4–5, at most twice; record it ([recoveries](recoveries.md)). A screen that stays signed out after the restarts stops the phase with `needs: sign-in`.

6. **Fresh config.** After every `mcp__argent__restart-app` or reload (the floating pill), prove the device refetched: `mcp__argent__native-network-logs {udid, bundleId}` shows the `entity-dependents-with-assets` call for Draft, or a `/deployed/…` call for Published. The evidence row for the phase carries `{version: "draft vN" | "published vM", refetchedAt, provenBy}`: `provenBy` names how the version was read (the version sheet, the DebugMenu label, the refetch call), or `unproven` when none was available: never assumed from the save. A test runner writes the version and how it was proven at the top of every issue log and retest file too.

7. **Actions.** The phase's taps, screenshots, measurements and flows. Tap points come from the tree the last tool returned, never from pixels. Measurement screenshots use `mcp__argent__screenshot {udid, scale: 1.0, includeImageInContext: false}` and go to disk; the report embeds downscaled copies and at most two images per pass are looked at. A memory warning, which some rendering bugs need before they show ([device traps](../../loop-orchestrator/references/device-traps.md) D17): `printf 1 > ~/Library/Developer/CoreSimulator/Devices/<udid>/data/var/run/memory_warning_simulation`, then a fresh layout.

8. **Release.** `bash "$S/device-pool.sh" release` on every exit path of the phase: success, error, stop. A phase that forgets this holds a simulator until the hook on Claude Code's Stop event or the TTL frees it.

## Evidence row

`phase · finding · kind (screenshot | network | log | measure | diff) · artefact path or quoted line · time · verdict · version (draft vN | published vM) · refetch proof (network-logs call)`. A device finding without the last two columns is `unverified`.

## Not confirmed

- The "Open in “UnifyApps Preview”?" prompt (Cancel · Open) and the version sheet ("Choose a version to open": `Draft vN · edited …`, `Published vM · live since …`) were seen on a release build on 2026-10-12 (experiments L0b); the DebugMenu labels ("Exit Application", the Draft/Published switch) still come from the transcripts of earlier build sessions.
- That `entity-dependents-with-assets` is the Draft refetch request and `/deployed/…` the Published one on a release build; seen on a development build in the history, not yet on a release build.
