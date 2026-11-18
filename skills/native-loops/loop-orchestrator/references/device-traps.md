# Device-proven traps

What a MOBILE page does on the phone that its config, the builder's read-back
and the web preview do not show. Every trap was seen on an iOS simulator
against a saved draft, and each cost a builder attempt before it was known.
The [builder brief](builder-brief.md) copies the traps that touch an app's
blocks; test runners use the ids in an issue's `fix hint`. Brief and
tool traps that `native-lint`'s `task-lint` catches are kept in that block;
D01 is linted there as T23.

| id | Trap | What the device shows | Write instead |
| --- | --- | --- | --- |
| D01 | A `{{ … }}` expression inside a block's native custom style JSON (`customStyles`, `additional.customCSS`, e.g. `borderColor: {{ item.border }}`) is not evaluated on the phone | a red toast "cssToNativeStyles: Failed to parse declaration borderColor: {{ … }}" over the tab bar; the border falls back | literal values per state (one block per state, shown by condition), or an appearance property the block's sheet says takes a binding |
| D02 | A repeatable or list bound to a path that is undefined on first paint | toasts "Dynamic path value is not a string at path: undefined", one per row | guard every bound path with a default (`?? ''`, `\|\| []`) |
| D03 | The web preview is not the phone: paddings, button heights and corner radii differ | a page that matches in the builder is off by 2–12 pt on the device | judge on the simulator; the test runner's numbers win |
| D04 | A ScrollView's own padding and gap, and a grid's horizontal padding, are saved but not applied on the phone | content flush to the edges, no gaps | wrap the content in an inner Stack that carries the padding and the gap |
| D05 | On a MOBILE app the builder rebuilds `appearance.customStyles` from `additional.customCSS`; the phone drops `customStyles` when `customCSS` is absent | a style that reads back but never shows | write both, identical (the object, and the same object as a JSON string) |
| D06 | Free `px` strings in custom style objects can be dropped on the way to React Native | square corners, no padding, no error | numbers, or token classes; read the device, not the config |
| D07 | An app theme chosen by a condition refuses theme writes (`set_app_theme`, typography, component styles) | the write is refused | put the look's values on each block, through the tokens the theme already has |
| D08 | Colour forms on native: standard tokens work as a token name or `{custom:"var(--token)"}`; custom tokens only as `{custom:"var(--…)"}`; compound values (`1px solid var(--border-secondary)`) work in custom CSS; a palette name as a class does not | a colour that stays light in dark mode, or falls back | a token for anything that differs between light and dark; never a hex there |
| D09 | A Calendar range picker needs both range defaults set on the phone | the range picker breaks or draws nothing | keep both defaults; track "picked by the person" in a page variable |
| D10 | A shadow on a page shown inside a chat message (an in-chat card page) is clipped by the message's body view | the shadow is cut on the left | no page setting fixes it: a `platform` issue |
| D11 | Deep links: once the app is loaded, `matrix://<page slug>?<input>=<value>` opens a page with inputs; `matrix://open?url=<endpoint>/<slug>` does not | the second form opens the home page or nothing | open the app endpoint first (`matrix://open?url=<endpoint>`), then page slugs |
| D12 | A page rendered inside a chat message (an in-chat card) keeps the inputs, page events and exact message texts the AI agent routes on | a reworded button message the agent no longer understands | read the page's events before changing a button; keep every declared input and every message text |
| D13 | An upload or file block mounting before its provider on the first open of a new draft | "Render Error … Not initialised", then "Something went wrong"; a restart recovers | restart once; if it repeats, a `platform` issue |
| D14 | A LogBox banner over the tab bar and the composer | screenshots and taps hit the banner | dismiss from the tree before tapping; in an audit the banner text is a `bundle` issue |
| D15 | After Continue the app sometimes stays on the sign-in screen although the login call answered 200 | the sign-in screen again | `restart-app`, at most twice, and record it |
| D17 | A rendering bug can stay hidden through reloads, exits and cold starts and show only after iOS sends a memory warning: React Native then empties its font and image caches, and the next layout rebuilds them from the files on disk now | text drawn as boxed "?" glyphs, or an image gone, only after the warning; reloads looked fine | before a rendering issue is `not reproduced`, send a memory warning: `printf 1 > ~/Library/Developer/CoreSimulator/Devices/<udid>/data/var/run/memory_warning_simulation` (the file the app's `SIMULATOR_MEMORY_WARNINGS` environment variable names; `simctl spawn <udid> notifyutil -p UISimulatedMemoryWarningNotification` does nothing). Then force a fresh layout (switch tabs, or open and close a sheet) and look again |

## On WEB

The D traps are the phone's: its renderer and the Preview app. A WEB
page is judged in UnifyApps Headless's browser on the builder preview route,
where it draws as a person sees it, so D03 does not apply and D01, D02,
D04–D06, D08–D11 and D13–D17 do not either. D07 (a theme chosen by a
condition refuses theme writes) and D12 (an in-chat card keeps the inputs and
message texts its AI agent routes on) are about the builder's tools and the
agent, not the phone, and hold on WEB too, as do the automation traps below.
`task-lint --platform WEB` skips T23, D01's lint, with the other phone traps.
What the preview adds to a WEB measurement (a page drawn in a same-origin
iframe, the 375 app frame inside the phone frame, a block root that wraps the
element that paints, the builder's own long tasks and bytes) is handled by
web-browser's [checks](../../../web-loops/web-browser/references/checks.md)
§ Good to know and web-profile's
[metrics](../../../web-loops/web-profile/references/metrics.md) § What the
numbers cannot see. A test runner that proves a WEB trap adds it here as
`WD<nn>`, the way § Adding a trap says.

## Automation traps

Met while reading, test-running and fixing automations; every automation
job's brief copies them.

| id | Trap | Write instead |
| --- | --- | --- |
| A01 | A test run started from the tool has an empty run timezone; a step that builds a zone from it fails in test runs only | prove the changed step in the run's node results; settle the full answer with an app run (`list_workflow_runs`) |
| A02 | A lookup moved inside a condition and skipped leaves its parameter out of a later Groovy step ("No such property") | `binding.hasVariable('x') ? x : null` in the Groovy step |
| A03 | An empty input spliced unquoted into SQL fails the whole run | return the empty result early when the input is missing, and quote the value |
| A04 | An automation that fails when a record is missing breaks every page that calls it for a new account | return the empty result (outputs unchanged) instead of failing |

## Adding a trap

A test runner that proves a new trap adds it here in the run's
`brief/BRIEF-COMMON.md` as an `UPDATE` ([builder brief](builder-brief.md)),
with the draft version it was seen on. A trap moves into this file in a plugin
change, with the run that proved it named in the PR, never the tenant.
