---
name: web-design-spec
description: "Reads a WEB app's design into the design store for the UnifyApps Headless loops: one reference picture and one spec per screen and width (home@1440), in CSS px as the frame draws it, with no phone scaling, from Figma frames, an HTML prototype or screenshots. A hidden block of the web loops' design intake; read when asked to 'read the Figma for the web app', 'add this screen's design' or 'which widths does the design cover'."
user-invocable: false
---

# Web design spec

A WEB design is read at the width it was drawn at. A Figma frame 1440 wide
becomes `specs/home@1440.json` and `screens/home@1440.png` in the solution's
design store, every box and value in CSS px from the frame's top-left: no
402 pt scale, no 4 pt grid, no safe top, no phone bars. A second width with
no frame of its own gets no spec: the responsive check covers it.

| Situation | Read | Acceptance |
| --- | --- | --- |
| Start the store, or add a screen from a Figma frame, a prototype page or a picture | [Intake](references/intake.md) | `store.mjs status` lists the screen at its width (`home@1440`) with a reference and a spec, and its next step is `ready` |
| Which widths a run checks | [Intake](references/intake.md#widths) | `status` names the design width as a screen with a spec; a width with no frame is listed as "no spec, so not compared", which is expected |

The store, its commands and the Figma board are
[native-design-spec](../../native-loops/native-design-spec/SKILL.md)'s: the
board, the person's Figma exports, rate limits and the spec shape work as
they do for a MOBILE app. This block says what differs on WEB. Scripts:
`S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/native-design-spec/scripts"`
(`store.mjs`, `figma-spec.mjs`; Node 22, no packages, each answers `--help`).

Next: [web-visual-check](../web-visual-check/SKILL.md) measures the page
against these specs, one width at a time.
