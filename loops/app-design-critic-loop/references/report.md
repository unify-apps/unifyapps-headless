# Report template

Write `RUN/report.md` in exactly this shape. Sections with no issues still appear, with "None found."

```markdown
# <App name> — web app critique

<date> · <deployed URL> · Chrome for Testing · <design width> and 375 CSS px · <N> pages reviewed

## Summary

| Severity | Count |
|---|---|
| Critical | n |
| High | n |
| Minor | n |
| Nitpick | n |

<Three sentences at most: the overall impression from a user's chair, and the one thing to fix first.>

| Category | Critical | High | Minor | Nitpick |
|---|---|---|---|---|
| Stability and blockers | … |
| … all 12 categories, in taxonomy order … |

## Critical

### Stability and blockers

#### C1 · <title>
<issue body in the taxonomy issue shape, without the Severity, Category and Root cause key lines>

### Navigation and flow
…

## High
…same category order…

## Minor
…

## Nitpick
…

## Timings

| Page or action | Width | LCP or first content | CLS | INP or first feedback | Budget | Verdict | Issue IDs |
|---|---|---|---|---|---|---|---|
| <each page open at each width, each core action from timings.md> | … |

Timing resolution in this browser: <n> ms.

## Theme

| Role or component | Values found | Pages | Issue IDs |
|---|---|---|---|
| <page background, surface, accent, text primary, text secondary, border, divider, error, disabled, overlay, focus ring, then each component type and font role> | <exact values from the dumps; one value means consistent> | … | … |

## Page by page

| # | Page | Type | Design | Critical | High | Minor | Nitpick | Issue IDs |
|---|---|---|---|---|---|---|---|---|

Design is one of: `compared at <design width>`, `compared at both`, `no design`, `could not measure`.

## Coverage

- Pages reviewed: <list from navmap>, each at <design width> and 375.
- Not reached and why: <pages, states (error, empty), flows>.
- Probes not run and why: <list>.
- Timings not measured and why: <list>.
- Optional passes: <dark mode / 200% zoom / keyboard only: done or skipped>.
- Auth pass: <ran: sign-out, private URL, sign-in again, each with its result | not run: reason>.
- Notifications pass: <ran: the bell, the count, one marked read, arrival time | not reached: reason>.
- Direct opens: <every page opened by its URL in a fresh tab, reloaded, back | the pages that were not, and why>.
- Console errors and failed requests: <total per page, or none>.
- Address and branding leads: <the pages flagged, or none>.
- Account: <the role the walk ran as; a second account's run names its own folder>.
- Design: <n pages compared at the design width, n at both, n with no design, n could not be measured; the store's folder>.
- Lenses used: whole-page screenshots, the accessibility tree and a measured dump of the deployed app in UnifyApps Headless's browser. Colours and spacing are read from the page, not from design files.

## Tickets

<Written by the ticket stage after the person's yes: one line per ticket, `<key> · <title> · <priority> · <issue IDs> · <link>`; then the issues not ticketed, each with its reason. Before the stage runs, or when it was skipped: "Not filed: <reason>".>

## Next

Fix with `/ua:app-fix-loop`, this report as its input: the critical and high issues first.
```

## Rules for the text

- Write for a product owner and a designer, not an engineer.
- Every issue title says the problem in plain words and names the width when it is one: "Save button below the fold at 375 on New order", not "Responsive issue".
- In each category, issues follow the page order of the navigation map. An issue on several pages sits at its first page.
- Link evidence by relative path (`pages/04-new-order/screen-375.png`, `pages/04-new-order/probe-focus-3.png`) so the report works from the run folder.
