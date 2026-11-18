# The simulator pool

Goal: `N` simulators named `ua-sim-01` … `ua-sim-<NN>`, all on one iOS runtime, each with the Preview app installed, booted headless, recorded in `$LOOPS_HOME/pool.json`. Below, `S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-device-pool/scripts"`; every command also takes `--json`, and prints JSON on its own when stdout is not a terminal.

## Init

```sh
bash "$S/device-pool.sh" pool init --count <N> --preview-app <path-or-url>
```

`native-setup` runs this with the laptop's size: `loops.mjs` reads RAM and performance cores and passes `--count` (see `limits.md` of the loops). Without `--count`, `init` takes `config.pool.size` (`device-pool config set pool.size=<N>`; an older config's `pool.count` is read too), else the size of the pool that already exists, else the laptop default when the loops are installed beside this block.

What it does, in order, under the `pool-init` lock so two sessions cannot race it:

1. **Runtime.** `--runtime <id>`, else `config.pool.runtime`, else **iOS 18.6**, else the newest iOS 18.x runtime that offers the model (`--model`, default `config.pool.model` = `iPhone 16 Pro`). A 26.x or later runtime is never picked on its own: the Preview builds and argent's input were proven on 18.x, and a newer UI generation moves every measurement. Pass `--runtime` (or set `pool.runtime`) to pin one on purpose. A Mac without an iOS 18 runtime gets the install command in the error: `xcodebuild -downloadPlatform iOS -buildVersion 18.6`.
2. **Devices.** For each index, a simulator named `ua-sim-<nn>` (or `loops-<n>`, the name earlier versions gave it) is adopted when it exists, cloned with `--clone-from <udid>` (keeps the app and the dialog answers of the source), or created with `xcrun simctl create`. A pool that already exists keeps its devices; `init` only adds the missing ones. Each device is then brought up to date before it boots, a booted one by a restart: slimmed ([Slim simulators](#slim-simulators)) and given its `ua-sim-<nn>` name. A device another session has reserved is left alone; it is brought up to date when it is next reserved.
3. **The app** (skipped with `--skip-install`), in this order:
   - `--preview-app <path|url>`;
   - `config.previewApp.path`;
   - `config.previewApp.url`, downloaded to `apps/<sha256>/` and unpacked (`.zip`, `.tar.gz`, `.tgz`). A sha already present on disk is reused, so a second init does not download;
   - the app a booted simulator already carries (`simctl get_app_container <udid> <bundle id> app`, trying every Preview variant).

   The bundle id must be one of the Preview app's (`com.unifyapps.matrix`, `.preview`, `.internal` or `.development`); the installed one is recorded in `config.previewApp.bundleId`, and a different variant replaces it on install so one app answers the `matrix://` deep link. The build must carry `main.jsbundle` (`kind: release-embedded`); one without it is a development build (`kind: debug-metro`) and is refused.
4. **Boot and install.** `simctl boot` (headless, no Simulator window) + `bootstatus -b`, then `simctl install`. After the boot, `launchctl print-disabled system` inside the simulator says which services launchd really keeps off.
5. **Record.** `pool.json` holds the model, runtime, the app (bundle id, scheme, kind, source, sha256, version) and per device: udid, name, index, how it was made, `appInstalled`, `lastBootAt`, `slim` (launchd's answer after the last boot: `slim`, `stock`, `partial` or `unknown`), and a `state` block the protocol keeps (`currentApp {endpoint, version, since}`, `deepLinkPromptSeen`, `lastRestartAt`, `lastReleasedAt`). `config.previewApp.{kind, sha}` are updated too.

## The artifact input

`--preview-app` takes a `.app` folder, a `.zip` / `.tar.gz` of one, or a URL to such an archive: the UnifyApps Preview app's iOS simulator build, which the person gives. There is no default and the loops never download one on their own; `loops preview install --app <path>` (or `--url <url>`) hands it to `pool install`, and `loops setup --app <path>` does it before it creates the pool. The build is x86_64, so an Apple Silicon Mac needs Rosetta. `device-pool config set previewApp.path=<file>` (or `previewApp.url=<url>`) pins one for every later `init` and `pool install`. `pool status` shows the installed sha per device; when the source's content changes, `pool install` reinstalls on every device and clears each device's `currentApp`.

## Day-to-day

| Command | Does |
| --- | --- |
| `pool status` | One row per device: simulator state, app installed, slim or stock, who reserved it, the app endpoint it shows |
| `pool boot --udid U` / `--all` | Shut down, write the slim list (or clear it when `pool.slim` is false), boot again: the recovery for `init_failed`, and how a booted stock simulator becomes slim |
| `pool shutdown --udid U` / `--all` | Refuses a device another session reserved unless `--force` |
| `pool install [--udid U \| --all] [--preview-app …]` | Reinstall the app; records the new build in `pool.json` |
| `pool remove --udid U` / `--all` | Deletes the simulator; refuses reserved devices |
| `pool set U key=value …` | Writes dotted keys under the device's `state`, e.g. `currentApp.endpoint=… currentApp.version="draft v4"` |

## Add a device to the pool

A simulator driven outside the pool has no reservation, so the hooks cannot keep other sessions off it and `device-pool status` does not show it. Add it instead:

- **A new device:** `bash "$S/device-pool.sh" pool init --count <N+1>`. `init` keeps the existing devices and creates (or clones with `--clone-from <udid of a pool device>`, which keeps the app and the deep-link answer) only `loops-<N+1>`.
- **A simulator that already exists** (for example one you used by hand): shut it down, `xcrun simctl rename <udid> ua-sim-<NN+1>`, then `pool init --count <N+1>` adopts it by name and installs the Preview app when it is missing.
- Then `pool status` lists it; `reserve` hands it out like the others. Set `pool.size` in the config (`device-pool config set pool.size=<N+1>`) so the doctor and the next `init` agree.

## Slim simulators

A stock iOS 18.6 simulator with the Preview app runs 180–260 processes and takes 3.4 GB once it has settled, 5.2 GB in its first hours. Most of that is background work a test device never uses: Siri, Spotlight indexing, iCloud, photo analysis, widgets. A slim simulator runs about 66 processes and takes about 1.4 GB. It starts as fast and uses about half the CPU while an agent drives it, so a laptop holds about twice as many.

- **How.** When a simulator starts, its launchd reads which services to keep off from `/private/var/tmp/com.apple.CoreSimulator.SimDevice.<udid>/disabled.plist`. `pool init`, `pool boot` and `pool install` write the list there while the simulator is shut down, and keep every other entry in the file; nothing else on the Mac changes. The list survives shutdown, reboot and `simctl erase`, but a clone or a new simulator starts without it, which is why `init` writes it into each one before the first boot.
- **What stops working.** Siri, Spotlight and in-Settings search, iCloud and the Apple Account, remote push notifications, StoreKit testing, universal links, Mail, Calendar and Contacts sync, Health and Home, Wallet and App Clips. The `matrix://` deep link, argent, the photo library and photo picker, the keychain and the share sheet all work.
- **Turning it off.** `device-pool config set pool.slim=false`, then `pool boot --udid U`: that simulator restarts with every service on, and the laptop default sizes the pool for stock simulators. `pool boot` does not wait for a reservation, so use `--all` only when no other session holds a simulator. `pool.slim=true` and `pool boot` slim them again.
- **Checking.** `pool status` shows `slim`, `stock` or `partial` from the list, followed by `live: …` when launchd kept something else off at the last boot. A simulator that stays `stock` after `pool boot` runs on a runtime that ignores the list: it still works, only heavier. iOS 18.5 and newer keep the list across reboots; the pool runs 18.6.

## From an earlier version

A pool an earlier version made has stock simulators named `loops-<n>`, sized for stock simulators. Nothing has to be run by hand:

- **Each simulator** gets its `ua-sim-<nn>` name and is slimmed the first time this version touches it while no other session holds it: `pool init` (so `loops pool up` and `loops setup`) does it for every idle one, and `reserve` for the one it has just handed out. A booted simulator is restarted once for it, about 10 seconds; its udid, its app and its sign-in stay.
- **The size.** The session-start health line says when the laptop takes more simulators than the pool has, and `native-setup` offers to grow the pool; each new simulator takes about 1.5 GB of disk. Until then a run plans no more test runners than the pool has simulators.

## Sizing

Each simulator with the Preview app takes about 1.5 GB of disk once it has run, so ten take about 15 GB; every pool device stays booted, so memory is the tighter limit. The laptop default for slim simulators is `min(floor((RAM_GB − 10) / 2), perfCores, 12)`, at least 1: 7 on a 24 GB Mac with 8 performance cores, 10 on 36 GB. With `pool.slim` false it is `min(floor((RAM_GB − 10) / 4.5), floor(perfCores / 2), 10)`: 3 and 5. A device deleted by hand shows as `missing` in `pool status`; `pool init` recreates it under the same name with a new udid, slim.

## Not confirmed

- A full `init` from a local `.app` has created, slimmed, booted and installed real iOS 18.6 simulators, a clone included. An `init` that downloads the archive itself has not been recorded here yet.
- The `.tar.gz` layout of an EAS simulator build (the `.app` at the archive root) is assumed; `findAppBundle` looks four levels deep.
- The slim memory and CPU figures come from one Apple Silicon Mac, with the Preview app on its sign-in screen. A real page takes more; the 2 GB per simulator in the laptop default leaves room for it.
