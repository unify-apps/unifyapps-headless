---
name: loop-feature-recipes
description: Holds the feature recipes the build loops plan from when the person describes a feature of an app (MOBILE or WEB) with no design - usage tracking, an analytics dashboard, near-realtime refresh, notifications, a third-party analytics tag (WEB only), and true realtime push (an open question for the platform team, which falls back to near-realtime). Each recipe names the objects, automations, pages and AI agents a feature needs, the builder agent and the knowledge skills for each, its security and performance rules, the acceptance and realtime checks that prove it, and what MOBILE, WEB or UnifyApps Headless cannot do. A hidden block of the UnifyApps Headless loops, read by the build loop's feature stage when the person asks to "add analytics", "track usage", "show a dashboard", "make it realtime", "update the list live", "notify the manager when", "email me when" or "add a tracking tag".
user-invocable: false
---

# Feature recipes

A recipe is a reference note for one common feature. It tells the build
loop's [feature stage](../loop-orchestrator/references/stages/feature.md)
which entities the feature needs, who builds each, and how to prove it. It
is not a script and it holds no platform property paths or tool arguments:
each builder agent reads its own knowledge sheets before it writes.

## What a recipe holds

| Section | Holds |
| --- | --- |
| When | the words that pick it, and the words that mean another recipe |
| Questions for the person | at most four, each with its default; the feature stage merges them into the run settings |
| Entities | one row per entity: the kind (object, automation, page, AI agent, app), what it is, the builder agent, and the UnifyApps Headless knowledge skills that builder loads |
| Security | what the feature must never do, from `ua:ua-secure-by-default` |
| Performance | what the feature must never cost, from `ua:performance` and the page quality rulebook |
| Acceptance checks | each check's kind (`acceptance` or `realtime`), its steps, and its `Effects:` or `Watch:` lines |
| Limits | what MOBILE or WEB cannot do, and what UnifyApps Headless does not know |

## Which recipe fits which words

| The person says | Recipe | Often with |
| --- | --- | --- |
| "track usage", "log page views", "which buttons do people tap", "add analytics" (collecting) | [usage tracking](references/usage-tracking.md) | the analytics dashboard, to show what it collects |
| "add analytics" (showing), "a dashboard of …", "KPI tiles", "show counts by week" | [analytics dashboard](references/analytics-dashboard.md) | usage tracking, when the numbers are about use of the app |
| "update the list in real time", "refresh automatically", "live status", "see new items without reloading" | [near-realtime refresh](references/near-realtime.md) | — |
| "notify the manager when …", "email me when …", "alert the team when …", "send a message when …" | [notifications](references/notifications.md) | near-realtime, when the person who is told has the list open |
| "add a tracking tag", "add the vendor's analytics script", "add a pixel" | [third-party analytics tag](references/analytics-tag-web.md). Platform: WEB only (a MOBILE app needs a platform change) | — |
| "true realtime", "push the change", "instant, no polling", "like a chat" | [realtime push](references/realtime-push.md) | near-realtime, which it falls back to |

No recipe fits: the feature stage plans from the person's words alone, with
the same plan shapes and checks. Two fit: it combines them, one plan, and
asks at most four questions in all.

## How the feature stage uses a recipe

1. **Questions.** The recipe's questions join the run settings, with their
   defaults filled from the cache and memory. At most four in all; a
   question whose default the cache settles is not asked, and its default is
   named in the plan preview as an assumption.
2. **Entities become tasks.** Each row is one task of one UnifyApps Headless plan, of
   the kind its builder takes (`object`, `automation-shell`, `automation`,
   `deploy`, `page-layout`, `page-bind`, `page-review`, `ai-agent`, `app`,
   `publish`). An entity that already exists is changed, not made again:
   the feature stage reads it in the cache first.
3. **Checks become steps files.** Each acceptance check becomes one steps
   file in the run folder and one queued `acceptance` or `realtime` check
   ([test-and-fix](../loop-orchestrator/references/stages/test-and-fix.md)).
4. **Limits become plan lines.** What a recipe marks unknown or not possible
   goes into the spec's `Not proven when done`, or into a question for the
   platform team, never into a task.

## Rules every recipe keeps

- **Identity comes from the server.** An automation reads the user from
  `USER.id`. No page, data source input, block binding or AI agent tool
  argument sends a user id, a name or an email. A data source that sends a
  user id lets any caller act as anyone.
- **A tap never waits on a side effect.** Tracking, a refresh or a message
  runs after what the person sees, never before it.
- **No invented settings.** A recipe names the block, the node kind or the
  setting by its knowledge sheet; the builder reads the sheet before it
  writes. What no sheet covers is written `unknown`, with who can answer.
- **Checks write only as the test user.** A check that saves or sends runs
  only when the run settings allowed it, on the test user's own records or
  `ZZ_LOOP_` test records, and a message goes only to a test recipient the
  person named.

## References

| File | Read it when |
| --- | --- |
| [references/usage-tracking.md](references/usage-tracking.md) | the feature collects who used what and when |
| [references/analytics-dashboard.md](references/analytics-dashboard.md) | the feature shows numbers, tiles or charts |
| [references/near-realtime.md](references/near-realtime.md) | a page must show changes others make without a reload |
| [references/notifications.md](references/notifications.md) | someone must be told when something happens |
| [references/analytics-tag-web.md](references/analytics-tag-web.md) | a third-party analytics script goes on a WEB app |
| [references/realtime-push.md](references/realtime-push.md) | the person asks for push, or near-realtime is not enough |
