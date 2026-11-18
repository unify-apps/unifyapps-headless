---
name: app-best-practices
description: The rulebook a UnifyApps no-code app is built and reviewed against. 1537 rules in 20 areas, each with a severity from P0 to P3 and the app type it applies to. Read when building, changing or reviewing a web or mobile app's pages, data sources, navigation, theme or access.
user-invocable: false
---

# App best practices

One rulebook for every no-code app. A builder follows it while building, and `/ua:app-config-review` checks an app against it. A rule applies to every app unless it says web only or mobile only.

## Severity

| Severity | Meaning |
|---|---|
| P0 | Blocks release: a broken or dead control, lost or leaked data, a page that does not render. |
| P1 | Fix before release. |
| P2 | Has a workaround. Fix in the next pass. |
| P3 | Hygiene. Fix when you are there anyway. |

## Who checks a rule

The platform's own page checks find some rules, `scripts/rule-check.mjs` checks 44 from the stored config, and a reviewer judges the rest by reading the config. `rules.json` says which, for scripts.

## Areas

| Area | File | Rules | P0 and P1 | What it covers |
|---|---|---|---|---|
| Configuration integrity | [int.md](references/int.md) | 124 | 77 | Ids resolve, nothing is orphaned, deprecated patterns are gone. |
| Data sources and queries | [data.md](references/data.md) | 108 | 79 | The right query, bounded, triggered at the right time, refreshed after writes. |
| Performance and page weight | [perf.md](references/perf.md) | 51 | 19 | What the page costs to load and render. |
| Custom code and expressions | [code.md](references/code.md) | 130 | 55 | Page functions, scripts, bindings and custom CSS that are correct and earn their place. |
| Loading, empty and error states | [state.md](references/state.md) | 77 | 30 | Every data-bound surface says what is happening. |
| Components | [comp.md](references/comp.md) | 218 | 80 | Tables, repeatables, forms, charts, cards and Copilot used the way they are built to be used. |
| Layout, sizing and responsive | [layout.md](references/layout.md) | 57 | 14 | Sizes, scroll and per-device overrides that hold on every screen. |
| Navigation and routing | [nav.md](references/nav.md) | 90 | 48 | Menus, page paths and back controls. |
| Theme, styles and branding | [theme.md](references/theme.md) | 56 | 5 | Tokens over hard-coded values; the client's brand. |
| Security and access | [sec.md](references/sec.md) | 118 | 97 | Who can open what, and what can leak. |
| Accessibility | [a11y.md](references/a11y.md) | 13 | 2 | Names, labels, contrast and titles. |
| Naming, copy and localisation | [copy.md](references/copy.md) | 62 | 8 | Names a builder can read, words a user can read. |
| Intent and simplicity | [intent.md](references/intent.md) | 26 | 4 | Judgment calls: does the page do its job, with as little as it needs. |
| How it is built | [build.md](references/build.md) | 9 | 4 | Signs a page was built the wrong way even when every setting is valid: workarounds, guessed context, hidden behaviour, copies and dead weight. They make it break quietly and hard to change. |
| Files and uploads | [files.md](references/files.md) | 11 | 7 | Who can open what users upload, and where it is stored. |
| Export and print | [export.md](references/export.md) | 9 | 6 | PDF export and print layouts that come out whole and on time. |
| Objects the app binds to | [obj.md](references/obj.md) | 14 | 7 | Indexes, permissions, store type and field shapes behind the page's data. |
| Automations the app calls | [auto.md](references/auto.md) | 119 | 33 | The workflows a page triggers: the platform's workflow checks plus limits read from their code. |
| Agents the app calls | [agent.md](references/agent.md) | 33 | 14 | AI agents behind Copilot and chat blocks: the platform's agent checks and the review checklist. |
| Mobile only | [mobile.md](references/mobile.md) | 212 | 127 | Rules for MOBILE apps on the UnifyApps mobile renderer. |

[must-fix.md](references/must-fix.md) lists every P0 and P1 rule in one file. Builders read that one.

## Checking a page with the script

`node "${CLAUDE_PLUGIN_ROOT}/skills/app-best-practices/scripts/rule-check.mjs" --app-id <app id> [--pages <page id>,…] --out <file>`, run from the solution folder, checks the cached app and writes JSON: `findings` (the rule's text as `title`, severity, page, target, evidence), `checked` (the rule keys that ran) and `errors` (a check that threw; the others still ran). Run `solution refresh --json` first: a stale page is skipped and listed under `skipped`, never read old. The script is [scripts/rule-check.mjs](scripts/rule-check.mjs).

Before a build changes a page, save a baseline with the same command. After its read-back, run it again with `--baseline <file> --touched <ids it wrote>`: it exits 1 when a P0 or P1 is new on something it wrote, and `gate.blocking` lists them. Problems the page already had do not count. It exits 2 when it could not check: a check threw, or a page it was given could not be read, so an empty result is never a pass.

`rules.json` holds the same rules as data, for scripts.
