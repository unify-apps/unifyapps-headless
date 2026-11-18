# Report template

Write `RUN/report.md` in exactly this shape. Sections with no issues still appear, with "None found."

```markdown
# <App name> — app critique

<date> · <platform> <OS version> · <device model> · <build/version if shown in the app> · <N> pages reviewed

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
<issue body in the taxonomy issue shape, without the Severity and Category lines>

### Navigation and flow
…

## High
…same category order…

## Minor
…

## Nitpick
…

## Timings

| Moment | Median | Slowest | Budget | Verdict | Issue IDs |
|---|---|---|---|---|---|
| Cold start | … |
| <each page open, sheet and core action from timings.md> | … |

Timing resolution on this device: <n> ms. Video recording: <used | not available on this target>.

## Theme

| Role or component | Values found | Pages | Issue IDs |
|---|---|---|---|
| <page background, surface, accent, text primary, text secondary, border, divider, error, disabled, overlay, then each component type and font role> | <hex values or radius/shadow estimates; one value means consistent> | … | … |

## Page by page

| # | Page | Type | Critical | High | Minor | Nitpick | Issue IDs |
|---|---|---|---|---|---|---|---|

## Coverage

- Pages reviewed: <list from navmap>.
- Not reached and why: <pages, states (error, empty, offline), flows>.
- Probes not run and why: <list>.
- Timings not measured and why: <list>.
- Optional passes: <dark / large text / landscape: done or skipped>.
- Lenses used: screenshots and the accessibility tree from a production build. Colours and spacing are measured from pixels and frames, not read from design files.
```

## Rules for the text

- Write for a product owner and a designer, not an engineer.
- Every issue title says the problem in plain words: "Save button hidden behind the keyboard on Edit profile", not "Keyboard issue".
- In each category, issues follow the page order of the navigation map. An issue on several pages sits at its first page.
- Link evidence by relative path (`pages/04-edit-profile/probe-keyboard-name.png`) so the report works from the run folder.
