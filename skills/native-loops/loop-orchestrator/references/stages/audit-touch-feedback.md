# Check: touch feedback (MOBILE) · interaction (WEB)

## Contents

- Config (the check agent, no device)
- Device (queued, never waited for)
- WEB: the interaction check
- Done when

Does every tap show the person something? A Pressable with no touch feedback
looks dead under the finger; a button that calls a source and shows nothing
looks broken. The web preview hides both (a hover is not a press), so
builders and FDEs miss them, and the phone shows them on every page. Runs as
[audit checks](../audit-checks.md) § The check agent says. Issues:
`PR<g>-<nn>`, `check: touch-feedback`, `kind: touch-feedback` or `interaction`.

The rules are the page quality rulebook's
[U1 press feedback, U7 tap targets and X2 feedback on every interaction](../../../../app-page-quality/references/rulebook.md).
On a WEB app a person points and tabs rather than presses: the same file is
the interaction check (`check: interaction`), which looks at hover, focus and
the keyboard instead (§ WEB: the interaction check).

## Config (the check agent, no device)

1. **The rulebook's findings.** `node "${CLAUDE_PLUGIN_ROOT}/skills/app-page-quality/scripts/page-audit.mjs" <pageId> --app-id <appId> --json`;
   keep U1, U7 and X2, and judge the `candidates.interactions` the script
   leaves to the session (a Pressable's slow chain needs a separate loader).
2. **Every tappable, listed.** From `ua cache outline` and
   `ua cache events <pageId> --app-id <appId>`: every Pressable, Button,
   IconButton and Card with an event; every Repeatable wired through
   `onSelectItem` and every Carousel through `onSlideClick`; every Stack,
   Icon, Typography, Divider or Image that carries an event (none takes a tap
   on the phone with feedback). Write them to `R/touch-feedback/<pageId>/tappables.json`:
   `[{blockId, name, type, surface, label, chain: "navigate | source | submit | write | other"}]`.
3. **The surface's feedback.** Per tappable, read
   `ua cache blocks <pageId> --app-id <appId> --name <block> --field component.appearance.interactions`
   and judge it against its surface:

   | Surface | Feedback it calls for |
   | --- | --- |
   | White or flat card, list row | highlight `{ "custom": "#EFF0F2FF" }`, opacity 1, scale 1 |
   | Coloured tile, photo card, icon tile | opacity 0.6 |
   | Solid call to action | scale 0.96, a light haptic |
   | Link | opacity 0.5 |
   | Any of them | `androidRipple: false`, so both platforms feel the same |

   No `appearance.interactions`, a pressed opacity or scale of 0 or 1 (no
   change), a bare hex highlight (`"#EFF0F2"` is none), a highlight under an
   opaque child Stack, an event on a block that takes no tap, a list row
   template that is not a Pressable: each is an issue. A tab of a tab bar with
   feedback off on purpose is `ok`.
4. **Feedback on interactions (X2).** A Button or IconButton whose chain
   calls a source or submits a form must bind `appearance.loading` to the
   source's `isLoading` or a page variable the chain sets; a loading that is
   on for good is a `critical` issue (the button never presses); a chain that
   writes needs a `showNotification` on success and on error.
5. **Fix hint.** Name the feedback the surface calls for. `update_blocks`
   writes `appearance.interactions` only on a Pressable, so a Card, a list row or a
   slide that must show feedback becomes a Pressable (or gets one as its root)
   and its actions move to `onPress` (rulebook U1 § Fix).

`severity`: `critical` when the main action of the page shows nothing or never
presses; `major` for any other U1 or X2 source and submit finding; `minor`
for U7 and the advisory part of X2.

## Device (queued, never waited for)

One `touch-feedback` request per page, naming its tappables file:

```
loops queue add --run <R> --kind touch-feedback --page <pageId> --page-name "<Page>" --version draft \
  --app <appId> --issues R/touch-feedback/<pageId>/tappables.json
```

The test runner, per tappable, on the page's resting state: `describe` for the
frame (never a remembered point); `gesture-custom` Down at the frame's centre,
hold 150 ms, `screenshot` to `R/touch-feedback/<pageId>/<blockId>--down.png`; Up;
`screenshot` to `--up.png`. A tap whose chain navigates or writes is held and
released outside the frame (slide off before Up), so nothing runs; a chain
that writes is never released inside it. Per page the test runner builds one
composite of every pair, downscaled, and judges each pair: `changed` (a
highlight, a dim or a shrink is visible) or `unchanged`. Only that one
composite is looked at. An `unchanged` pair is an issue with `device: device`;
a config issue the shot proves gets `device: device` and the shot as evidence.

## WEB: the interaction check

The same question for a pointer and a keyboard: does every control show that
it can be used, and can the keyboard reach it? The rules are web-browser's
W1–W6 ([checks](../../../../web-loops/web-browser/references/checks.md)): W1 a
hover look, W2 a visible focus indicator, W3 a pointer cursor, W4 keyboard
reach and no trap, W5 focus order, W6 a pressed look.

- **Config.** `page-audit.mjs` refuses a WEB app, so steps 1, 3 and 5 do not
  run as written: the surface table above is the phone's. Step 2 still lists
  every block that carries an event (`cache events`) into
  `R/touch-feedback/<pageId>/tappables.json`, and step 4 (X2: a loading state
  on a button whose chain calls a source or submits, a notification on
  success and error of a chain that writes) is judged by hand from the cache.
  An event on a block a keyboard cannot reach (a Stack, an Image, a
  Typography) is an issue for W4 that the browser confirms.
- **Device.** One `interaction` request per page, after
  `loops cache-export <appId> <pageId> --run <R>`; the test runner
  ([runner](../../../../web-loops/web-browser/references/runner.md)) runs
  `interaction.mjs` at the design width (1440) and the second width (375)
  (`--active` for W6) and reads only: it hovers, presses Tab and Escape, and
  never clicks:

  ```
  loops queue add --run <R> --kind interaction --platform web --page <pageId> --page-name "<Page>" --version draft \
    --app <appId> --issues R/touch-feedback/<pageId>/tappables.json --note "widths 1440,375; path <preview path>; group <g>; start <s>"
  ```

  `<s>` is this request's own first issue number ([audit checks](../audit-checks.md) § The checks: the check agent's issues are `<P><g>-01` up, its k-th request starts at 50 × k + 1).

  A `touch-feedback` request with `--platform web` is refused, naming
  `interaction`. Issues: `PR<g>-<nn>`, `check: interaction`,
  `kind: interaction` (W1–W6); a control in the menu or a shared header is an
  `app shell` issue.

`severity` on WEB is the check's own: W1 `major` (`minor` when the control has
a pressed rule or a ripple), W2 and W4 `major`; W3, W5 and W6 `minor`. The
page's main action with no hover look and no focus indicator is `critical`.

## Done when

Every tappable of every page in the group has a verdict in
`tappables.json` (`ok`, an issue id, or `not reached` with the reason), and the
page's `touch-feedback` request (`interaction` on WEB) is queued.
