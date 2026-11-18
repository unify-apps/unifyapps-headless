---
name: loop-preflight
description: "Checks, before a UnifyApps Headless loop run spends a builder attempt, that the solution folder is set up, the sign-in is alive and the tenant answers (classifying fetch failed, AUTH_EXPIRED, HTTP 5xx and bridge-down answers with one next action each); keeps the solution's loops profile in .nebula/loops/profile.json; and holds the run limits. Runs UnifyApps Headless's own CLI from the plugin it ships in. A shared hidden block of the UnifyApps Headless loops, read before any loop run on a UnifyApps MOBILE app and whenever a builder report says 'fetch failed', 'AUTH_EXPIRED' or an HTTP 5xx. Never writes to the tenant."
user-invocable: false
---

# Native preflight

The loops run against a tenant that fails often (HTTP 500 ×36, bridge down ×18, AUTH_EXPIRED ×6 in one early build). This block owns the checks every UnifyApps Headless loop run makes before it spends a builder attempt, and the solution profile every loop reads. UnifyApps Headless rules are in [shared rules](../loop-orchestrator/references/rules.md#ua-ownership). The laptop side (Xcode, the iOS 18 runtime, argent, baguette, the Preview app, ports, the file table) is `loops.mjs doctor` of [the loops](../loop-orchestrator/SKILL.md), not this block.

| Situation | Read | Acceptance |
| --- | --- | --- |
| A builder attempt is about to be spent, or a report says `fetch failed`, `AUTH_EXPIRED` or 5xx | [Health](references/health.md) | `check` prints `ok`, or a status with one next action; nothing is dispatched on anything but `ok` |
| A solution folder needs its profile, or a run reads one | [Profile](references/profile.md) | `validate` exits 0; the profile is `.nebula/loops/profile.json` (a legacy `.agentic-loops/profile.json` moved once); `app.type` is `MOBILE` |
| Passes, tokens, Figma calls and images in a run | [Limits](references/limits.md) | Every limit named with its source; a run that hits one says which |

Scripts live in `scripts/` (`S="${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-preflight/scripts"`): `health.mjs` and `profile.mjs`, each answering `--help`; `scripts/lib/ua-cli.mjs` runs UnifyApps Headless's CLI from this plugin. Node 22 or newer, no packages.

Used by `native-setup` (writes the profile) and by the start of every loop.
