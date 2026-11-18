# Devices and browsers — what a test runs as, and on

## Contents
- The run's device
- Walking as the device
- Submitting
- An existing case
- Browsers

A Test Studio case runs as **one device** on **one or more browsers**. The
device is the builder's device switcher type (`desktop`, `tablet`, `mobile`)
and model (`iphone14Pro`, `ipadMiniH`, `laptop1440x834`, …). It is compiled
into the case's script: its size, and for a tablet or phone a user agent and
touch. The browsers (`CHROMIUM`, `FIREFOX`, `WEBKIT` for Safari) are a
list saved beside the script, and the runner picks each one, so one script
serves them all. The
platform itself has no device, only its fixed size.

The device matters to the walk. A builder app picks its layout from the user
agent the server gets, once per page load. A browser at a phone's size with
a desktop user agent gets the desktop layout: steps walked there pass the
walk and fail every run.

## The run's device

- **The default.** `get_app_run_viewport` answers how a new case of the app
  runs: `runViewport` and `runDevice` (`type`, `variant`, and for a tablet or
  phone `userAgent`, `isMobile`, `hasTouch`), the app's primary device at its
  default model. Call it as soon as the platform screen URL is known.
- **A device the person names** ("test it on an iPad mini in landscape",
  "on a phone") wins over the default for the whole run. Map their words to
  a type and model with
  `node "${CLAUDE_PLUGIN_ROOT}/skills/app-test-author/scripts/device.mjs" list`,
  then `device.mjs resolve <type> [model]` gives the same `runViewport` and
  `runDevice` shape. A type with no model named takes the type's default.
  Pick an orientation by the size `list` prints, never by the `V` or `H`
  in a model's id: landscape is wider than tall, and `ipadProV` is
  1194 x 834.
  When the words fit two models, ask which, with AskUserQuestion. A name
  that is no model of any type: say which models exist; never pick the
  nearest size. In `app-test-create-loop` and `app-test-discover-loop` the
  contract's device field is the device the person named, and these
  questions are asked at kickoff only.
- **Record it.** `scenarios.md`'s run header names the device ("Runs as:
  tablet ipadMiniH, 1133 x 744"), so the approval shows it and the person
  can change it there. A change at approval makes the main session's
  browser that device again (below) before the helpers start.
- **A browser-extension scenario runs on desktop**, whatever the run's
  device: the extension's browser starts with the size alone, so a tablet
  or phone emulation would not apply, and `deliver_steps` refuses one. On a
  tablet or phone run, its run-file entry carries `device.mjs resolve desktop`'s device
  (`parallel-authoring.md`, _The run file_). When the person named a tablet
  or phone for a run with extension scenarios, say once that those
  scenarios run on desktop.
- **The tenant predates devices** when `get_app_run_viewport` answers no
  `runDevice`: walk at `runViewport` alone and send no device, as before.
  A device the person named cannot be saved there: say so once.

## Walking as the device

The source of a walk's device is a JSON file holding a size and a device:
the run file itself (`viewport`, `device`), or a file you write holding a
case's `runViewport` and `runDevice` from `get_test_case`.

- **The MCP browser** is already running, so each tab takes the device in
  place: `device.mjs code <source>` prints a function; pass it unchanged to
  one `browser_run_code_unsafe` call. It sets the size, the user agent and
  touch on that tab, and reloads a loaded page. Run it before the sign-in
  opens the app, in every tab the walk opens, and after the browser reopens
  from its idle close. While a tablet or phone runs, `browser_resize` does
  nothing: change the device only through this call. Desktop and a size
  with no device use the same call, which also clears an earlier tablet or
  phone. When the `playwright` MCP offers no `browser_run_code_unsafe`, a
  desktop or size-only walk uses `browser_resize`; a tablet or phone walk
  says it cannot be emulated in this browser and stops.
- **A helper's wrapper browser** starts as the device:
  `device.mjs config <source> <out>` writes the playwright-cli config, and
  the browser opens with
  `open about:blank --config=<out>`. Every tab of that browser then opens
  as the device, so no tab needs resizing. The main session writes the run's
  config once, after the run file (`parallel-authoring.md`), and each
  helper opens with the file its entry names.

## Submitting

`deliver_steps` takes the device as `device`, `{ "type", "variant" }` only
(never the user agent or size: the model gives both). Send the device the
walk ran as, from the helper's run-file entry or the run file, on every new
case and every fix-round resubmission. Send none for the platform, or when
the run file's `device` is `null`. A re-delivery that sends none keeps the
case's own device.

## An existing case

`get_test_case` answers `runViewport` and `runDevice`, the device the case's
runs use; no `runDevice` means the case was saved before devices and runs at
its size alone. Before an update, auto-heal or heal walk replays a case, put
both in a source file and make each of its users' browsers that device
(_Walking as the device_).

A re-delivery through `deliver_steps` keeps the case's device on its own. A
steps write-back compiles its script with `app_testing`: pass the case's
`runViewport` as `viewport` and its `runDevice` as `device`, verbatim, so the
script keeps the size and device every run opens the app with. When
`app_testing`'s input schema lists no `device`, the tenant compiles none: a
size-only case still writes back with its `viewport`, but a case whose
`runDevice` is a tablet or phone would run with a desktop user agent under
steps walked on the tablet or phone layout. Do not write such a case back:
report it with this reason, and leave it unchanged.

## Browsers

- **The choices** are `CHROMIUM`, `FIREFOX` and `WEBKIT` (Safari). A case
  that installs a browser extension runs on `CHROMIUM` only.
- **A new case** saves no list, and runs on Chromium alone, by itself and
  in a suite or plan. Set its browsers only when the person asks for them
  ("on Chrome and Safari"): once a case is created, `update_test_case` on
  its id, `browsers` set to the list. A case keeps at least one browser.
  The person's ask is the go-ahead for that write; record the browsers in
  `scenarios.md`'s run header, as the device.
- **A suite or plan** has no list of its own: each member case runs on its
  own browsers (`suites-and-plans.md`, _Browsers_).
- **A result per browser.** A case run on several browsers has a result for
  each; a browser a case leaves out shows as not applicable, not failed.
  Report each browser's result, never one verdict for all.
- **The walk is Chromium.** Every browser UnifyApps Headless walks in is Chromium, so a
  red that failed on Firefox or Safari, while Chromium passed in the same
  run or the case does not run on Chromium, cannot be replayed here: the
  heal loop sets it aside with the root cause `browser specific`.
- **The tenant predates browsers** when `update_test_case` refuses
  `browsers` as an unknown argument: say so once, and leave the lists as
  they are.
