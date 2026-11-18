# Recipe: realtime push

## Contents

- When
- Questions for the person
- What to ask the platform team
- Entities
- Security
- Performance
- Acceptance checks
- Limits

A change pushed to every open page the moment it is saved, with no timer.
UnifyApps Headless has no knowledge of a push channel for page data: no tool, block
sheet or skill in UnifyApps Headless names one. So this recipe says what to ask the
platform team, and builds the [near-realtime](near-realtime.md) recipe in
the meantime. It never invents a setting.

## When

"True realtime", "push the change", "instant, no polling", "live like a
chat", "websocket", or a near-realtime interval the person says is too slow.

## Questions for the person

1. **Build near-realtime now?** Default: yes, every 15 s, and ask the
   platform team about push. Option: wait for the platform team's answer
   and build nothing yet.
2. **How fast is enough.** Default: within 15 s. It sets the near-realtime
   interval and the window of the realtime check.

## What to ask the platform team

Write these as a handoff note (the [fix stage](../../loop-orchestrator/references/stages/fix.md)
§ Handoff note shape) and as the spec's open question:

1. Does the platform push a saved record change to a MOBILE page that has
   it open? Through which block, data source setting, action or event?
2. Does it need the realtime broker (the triage stage names one as
   environment infrastructure)? Is that on in every environment, and does it
   move with a changeset?
3. Does a pushed change pass the object's permission filter and the
   automation's owner check, or does it reach everyone with the page open?
4. Does it reach a MOBILE app in the background, the Preview app and a
   store build?
5. What are its limits: connections per user and per tenant, messages per
   second, and what a page that reconnects does about the changes it missed?
6. Is there an MCP tool or a knowledge sheet a builder can set it with? The
   sheet list has `blocks/live-collaborators`; whether it has anything to do
   with pushing data is not known.

## Entities

- **Now:** the near-realtime recipe's entities.
- **After the answer:** unknown until the platform team answers. The
  feature stage plans them then, from the sheet or tool they name.

## Security

- A push must carry no more than the page's own read would: the same owner
  check. Until that is known (question 3 above), nothing is built that skips
  the automation's check.

## Performance

- Push would replace the timer's calls. Until then the near-realtime cost
  holds: one call per open page per interval, said in the plan preview.

## Acceptance checks

1. **`realtime`, now:** the near-realtime recipe's check, with its window
   (the interval plus 5 s).
2. **`realtime`, after push lands:** the same steps with a short window,
   such as `- device 2 shows "<new value>" within 3 s`. Its pass is the proof
   that push works.

## Limits

- **Unknown on MOBILE:** everything about push. Nothing in this
  recipe is built until the platform team answers.
- **The fallback is not push:** near-realtime shows a change after up to one
  interval.
