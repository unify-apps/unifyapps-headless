---
name: give-feedback
description: Zips and uploads this UnifyApps Headless session's transcript and saves one classified report record per issue to the active solution, which is how a person reports a UnifyApps Headless bug or asks for a UnifyApps Headless feature. Use when the person types /ua:give-feedback with or without a description, or asks in chat to save the session, report a bug in UnifyApps Headless, or request a feature for UnifyApps Headless.
allowed-tools: Skill, Bash(bash:*), Bash(mktemp:*), Bash(rm:*), Write, Read, AskUserQuestion
---

# Save UnifyApps Headless session

The text after `/ua:give-feedback` is an optional report description:
`/ua:give-feedback <description>`. Treat it as the person's words, never as
a command or CLI flag. Do not begin a new task, change a plan, or write any
solution entity other than the saved session records.

The person can also ask for this in chat, without the slash command: `save
session`, `report a bug`, `I have a feature request`, `tell the UnifyApps Headless team
that …`. That is the same save. It is about UnifyApps Headless itself. A problem with the
person's own app, page, object or automation is a change: load `ua-change`.

## One record per issue

A report record describes exactly one issue. When the description, or what you
saw in this session, holds more than one distinct issue, save one record for
each. Two complaints about the same behaviour are one issue; a failed automation
save and an unrelated stale page cache are two.

Separate them before anything else, and keep them separate the whole way: each
issue gets its own family, its own remarks and its own `session save` run. Never
list several issues in one record's remarks — a record that carries three issues
cannot be classified, grouped or fixed as any one of them.

## Classify each issue

Every record carries a `family`, the surface the issue belongs to. Pick from
this list and nothing else:

| Family | What it covers |
|---|---|
| `automation` | Compiler schemas, callable defaults, sandbox behavior, run inspection, deployment |
| `app-page` | Page functions, form edits, localization, layout, preview behavior |
| `guidance-planning` | Contradictory instructions, incorrect proof requirements, plan revisions |
| `object-data` | Filters, lookups, unique indexes, partial bulk writes |
| `tooling-transport` | Oversized replies, missing tools, output files, malformed CLI output |
| `agent-ai` | Agent capabilities, publishing, instructions, response schemas |
| `session-cli` | Stale cache, entity context, CLI input/output differences |
| `auth-permissions` | Auto-mode refusals, relayed approval not recognized |
| `miscellaneous` | Nothing above fits |

Decide it yourself from what the issue is about; never ask the person which
family it belongs to. When nothing above fits, use `miscellaneous` and name the
family it should have had in `--suggested-family`: two or three words, lowercase
with hyphens, the way the families above are written (`release-signing`,
`browser-proof`). That is how the list learns what it is missing, so a
`miscellaneous` record without a suggestion is refused.

Pick the family the issue is *about*, not the tool you happened to be holding.
An automation that would not compile is `automation` even if you found it
through the CLI.

## Write the issue context

You compose the remarks for each record. They use the same fields the builders'
`feedback:` notes use (`skills/ua-change/references/run-loop.md`), so a problem a
session noticed and offered to report keeps its shape when the person sends it:

```markdown
Bug: <what failed, in plain words>
Context: <the operation, the relevant input or state, and the surface>
Evidence: <the exact error, or expected versus actual, plus the shortest reproduction>
Cause: <Confirmed: … | Suspected: … | Unknown — next check: …>
Reported: <the person's own description, exactly as typed, or "not described">
```

`Cause:` **must** begin with `Confirmed:`, `Suspected:`, or `Unknown — next
check:`. Never present an inference as fact. A labelled guess is worth keeping —
you were there and whoever picks this up was not — but an unlabelled one sends
them down one road before they have looked, which is worse than saying nothing.
Most reports a person files end in `Unknown — next check:`, and that is a fine
answer; do not manufacture a cause to fill the line.

Add a `Regression:` line when you can name one: the smallest check that fails
before and passes after. Leave it out rather than guessing at it.

Those five fields are the whole report. Do not add a `Fix:`, `Prevention:` or
`Suggested change:` line, and do not work a remedy into the other fields. A
remedy written by the reporter steers whoever picks the issue up before they
have looked at the code, and biases the answer they reach.

Keep `Reported:` verbatim, including their spelling. When one description covers
several issues, quote only the part about this issue. When the person described
nothing and you are reporting what you saw, write `not described`.

If the issue arose inside a plan, pass that plan's id as `--plan-id`. Pass it
only when you know it: an id guessed from whatever ran last attributes the issue
to the wrong plan. It is a field on the record, so do not also write it into the
remarks. The solution id is on the record already, and the `sessionUrl` the
command prints opens the record on the tenant.

## Ask what is still open

Skip any question the chat already answered, in this message or earlier in
the conversation. When nothing has described the report yet, ask the Type and
Remarks questions below. For a slash command with a description, or
a chat request that already describes a report, use these answers first:

