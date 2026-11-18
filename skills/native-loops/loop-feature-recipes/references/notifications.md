# Recipe: notifications

## Contents

- When
- Questions for the person
- Entities
- Security
- Performance
- Acceptance checks
- Limits

Tells someone when something happens: a message sent by an automation, right
after the write it is about, to a recipient the server works out.

## When

"Notify the manager when a request is submitted", "email me when the status
changes", "alert the team when a payment fails", "send a message when an
order ships".

## Questions for the person

1. **Who is told.** Default: worked out on the server from live data (the
   manager of the person who submitted, from the record or the user
   profile). Option: a fixed team or address I name. Never an address the
   page sends.
2. **How.** Default: an in-platform notification. Options: email · a chat
   app, through a connection the tenant already has (`list_connections`).
3. **When.** Default: right after the save, in the automation that saves it.
   Option: on any change of the record that matches a condition (a record
   trigger).
4. **The test recipient.** Default: none, so the checks stop before the send.
   Option: <a test user or test address the person names>, which every check
   uses instead of a real person.

## Entities

| # | Kind | What | Builder | Knowledge it loads |
| --- | --- | --- | --- | --- |
| 1 | automation (change or new) | Question 3 "after the save": the automation that saves the record (`ua cache wf`) gains the send after its write succeeds, or calls a new callable `Notify <who> on <event>`. It works out the recipient from live data, builds the message from a template with bound fields, and sends it: a platform notification for an in-platform message; the connector's own operation for email or chat | `ua:automation-agent` | `ua:unifyapps-data` (§ Platform users and assets), `ua:external-data-inspection` (a connector), `ua:resiliency`, `ua:ua-secure-by-default` |
| 2 | automation (new, record trigger) | Question 3 "on any change": a trigger on `storage_by_unifyapps_on_any_change`, with a condition that narrows it to the change that matters (the automation agent writes it with its filter helpers). The trigger is refused at compile until the object allows it (row 3) | `ua:automation-agent` | as row 1, plus `ua:node-inputs-and-pills` |
| 3 | object (change) | For a record trigger only: `logging.supportsWebhook` on, in a task the trigger's automation task waits on | `ua:fde-agent` | `ua:object-storage-manager` |
| 4 | connection | Email or chat with no connection on the tenant: a `manual` task. Builders only read connections; the main session makes one with `ua:connection-manager` | the person | `ua:connection-manager` |
| 5 | page bind (optional) | The page a notification opens reads its page inputs: a notification tap sends them as one `pageInputs` value | `ua:app-agent` | `ua:app-native` |

Every new or changed automation deploys once its test runs pass, with no
approval when the tenant said it is UAT at sign-in and a yes on any other; the
plan preview names it.

## Security

- **The recipient comes from the server.** No page input, source input or
  AI agent argument names who is told. A page that could set the recipient
  could send any text to anyone.
- **A record trigger runs with no user.** An event run uses the system user,
  so `USER.id` is not the person who saved: the automation reads the
  submitter and the manager from the record itself.
- **The message is a template.** Fields are bound into a template, never
  joined into HTML or a script (`ua-secure-by-default`: exports and
  documents made from data). Only the fields the message needs.
- **No secret in the automation.** A connection holds the sign-in; a setting
  that is not secret comes from `ENV`.
- **A message to a person is asked.** The checks send only to the test
  recipient of question 4. With none, the checks stop before the send and
  the send is proven by the automation's test run in the plan.

## Performance

- **The save never waits on the send.** The send comes after the write, and
  a failed send is caught and logged (`resiliency`): the person's save still
  succeeds. Only the person's own words make a send part of the save.
- **One send per event.** No loop over users. Many recipients go in one call
  when the connector's operation takes a list.
- **A record trigger fires on every change.** Its condition narrows it to
  the change that matters, or it sends on every edit.

## Acceptance checks

1. **`acceptance`: the event sends the message** (only with a test
   recipient).

   ```
   - Writes: one request ZZ_LOOP_build_notify_<n> as test user 1, whose manager is <test recipient>; one message to <test recipient> — allowed in the run settings
   1. Open <New request> (<route>)
   2. Fill Title with "ZZ_LOOP_build_notify_<n>"
   3. Tap Submit
   4. Expect: "<the confirmation the page shows>"

   Effects:
   - record <Request> (<object id>) · title = ZZ_LOOP_build_notify_<n> · status = <submitted code>
   - run <Notify manager on submit> (<automation id>) · success · after step 3
   ```

   The orchestrator's read-only run read (`inspect_workflow_run`) also names
   the recipient the send step used: the check fails when it is not the test
   recipient.

2. **`realtime`** (with the near-realtime recipe): the recipient's list shows
   the new item. Its steps are check 1's, plus a `Watcher:` line signed in as
   the test recipient and `- device 2 shows "ZZ_LOOP_build_notify_<n>" within <interval + 5> s`.

## Limits

- **Delivery is not checked.** A check reads the run's send step, not an
  inbox or a chat channel. The person confirms the first delivery by hand
  (a manual step).
- **Unknown: MOBILE push.** UnifyApps Headless's knowledge does not say whether an
  automation can send a push notification to a MOBILE app user. The Preview
  app turns push off when it runs on the builder's sign-in. Ask the platform
  team; until then, an in-platform notification or an email.
- **Where a MOBILE app shows in-platform notifications** is not in UnifyApps Headless's
  knowledge.
- **A new connection** is the person's manual step.
