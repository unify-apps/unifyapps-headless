---
name: loop-route-map
description: "Reads a UnifyApps app's page config through the UnifyApps Headless cache and lists the routes from the home page (or any start) into one target page, with block and event per hop: the navigation graph the device steps walk and the impact analysis reads. No device needed. A shared hidden block of the UnifyApps Headless loops (scope, triage, reproduction), read when asked 'how do I reach this page', 'which pages open X', for 'page opening paths' or a 'navigation graph', or before any device step that has to walk to a page."
user-invocable: false
---

# Native route map

Build the app's navigation graph from page config and list the routes into one page. Reads only. UnifyApps Headless reads follow [shared rules](../loop-orchestrator/references/rules.md#ua-ownership); `UnifyApps Headless` below is UnifyApps Headless's own CLI, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs"`.

| Situation | Read | Acceptance |
| --- | --- | --- |
| Routes into a target page | [Build](references/build.md) | `routes.json` written, `notes` read, routes reported as `page > page` with block and event per hop |
| A hop looks wrong: modal, row, condition, back or a field the script misses | [Config fields](references/config-fields.md) | The hop marked with what it needs, or the unconfirmed case named |

Script: `node "${CLAUDE_PLUGIN_ROOT}/skills/native-loops/loop-route-map/scripts/page-routes.mjs" --help` (Node 22, no packages).

Used by the UnifyApps Headless loops that reach a page on a device, tapping each hop ([loop orchestrator](../loop-orchestrator/SKILL.md)).
