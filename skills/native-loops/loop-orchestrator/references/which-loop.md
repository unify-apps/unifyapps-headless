# Which loop: what the ask is about

Every front door (`/ua:build-loop`, `repair-loop`, `scope-loop`, `test-loop`,
`review-loop`) and `ua-change` § Loop first read this before they run
`loops target`. You read the ask and say what kind of thing it is about. The
script finds the thing in the solution's cache and names the loop. Do not do
the work here, and do not pick the loop name yourself.

## What a solution holds

- **Apps**: web apps and mobile apps, each with pages. Pages hold tables,
  forms, buttons, filters, charts, headers and menus.
- **Automations** (also called workflows): run on a trigger, a schedule or a
  call. They send email or Slack, sync systems, call APIs and write records.
- **AI agents** (also called copilots, assistants or bots): answer in chat.
  Their parts are instructions, persona, tools, knowledge, guardrails and
  evaluation datasets.
- **Objects**: the data model: objects, fields and records.

`ua entity context solution --json` lists the apps with their pages, the
automations, the AI agents and the objects, when you do not know them yet.

## The kind

Pass one with `--kind`:

| Kind | The ask is about |
|---|---|
| `app` | an app or what is on its pages: a page, a screen, a table, a filter, a layout, a whole app. Building or running tests of an app (Test Studio cases) is `app` too. |
| `automation` | a process that runs with no person on a screen: a schedule, a trigger, a notification, a sync, an integration, an API call, a failed run. |
| `ai-agent` | an agent's behaviour or its parts, or its evaluation datasets. |
| `content` | a deck, a presentation, a pitch, slides or a video. It is never an app build, even when it shows an app. |
| `object` | the data model itself: add or change fields or objects, load or fix records. An automation or an agent that acts on a record is still that automation or agent. |
| `unknown` | it could be two kinds of thing, or which app it is cannot be told. The person is asked. Prefer this to a guess. |

A ticket key, a Figma link, or a link to an app, page, agent or automation
needs no kind: pass it as it is, and the script reads it.

## For an app

- `--app "<name>"`: the app it is about, by its name in the cache. With one
  app in the solution, an ask about a page or a screen is that app.
- `--new --platform web|mobile`: an app the solution does not have yet.
- Neither: the script takes the app named in the ask, or the one holding a
  page named in it, or the solution's only app, and asks when none fits.

## Examples

```bash
T "the Status filter on Orders shows nothing" --verb fix --kind app --app "Order desk" --json
T "send a daily summary to the managers" --verb build --kind automation --json
T "write the instructions for the support copilot" --verb build --kind ai-agent --json
T "a 3-minute demo video of the order flow" --verb build --kind content --json
T "a leave app for field staff" --verb scope --kind app --new --platform mobile --json
```

## What comes back

`target`, `command` and `reason` as before. A `check` line says the ask also
names an agent or automation of another kind than the one you passed. Read
it, then run `T` again with the right kind, or hand over as it is when you are
sure. `target: unknown` with a `reason` means ask the person one question.
