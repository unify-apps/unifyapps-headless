# Check: a11y (WEB only)

Can every person use the page: a screen reader names each control, each
field says what it takes, the text is readable against its background, and
the headings and ARIA tell the truth? A WEB check: on a MOBILE app it does not
run (the UI check covers what the device shows). Runs as
[audit checks](../audit-checks.md) § The check agent says. Issues: `AY<g>-<nn>`,
`check: a11y`, `kind: component`, `colour` or `typography`.

The rules are web-browser's W7–W11
([checks](../../../../web-loops/web-browser/references/checks.md)): W7
accessible names, W8 form labels, W9 WCAG AA contrast, W10 heading order, W11
ARIA.

## Config (the check agent, from the cache)

1. **Names and labels in config.** From `ua cache blocks <pageId> --app-id <appId>`
   and `ua cache form <pageId> --app-id <appId>`: an IconButton or an
   icon-only Button with no label or tooltip, an Image with no alt text, a form
   field with only a placeholder, a Typography used as a heading without a
   heading variant. Each is an issue with `device: config`; the browser decides
   what a screen reader really hears.
2. **Colour tokens.** A text colour or a background set as a bare hex that the
   theme also sets as a token is a likely contrast drift between light and
   dark; it is an issue only when the browser measures it under AA.

## Device (queued, never waited for)

One `a11y` request per page, after `loops cache-export <appId> <pageId> --run <R>`:

```
loops queue add --run <R> --kind a11y --platform web --page <pageId> --page-name "<Page>" \
  --version draft --app <appId> --note "widths 1440,375; path <preview path>; group <g>; start <s>"
```

`<s>` is this request's own first issue number ([audit checks](../audit-checks.md) § The checks: the check agent's issues are `<P><g>-01` up, its k-th request starts at 50 × k + 1).

The test runner
([runner](../../../../web-loops/web-browser/references/runner.md)) runs
`a11y.mjs` at the design width (1440) and the second width (375) and writes
the issues of the `a11y` check. A finding outside the page root (the menu, a
shared header) is an `app shell` issue and goes to the app-shell job.

## Done when

Every page in the group has issues, `ok`, or `Not reached` at each width in
scope, and its a11y request is queued with its id in the issue log's footer.
