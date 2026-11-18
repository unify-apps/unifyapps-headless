# Stage: retake (only on request)

Retakes every "before" screenshot one for one on the published app, same
screen and same state, so a before-and-after report can show them side by
side. Runs only when the person asks for after shots; no goal runs it on its
own. Reads only. Replaces the old report-retake loop.

## Inputs

- The before folders (an audit's evidence folders, or any shot set) and their
  notes: which account, which version, which state.
- The version to capture: published v<M> by default, read from the tenant first
  (`list_interface_versions` through a read-only brief, or
  `ua cache app <appId>`).
- Data variants: `--variant <input>=<value>` for list and data pages, opened by
  deep link `matrix://<slug>?<input>=<value>` once the app is loaded (D11); the
  after shot gets `--<value>` before the extension.

## 1. Plan the capture (no device)

List every before shot with its screen and state, from the notes and the shot
itself (a downscaled look only when the notes do not say). Split into capture
groups, at most one per pool simulator, related screens together, each list
in `R/after/<group>/list.md`.

## 2. Capture (one agent per group, in parallel)

Each capture agent, holding its own reservation:

1. Device protocol steps 2–6 with the published version; confirm the version
   once in the version sheet and record how it was proven.
2. Per before shot: a downscaled copy to match framing (`sips -Z 500`); the
   same screen and state (tab, sheet open, scroll position, month, filter);
   data loaded (no spinner or skeleton, at most 20 s, else take it and note
   it); `screenshot` at scale 1.0 to `R/after/<group>/<the before file name>`.
3. Data variants on list and data pages only, saved as `<name>--<value>.png`.
4. Chat messages only where the list says (a message that only reads); never a
   card's submit, apply or approve; no other write.
5. One mapping row per shot as it goes; the reservation released on every exit path.

## 3. Merge

`R/after/mapping.md`, header: app, version captured and how it was proven,
device, time, the variants. Then:

```
| before path | after path(s) | screen | what visibly changed | notes |
|---|---|---|---|---|
| before/a/05-history-sheet.png | after/a/05-history-sheet.png, after/a/05-history-sheet--<value>.png | Chat history sheet | taller sheet, rows 56 pt, title 20/600 | — |
```

The after shot keeps the before shot's file name. `what visibly changed` holds
facts only. A shot not taken is a row with `—` and the reason.

## On a WEB app

A capture agent holds a browser folder (`R/runners/web-<n>/browser/`, `<n>`
its group's number), not a reservation, at most `capacity.browsers` at once.
Below, `B` is
`node "${CLAUDE_PLUGIN_ROOT}/skills/app-verify/scripts/browser.mjs" R/runners/web-<n>/browser/`,
UnifyApps Headless's own browser ([web-browser](../../../../web-loops/web-browser/SKILL.md)). UnifyApps Headless's
browser opens the builder preview route, which shows the saved draft: before
capturing, check with `ua cache app <appId>` that the draft holds nothing
newer than the published version (the page's version equals the deployed
one), else say so and capture only on the person's yes, labelled
`draft (preview route)`. Each shot is `B page-shot <width>` at the width the
before shot was taken at (1440 by default; at 375, `open.mjs --width 375`,
then `B fit-page` and `B screenshot`; both save into the browser folder,
page-shot as `page-<width>.png`), copied to where step 2 saves a MOBILE
shot, `R/after/<group>/<the before file name>`, with the page's inputs in the
preview path's params in place of a deep link; data variants are other param
values.
Every browser is closed (`B close`) on every exit
path.

## Done when

Every before shot has an after row, every reservation is released (on WEB
every browser closed), and the person has the folder path. The report built from it is the person's to share.
