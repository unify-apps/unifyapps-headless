# Check: responsive (WEB only)

Does the page hold together at both widths it is used at: nothing wider than
the window, no text cut off or drawn over other text, and a menu that fits
each width? A WEB check: on a MOBILE app it does not run (the phone has one
width, which the UI check measures). Runs as [audit checks](../audit-checks.md)
§ The check agent says. Issues: `RS<g>-<nn>`, `check: responsive`, `kind: layout`
or `navigation`.

The rules are web-browser's W12–W15
([checks](../../../../web-loops/web-browser/references/checks.md)): W12
overflow, W13 cut text, W14 text over text, W15 the navigation per width.

## Widths

The design width (1440) and the second width (375). At 375 the app is drawn in
the preview's phone frame, so a block is held to the app frame's edges, not
the window's. A width the preview does not offer is reported as not checked,
with the sizes its menu showed; it is never guessed.

## Config (the check agent, from the cache)

1. **Fixed sizes.** From `ua cache blocks <pageId> --app-id <appId>`: a
   block with a fixed width over the second width, a row of columns with no
   wrap, a table with no horizontal scroll. Each is an issue with
   `device: config` that the browser confirms or drops.
2. **The menu per size.** `ua cache nav <appId>`: the bar's position and
   what draws it at each size (XL, LG, MD, SM). A side bar kept at SM, or a
   size with no menu and no menu button, is an `app shell` issue; moving the
   bar is a manual step in the builder (*App settings → Navigation →
   Appearance*), so its fix hint says so.

## Device (queued, never waited for)

One `responsive` request per page, after `loops cache-export`:

```
loops queue add --run <R> --kind responsive --platform web --page <pageId> --page-name "<Page>" \
  --version draft --app <appId> --note "widths 1440,375; path <preview path>; group <g>; start <s>"
```

`<s>` is this request's own first issue number ([audit checks](../audit-checks.md) § The checks: the check agent's issues are `<P><g>-01` up, its k-th request starts at 50 × k + 1).

The test runner
([runner](../../../../web-loops/web-browser/references/runner.md)) runs
`responsive.mjs --widths 1440,375` from one open and writes the issues of the
`responsive` check, one issue per problem at the widest width it shows at,
naming the other width.

## Done when

Every page in the group has issues, `ok`, or `Not reached` at each width in
scope, and its responsive request is queued with its id in the issue log's
footer.