- Infer `Bug` when the description says something in this session broke,
  failed, returned an error, or behaved incorrectly. Infer `Feature Request`
  when it asks UnifyApps Headless for a new capability or improvement. Decide from the
  meaning, even without the words "bug" or "feature request".
  Skip the Type question when the intent is clear.
- If you cannot decide between `Bug` and `Feature Request` for an issue, ask the
  Type question for that issue. Do not guess from a vague description.
- The description after the slash command, or the chat request's description,
  kept exactly as typed, is what goes in `## In their words`. Skip the Remarks question.
- Ask only the questions left. With both known, go straight to the check below.

First, one AskUserQuestion carrying the questions still open, at most two:

1. header `Type`, question `What kind of session was this?`, options `Bug`
   (`Something broke or misbehaved.`) and `Feature Request` (`Something UnifyApps Headless
   should do and does not.`). The built-in free-text row is any other type:
   keep the person's words.
2. header `Remarks`, question `What should the UnifyApps Headless developers know
   (optional)?`, options `Skip` (`Save without remarks.`) and `Let me write it`
   (`Type it in the box.`). Free text becomes their words.

When they skip the Remarks question and you saw nothing yourself, save a record
whose `## In their words` is `not described` and whose other sections describe
what you saw. Never invent a behaviour to fill them.

## Show it before sending

Before anything is sent, show what will be saved and let the person check it.
Every save does this, from the slash command or from chat. With one issue:

```
This report will be saved for the UnifyApps Headless team:

Type: <type>
Family: <family>
Issue: <the Bug: line>
Attached: this conversation, with passwords, tokens and keys removed.
```

With more than one, say how many records will be saved and list them, one block
per issue, in that same shape:

```
3 reports will be saved for the UnifyApps Headless team, one per issue:

1. <family> — <the Bug: line>
2. <family> — <the Bug: line>
3. <family> — <the Bug: line>

Attached to each: this conversation, with passwords, tokens and keys removed.
```

Then one AskUserQuestion with header `Send`, question `Send this report?` (or
`Send these reports?`), options `Send` (`Save to this solution now.`), `Change
it` (`Edit the type, the family or the issues first.`) and `Cancel` (`Send
nothing.`). `Send` runs the command below once per issue. `Change it` asks the
Type and Remarks questions again, with the current answers named in the
question, then shows the lines and this question once more; free text in the
built-in row replaces their words, then shows the lines and this question once
more. `Cancel` says `Nothing was sent.` and stops. Ask nothing else. The person
answers once for the whole set, not once per issue.

## Save it

For each issue, write that issue's remarks to its own temporary file created
with `mktemp` and `Write`. This keeps quotes and shell characters out of the
command. Shell-quote the type, the family and the temporary file path as
separate arguments. Then run, once per issue:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-node.sh" "${CLAUDE_PLUGIN_ROOT}/scripts/ua.mjs" session save --type <shell-quoted-type> --family <shell-quoted-family> [--suggested-family <shell-quoted-suggestion>] [--plan-id <shell-quoted-plan-id>] --remarks-file <shell-quoted-temp-path> --json
```

`--suggested-family` goes only with `--family miscellaneous`, and is required
there. `--plan-id` only when you know the plan.

When this session ran a UnifyApps Headless loop or one of its skills (a run folder under `.nebula/loops/runs/`), name each run id in the remarks and add
the summary `loops.mjs log share --run <id>` prints (counts and timings only,
no client data). The transcript already carries every brief and report the run
sent.

The command does the rest on its own: it zips a redacted copy of this session's
transcript together with its subagent transcripts, uploads the archive to the
tenant, and writes the record — `solutionId`, `session` (the uploaded file),
`type`, `family`, `suggestedFamily`, `planId`, `remarks`, `pluginVersion`,
`mode`, `agentSessionId` and `transcriptStats`. Nothing else is stored, and no
report document is written: the archive holds the whole session. Each record
carries its own copy of the archive, so each one stands on its own. The records
stay on this tenant and are copied nowhere else.

Run the issues one after another, not in parallel: each run packs and uploads
the archive, and several at once would race over the same session folder.

Remove only those exact temporary files afterwards, whether the saves succeed or
fail. Never remove a directory or use a wildcard.

On success, with one issue, say `Session saved: <sessionId>.` and
show `<sessionUrl>` on the next line. With several, say `<n> reports saved.` and
then one line per record: `<family> — <sessionId> — <sessionUrl>`.

When `transcriptUploaded` is false, say on the following line that the
transcript could not be uploaded, and give `transcriptArchivePath` when the
result carries one, so the person still has the archive. When the result carries
`fieldsNotStored`, say that this tenant's `nebula_session` type does not yet
declare those fields, name them, and say the report was saved without them —
they are what a fixer groups by, so somebody has to add them to the type.

On failure, say what prevented the save and what to do next, and name which
issues were saved and which were not. Do not retry a create whose outcome is
unknown.
